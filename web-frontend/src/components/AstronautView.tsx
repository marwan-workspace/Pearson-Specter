'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { ArrowLeft, Brain, Check, ClipboardList, Clock3, HeartPulse, MessagesSquare, Moon, NotebookText, OctagonAlert, Pill, Radiation, RefreshCw, Search, Send, TriangleAlert, Watch, X } from 'lucide-react';
import { astronautStatus, cumulativeDose, fmtDelay, mentalSeries, openEvents, rootCauseFor, useMission } from '@/lib/mission';
import { useAgent } from '@/lib/agent';
import { useActiveSection } from '@/lib/hooks';
import { DOSE_LIMIT_MSV, SHELTER_RATE_USV_H, byId, sleepNights, suggestedWindow, therapyRecommendation } from '@/lib/crew';
import { CONDITIONS, EARTH_REVIEW_SEC, LOCATIONS, TIER_LABEL, scoreSeries } from '@/lib/conditions';
import type { Astronaut, WatchEvent } from '@/lib/types';
import { Stage } from './Stage';
import { BPChart, Hypnogram, Legend, MentalTrend, RadiationChart, SleepWeek, VitalChart } from './charts';
import { Meter, Notice, Panel, Stat, StatusPill, STATUS_META, ago, firstName, fmtTime, scoreTone } from './ui';
import { CheckInChat, AgentChat } from './Chats';
import { BloodTests } from './BloodTests';
import { Reports } from './Reports';
import { GravityDropTest } from './GravityDropTest';
import { HeartbeatSection } from './Heartbeat';

/** Sections grouped by what the reader is doing, in page order. */
const NAV = [
  { group: 'Monitor', items: [['vitals', 'Vitals'], ['sleep', 'Sleep'], ['mental', 'Mental health'], ['radiation', 'Radiation'], ['gravity', 'Bone strength']] },
  { group: 'Care', items: [['medication', 'Medication'], ['plan', 'Root cause and plan'], ['blood', 'Blood tests']] },
  { group: 'Talk', items: [['checkin', 'Daily check-in'], ['agent', 'Manager agent'], ['heartbeat', 'Heartbeat from home']] },
  { group: 'Mission', items: [['reports', 'Mission command'], ['log', 'Decision log']] },
] as const;
const SECTION_IDS = NAV.flatMap((g) => g.items.map(([id]) => id));

const EVENT_STATE: Record<WatchEvent['state'], string> = {
  countdown: 'Cancel window open',
  'awaiting-confirm': 'Waiting for the astronaut to confirm',
  'crewmate-alerted': 'Crewmate alerted',
  administered: 'Administered',
  cancelled: 'Cancelled',
  declined: 'Declined, breathing helped',
  'given-by-crewmate': 'Given by crewmate',
  'blocked-dose-limit': 'Blocked by the dose limit',
};

function SectionNav() {
  const active = useActiveSection(SECTION_IDS);
  return (
    <nav aria-label="Record sections" className="sticky top-14 z-30 -mx-4 border-b border-line bg-space-0/90 px-4 backdrop-blur-md md:-mx-8 md:px-8 xl:top-[72px] xl:mx-0 xl:self-start xl:border-0 xl:bg-transparent xl:px-0 xl:backdrop-blur-none">
      <div className="flex gap-1 overflow-x-auto py-2 xl:flex-col xl:gap-5 xl:overflow-visible xl:py-0">
        {NAV.map((g) => (
          <div key={g.group} className="flex shrink-0 gap-1 xl:flex-col xl:gap-0.5">
            <p className="label hidden px-3 pb-1 xl:block">{g.group}</p>
            {g.items.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={active === id ? 'location' : undefined}
                className={clsx(
                  'relative inline-flex min-h-10 shrink-0 items-center rounded-[4px] px-3 text-sm transition-colors duration-150 xl:min-h-9',
                  active === id ? 'bg-space-2 font-semibold text-ink' : 'text-text-2 hover:bg-space-2 hover:text-ink',
                )}
              >
                {label}
              </a>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}

/* ───────────── Vitals (features 3, 13, 19) ───────────── */

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
  const Chart = ({ title, score, children }: { title: string; score: number; children: React.ReactNode }) => (
    <div className="well p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="label num" style={{ color: STATUS_META[scoreTone(score)].color }}>Score {score}/100</span>
      </div>
      {children}
    </div>
  );
  return (
    <Panel
      id="vitals"
      feature="Features 3, 13, 19"
      title="Vitals, last 24 hours"
      icon={<HeartPulse className="size-5 text-nasa-bright" aria-hidden />}
      lead="Each reading is scored against this astronaut's own baseline, not a population average."
      right={<span className="num text-sm font-semibold" style={{ color: STATUS_META[scoreTone(overall)].color }}>24 h score {overall}/100</span>}
    >
      {fault && (
        <div className="mb-3">
          <Notice tone="watch" role="alert" icon={<Watch className="size-4" aria-hidden />}>
            Sensor fault. The watch is loose or off the wrist: skin contact is lost while motion continues. The flat line is not treated as cardiac arrest.
          </Notice>
        </div>
      )}
      <div className="mb-3">
        <Legend items={[{ label: 'Personal baseline band', color: 'var(--nominal)', area: true }, { label: 'Baseline', color: 'var(--text-3)', dashed: true }]} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Chart title="Heart rate, bpm" score={scores.hr}>
          <VitalChart data={v} k="heartRate" name="Heart rate" unit="bpm" baseline={b.heartRate} tolerance={15} color="var(--chart-2)" />
        </Chart>
        <Chart title="Blood pressure, mmHg" score={scores.bp}>
          <BPChart data={v} baseline={b} />
          <Legend items={[{ label: 'Systolic', color: 'var(--chart-1)' }, { label: 'Diastolic', color: 'var(--chart-3)' }]} />
        </Chart>
        <Chart title="Blood oxygen, %" score={scores.spo2}>
          <VitalChart data={v} k="spo2" name="Blood oxygen" unit="%" baseline={b.spo2} tolerance={3} domain={[80, 100]} />
        </Chart>
        <Chart title="Body temperature, °C" score={scores.temp}>
          <VitalChart data={v} k="temp" name="Temperature" unit="°C" baseline={b.temp} tolerance={0.5} color="var(--chart-3)" domain={[35.5, 39.5]} />
        </Chart>
      </div>
      <p className="mt-3 text-sm text-text-3">Exercise blocks at 10:00 to 11:00 and 16:00 to 16:30 UTC raise heart rate. Activity is taken into account, so these are not scored as abnormal.</p>
    </Panel>
  );
}

/* ───────────── Sleep (feature 1) ───────────── */

function SleepSection({ a }: { a: Astronaut }) {
  const nights = sleepNights(a.id);
  const last = nights[nights.length - 1];
  const win = suggestedWindow(nights);
  return (
    <Panel id="sleep" feature="Feature 1" title="Sleep" icon={<Moon className="size-5 text-nasa-bright" aria-hidden />} lead="Measured by the watch and confirmed in the daily check-in.">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
            <Stat label="Last night" value={last.hours} unit="h" tone={last.hours < 6 ? 'watch' : 'nominal'} />
            <Stat label="Sleep cycles" value={last.cycles} tone={last.cycles < 4 ? 'watch' : 'nominal'} />
            <Stat label="Efficiency" value={last.efficiency} unit="%" tone={last.efficiency < 85 ? 'watch' : 'nominal'} />
            <Stat label="Self-rated" value={last.selfRated} unit="of 5" />
          </div>
          <div className="border-l-2 border-nasa-bright pl-4">
            <p className="label">Suggested sleep window tonight</p>
            <p className="num title text-2xl">{win.start} to {win.end} <span className="label font-normal">UTC</span></p>
            <p className="text-sm text-text-2">Sleep debt over the last 3 nights is <span className="num">{win.debtHours} h</span>{win.debtHours > 3 ? '. Start 30 minutes earlier to recover.' : '.'}</p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Last night&rsquo;s sleep stages</h3>
            <Hypnogram night={last} />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Last 7 nights</h3>
          <SleepWeek nights={nights} height={280} />
        </div>
      </div>
    </Panel>
  );
}

/* ───────────── Mental health (feature 2) ───────────── */

function MentalSection({ a }: { a: Astronaut }) {
  const { s } = useMission();
  const checks = mentalSeries(s, a.id);
  const last = checks[checks.length - 1];
  const therapy = therapyRecommendation(last.score);
  const tone = scoreTone(last.score);
  return (
    <Panel id="mental" feature="Feature 2" title="Mental health" icon={<Brain className="size-5 text-nasa-bright" aria-hidden />} lead="Five set questions a day, scored out of 100 and shared with mission command.">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <p className="mb-2 flex items-baseline gap-2">
            <span className="num display text-5xl" style={{ color: STATUS_META[tone].color }}>{last.score}</span>
            <span className="label">of 100 today, with the 14-day trend below{s.mentalLive[a.id] ? '. Scored by Gemini from today’s check-in.' : ''}</span>
          </p>
          <MentalTrend checks={checks} height={210} />
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Today&rsquo;s answers <span className="label font-normal">0 is worst, 4 is best</span></h3>
            <ul className="flex flex-col gap-2">
              {last.answers.map((x) => (
                <li key={x.q} className="grid grid-cols-[1fr_72px_1.5ch] items-center gap-3 text-sm">
                  <span className="text-text-2">{x.q}</span>
                  <Meter value={x.a} max={4} label={x.q} color={x.a <= 1 ? 'var(--critical)' : x.a === 2 ? 'var(--watch)' : 'var(--nominal)'} />
                  <span className="num text-right font-semibold">{x.a}</span>
                </li>
              ))}
            </ul>
          </div>
          {therapy ? (
            <div className="border-l-2 border-agent pl-4">
              <p className="label">The agent recommends</p>
              <p className="font-semibold">{therapy.sessions}</p>
              <p className="text-sm text-text-2">{therapy.note}</p>
            </div>
          ) : (
            <Notice tone="nominal" icon={<Check className="size-4" aria-hidden />}>No issue spotted. No therapy sessions are needed.</Notice>
          )}
        </div>
      </div>
    </Panel>
  );
}

/* ───────────── Radiation (feature 14) ───────────── */

function RadiationSection({ a }: { a: Astronaut }) {
  const { s } = useMission();
  const v = s.vitals[a.id];
  const total = cumulativeDose(s, a.id);
  const rate = v[v.length - 1].radiationRate;
  const peak = Math.max(...v.map((x) => x.radiationRate));
  const now = rate > SHELTER_RATE_USV_H;
  const earlier = !now && peak > SHELTER_RATE_USV_H;
  return (
    <Panel id="radiation" feature="Feature 14" title="Radiation exposure" icon={<Radiation className="size-5 text-nasa-bright" aria-hidden />}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Dose rate now" value={Math.round(rate)} unit="µSv/h" tone={now ? 'critical' : 'nominal'} />
            <Stat label="24 h peak" value={Math.round(peak)} unit="µSv/h" tone={peak > SHELTER_RATE_USV_H ? 'watch' : 'nominal'} />
          </div>
          <div className="well p-3">
            <p className="label">Mission total</p>
            <p className="num title mb-2 text-3xl">{total.toFixed(1)} <span className="label font-normal">mSv</span></p>
            <Meter value={total} max={DOSE_LIMIT_MSV} label="Mission dose against the career limit" color={total / DOSE_LIMIT_MSV > 0.6 ? 'var(--watch)' : 'var(--chart-1)'} />
            <p className="label mt-1.5"><span className="num">{((total / DOSE_LIMIT_MSV) * 100).toFixed(0)}%</span> of the {DOSE_LIMIT_MSV} mSv career limit</p>
          </div>
          <Notice tone={now ? 'critical' : earlier ? 'watch' : 'info'} role={now ? 'alert' : undefined} icon={now ? <OctagonAlert className="size-4" aria-hidden /> : earlier ? <TriangleAlert className="size-4" aria-hidden /> : undefined}>
            {now ? 'Take shelter now. Move to the shielded area.' : earlier ? `A take-shelter warning was issued in the last 24 hours. The peak was ${Math.round(peak)} µSv/h.` : `No shelter warning. The threshold is ${SHELTER_RATE_USV_H} µSv/h.`}
          </Notice>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Dose rate, last 24 hours <span className="label font-normal">log scale</span></h3>
          <RadiationChart data={v} shelter={SHELTER_RATE_USV_H} height={250} />
        </div>
      </div>
    </Panel>
  );
}

/* ───────────── Medication (features 7, 12) ───────────── */

function MedicationSection({ a }: { a: Astronaut }) {
  const { s, dispatch } = useMission();
  const meds = s.meds[a.id];
  const events = s.events.filter((e) => e.astronautId === a.id);
  const log = s.medLog.filter((m) => m.astronautId === a.id);
  return (
    <Panel id="medication" feature="Features 7, 12" title="Medication" icon={<Pill className="size-5 text-nasa-bright" aria-hidden />}>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold">What {firstName(a.name)} takes</h3>
            <ul className="flex flex-col">
              {meds.map((m) => (
                <li key={m.name} className="border-b border-line py-3 first:pt-0 last:border-b-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-semibold">{m.name} <span className="num label font-normal">{m.dose}, {m.route}</span></p>
                    <span className="label">{m.schedule}</span>
                  </div>
                  <p className="text-sm text-text-3">{m.reason}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.today.length === 0 && <span className="text-sm text-watch">Not started. Waiting for mission command.</span>}
                    {m.today.map((d, i) => {
                      const missed = !d.taken && d.at < s.now;
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={d.taken}
                          onClick={() => dispatch({ type: 'med-taken', id: a.id, med: m.name, index: i })}
                          className={clsx('btn btn-sm border disabled:opacity-100', d.taken ? 'border-nominal/40 text-nominal' : missed ? 'border-critical/60 bg-critical/10 text-critical hover:bg-critical/20' : 'border-line-strong text-text-2 hover:bg-space-3')}
                        >
                          {d.taken ? <Check className="size-4" aria-hidden /> : missed ? <X className="size-4" aria-hidden /> : <Clock3 className="size-4" aria-hidden />}
                          <span className="num">{fmtTime(d.at)}</span> {d.taken ? 'Taken' : missed ? 'Missed, log as taken' : 'Due, log as taken'}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Watch responses</h3>
            {events.length === 0 ? (
              <p className="text-sm text-text-3">No watch events yet. Open the Simulator in the header and inject an emergency to see one.</p>
            ) : (
              <ul className="flex flex-col">
                {events.slice(0, 8).map((e) => (
                  <li key={e.id} className="border-b border-line py-2.5 text-sm first:pt-0 last:border-b-0">
                    <p className="font-semibold">{CONDITIONS[e.condition].label} <span className="label ml-1 font-normal">{TIER_LABEL[CONDITIONS[e.condition].tier]}</span></p>
                    <p className="text-text-2">{e.evidence}, {ago(e.detectedAt, s.now)}</p>
                    <p className={e.suppressed ? 'text-text-3' : 'text-nasa-bright'}>
                      {e.suppressed ? 'False alarm suppressed: explained by exercise' : EVENT_STATE[e.state]}
                      {e.resolvedBy ? `, ${e.resolvedBy}` : ''}
                    </p>
                    {e.rule && <p className="label num">Rule {e.rule}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Medication log</h3>
            {log.length === 0 ? (
              <p className="text-sm text-text-3">No doses recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table min-w-[420px]">
                  <thead><tr><th>Time</th><th>Drug</th><th>Route</th><th>Given by</th></tr></thead>
                  <tbody>
                    {log.slice(0, 8).map((m) => (
                      <tr key={m.id}>
                        <td className="num text-text-3">{fmtTime(m.at)}</td>
                        <td className="font-semibold">{m.drug}</td>
                        <td className="text-text-2">{m.route}</td>
                        <td className="text-text-2">{m.givenBy}<span className="label block">{m.reason}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">On-board stock and dose limits</h3>
            <div className="overflow-x-auto">
              <table className="table min-w-[440px]">
                <thead><tr><th>Drug</th><th>Form</th><th>Stock</th><th>Doses in 24 h</th></tr></thead>
                <tbody>
                  {s.stock.map((x) => {
                    const used = s.medLog.filter((m) => m.astronautId === a.id && m.drug === x.drug && s.now - m.at < 86_400_000).length;
                    const low = x.onBoard / x.initial < 0.3;
                    return (
                      <tr key={x.drug}>
                        <td className="font-medium">{x.drug}</td>
                        <td className="text-text-2">{x.form}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-20"><Meter value={x.onBoard} max={x.initial} label={`${x.drug} stock`} color={low ? 'var(--critical)' : 'var(--chart-1)'} /></div>
                            <span className={clsx('num', low && 'font-semibold text-critical')}>{x.onBoard}/{x.initial}{low ? ' low' : ''}</span>
                          </div>
                        </td>
                        <td className={clsx('num', used >= x.maxPer24h ? 'font-bold text-critical' : 'text-text-2')}>{used} of {x.maxPer24h}{used >= x.maxPer24h ? ', limit reached' : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <details className="rule mt-6 pt-4">
        <summary className="text-sm font-semibold">Medication for each condition, by watch response tier</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="table min-w-[720px]">
            <thead><tr><th>Condition</th><th>First response</th><th>Medication</th><th>Watch can inject</th><th>Tier</th></tr></thead>
            <tbody>
              {Object.values(CONDITIONS).map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.label}</td>
                  <td className="text-text-2">{c.firstResponse}</td>
                  <td>{c.medication}</td>
                  <td>{c.watchCanInject ? 'Yes' : 'No'}</td>
                  <td className="num">{c.tier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <Notice tone="watch" icon={<TriangleAlert className="size-4" aria-hidden />}>
            This table comes from general medical knowledge. It has not been checked against NASA&rsquo;s medical kit or current clinical guidelines and contains no doses. A medical reviewer must check it.
          </Notice>
        </div>
      </details>
    </Panel>
  );
}

/* ───────────── Root cause (8) and treatment plan (4) ───────────── */

function PlanSection({ a }: { a: Astronaut }) {
  const { s } = useMission();
  const { runAssessment, live } = useAgent();
  const rc = rootCauseFor(s, a.id);
  const plan = s.plans[a.id];
  const busy = !!s.pending[`assess:${a.id}`];
  const loc = LOCATIONS[s.location];
  const wait = fmtDelay(Math.round(loc.owltSec * 2 + EARTH_REVIEW_SEC));
  const APPROVAL: Record<string, { label: string; cls: string }> = {
    'not-required': { label: 'Urgent: going ahead now, no approval needed', cls: 'text-critical' },
    'pending-mission-command': s.location === 'mars' ? { label: `Earth review is at least ${wait} away, so the onboard system acts as the doctor`, cls: 'text-watch' } : { label: `Waiting for mission command, reply in about ${wait}`, cls: 'text-watch' },
    approved: { label: 'Approved by mission command', cls: 'text-nominal' },
    'changed-by-mission-command': { label: 'Changed by mission command', cls: 'text-nasa-bright' },
  };
  return (
    <Panel
      id="plan"
      feature="Features 8, 4"
      title="Root cause and treatment plan"
      icon={<Search className="size-5 text-nasa-bright" aria-hidden />}
      lead="The agent looks at the check-in, sleep, mental health and vitals together to find the one underlying problem, then plans around it."
      right={
        <button className="btn btn-sm btn-ghost" onClick={() => void runAssessment(a.id)} disabled={busy}>
          <RefreshCw className={clsx('size-4', busy && 'animate-spin')} aria-hidden /> {busy ? 'Analysing' : live ? 'Run analysis with Gemini' : 'Run analysis again'}
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-2" aria-busy={busy}>
        <div>
          <div className="border-l-2 border-agent pl-4">
            <p className="label">Underlying problem{s.rootCauses[a.id] ? ', found by Gemini' : ''}</p>
            <p className="title text-xl">{rc.problem}</p>
            <p className="label num mt-1">Confidence {Math.round(rc.confidence * 100)}%, {rc.date}</p>
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {rc.factors.map((f, i) => (
              <li key={`${f.source}-${i}`}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <b>{f.source}</b>
                  <span className="label num">Weight {Math.round(f.weight * 100)}%</span>
                </div>
                <Meter value={f.weight} max={1} label={`${f.source} weight`} color="var(--agent)" />
                <p className="mt-1 text-sm text-text-2">{f.finding}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><ClipboardList className="size-4 text-text-3" aria-hidden /> Treatment plan</h3>
          {plan.length === 0 ? (
            <p className="text-sm text-text-3">No plan items. Run the analysis to build one.</p>
          ) : (
            <ul className="flex flex-col">
              {plan.map((p) => (
                <li key={p.id} className="border-b border-line py-3 first:pt-0 last:border-b-0">
                  <p className="font-medium">{p.text}</p>
                  <p className="mt-0.5 text-sm"><span className="label capitalize">{p.kind}</span> <span className={clsx('ml-2', APPROVAL[p.approval].cls)}>{APPROVAL[p.approval].label}</span></p>
                  {p.missionCommandNote && <p className="text-sm text-text-3">Mission command: “{p.missionCommandNote}”</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm text-text-3">Urgent items go ahead with no approval. The rest are checked with mission command first, which takes about {wait} from {loc.label}.</p>
        </div>
      </div>
    </Panel>
  );
}

/* ───────────── Decision log (feature 17) ───────────── */

function DecisionLog({ a }: { a: Astronaut }) {
  const { s } = useMission();
  const rows = s.decisions.filter((d) => !d.astronautId || d.astronautId === a.id).sort((x, y) => y.at - x.at);
  return (
    <Panel id="log" feature="Feature 17" title="Decision log" icon={<NotebookText className="size-5 text-nasa-bright" aria-hidden />} lead="Every watch and agent decision with the rule that fired. Included in the weekly report.">
      <div className="overflow-x-auto">
        <table className="table min-w-[880px]">
          <thead><tr><th>When, UTC</th><th>Who</th><th>Decision</th><th>Rule that fired</th><th>Reason</th></tr></thead>
          <tbody>
            {rows.slice(0, 25).map((d) => (
              <tr key={d.id}>
                <td className="num whitespace-nowrap text-text-3">{new Date(d.at).toISOString().slice(5, 16).replace('T', ' ')}</td>
                <td className="whitespace-nowrap font-semibold">{d.actor}</td>
                <td>{d.decision}</td>
                <td className="num text-text-2">{d.rule ?? 'None'}</td>
                <td className="text-text-2">{d.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ───────────── Page ───────────── */

export function AstronautView({ id }: { id: string }) {
  const { s } = useMission();
  const a = byId(id)!;
  if (!s.ready) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading health record">
        <div className="skeleton h-[520px]" />
        <div className="skeleton h-[320px]" />
      </div>
    );
  }
  const v = s.vitals[id];
  const last = v[v.length - 1];
  const st = astronautStatus(s, id);
  const fault = s.sensorFault[id];
  const open = openEvents(s, id);
  const meds = s.meds[id];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="btn btn-sm btn-quiet -ml-3 self-start">
        <ArrowLeft className="size-4" aria-hidden /> Crew overview
      </Link>

      <section className="panel grid overflow-hidden bg-black lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" aria-label={`${a.name}, summary`}>
        <Stage a={a} interactive className="sm:h-[480px]" />
        <div className="flex flex-col gap-4 border-t border-line bg-space-1 p-5 md:p-6 lg:border-l lg:border-t-0">
          <div>
            <p className="label">{a.role}, age {a.age}</p>
            <h1 className="display mt-1 text-4xl md:text-5xl">{a.name}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusPill status={st.status} />
              <span className="text-sm" style={{ color: st.status === 'nominal' ? 'var(--text-2)' : STATUS_META[st.status].color }}>{st.reason}</span>
            </p>
          </div>
          {open.length > 0 && (
            <Notice tone="critical" role="alert" icon={<OctagonAlert className="size-4" aria-hidden />}>
              Active emergency: {CONDITIONS[open[0].condition].label}. Respond in the banner at the top of the page.
            </Notice>
          )}
          <p className="text-sm text-text-2">{a.scenario}</p>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Radiation" value={Math.round(last.radiationRate)} unit="µSv/h" tone={last.radiationRate > SHELTER_RATE_USV_H ? 'critical' : 'nominal'} />
            <Stat label="Watch" value={fault ? 'Loose' : 'On wrist'} sub={`Updated ${ago(last.t, s.now)}`} tone={fault ? 'watch' : 'nominal'} />
            <Stat label="Days in space" value={a.daysInSpace} />
            <Stat label="Check-in today" value={s.checkins[id].completed ? 'Done' : 'Not yet'} tone={s.checkins[id].completed ? 'nominal' : 'watch'} />
          </div>
          <div className="rule mt-auto pt-4">
            <p className="label mb-1">Medication today</p>
            <p className="text-sm">{meds.length ? meds.map((m) => `${m.name} ${m.dose}`).join(', ') : 'None'}</p>
          </div>
          <p className="label">Drag the suit to turn it. The chest light beats at the live heart rate.</p>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[200px_minmax(0,1fr)] xl:gap-6">
        <SectionNav />
        <div className="flex min-w-0 flex-col gap-4">
          <VitalsSection a={a} />
          <SleepSection a={a} />
          <MentalSection a={a} />
          <RadiationSection a={a} />
          <GravityDropTest a={a} />
          <MedicationSection a={a} />
          <PlanSection a={a} />
          <BloodTests a={a} />
          <Panel id="checkin" feature="Feature 5" title="Daily check-in" icon={<Send className="size-5 text-nasa-bright" aria-hidden />}>
            <CheckInChat a={a} />
          </Panel>
          <Panel id="agent" feature="Feature 9" title="Manager agent" icon={<MessagesSquare className="size-5 text-nasa-bright" aria-hidden />} lead="Available any time. What the astronaut reports takes priority over what the watch shows.">
            <AgentChat a={a} />
          </Panel>
          <HeartbeatSection a={a} />
          <Reports a={a} />
          <DecisionLog a={a} />
        </div>
      </div>
    </div>
  );
}
