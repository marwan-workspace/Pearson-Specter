'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Brain,
  ClipboardList,
  FlaskConical,
  HeartPulse,
  Moon,
  NotebookText,
  Pill,
  Radiation,
  Search,
  Send,
  Watch,
} from 'lucide-react';
import { astronautStatus, cumulativeDose, fmtDelay, openEvents, useMission } from '@/lib/mission';
import { DOSE_LIMIT_MSV, SHELTER_RATE_USV_H, byId, mentalChecks, rootCause, sleepNights, suggestedWindow, therapyRecommendation } from '@/lib/crew';
import { CONDITIONS, EARTH_REVIEW_SEC, LOCATIONS, TIER_LABEL, scoreSeries } from '@/lib/conditions';
import type { Astronaut, WatchEvent } from '@/lib/types';
import { Astronaut3D } from './three/Astronaut3D';
import { BPChart, Hypnogram, Legend, MentalTrend, RadiationChart, SleepWeek, VitalChart } from './charts';
import { Meter, Panel, Stat, StatusPill, STATUS_META, ago, fmtTime, scoreTone } from './ui';
import { CheckInChat, AgentChat } from './Chats';
import { BloodTests } from './BloodTests';
import { Reports } from './Reports';
import { GravityDropTest } from './GravityDropTest';
import { HeartbeatSection } from './Heartbeat';

const NAV = [
  ['vitals', 'Vitals'],
  ['medication', 'Medication'],
  ['sleep', 'Sleep'],
  ['mental', 'Mental health'],
  ['checkin', 'Check-in'],
  ['plan', 'Root cause & plan'],
  ['radiation', 'Radiation'],
  ['gravity', 'Gravity drop test'],
  ['heartbeat', 'Heartbeat from home'],
  ['agent', 'Manager agent'],
  ['blood', 'Blood tests'],
  ['reports', 'Mission command'],
  ['log', 'Decision log'],
] as const;

const EVENT_STATE: Record<WatchEvent['state'], string> = {
  countdown: 'Cancel window open',
  'awaiting-confirm': 'Awaiting astronaut confirmation',
  'crewmate-alerted': 'Crewmate alerted',
  administered: 'Administered',
  cancelled: 'Cancelled',
  declined: 'Declined (breathing helped)',
  'given-by-crewmate': 'Given by crewmate',
  'blocked-dose-limit': 'Blocked: dose limit',
};

/* ───────────────────────── Vitals (features 3 + 13 + 19) ───────────────────────── */

function VitalsSection({ a }: { a: Astronaut }) {
  const { s } = useMission();
  const v = s.vitals[a.id];
  const b = a.baseline;
  const scores = {
    hr: scoreSeries(v.map((x) => x.heartRate - x.activity * 78), b.heartRate, 15),
    bp: scoreSeries(v.map((x) => x.systolic - x.activity * 18), b.systolic, 12),
    spo2: scoreSeries(v.map((x) => x.spo2), b.spo2, 3),
    temp: scoreSeries(v.map((x) => x.temp - x.activity * 0.3), b.temp, 0.5),
  };
  const overall = Math.round((scores.hr + scores.bp + scores.spo2 + scores.temp) / 4);
  const fault = s.sensorFault[a.id];
  const Box = ({ title, score, children }: { title: string; score: number; children: React.ReactNode }) => (
    <div className="rounded-xl border border-line bg-space-0/40 p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="num text-xs font-semibold" style={{ color: STATUS_META[scoreTone(score)].color }}>score {score}/100</span>
      </div>
      {children}
    </div>
  );
  return (
    <Panel
      id="vitals"
      feature="Feature 3 · Short-term vitals evaluation · Feature 13 · Personal baselines"
      title="Last 24 hours of watch data"
      icon={<HeartPulse className="size-5 text-nasa-red" aria-hidden />}
      right={
        <div className="flex items-center gap-3">
          <Legend items={[{ label: 'Personal baseline band', color: 'var(--nominal)', area: true }, { label: 'Baseline', color: 'var(--text-3)', dashed: true }]} />
          <span className="num rounded-lg border px-3 py-1 text-sm font-bold" style={{ color: STATUS_META[scoreTone(overall)].color, borderColor: `color-mix(in srgb, ${STATUS_META[scoreTone(overall)].color} 45%, transparent)` }}>24 h score {overall}</span>
        </div>
      }
    >
      {fault && (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-lg border border-watch/60 bg-watch/10 px-3 py-2 text-sm text-watch">
          <Watch className="size-4" aria-hidden /> Feature 19: sensor fault. The watch is loose or removed (skin contact lost, motion present). The flatline is <b>not</b> treated as cardiac arrest.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <Box title="Heart rate (bpm)" score={scores.hr}>
          <VitalChart data={v} k="heartRate" name="Heart rate" unit="bpm" baseline={b.heartRate} tolerance={15} color="var(--nasa-red)" />
        </Box>
        <Box title="Blood pressure (mmHg)" score={scores.bp}>
          <BPChart data={v} baseline={b} />
          <Legend items={[{ label: 'Systolic', color: 'var(--chart-1)' }, { label: 'Diastolic', color: 'var(--chart-3)' }]} />
        </Box>
        <Box title="Blood oxygen SpO₂ (%)" score={scores.spo2}>
          <VitalChart data={v} k="spo2" name="SpO₂" unit="%" baseline={b.spo2} tolerance={3} domain={[80, 100]} />
        </Box>
        <Box title="Body temperature (°C)" score={scores.temp}>
          <VitalChart data={v} k="temp" name="Temperature" unit="°C" baseline={b.temp} tolerance={0.5} color="var(--chart-2)" domain={[35.5, 39.5]} />
        </Box>
      </div>
      <p className="mt-2 text-xs text-text-3">Exercise blocks (10:00–11:00, 16:00–16:30 UTC) raise heart rate. The model uses activity context, so these are not scored as abnormal.</p>
    </Panel>
  );
}

/* ───────────────────────── Medication (features 7 + 12) ───────────────────────── */

function MedicationSection({ a }: { a: Astronaut }) {
  const { s, dispatch } = useMission();
  const meds = s.meds[a.id];
  const events = s.events.filter((e) => e.astronautId === a.id);
  const log = s.medLog.filter((m) => m.astronautId === a.id);
  return (
    <Panel id="medication" feature="Feature 7 · On-the-spot medication · Feature 12 · Medication log and stock" title="Medication" icon={<Pill className="size-5 text-nasa-bright" aria-hidden />}>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold">What {a.name.split(' ')[0]} takes</h3>
            <ul className="flex flex-col gap-2">
              {meds.map((m) => (
                <li key={m.name} className="rounded-xl border border-line bg-space-0/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{m.name} <span className="num text-sm font-normal text-text-2">{m.dose} · {m.route}</span></p>
                    <span className="text-xs text-text-3">{m.schedule}</span>
                  </div>
                  <p className="text-xs text-text-3">{m.reason}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.today.length === 0 && <span className="text-xs text-watch">Not started: awaiting mission command</span>}
                    {m.today.map((d, i) => (
                      <button
                        key={i}
                        type="button"
                        disabled={d.taken}
                        onClick={() => dispatch({ type: 'med-taken', id: a.id, med: m.name, index: i })}
                        className={`num inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold ${d.taken ? 'border-nominal/50 text-nominal' : d.at < s.now ? 'border-critical/60 bg-critical/10 text-critical' : 'border-line-strong text-text-2 hover:bg-space-3'}`}
                        aria-label={`${m.name} ${fmtTime(d.at)}: ${d.taken ? 'taken' : d.at < s.now ? 'missed, select to log as taken' : 'upcoming, select to log as taken'}`}
                      >
                        {fmtTime(d.at)} · {d.taken ? '✓ taken' : d.at < s.now ? '✕ missed' : '◷ due'}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Watch responses</h3>
            {events.length === 0 ? (
              <p className="text-sm text-text-3">No events. Use the Simulator to inject an emergency.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {events.slice(0, 8).map((e) => (
                  <li key={e.id} className="rounded-xl border border-line bg-space-0/40 p-3 text-sm">
                    <p className="font-semibold">{CONDITIONS[e.condition].label} <span className="ml-1 text-xs font-normal text-text-3">{TIER_LABEL[CONDITIONS[e.condition].tier]}</span></p>
                    <p className="text-xs text-text-2">{e.evidence} · {ago(e.detectedAt, s.now)}</p>
                    {e.rule && <p className="num text-[11px] text-agent">Rule {e.rule}</p>}
                    <p className={`text-xs font-semibold ${e.suppressed ? 'text-text-3' : 'text-nasa-bright'}`}>
                      {e.suppressed ? 'False alarm suppressed (activity context)' : EVENT_STATE[e.state]}
                      {e.resolvedBy ? ` · ${e.resolvedBy}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Medication log</h3>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {log.length === 0 && <li className="p-3 text-sm text-text-3">No doses recorded.</li>}
              {log.slice(0, 8).map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                  <span className="num text-xs text-text-3">{fmtTime(m.at)}</span>
                  <b>{m.drug}</b>
                  <span className="text-text-2">{m.route}</span>
                  <span className="ml-auto text-xs text-text-3">{m.givenBy} · {m.reason}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">On-board stock and dose limits</h3>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-space-2 text-left text-[11px] uppercase tracking-wider text-text-3">
                  <tr><th className="px-3 py-2">Drug</th><th className="px-3 py-2">Form</th><th className="px-3 py-2">Stock</th><th className="px-3 py-2">Limit / 24 h</th></tr>
                </thead>
                <tbody>
                  {s.stock.map((x) => {
                    const used = s.medLog.filter((m) => m.astronautId === a.id && m.drug === x.drug && s.now - m.at < 86_400_000).length;
                    return (
                      <tr key={x.drug} className="border-t border-line">
                        <td className="px-3 py-1.5 font-medium">{x.drug}</td>
                        <td className="px-3 py-1.5 text-text-2">{x.form}</td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <Meter value={x.onBoard} max={x.initial} label={`${x.drug} stock`} color={x.onBoard / x.initial < 0.3 ? 'var(--critical)' : 'var(--chart-1)'} />
                            <span className="num w-10 text-right text-xs">{x.onBoard}/{x.initial}</span>
                          </div>
                        </td>
                        <td className={`num px-3 py-1.5 ${used >= x.maxPer24h ? 'font-bold text-critical' : 'text-text-2'}`}>{used}/{x.maxPer24h}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <details className="mt-4 rounded-xl border border-line bg-space-0/40 p-3">
        <summary className="cursor-pointer text-sm font-semibold">Medication per condition (watch response tiers)</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-text-3">
              <tr><th className="py-1.5">Condition</th><th>First response</th><th>Medication</th><th>Watch can inject?</th><th>Tier</th></tr>
            </thead>
            <tbody>
              {Object.values(CONDITIONS).map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="py-1.5 pr-2 font-medium">{c.label}</td>
                  <td className="pr-2 text-text-2">{c.firstResponse}</td>
                  <td className="pr-2">{c.medication}</td>
                  <td className="pr-2">{c.watchCanInject ? 'Yes' : 'No'}</td>
                  <td className="num">{c.tier}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 rounded-lg border border-watch/50 bg-watch/10 px-3 py-2 text-xs text-watch">
            Warning: this table comes from general medical knowledge. It has not been checked against NASA’s medical kit or current clinical guidelines, and contains no doses. A medical reviewer must check it.
          </p>
        </div>
      </details>
    </Panel>
  );
}

/* ───────────────────────── Sleep (feature 1) ───────────────────────── */

function SleepSection({ a }: { a: Astronaut }) {
  const nights = sleepNights(a.id);
  const last = nights[nights.length - 1];
  const win = suggestedWindow(nights);
  return (
    <Panel id="sleep" feature="Feature 1 · Sleep tracker (watch + check-in)" title="Sleep" icon={<Moon className="size-5 text-nasa-bright" aria-hidden />}>
      <div className="grid gap-4 xl:grid-cols-[2fr_3fr]">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Last night" value={last.hours} unit="h" tone={last.hours < 6 ? 'watch' : 'nominal'} />
            <Stat label="Sleep cycles" value={last.cycles} tone={last.cycles < 4 ? 'watch' : 'nominal'} />
            <Stat label="Efficiency" value={last.efficiency} unit="%" tone={last.efficiency < 85 ? 'watch' : 'nominal'} />
            <Stat label="Self-rated" value={`${last.selfRated}/5`} sub="from check-in" />
          </div>
          <div className="rounded-xl border border-nasa-bright/40 bg-nasa-blue/20 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-nasa-bright">Suggested sleep window</p>
            <p className="num text-2xl font-semibold">{win.start} – {win.end} <span className="text-sm font-normal text-text-3">UTC</span></p>
            <p className="text-xs text-text-2">Sleep debt over the last 3 nights: <span className="num">{win.debtHours} h</span>{win.debtHours > 3 ? '. Start 30 min earlier to recover.' : '.'}</p>
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold">Last night’s sleep pattern</p>
            <Hypnogram night={last} />
          </div>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold">Last 7 nights</p>
          <SleepWeek nights={nights} height={260} />
        </div>
      </div>
    </Panel>
  );
}

/* ───────────────────────── Mental health (feature 2) ───────────────────────── */

function MentalSection({ a }: { a: Astronaut }) {
  const checks = mentalChecks(a.id);
  const last = checks[checks.length - 1];
  const therapy = therapyRecommendation(last.score);
  return (
    <Panel id="mental" feature="Feature 2 · Mental health checks" title="Mental health" icon={<Brain className="size-5 text-agent" aria-hidden />}
      right={<span className="rounded-lg border border-line px-3 py-1 text-xs text-text-2">Results sent to mission command ✓</span>}>
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <div>
          <div className="mb-2 flex items-baseline gap-3">
            <span className="num text-4xl font-semibold" style={{ color: STATUS_META[scoreTone(last.score)].color }}>{last.score}</span>
            <span className="text-text-3">/100 today · 14-day trend</span>
          </div>
          <MentalTrend checks={checks} height={200} />
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1.5 text-sm font-semibold">Today’s set questions <span className="font-normal text-text-3">(0–4)</span></p>
            <ul className="flex flex-col gap-1.5">
              {last.answers.map((x) => (
                <li key={x.q} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 text-text-2">{x.q}</span>
                  <div className="w-20"><Meter value={x.a} max={4} label={x.q} color={x.a <= 1 ? 'var(--critical)' : x.a === 2 ? 'var(--watch)' : 'var(--nominal)'} /></div>
                  <span className="num w-4 text-right">{x.a}</span>
                </li>
              ))}
            </ul>
          </div>
          {therapy ? (
            <div className="rounded-xl border border-agent/50 bg-agent/10 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-agent">Agent recommends</p>
              <p className="font-semibold">{therapy.sessions}</p>
              <p className="text-xs text-text-2">{therapy.note}</p>
            </div>
          ) : (
            <p className="rounded-xl border border-nominal/40 bg-nominal/10 p-3 text-sm text-nominal">No issue spotted. No therapy sessions needed.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

/* ───────────────────────── Root cause (8) + Treatment plan (4) ───────────────────────── */

function PlanSection({ a }: { a: Astronaut }) {
  const { s } = useMission();
  const rc = rootCause(a.id);
  const plan = s.plans[a.id];
  const loc = LOCATIONS[s.location];
  const wait = fmtDelay(Math.round(loc.owltSec * 2 + EARTH_REVIEW_SEC));
  const APPROVAL: Record<string, { label: string; cls: string }> = {
    'not-required': { label: 'Urgent: proceeding now (no approval needed)', cls: 'border-critical/60 text-critical bg-critical/10' },
    'pending-mission-command':
      s.location === 'mars'
        ? { label: `Earth review pending (≥ ${wait} away): onboard system acting as doctor`, cls: 'border-nasa-red/60 text-white bg-nasa-red/20' }
        : { label: `Waiting for mission command (reply ≈ ${wait})`, cls: 'border-watch/60 text-watch bg-watch/10' },
    approved: { label: 'Approved by mission command', cls: 'border-nominal/50 text-nominal bg-nominal/10' },
    'changed-by-mission-command': { label: 'Changed by mission command', cls: 'border-nasa-bright/60 text-nasa-bright' },
  };
  return (
    <div id="plan" className="grid scroll-mt-28 gap-4 xl:grid-cols-2">
      <Panel feature="Feature 8 · Root-cause analysis (runs daily with the check-in)" title="Underlying problem" icon={<Search className="size-5 text-agent" aria-hidden />}>
        <div className="rounded-xl border border-agent/50 bg-agent/10 p-3">
          <p className="text-lg font-semibold">{rc.problem}</p>
          <p className="num text-xs text-text-2">Confidence {Math.round(rc.confidence * 100)}% · {rc.date}</p>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {rc.factors.map((f) => (
            <li key={f.source} className="rounded-lg border border-line p-2.5">
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <b>{f.source}</b>
                <span className="num text-xs text-text-3">weight {Math.round(f.weight * 100)}%</span>
              </div>
              <Meter value={f.weight} max={1} label={`${f.source} weight`} color="var(--agent)" />
              <p className="mt-1 text-sm text-text-2">{f.finding}</p>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel feature="Feature 4 · Treatment plan" title="Plan for the underlying problem" icon={<ClipboardList className="size-5 text-nasa-bright" aria-hidden />}>
        <ul className="flex flex-col gap-2">
          {plan.map((p) => (
            <li key={p.id} className="rounded-xl border border-line bg-space-0/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-line-strong px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-2">{p.kind}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${APPROVAL[p.approval].cls}`}>{APPROVAL[p.approval].label}</span>
              </div>
              <p className="mt-1.5 font-medium">{p.text}</p>
              {p.missionCommandNote && <p className="text-xs text-text-3">Mission command: “{p.missionCommandNote}”</p>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-text-3">Urgent items proceed with no approval. Non-urgent items are checked with mission command first. At {loc.label} that takes about {wait} (feature 20).</p>
      </Panel>
    </div>
  );
}

/* ───────────────────────── Radiation (feature 14) ───────────────────────── */

function RadiationSection({ a }: { a: Astronaut }) {
  const { s } = useMission();
  const v = s.vitals[a.id];
  const total = cumulativeDose(s, a.id);
  const rate = v[v.length - 1].radiationRate;
  const peak = Math.max(...v.map((x) => x.radiationRate));
  return (
    <Panel id="radiation" feature="Feature 14 · Radiation exposure tracker" title="Radiation exposure" icon={<Radiation className="size-5 text-chart-2" aria-hidden />}>
      <div className="grid gap-4 xl:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Dose rate now" value={Math.round(rate)} unit="µSv/h" tone={rate > SHELTER_RATE_USV_H ? 'critical' : 'nominal'} />
            <Stat label="24 h peak" value={Math.round(peak)} unit="µSv/h" tone={peak > SHELTER_RATE_USV_H ? 'watch' : 'nominal'} />
          </div>
          <div className="rounded-xl border border-line bg-space-0/40 p-3">
            <p className="text-xs text-text-3">Running total (mission)</p>
            <p className="num text-3xl font-semibold">{total.toFixed(1)} <span className="text-sm font-normal text-text-3">mSv</span></p>
            <Meter value={total} max={DOSE_LIMIT_MSV} label="Cumulative dose against career limit" color={total / DOSE_LIMIT_MSV > 0.6 ? 'var(--watch)' : 'var(--chart-2)'} />
            <p className="mt-1 text-xs text-text-3"><span className="num">{((total / DOSE_LIMIT_MSV) * 100).toFixed(0)}%</span> of {DOSE_LIMIT_MSV} mSv career limit</p>
          </div>
          <p className={`rounded-xl border p-3 text-sm ${rate > SHELTER_RATE_USV_H ? 'border-critical/60 bg-critical/15 font-semibold text-critical' : peak > SHELTER_RATE_USV_H ? 'border-watch/50 bg-watch/10 text-watch' : 'border-line text-text-2'}`}>
            {rate > SHELTER_RATE_USV_H ? 'TAKE SHELTER NOW. Move to the shielded area.' : peak > SHELTER_RATE_USV_H ? `A take-shelter warning was issued in the last 24 h (peak ${Math.round(peak)} µSv/h).` : `No shelter warning. The threshold is ${SHELTER_RATE_USV_H} µSv/h.`}
          </p>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold">Dose rate, last 24 h <span className="font-normal text-text-3">(log scale)</span></p>
          <RadiationChart data={v} shelter={SHELTER_RATE_USV_H} height={240} />
        </div>
      </div>
    </Panel>
  );
}

/* ───────────────────────── Decision log (feature 17) ───────────────────────── */

function DecisionLog({ a }: { a: Astronaut }) {
  const { s } = useMission();
  const rows = s.decisions.filter((d) => !d.astronautId || d.astronautId === a.id).sort((x, y) => y.at - x.at);
  return (
    <Panel id="log" feature="Feature 17 · Decision log: every watch and agent decision, with the rule that fired (included in the weekly report)" title="Decision log" icon={<NotebookText className="size-5 text-text-2" aria-hidden />}>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-space-2 text-left text-[11px] uppercase tracking-wider text-text-3">
            <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Who</th><th className="px-3 py-2">Decision</th><th className="px-3 py-2">Rule that fired</th><th className="px-3 py-2">Reason</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, 25).map((d) => (
              <tr key={d.id} className="border-t border-line align-top">
                <td className="num whitespace-nowrap px-3 py-2 text-xs text-text-3">{new Date(d.at).toISOString().slice(5, 16).replace('T', ' ')}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-agent">{d.actor}</td>
                <td className="px-3 py-2">{d.decision}</td>
                <td className="num px-3 py-2 text-[11px] text-agent">{d.rule ?? '—'}</td>
                <td className="px-3 py-2 text-text-2">{d.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export function AstronautView({ id }: { id: string }) {
  const { s } = useMission();
  const a = byId(id)!;
  if (!s.ready) return <div className="panel h-[480px] animate-pulse" aria-busy="true" />;
  const v = s.vitals[id];
  const last = v[v.length - 1];
  const st = astronautStatus(s, id);
  const fault = s.sensorFault[id];
  const open = openEvents(s, id);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-text-2 hover:text-white">
        <ArrowLeft className="size-4" aria-hidden /> Crew overview
      </Link>

      {/* Hero: interactive 3D model + live readout */}
      <section className="panel grid overflow-hidden lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" aria-label={`${a.name} summary`}>
        <div className="relative h-[420px] bg-[radial-gradient(circle_at_50%_40%,rgba(11,61,145,0.55),transparent_70%)]">
          <Astronaut3D label={`Interactive 3D model of ${a.name}. Drag to rotate.`} suitColor={a.suitColor} visorTint={a.visorTint} status={st.status} heartRate={fault ? 0 : last.heartRate} interactive stars />
          <p className="pointer-events-none absolute left-4 top-3 text-xs text-text-3">Drag to rotate · chest beacon pulses at live heart rate</p>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">{a.role}</p>
              <h1 className="text-3xl font-semibold tracking-tight">{a.name}</h1>
              <p className="text-sm text-text-3">Age {a.age} · {a.scenario}</p>
            </div>
            <StatusPill status={st.status} />
          </div>
          <p className="text-sm" style={{ color: STATUS_META[st.status].color }}>{st.reason}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Heart rate" value={fault ? '—' : Math.round(last.heartRate)} unit="bpm" sub={`baseline ${a.baseline.heartRate}`} tone={!fault && Math.abs(last.heartRate - a.baseline.heartRate - last.activity * 78) > 25 ? 'critical' : 'nominal'} />
            <Stat label="Blood pressure" value={`${Math.round(last.systolic)}/${Math.round(last.diastolic)}`} unit="mmHg" sub={`baseline ${a.baseline.systolic}/${a.baseline.diastolic}`} tone={last.systolic > 140 || last.systolic < 90 ? 'watch' : 'nominal'} />
            <Stat label="Blood oxygen" value={fault ? '—' : Math.round(last.spo2)} unit="%" tone={!fault && last.spo2 < 93 ? 'critical' : 'nominal'} />
            <Stat label="Body temp" value={last.temp.toFixed(1)} unit="°C" tone={last.temp > 38 ? 'watch' : 'nominal'} />
            <Stat label="Radiation" value={Math.round(last.radiationRate)} unit="µSv/h" tone={last.radiationRate > SHELTER_RATE_USV_H ? 'critical' : 'nominal'} />
            <Stat label="Watch" value={fault ? 'Loose' : 'On wrist'} sub={`updated ${ago(last.t, s.now)}`} tone={fault ? 'watch' : 'nominal'} />
          </div>
          <div className="rounded-xl border border-line bg-space-0/40 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-3"><Pill className="size-3.5" aria-hidden /> Takes</p>
            <p className="text-sm">{s.meds[id].map((m) => `${m.name} ${m.dose}`).join(' · ')}</p>
          </div>
          {open.length > 0 && <p className="rounded-lg border border-critical/60 bg-critical/15 px-3 py-2 text-sm font-semibold text-critical">Active emergency: {CONDITIONS[open[0].condition].label}. See the banner above.</p>}
        </div>
      </section>

      {/* Section nav */}
      <nav aria-label="Sections" className="sticky top-16 z-30 -mx-1 flex gap-1 overflow-x-auto rounded-xl border border-line bg-space-0/85 p-1 backdrop-blur">
        {NAV.map(([href, label]) => (
          <a key={href} href={`#${href}`} className="inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 text-sm text-text-2 hover:bg-space-3 hover:text-white">{label}</a>
        ))}
      </nav>

      <VitalsSection a={a} />
      <MedicationSection a={a} />
      <SleepSection a={a} />
      <MentalSection a={a} />
      <Panel id="checkin" feature="Feature 5 · Daily check-in" title="Daily check-in with the agent" icon={<Send className="size-5 text-agent" aria-hidden />}>
        <CheckInChat a={a} />
      </Panel>
      <PlanSection a={a} />
      <RadiationSection a={a} />
      <GravityDropTest a={a} />
      <HeartbeatSection a={a} />
      <Panel id="agent" feature="Feature 9 · Manager agent" title="Talk to the manager agent" icon={<FlaskConical className="size-5 text-agent" aria-hidden />}>
        <AgentChat a={a} />
      </Panel>
      <BloodTests a={a} />
      <Reports a={a} />
      <DecisionLog a={a} />
    </div>
  );
}
