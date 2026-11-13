'use client';

import { useCallback, useRef } from 'react';
import { agentApi } from './api';
import { useBackend } from './backend';
import { CONDITIONS } from './conditions';
import { CREW, byId, sleepNights } from './crew';
import { mentalSeries, openEvents, rootCauseFor, useMission, type MissionState } from './mission';
import type { CheckInMessage } from './types';

/**
 * The agent features (chat, check-in, root cause + plan, weekly report), each with the same shape:
 *   1. show the astronaut's input straight away and mark the request as pending;
 *   2. if the Gemini backend is live, ask it;
 *   3. if it is not, or the call fails, answer from the local simulation so the crew is never left waiting.
 * Every agent message records which of the two wrote it.
 */

const today = () => new Date().toISOString().slice(0, 10);
const wire = (m: CheckInMessage[]) => m.map(({ from, text }) => ({ from, text }));
const round = (n: number, d = 0) => Number(n.toFixed(d));
/** A short pause so a simulated reply reads as a reply, not a glitch. */
const beat = () => new Promise((r) => setTimeout(r, 450));

function vitalsSummary(s: MissionState, id: string) {
  const day = (s.vitals[id] ?? []).slice(0, 288);
  const stat = (f: (v: (typeof day)[number]) => number, d = 0) => {
    const xs = day.map(f);
    if (!xs.length) return null;
    return { min: round(Math.min(...xs), d), mean: round(xs.reduce((a, b) => a + b, 0) / xs.length, d), max: round(Math.max(...xs), d) };
  };
  return {
    heartRate: stat((v) => v.heartRate),
    systolic: stat((v) => v.systolic),
    diastolic: stat((v) => v.diastolic),
    spo2: stat((v) => v.spo2),
    temp: stat((v) => v.temp, 1),
    radiationRateUSvH: stat((v) => v.radiationRate),
    note: 'Exercise blocks 10:00-11:00 and 16:00-16:30 UTC raise heart rate normally.',
  };
}

function watchEvents(s: MissionState, id: string) {
  return s.events
    .filter((e) => e.astronautId === id && !e.suppressed && s.now - e.detectedAt < 86_400_000)
    .map((e) => ({ condition: CONDITIONS[e.condition].label, tier: CONDITIONS[e.condition].tier, evidence: e.evidence, state: e.state }));
}

/** What the agent is told about an astronaut. No doses are sent; the agent must not prescribe them. */
function contextFor(s: MissionState, id: string) {
  const c = byId(id)!;
  const last = s.vitals[id]?.slice(-1)[0];
  const night = sleepNights(id).slice(-1)[0];
  const mh = mentalSeries(s, id).slice(-1)[0];
  return {
    name: c.name,
    role: c.role,
    age: c.age,
    baseline: c.baseline,
    latestVitals: last && !s.sensorFault[id] ? { heartRate: round(last.heartRate), bloodPressure: `${round(last.systolic)}/${round(last.diastolic)}`, spo2: round(last.spo2), temp: round(last.temp, 1), radiationRateUSvH: round(last.radiationRate), exercising: last.activity > 0.6 } : 'Watch sensor fault: no reliable live reading',
    sleepLastNight: { hours: night.hours, cycles: night.cycles, efficiency: night.efficiency, selfRated: night.selfRated },
    mentalHealthScore: mh.score,
    medications: s.meds[id].map((m) => ({ name: m.name, schedule: m.schedule, reason: m.reason })),
    treatmentPlan: s.plans[id].map((p) => ({ kind: p.kind, text: p.text, urgent: p.urgent, approval: p.approval })),
    underlyingProblem: rootCauseFor(s, id).problem,
    openEmergencies: openEvents(s, id).map((e) => CONDITIONS[e.condition].label),
    shipLocation: s.location,
    earthContact: s.earthLink,
  };
}

export function useAgent() {
  const { s, dispatch } = useMission();
  const backend = useBackend();
  // Async continuations must read the latest state, not the one captured when the request started.
  const latest = useRef(s);
  latest.current = s;
  const live = backend.status === 'live';
  const liveRef = useRef(live);
  liveRef.current = live;

  const failed = useCallback(
    (e: unknown) => {
      backend.reportError(e instanceof Error ? e.message : 'The agent call failed.');
    },
    [backend],
  );

  /** Feature 9: talk to the manager agent. */
  const sendChat = useCallback(
    async (id: string, text: string) => {
      if (latest.current.pending[`chat:${id}`]) return; // one question at a time
      dispatch({ type: 'chat-user', id, text });
      if (liveRef.current) {
        try {
          const messages = [...wire(latest.current.agentChats[id] ?? []), { from: 'astronaut' as const, text }];
          const r = await agentApi.chat({ astronautId: id, messages, context: contextFor(latest.current, id) });
          dispatch({ type: 'chat-reply', id, text: r.text, source: 'gemini' });
          return;
        } catch (e) {
          failed(e);
        }
      } else {
        await beat();
      }
      dispatch({ type: 'chat-reply', id, source: 'simulated' });
    },
    [dispatch, failed],
  );

  /** Features 5 and 2: one answer in the daily check-in. */
  const sendCheckin = useCallback(
    async (id: string, text: string) => {
      if (latest.current.pending[`checkin:${id}`]) return;
      dispatch({ type: 'checkin-user', id, text });
      if (liveRef.current) {
        try {
          const ci = latest.current.checkins[id];
          const messages = [...wire(ci.messages), { from: 'astronaut' as const, text }];
          const r = await agentApi.checkin({ astronautId: id, date: today(), missedYesterday: ci.missedYesterday, messages });
          dispatch({ type: 'checkin-reply', id, text: r.text, completed: r.completed, mental: r.mental, source: 'gemini' });
          return;
        } catch (e) {
          failed(e);
        }
      } else {
        await beat();
      }
      dispatch({ type: 'checkin-reply', id, source: 'simulated' });
    },
    [dispatch, failed],
  );

  /** Features 8 and 4: re-run the root-cause analysis and rebuild the treatment plan. */
  const runAssessment = useCallback(
    async (id: string) => {
      if (latest.current.pending[`assess:${id}`]) return;
      dispatch({ type: 'pending', key: `assess:${id}`, on: true });
      if (liveRef.current) {
        try {
          const st = latest.current;
          const mh = mentalSeries(st, id).slice(-1)[0];
          const r = await agentApi.assess({
            astronautId: id,
            date: today(),
            vitals24h: { baseline: byId(id)!.baseline, ...vitalsSummary(st, id) },
            sleep: sleepNights(id).slice(-3).map((n) => ({ date: n.date, hours: n.hours, cycles: n.cycles, efficiency: n.efficiency, selfRated: n.selfRated })),
            mental: { score: mh.score, answers: mh.answers },
            checkIn: wire(st.checkins[id].messages),
            watchEvents: watchEvents(st, id),
          });
          dispatch({ type: 'assess-done', id, rootCause: r.rootCause, plan: r.plan, source: 'gemini' });
          return;
        } catch (e) {
          failed(e);
        }
      } else {
        await beat();
      }
      dispatch({ type: 'assess-done', id, source: 'simulated' });
    },
    [dispatch, failed],
  );

  /** Feature 6: weekly report for mission command. */
  const weeklyReport = useCallback(async () => {
    if (latest.current.pending.weekly) return;
    dispatch({ type: 'pending', key: 'weekly', on: true });
    if (liveRef.current) {
      try {
        const st = latest.current;
        const end = Date.now();
        const r = await agentApi.weekly({
          periodStart: new Date(end - 7 * 86_400_000).toISOString().slice(0, 10),
          periodEnd: new Date(end).toISOString().slice(0, 10),
          astronauts: CREW.map((c) => {
            const nights = sleepNights(c.id);
            return {
              id: c.id,
              name: c.name,
              role: c.role,
              averageSleepHours: round(nights.reduce((x, n) => x + n.hours, 0) / nights.length, 1),
              mentalHealthScores: mentalSeries(st, c.id).slice(-7).map((m) => m.score),
              vitals24h: vitalsSummary(st, c.id),
              watchEvents: st.events.filter((e) => e.astronautId === c.id && !e.suppressed).map((e) => ({ condition: CONDITIONS[e.condition].label, state: e.state })),
              underlyingProblem: rootCauseFor(st, c.id).problem,
              planItemsAwaitingApproval: st.plans[c.id].filter((p) => p.approval === 'pending-team-leader').length,
            };
          }),
        });
        dispatch({ type: 'weekly-report', summary: r.summary, flagged: r.flagged });
        return;
      } catch (e) {
        failed(e);
      }
    } else {
      await beat();
    }
    dispatch({ type: 'weekly-report' });
  }, [dispatch, failed]);

  return { live, sendChat, sendCheckin, runAssessment, weeklyReport };
}
