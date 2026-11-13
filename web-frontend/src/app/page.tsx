'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { astronautStatus, mentalSeries, useMission, type MissionState } from '@/lib/mission';
import { CREW, sleepNights } from '@/lib/crew';
import { scoreSeries } from '@/lib/conditions';
import type { Astronaut, Status } from '@/lib/types';
import { Stage } from '@/components/Stage';
import { STATUS_META, StatusPill, initials, scoreTone } from '@/components/ui';

const RANK: Record<Status, number> = { critical: 0, watch: 1, nominal: 2 };

function vitalsScore(s: MissionState, a: Astronaut) {
  const v = s.vitals[a.id] ?? [];
  return Math.round(
    (scoreSeries(v.map((x) => x.heartRate - x.activity * 78), a.baseline.heartRate, 15) +
      scoreSeries(v.map((x) => x.systolic - x.activity * 18), a.baseline.systolic, 12) +
      scoreSeries(v.map((x) => x.spo2), a.baseline.spo2, 3)) / 3,
  );
}

/** Last five minutes of heart rate as a plain SVG line: no chart library needed for 60 points. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <svg className="h-8 w-24" aria-hidden />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(8, hi - lo);
  const pts = values.map((y, i) => `${((i / (values.length - 1)) * 96).toFixed(1)},${(28 - ((y - lo) / span) * 24).toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 96 32" className="h-8 w-24 shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Metric({ label, value, unit, tone }: { label: string; value: string | number; unit?: string; tone: Status }) {
  const off = tone !== 'nominal';
  const I = STATUS_META[tone].icon;
  return (
    <div>
      <dt className="label flex items-center gap-1">
        {label}
        {off && <I className="size-3" style={{ color: STATUS_META[tone].color }} aria-label={STATUS_META[tone].label} />}
      </dt>
      <dd className="num text-lg font-semibold leading-tight" style={off ? { color: STATUS_META[tone].color } : undefined}>
        {value}
        {unit && <span className="label ml-0.5 font-normal">{unit}</span>}
      </dd>
    </div>
  );
}

function CrewRow({ a, selected, onSelect }: { a: Astronaut; selected: boolean; onSelect: () => void }) {
  const { s } = useMission();
  const v = s.vitals[a.id] ?? [];
  const last = v[v.length - 1];
  const st = astronautStatus(s, a.id);
  const fault = !!s.sensorFault[a.id];
  const night = sleepNights(a.id).slice(-1)[0];
  const mh = mentalSeries(s, a.id).slice(-1)[0].score;
  const plan = s.plans[a.id] ?? [];
  const urgent = plan.filter((p) => p.urgent).length;
  const score = vitalsScore(s, a);

  return (
    <li className={clsx('relative flex border-b border-line transition-colors duration-150 last:border-b-0', selected ? 'bg-space-2' : 'hover:bg-space-2/60')}>
      {/* Selected marker */}
      <span aria-hidden className={clsx('absolute inset-y-0 left-0 w-[3px] origin-center bg-nasa-bright transition-transform duration-200 ease-out', selected ? 'scale-y-100' : 'scale-y-0')} />
      <button type="button" onClick={onSelect} aria-pressed={selected} className="min-w-0 flex-1 px-4 py-4 text-left md:px-5">
        <span className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-space-3 text-sm font-bold" aria-hidden>{initials(a.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="title block truncate text-lg">{a.name}</span>
            <span className="label block">{a.role}, age {a.age}</span>
          </span>
          <span className="hidden text-right sm:block">
            <Sparkline values={fault ? [] : v.slice(-60).map((x) => x.heartRate)} color={STATUS_META[st.status].color} />
          </span>
          <StatusPill status={st.status} size="sm" />
        </span>
        <span className="mt-2 block text-sm" style={{ color: st.status === 'nominal' ? 'var(--text-2)' : STATUS_META[st.status].color }}>{st.reason}</span>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
          <Metric label="Heart rate" value={fault || !last ? 'No signal' : Math.round(last.heartRate)} unit={fault ? undefined : 'bpm'} tone={fault ? 'watch' : 'nominal'} />
          <Metric label="Vitals, 24 h" value={fault ? 'Fault' : score} unit={fault ? undefined : '/100'} tone={fault ? 'watch' : scoreTone(score)} />
          <Metric label="Sleep" value={night.hours} unit="h" tone={night.hours < 6 ? 'watch' : 'nominal'} />
          <Metric label="Mental health" value={mh} unit="/100" tone={scoreTone(mh)} />
          <Metric label="Plan" value={plan.length} unit={`${plan.length === 1 ? 'item' : 'items'}${urgent ? `, ${urgent} urgent` : ''}`} tone={urgent ? 'watch' : 'nominal'} />
        </dl>
      </button>
      <Link href={`/astronaut/${a.id}`} className="grid w-12 shrink-0 place-items-center border-l border-line text-text-3 transition-colors duration-150 hover:bg-space-3 hover:text-ink" aria-label={`Open ${a.name}'s full record`}>
        <ChevronRight className="size-5" aria-hidden />
      </Link>
    </li>
  );
}

export default function CrewOverview() {
  const { s } = useMission();
  const [picked, setPicked] = useState<string | null>(null);

  // Open on whoever needs attention most; after that the choice is the user's.
  const worst = s.ready ? [...CREW].sort((x, y) => RANK[astronautStatus(s, x.id).status] - RANK[astronautStatus(s, y.id).status])[0].id : null;
  useEffect(() => {
    if (picked === null && worst) setPicked(worst);
  }, [picked, worst]);

  if (!s.ready || !picked) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" aria-busy="true" aria-label="Loading crew data">
        <div className="skeleton h-[420px] lg:h-[680px]" />
        <div className="skeleton h-[680px]" />
      </div>
    );
  }

  const a = CREW.find((c) => c.id === picked)!;
  const st = astronautStatus(s, a.id);
  const statuses = CREW.map((c) => astronautStatus(s, c.id).status);
  const meds = s.meds[a.id] ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h1 className="display text-2xl md:text-3xl">Crew overview</h1>
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" aria-label="Crew status summary">
          {(['critical', 'watch', 'nominal'] as const).map((k) => {
            const m = STATUS_META[k];
            const I = m.icon;
            const n = statuses.filter((x) => x === k).length;
            return (
              <li key={k} className="flex items-center gap-1.5" style={{ color: n ? m.color : 'var(--text-3)' }}>
                <I className="size-4" aria-hidden strokeWidth={2.5} /> <b className="num">{n}</b> {m.label.toLowerCase()}
              </li>
            );
          })}
          <li className="flex items-center gap-2 text-text-3">
            <span className="live-dot size-2 rounded-full bg-nominal" aria-hidden /> Watch data, live
          </li>
        </ul>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="panel overflow-hidden bg-black lg:sticky lg:top-[72px]" aria-label={`${a.name}, selected crew member`}>
          <Stage a={a} className="sm:h-[min(56vh,520px)] sm:min-h-[380px]" />
          <div key={a.id} className="fade-in rule flex flex-wrap items-end justify-between gap-4 bg-space-1 p-4 md:p-5">
            <div className="min-w-0">
              <p className="label">{a.role}</p>
              <h2 className="display text-3xl md:text-4xl">{a.name}</h2>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <StatusPill status={st.status} size="sm" />
                <span className="text-text-2">{st.reason}</span>
              </p>
              <p className="label mt-3">
                Medication today: <span className="text-text-2">{meds.length ? meds.map((m) => m.name).join(', ') : 'none'}</span>
              </p>
            </div>
            <Link href={`/astronaut/${a.id}`} className="btn btn-primary">
              Open full record <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>

        <section className="panel overflow-hidden" aria-labelledby="roster-h">
          <h2 id="roster-h" className="sr-only">Crew</h2>
          <ul>
            {CREW.map((c) => <CrewRow key={c.id} a={c} selected={c.id === picked} onSelect={() => setPicked(c.id)} />)}
          </ul>
        </section>
      </div>
    </div>
  );
}
