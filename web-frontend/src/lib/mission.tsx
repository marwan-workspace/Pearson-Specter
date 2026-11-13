'use client';

import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type {
  BloodTest,
  Location,
  CheckInMessage,
  ConditionId,
  DecisionLogEntry,
  MedLogEntry,
  Medication,
  MentalCheck,
  PlanItem,
  Report,
  RootCause,
  Status,
  StockItem,
  VitalSample,
  WatchEvent,
} from './types';
import { CANCEL_WINDOW_MS, CONDITIONS, EARTH_REVIEW_SEC, INITIAL_STOCK, LOCATIONS, detect } from './conditions';
import { LIVE_MS, applyEmergency, doseFromSeries, history, liveRng, sampleAt } from './sim';
import {
  CHECKIN_SCRIPT,
  CREW,
  DECISIONS,
  MED_LOG,
  PRIOR_DOSE_MSV,
  REPORTS,
  SHELTER_RATE_USV_H,
  bloodTests,
  checkIn,
  mentalChecks,
  rootCause,
  sleepNights,
  treatmentPlan,
} from './crew';

/** Where an agent reply came from: the Gemini backend, or the local rule-based stand-in. */
export type AgentSource = 'gemini' | 'simulated';

const LIVE_KEEP = 180;
const uid = () => Math.random().toString(36).slice(2, 10);

export interface MissionState {
  ready: boolean;
  now: number;
  vitals: Record<string, VitalSample[]>;
  emergencies: Record<string, { condition: ConditionId; startedAt: number } | undefined>;
  sensorFault: Record<string, boolean>;
  events: WatchEvent[];
  stock: StockItem[];
  medLog: MedLogEntry[];
  meds: Record<string, Medication[]>;
  decisions: DecisionLogEntry[];
  reports: Report[];
  earthLink: boolean;
  /** Feature 20 — ship location sets the Earth light-time delay. */
  location: Location;
  /** Feature 22 — heartbeat-in-a-bottle playback triggered by stress. */
  heartbeat: { astronautId: string; member: number; at: number; reason: string } | null;
  plans: Record<string, PlanItem[]>;
  checkins: Record<string, { completed: boolean; missedYesterday: boolean; messages: CheckInMessage[]; step: number }>;
  agentChats: Record<string, CheckInMessage[]>;
  blood: Record<string, BloodTest[]>;
  /** Root cause written by the Gemini agent (feature 8); falls back to the seeded one. */
  rootCauses: Record<string, RootCause | undefined>;
  /** Today's mental-health check scored by the Gemini agent during the check-in (feature 2). */
  mentalLive: Record<string, MentalCheck | undefined>;
  /** In-flight agent requests, keyed `chat:<id>`, `checkin:<id>`, `assess:<id>`, `weekly`. Not persisted. */
  pending: Record<string, boolean>;
}

type Action =
  | { type: 'init' }
  | { type: 'tick' }
  | { type: 'inject'; id: string; condition: ConditionId }
  | { type: 'clear'; id: string }
  | { type: 'cancel'; eventId: string }
  | { type: 'confirm'; eventId: string }
  | { type: 'decline'; eventId: string }
  | { type: 'crewmate-gave'; eventId: string; by: string }
  | { type: 'earth-link'; on: boolean }
  | { type: 'pending'; key: string; on: boolean }
  | { type: 'weekly-report'; summary?: Record<string, string>; flagged?: string[] }
  | { type: 'location'; location: Location }
  | { type: 'heartbeat'; astronautId: string; member: number; reason: string }
  | { type: 'heartbeat-stop' }
  | { type: 'checkin-user'; id: string; text: string }
  | { type: 'checkin-reply'; id: string; text?: string; completed?: boolean; mental?: MentalCheck | null; source: AgentSource }
  | { type: 'chat-user'; id: string; text: string }
  | { type: 'chat-reply'; id: string; text?: string; source: AgentSource }
  | { type: 'assess-done'; id: string; rootCause?: RootCause; plan?: PlanItem[]; source: AgentSource }
  | { type: 'blood'; id: string; values: Record<string, number> }
  | { type: 'sensor-fault'; id: string }
  | { type: 'med-taken'; id: string; med: string; index: number };

const empty: MissionState = {
  ready: false,
  now: 0,
  vitals: {},
  emergencies: {},
  sensorFault: {},
  events: [],
  stock: [],
  medLog: [],
  meds: {},
  decisions: [],
  reports: [],
  earthLink: true,
  location: 'iss',
  heartbeat: null,
  plans: {},
  checkins: {},
  agentChats: {},
  blood: {},
  rootCauses: {},
  mentalLive: {},
  pending: {},
};

function init(): MissionState {
  const now = Date.now();
  const map = <T,>(f: (id: string) => T) => Object.fromEntries(CREW.map((c) => [c.id, f(c.id)])) as Record<string, T>;
  return {
    ...empty,
    ready: true,
    now,
    vitals: map((id) => history(CREW.find((c) => c.id === id)!, now)),
    stock: structuredClone(INITIAL_STOCK),
    medLog: [...MED_LOG],
    meds: map((id) => structuredClone(CREW.find((c) => c.id === id)!.medications)),
    decisions: [...DECISIONS],
    reports: structuredClone(REPORTS),
    plans: map(treatmentPlan),
    checkins: map((id) => ({ ...checkIn(id), step: 0 })),
    agentChats: map((id) => [
      {
        from: 'agent' as const,
        at: now - 60_000,
        text:
          id === 'hiro'
            ? 'Hiro, your watch reads within alarm limits, but you said you feel ill. Your report takes priority. I found three likely reasons: a missed lisinopril dose, BP 16 mmHg above your own baseline, and two short nights. Ask me anything.'
            : 'I’m the manager agent. You can talk to me any time, not just at check-in. I see your watch data, sleep, mental-health checks and treatment plan.',
      },
    ]),
    blood: map(bloodTests),
  };
}

/** Feature 18 + 20: a report leaves now (or queues), reaches Earth after the one-way delay, reply comes back after the round trip. */
function dispatchTimes(s: MissionState, now: number): Pick<Report, 'delivery' | 'sentAt' | 'arrivesAt' | 'replyDueAt'> {
  if (!s.earthLink) return { delivery: 'queued' };
  const owlt = LOCATIONS[s.location].owltSec * 1000;
  return { delivery: 'sent', sentAt: now, arrivesAt: now + owlt, replyDueAt: now + 2 * owlt + EARTH_REVIEW_SEC * 1000 };
}

export function fmtDelay(sec: number) {
  if (sec < 60) return `${sec} s`;
  return `${Math.floor(sec / 60)} min ${String(Math.round(sec % 60)).padStart(2, '0')} s`;
}

/** Mission command's reply lands on the ship (feature 6): approves pending plan items for weekly reports. */
function earthReply(s: MissionState, reportId: string, now: number): MissionState {
  const r = s.reports.find((x) => x.id === reportId)!;
  if (r.kind === 'emergency') {
    const text = 'Mission command: Emergency received. We concur with the onboard response. Continue monitoring and send an update in 24 h.';
    return {
      ...s,
      reports: s.reports.map((x) => (x.id === reportId ? { ...x, delivery: 'replied', reply: { at: now, text } } : x)),
      decisions: [{ id: uid(), at: now, astronautId: r.astronautIds[0], actor: 'Mission command', decision: 'Acknowledged emergency report', reason: 'Reply arrived after round-trip delay' }, ...s.decisions],
    };
  }
  const text = 'Mission command: Approved the pending treatment-plan items. Keep Maya off EVA for 7 days. Report any further events immediately.';
  return {
    ...s,
    reports: s.reports.map((x) => (x.id === reportId ? { ...x, delivery: 'replied', reply: { at: now, text } } : x)),
    plans: Object.fromEntries(
      Object.entries(s.plans).map(([id, items]) => [id, items.map((p) => (p.approval === 'pending-mission-command' ? { ...p, approval: 'approved' as const, missionCommandNote: 'Approved in the weekly reply.' } : p))]),
    ),
    decisions: [{ id: uid(), at: now, actor: 'Mission command', decision: 'Approved pending treatment-plan items', reason: 'Weekly check-in reply' }, ...s.decisions],
  };
}

function emergencyReport(s: MissionState, ev: WatchEvent, extra: string): Report {
  const spec = CONDITIONS[ev.condition];
  const name = CREW.find((c) => c.id === ev.astronautId)!.name;
  return {
    id: `em-${ev.id}`,
    kind: 'emergency',
    createdAt: s.now,
    astronautIds: [ev.astronautId],
    summary: { [ev.astronautId]: `${spec.label} detected (${ev.evidence}). ${extra}` },
    flagged: [`${name}: ${spec.label}`],
    ...dispatchTimes(s, s.now),
  };
}

function administer(s: MissionState, ev: WatchEvent, givenBy: MedLogEntry['givenBy']): MissionState {
  const spec = CONDITIONS[ev.condition];
  const stock = s.stock.find((x) => x.drug === spec.drug);
  const used24h = s.medLog.filter((m) => m.astronautId === ev.astronautId && m.drug === spec.drug && s.now - m.at < 86_400_000).length;
  if (stock && (used24h >= stock.maxPer24h || stock.onBoard <= 0)) {
    return {
      ...s,
      events: s.events.map((e) => (e.id === ev.id ? { ...e, state: 'blocked-dose-limit', resolvedAt: s.now } : e)),
      decisions: [
        { id: uid(), at: s.now, astronautId: ev.astronautId, actor: 'Watch LLM (rule set)', decision: `Blocked ${spec.drug}: dose limit reached`, reason: `${used24h}/${stock.maxPer24h} doses in 24 h, ${stock.onBoard} on board` },
        ...s.decisions,
      ],
    };
  }
  return {
    ...s,
    stock: s.stock.map((x) => (x.drug === spec.drug ? { ...x, onBoard: x.onBoard - 1 } : x)),
    medLog: [{ id: uid(), at: s.now, astronautId: ev.astronautId, drug: spec.drug, route: spec.watchCanInject ? 'injection (watch)' : 'crew-administered', givenBy, reason: spec.label }, ...s.medLog],
    emergencies: { ...s.emergencies, [ev.astronautId]: undefined },
  };
}

function reducer(s: MissionState, a: Action): MissionState {
  switch (a.type) {
    case 'init': {
      const fresh = init();
      const saved = loadSaved();
      return saved ? { ...fresh, ...saved } : fresh;
    }

    case 'tick': {
      if (!s.ready) return s;
      const now = Date.now();
      let next: MissionState = { ...s, now, vitals: { ...s.vitals } };
      for (const c of CREW) {
        const em = next.emergencies[c.id];
        const k = em ? Math.min(1, (now - em.startedAt) / 5000) : 0;
        let sample = applyEmergency(sampleAt(c, now, liveRng), em?.condition ?? null, k);
        if (next.sensorFault[c.id]) sample = { ...sample, heartRate: 0, spo2: 0, sensorFault: true }; // feature 19: watch off the wrist
        const arr = next.vitals[c.id];
        const hist = arr.length > 288 + LIVE_KEEP ? [...arr.slice(0, 288), ...arr.slice(-LIVE_KEEP + 1)] : arr;
        next.vitals[c.id] = [...hist, sample];

        // Feature 19 — sensor fault: no detection on a loose watch.
        if (next.sensorFault[c.id]) continue;
        // One open emergency per astronaut at a time (avoids duplicate alerts while vitals ramp).
        if (openEvents(next, c.id).length) continue;

        const dose = PRIOR_DOSE_MSV[c.id] + doseFromSeries(next.vitals[c.id].slice(0, 288));
        // fault samples are kept for the charts but never judged, or re-attaching reads as bradycardia
        const d = detect(next.vitals[c.id].slice(-30).filter((v) => !v.sensorFault), c.baseline, dose);
        if (!d) continue;
        const recent = next.events.find((e) => e.astronautId === c.id && e.condition === d.condition && now - e.detectedAt < (d.suppressed ? 600_000 : 120_000));
        if (recent) continue;
        const spec = CONDITIONS[d.condition];
        const ev: WatchEvent = {
          id: uid(),
          astronautId: c.id,
          condition: d.condition,
          detectedAt: now,
          confidence: d.confidence,
          evidence: d.evidence,
          rule: d.rule,
          suppressed: d.suppressed,
          state: d.suppressed ? 'cancelled' : spec.tier === 1 ? 'countdown' : spec.tier === 2 ? 'awaiting-confirm' : 'crewmate-alerted',
          cancelDeadline: spec.tier === 1 ? now + CANCEL_WINDOW_MS : undefined,
        };
        next.events = [ev, ...next.events];
        next.decisions = [
          {
            id: uid(),
            at: now,
            astronautId: c.id,
            actor: 'Watch LLM (rule set)',
            decision: d.suppressed ? `Suppressed ${spec.label} alarm` : `Detected ${spec.label} → ${spec.tier === 1 ? 'automatic injection after cancel window' : spec.tier === 2 ? 'asked astronaut to confirm' : 'alerted crewmates'}`,
            rule: d.rule,
            reason: d.suppressed ? `${d.evidence}: activity context` : `${d.evidence} · confidence ${Math.round(d.confidence * 100)}%`,
          },
          ...next.decisions,
        ];
        if (!d.suppressed) next.reports = [emergencyReport(next, ev, `Response: ${spec.firstResponse}; ${spec.medication}.`), ...next.reports];
        // Feature 22 — stress spike → play a family heartbeat recording.
        if (d.condition === 'panic-attack' && !d.suppressed) {
          next.heartbeat = { astronautId: c.id, member: 0, at: now, reason: d.evidence };
          next.decisions = [{ id: uid(), at: now, astronautId: c.id, actor: 'Manager agent', decision: `Played ${c.family[0].name}'s (${c.family[0].relation}) recorded heartbeat`, rule: d.rule, reason: 'Stress spike detected by the watch' }, ...next.decisions];
        }
      }
      // Feature 20 — mission command replies arrive after the round-trip light time.
      for (const r of next.reports.filter((x) => x.delivery === 'sent' && x.replyDueAt && x.replyDueAt <= now)) {
        next = earthReply(next, r.id, now);
      }
      // Tier-1 cancel windows that expired → administer.
      for (const ev of next.events.filter((e) => e.state === 'countdown' && e.cancelDeadline! <= now)) {
        next = administer(next, ev, 'watch (automatic)');
        next.events = next.events.map((e) => (e.id === ev.id && e.state === 'countdown' ? { ...e, state: 'administered', resolvedAt: now, resolvedBy: 'Watch (automatic)' } : e));
      }
      return next;
    }

    case 'inject':
      return {
        ...s,
        emergencies: { ...s.emergencies, [a.id]: { condition: a.condition, startedAt: Date.now() } },
        decisions: [{ id: uid(), at: Date.now(), astronautId: a.id, actor: 'Mission command', decision: `Simulator: injected ${CONDITIONS[a.condition].label}`, reason: 'Demo (feature 10)' }, ...s.decisions],
      };
    case 'clear':
      return { ...s, emergencies: { ...s.emergencies, [a.id]: undefined } };

    case 'cancel':
      return {
        ...s,
        emergencies: (() => {
          const ev = s.events.find((e) => e.id === a.eventId);
          return ev ? { ...s.emergencies, [ev.astronautId]: undefined } : s.emergencies;
        })(),
        events: s.events.map((e) => (e.id === a.eventId ? { ...e, state: 'cancelled', resolvedAt: Date.now(), resolvedBy: 'Astronaut (cancel window)' } : e)),
        decisions: [{ id: uid(), at: Date.now(), astronautId: s.events.find((e) => e.id === a.eventId)?.astronautId, actor: 'Astronaut', decision: 'Cancelled automatic injection', reason: 'Used the cancel window' }, ...s.decisions],
      };

    case 'confirm': {
      const ev = s.events.find((e) => e.id === a.eventId);
      if (!ev) return s;
      const n = administer({ ...s, now: Date.now() }, ev, 'watch (confirmed)');
      return {
        ...n,
        events: n.events.map((e) => (e.id === ev.id && e.state === 'awaiting-confirm' ? { ...e, state: 'administered', resolvedAt: Date.now(), resolvedBy: 'Astronaut confirmed' } : e)),
        decisions: [{ id: uid(), at: Date.now(), astronautId: ev.astronautId, actor: 'Astronaut', decision: `Confirmed ${CONDITIONS[ev.condition].drug}`, reason: 'Tier 2: confirm first' }, ...n.decisions],
      };
    }
    case 'decline':
      return {
        ...s,
        emergencies: (() => {
          const ev = s.events.find((e) => e.id === a.eventId);
          return ev ? { ...s.emergencies, [ev.astronautId]: undefined } : s.emergencies;
        })(),
        events: s.events.map((e) => (e.id === a.eventId ? { ...e, state: 'declined', resolvedAt: Date.now(), resolvedBy: 'Astronaut declined (guided breathing)' } : e)),
      };
    case 'crewmate-gave': {
      const ev = s.events.find((e) => e.id === a.eventId);
      if (!ev) return s;
      const n = administer({ ...s, now: Date.now() }, ev, a.by);
      return {
        ...n,
        events: n.events.map((e) => (e.id === ev.id && e.state === 'crewmate-alerted' ? { ...e, state: 'given-by-crewmate', resolvedAt: Date.now(), resolvedBy: a.by } : e)),
        decisions: [{ id: uid(), at: Date.now(), astronautId: ev.astronautId, actor: 'Crewmate', decision: `${a.by} gave ${CONDITIONS[ev.condition].drug}`, reason: 'Tier 3: crewmate gives it' }, ...n.decisions],
      };
    }

    case 'earth-link':
      return {
        ...s,
        earthLink: a.on,
        reports: a.on ? s.reports.map((r) => (r.delivery === 'queued' ? { ...r, ...dispatchTimes({ ...s, earthLink: true }, Date.now()) } : r)) : s.reports,
      };

    case 'pending':
      return { ...s, pending: { ...s.pending, [a.key]: a.on } };

    case 'weekly-report': {
      const pending = { ...s.pending, weekly: false };
      if (a.summary) {
        const r: Report = { id: `wk-${uid()}`, kind: 'weekly', createdAt: Date.now(), astronautIds: CREW.map((c) => c.id), summary: a.summary, flagged: a.flagged ?? [], ...dispatchTimes(s, Date.now()) };
        return { ...s, pending, reports: [r, ...s.reports], decisions: [{ id: uid(), at: Date.now(), actor: 'Manager agent', decision: 'Wrote the weekly report for mission command', reason: 'Written by the Gemini agent' }, ...s.decisions] };
      }
      const summary: Record<string, string> = {};
      const flagged: string[] = [];
      for (const c of CREW) {
        const nights = sleepNights(c.id);
        const mh = mentalSeries(s, c.id).slice(-1)[0];
        const avg = nights.reduce((x, n) => x + n.hours, 0) / nights.length;
        const evs = s.events.filter((e) => e.astronautId === c.id && !e.suppressed && s.now - e.detectedAt < 7 * 86_400_000);
        summary[c.id] = `Sleep ${avg.toFixed(1)} h/night avg. Mental-health score ${mh.score}/100. ${evs.length} watch event(s). ${s.plans[c.id].filter((p) => p.approval === 'pending-mission-command').length} plan item(s) awaiting approval.`;
        if (mh.score < 60) flagged.push(`${c.name}: mental-health score ${mh.score}`);
        if (avg < 6.5) flagged.push(`${c.name}: average sleep ${avg.toFixed(1)} h`);
        evs.forEach((e) => flagged.push(`${c.name}: ${CONDITIONS[e.condition].label}`));
      }
      const r: Report = { id: `wk-${uid()}`, kind: 'weekly', createdAt: Date.now(), astronautIds: CREW.map((c) => c.id), summary, flagged, ...dispatchTimes(s, Date.now()) };
      return { ...s, pending, reports: [r, ...s.reports] };
    }
    case 'location': {
      const now = Date.now();
      // Reports already in flight keep their timing; only new reports use the new delay.
      return {
        ...s,
        location: a.location,
        decisions: [{ id: uid(), at: now, actor: 'Manager agent', decision: `Ship location set to ${LOCATIONS[a.location].label}`, reason: `One-way delay to Earth ${fmtDelay(LOCATIONS[a.location].owltSec)}${a.location === 'mars' ? '. The onboard system now acts as the doctor' : ''}` }, ...s.decisions],
      };
    }
    case 'heartbeat':
      return { ...s, heartbeat: { astronautId: a.astronautId, member: a.member, at: Date.now(), reason: a.reason } };
    case 'heartbeat-stop':
      return { ...s, heartbeat: null };

    case 'checkin-user': {
      const ci = s.checkins[a.id];
      return { ...s, pending: { ...s.pending, [`checkin:${a.id}`]: true }, checkins: { ...s.checkins, [a.id]: { ...ci, messages: [...ci.messages, { from: 'astronaut', text: a.text, at: Date.now() }] } } };
    }
    case 'checkin-reply': {
      const ci = s.checkins[a.id];
      // No text from the backend: answer from the local script (the simulation).
      const scripted = a.text === undefined;
      const text = a.text ?? CHECKIN_SCRIPT[Math.min(ci.step, CHECKIN_SCRIPT.length - 1)];
      const done = scripted ? ci.step >= CHECKIN_SCRIPT.length - 1 : a.completed === true;
      return {
        ...s,
        pending: { ...s.pending, [`checkin:${a.id}`]: false },
        mentalLive: a.mental ? { ...s.mentalLive, [a.id]: a.mental } : s.mentalLive,
        checkins: { ...s.checkins, [a.id]: { ...ci, step: ci.step + 1, completed: done || ci.completed, messages: [...ci.messages, { from: 'agent', text, at: Date.now(), source: a.source }] } },
      };
    }
    case 'chat-user': {
      const msgs = s.agentChats[a.id] ?? [];
      return { ...s, pending: { ...s.pending, [`chat:${a.id}`]: true }, agentChats: { ...s.agentChats, [a.id]: [...msgs, { from: 'astronaut', text: a.text, at: Date.now() }] } };
    }
    case 'chat-reply': {
      const msgs = s.agentChats[a.id] ?? [];
      const asked = [...msgs].reverse().find((m) => m.from === 'astronaut')?.text ?? '';
      const text = a.text ?? agentReply(s, a.id, asked);
      return { ...s, pending: { ...s.pending, [`chat:${a.id}`]: false }, agentChats: { ...s.agentChats, [a.id]: [...msgs, { from: 'agent', text, at: Date.now(), source: a.source }] } };
    }
    case 'assess-done': {
      const pending = { ...s.pending, [`assess:${a.id}`]: false };
      const rc = a.rootCause ?? rootCauseFor(s, a.id);
      const log: DecisionLogEntry = {
        id: uid(),
        at: Date.now(),
        astronautId: a.id,
        actor: 'Root-cause analysis',
        decision: `Underlying problem: ${rc.problem}`,
        reason: a.source === 'gemini' ? `Gemini agent, confidence ${Math.round(rc.confidence * 100)}%` : `Local rules (simulation), confidence ${Math.round(rc.confidence * 100)}%`,
      };
      if (!a.rootCause || !a.plan) return { ...s, pending, decisions: [log, ...s.decisions] };
      return { ...s, pending, rootCauses: { ...s.rootCauses, [a.id]: a.rootCause }, plans: { ...s.plans, [a.id]: a.plan }, decisions: [log, ...s.decisions] };
    }
    case 'blood':
      return {
        ...s,
        blood: { ...s.blood, [a.id]: [...s.blood[a.id], { id: uid(), date: new Date().toISOString().slice(0, 10), enteredBy: 'Medical Officer', values: a.values }] },
      };
    case 'sensor-fault':
      return {
        ...s,
        sensorFault: { ...s.sensorFault, [a.id]: !s.sensorFault[a.id] },
        decisions: !s.sensorFault[a.id]
          ? [{ id: uid(), at: Date.now(), astronautId: a.id, actor: 'Watch LLM (rule set)', decision: 'Classified flatline as sensor fault, not cardiac arrest', reason: 'Skin contact lost, motion present, HR and SpO₂ dropped to 0 together' }, ...s.decisions]
          : s.decisions,
      };
    case 'med-taken':
      return {
        ...s,
        meds: { ...s.meds, [a.id]: s.meds[a.id].map((m) => (m.name === a.med ? { ...m, today: m.today.map((d, i) => (i === a.index ? { ...d, taken: true } : d)) } : m)) },
        medLog: [{ id: uid(), at: Date.now(), astronautId: a.id, drug: a.med, route: 'oral', givenBy: 'Self', reason: 'Scheduled medication' }, ...s.medLog],
      };
  }
}

/** Manager agent (feature 9) — rule-based stand-in for the LLM. */
function agentReply(s: MissionState, id: string, text: string) {
  const q = text.toLowerCase();
  const c = CREW.find((x) => x.id === id)!;
  const last = s.vitals[id].slice(-1)[0];
  const nights = sleepNights(id);
  const mh = mentalSeries(s, id).slice(-1)[0];
  if (/ill|sick|unwell|bad|headache|dizzy|feel/.test(q))
    return `Your report takes priority over the watch. Right now HR is ${Math.round(last.heartRate)} (baseline ${c.baseline.heartRate}), BP ${Math.round(last.systolic)}/${Math.round(last.diastolic)} (baseline ${c.baseline.systolic}/${c.baseline.diastolic}), and you slept ${nights.slice(-1)[0].hours} h. ${Math.round(last.systolic) - c.baseline.systolic > 10 ? 'Your blood pressure is above your own normal, which can cause headaches.' : 'Nothing in the watch data explains it yet, so I have flagged it for today’s root-cause analysis.'}`;
  if (/sleep|tired/.test(q)) return `Last night: ${nights.slice(-1)[0].hours} h, ${nights.slice(-1)[0].cycles} cycles, ${nights.slice(-1)[0].efficiency}% efficiency. Check your suggested sleep window in the Sleep section.`;
  if (/med|pill|dose|drug/.test(q)) return `Today you are scheduled for: ${s.meds[id].map((m) => `${m.name} ${m.dose}`).join(', ')}. The watch can only inject tier 1–2 drugs. Oral and IV drugs are given by a crewmate.`;
  if (/mood|stress|anx|mental/.test(q)) return `Your latest mental-health score is ${mh.score}/100. ${mh.score < 70 ? 'I recommend the daily guided sessions in your plan. These results are shared with mission command.' : 'That’s within your normal range.'}`;
  if (/radiation|dose|shelter/.test(q)) return `Current dose rate is ${Math.round(last.radiationRate)} µSv/h. Take shelter above ${SHELTER_RATE_USV_H} µSv/h.`;
  return 'Noted. I’ve added this to your record and will use it in today’s root-cause analysis. Is anything else bothering you?';
}

// ───────────── Persistence (survives page reloads; vitals are regenerated) ─────────────

const STORE_KEY = 'crew-health-v2';
const PERSIST: (keyof MissionState)[] = ['events', 'stock', 'medLog', 'meds', 'decisions', 'reports', 'earthLink', 'location', 'plans', 'checkins', 'agentChats', 'blood', 'sensorFault', 'rootCauses', 'mentalLive'];

function loadSaved(): Partial<MissionState> | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { savedAt: number; state: Partial<MissionState> };
    // Seeded times are relative to load, so stale saves (>6 h) are discarded.
    return Date.now() - v.savedAt < 6 * 3_600_000 ? v.state : null;
  } catch {
    return null;
  }
}

function save(s: MissionState) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ savedAt: Date.now(), state: Object.fromEntries(PERSIST.map((k) => [k, s[k]])) }));
  } catch {
    /* storage full or unavailable */
  }
}

/** Clears saved demo state and reloads. */
export function resetDemo() {
  localStorage.removeItem(STORE_KEY);
  location.reload();
}

// ───────────── Context ─────────────

interface Ctx {
  s: MissionState;
  dispatch: (a: Action) => void;
}
const MissionCtx = createContext<Ctx | null>(null);

export function MissionProvider({ children }: { children: ReactNode }) {
  const [s, dispatch] = useReducer(reducer, empty);
  useEffect(() => {
    dispatch({ type: 'init' });
    const t = setInterval(() => dispatch({ type: 'tick' }), LIVE_MS);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (s.ready) save(s);
    // Save only on meaningful changes, not on every vitals tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.ready, s.events, s.stock, s.medLog, s.meds, s.decisions, s.reports, s.earthLink, s.location, s.plans, s.checkins, s.agentChats, s.blood, s.sensorFault, s.rootCauses, s.mentalLive]);
  const v = useMemo(() => ({ s, dispatch }), [s]);
  return <MissionCtx.Provider value={v}>{children}</MissionCtx.Provider>;
}

export function useMission() {
  const c = useContext(MissionCtx);
  if (!c) throw new Error('useMission outside MissionProvider');
  return c;
}

// ───────────── Derived ─────────────

export function openEvents(s: MissionState, id?: string) {
  return s.events.filter((e) => (!id || e.astronautId === id) && (e.state === 'countdown' || e.state === 'awaiting-confirm' || e.state === 'crewmate-alerted'));
}

/** Feature 2: the 14-day series, with today's entry replaced by the Gemini-scored check-in when there is one. */
export function mentalSeries(s: MissionState, id: string): MentalCheck[] {
  const seeded = mentalChecks(id);
  const live = s.mentalLive[id];
  return live ? [...seeded.slice(0, -1), live] : seeded;
}

/** Feature 8: the Gemini agent's root cause when it has run, otherwise the seeded one. */
export function rootCauseFor(s: MissionState, id: string): RootCause {
  return s.rootCauses[id] ?? rootCause(id);
}

export function cumulativeDose(s: MissionState, id: string) {
  return PRIOR_DOSE_MSV[id] + doseFromSeries((s.vitals[id] ?? []).slice(0, 288));
}

export function astronautStatus(s: MissionState, id: string): { status: Status; reason: string } {
  const c = CREW.find((x) => x.id === id)!;
  const open = openEvents(s, id);
  if (open.length) return { status: 'critical', reason: CONDITIONS[open[0].condition].label };
  if (s.emergencies[id]) return { status: 'critical', reason: 'Emergency in progress' };
  if (s.sensorFault[id]) return { status: 'watch', reason: 'Watch sensor fault' };
  const last = s.vitals[id]?.slice(-1)[0];
  if (last && last.radiationRate > SHELTER_RATE_USV_H) return { status: 'critical', reason: 'Take shelter: high radiation' };
  const mh = mentalSeries(s, id).slice(-1)[0].score;
  const sleep = sleepNights(id).slice(-1)[0].hours;
  if (id === 'maya') return { status: 'watch', reason: 'Elevated radiation dose after EVA' };
  if (mh < 60) return { status: 'watch', reason: `Mental-health score ${mh}/100` };
  if (last && last.systolic - c.baseline.systolic > 12 && last.activity < 0.5) return { status: 'watch', reason: 'BP above personal baseline' };
  if (sleep < 6) return { status: 'watch', reason: `Short sleep (${sleep} h)` };
  if (last && last.spo2 < 93) return { status: 'watch', reason: 'Blood oxygen below personal baseline' };
  return { status: 'nominal', reason: 'All features within personal baseline' };
}
