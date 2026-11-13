'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ArrowRight, ChevronRight, CircleOff, Eye, Flag } from 'lucide-react';
import { astronautStatus, mentalSeries, useMission, type MissionState } from '@/lib/mission';
import { CREW, sleepNights } from '@/lib/crew';
import { scoreSeries } from '@/lib/conditions';
import type { Astronaut, Status } from '@/lib/types';
import { Stage } from '@/components/Stage';
import { STATUS_META, StatusFlash, StatusPill, initials, scoreTone } from '@/components/ui';
import { Rolling } from '@/components/Rolling';

const RANK: Record<Status, number> = { critical: 0, watch: 1, nominal: 2 };

function vitalsScore(s: MissionState, a: Astronaut) {
  const v = s.vitals[a.id] ?? [];
  return Math.round(
    (scoreSeries(v.map((x) => x.heartRate - x.activity * 78), a.baseline.heartRate, 15) +
      scoreSeries(v.map((x) => x.systolic - x.activity * 18), a.baseline.systolic, 12) +
      scoreSeries(v.map((x) => x.spo2), a.baseline.spo2, 3)) / 3,
  );
}

/** How far from fine someone is: status first, then their weakest score. Lower sorts first. */
function urgency(s: MissionState, a: Astronaut) {
  const mh = mentalSeries(s, a.id).slice(-1)[0].score;
  return RANK[astronautStatus(s, a.id).status] * 1000 + Math.min(mh, vitalsScore(s, a));
}

/* The roster is a manifest: one grid, so every figure lines up under its column heading. */
const COLS = 'md:grid-cols-[minmax(0,1.75fr)_repeat(4,minmax(0,0.6fr))_44px]';
const HEADINGS = ['Vitals, 24 h', 'Sleep', 'Mental health', 'Plan'];

function Cell({ label, value, unit, sub, tone, missing }: { label: string; value: string | number; unit?: string; sub?: string; tone: Status; missing?: boolean }) {
  const off = tone !== 'nominal';
  const I = STATUS_META[tone].icon;
  return (
    <span className="block md:self-center">
      <span className="label block text-text-2 md:sr-only">{label}</span>
      {missing ? (
        <span className="flex items-center gap-1 whitespace-nowrap text-base font-semibold text-watch">
          <CircleOff className="size-4 shrink-0" aria-hidden strokeWidth={2.5} /> No signal
        </span>
      ) : (
        <span className="num flex items-baseline gap-1 whitespace-nowrap text-2xl font-semibold leading-tight" style={off ? { color: STATUS_META[tone].color } : undefined}>
          <Rolling text={String(value)} rollKey="load" duration={900} />
          {unit && <span className="text-sm font-normal text-text-2">{unit}</span>}
          {off && <I className="size-4 self-center" aria-label={STATUS_META[tone].label} strokeWidth={2.5} />}
        </span>
      )}
      {sub && <span className="label block">{sub}</span>}
    </span>
  );
}

function CrewRow({ a, selected, first, index, onSelect }: { a: Astronaut; selected: boolean; first: boolean; index: number; onSelect: () => void }) {
  const { s } = useMission();
  const st = astronautStatus(s, a.id);
  const fault = !!s.sensorFault[a.id];
  const night = sleepNights(a.id).slice(-1)[0];
  const mh = mentalSeries(s, a.id).slice(-1)[0].score;
  const plan = s.plans[a.id] ?? [];
  const urgent = plan.filter((p) => p.urgent).length;
  const score = vitalsScore(s, a);

  return (
    <li className={clsx('stage-in relative grid border-t border-line md:col-span-6 md:grid-cols-subgrid', 'grid-cols-[minmax(0,1fr)_48px]', selected && 'bg-space-2')} style={{ ['--i' as string]: index }}>
      <StatusFlash status={st.status} />
      {/* Selection marker: a solid bar plus the word "Viewing", so it never depends on colour. It moves at once. */}
      <span aria-hidden className={clsx('absolute inset-y-0 left-0 w-1 origin-center bg-ink transition-transform duration-150 ease-out', selected ? 'scale-y-100' : 'scale-y-0')} />
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={clsx('row-btn grid grid-cols-2 gap-x-4 gap-y-3 py-4 pl-5 pr-3 text-left transition-colors duration-150 focus-visible:-outline-offset-2 md:col-span-5 md:grid-cols-subgrid md:gap-y-0 md:pr-0', !selected && 'hover:bg-space-2/60')}
      >
        <span className="col-span-2 flex min-w-0 items-start gap-3 md:col-span-1">
          {/* Crew identity colour: matches the stripes on the suit, and is never a health colour. */}
          <span className="avatar mt-0.5 grid size-10 shrink-0 place-items-center rounded-full border-2 text-sm font-bold" style={{ borderColor: a.suitColor }} aria-hidden>{initials(a.name)}</span>
          <span className="min-w-0">
            <span className="title block text-lg leading-tight">{a.name}</span>
            <span className="label block">{a.role}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <StatusPill status={st.status} size="sm" />
              <span className="text-sm text-text-2">{st.reason}</span>
            </span>
            {(first || selected) && (
              <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold">
                {first && <span className="flex items-center gap-1 text-watch"><Flag className="size-4" aria-hidden strokeWidth={2.5} /> Needs attention first</span>}
                {selected && <span className="flex items-center gap-1 text-ink"><Eye className="size-4" aria-hidden strokeWidth={2.5} /> Viewing</span>}
              </span>
            )}
          </span>
        </span>
        <Cell label="Vitals, 24 h" value={score} unit="/100" tone={fault ? 'watch' : scoreTone(score)} missing={fault} />
        <Cell label="Sleep" value={night.hours} unit="h" tone={night.hours < 6 ? 'watch' : 'nominal'} />
        <Cell label="Mental health" value={mh} unit="/100" tone={scoreTone(mh)} />
        <Cell label="Plan" value={plan.length} unit={plan.length === 1 ? 'item' : 'items'} sub={urgent ? `${urgent} urgent` : undefined} tone={urgent ? 'watch' : 'nominal'} />
      </button>
      <Link href={`/astronaut/${a.id}`} className="nudge-host grid place-items-center border-l border-line text-nasa-bright transition-colors duration-150 hover:bg-space-3 hover:text-ink focus-visible:-outline-offset-2" aria-label={`Open ${a.name}'s record`} title="Open record">
        <ChevronRight className="nudge size-6" aria-hidden />
      </Link>
    </li>
  );
}

export default function CrewOverview() {
  const { s } = useMission();
  const [picked, setPicked] = useState<string | null>(null);

  // Who needs attention first. The screen opens on them; after that the choice is the user's.
  const ordered = s.ready ? [...CREW].sort((x, y) => urgency(s, x) - urgency(s, y)) : [];
  const worst = ordered[0] && astronautStatus(s, ordered[0].id).status !== 'nominal' ? ordered[0].id : null;
  const initial = ordered[0]?.id ?? null;
  useEffect(() => {
    if (picked === null && initial) setPicked(initial);
  }, [picked, initial]);

  if (!s.ready || !picked) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,1fr)]" aria-busy="true" aria-label="Loading crew data">
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h1 className="title text-xl text-text-2">Crew overview</h1>
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1" aria-label="Crew status summary">
          {(['critical', 'watch', 'nominal'] as const).map((k) => {
            const m = STATUS_META[k];
            const I = m.icon;
            const n = statuses.filter((x) => x === k).length;
            return (
              <li key={k} className="flex items-center gap-1.5" style={{ color: n ? m.color : 'var(--text-3)' }}>
                <I className="size-5" aria-hidden strokeWidth={2.5} /> <b className="num text-lg">{n}</b> {m.label.toLowerCase()}
              </li>
            );
          })}
          <li className="flex items-center gap-2 text-text-2">
            <span className="live-dot size-2 rounded-full bg-nominal" aria-hidden /> Watch data is live
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,1fr)]">
        {/* The astronaut owns the left. On a phone the name, reason and action come before the model. */}
        <section className="panel overflow-hidden lg:sticky lg:top-[72px]" aria-label={`${a.name}, selected crew member`}>
          <div key={a.id} className="settle flex flex-wrap items-end justify-between gap-x-6 gap-y-4 p-5 md:p-6">
            <div className="min-w-0">
              <p className="label text-text-2">{a.role}, age {a.age}</p>
              <h2 className="display reveal mt-1 text-[2.5rem] md:text-5xl"><span>{a.name}</span></h2>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusPill status={st.status} />
                <span className="text-text-2">{st.reason}</span>
              </p>
            </div>
            <Link href={`/astronaut/${a.id}`} className="btn btn-primary">
              Open record <ArrowRight className="nudge size-4" aria-hidden />
            </Link>
          </div>
          <Stage a={a} className="border-t border-line sm:h-[min(52vh,500px)] sm:min-h-[400px]" />
          <p className="border-t border-line px-5 py-3 text-sm md:px-6">
            <span className="text-text-2">Medication today: </span>
            {meds.length ? meds.map((m) => m.name).join(', ') : 'none'}
          </p>
        </section>

        <section className="panel overflow-hidden" aria-labelledby="roster-h">
          <h2 id="roster-h" className="sr-only">Crew roster</h2>
          <ul className={clsx('grid', COLS)}>
            <li className={clsx('hidden md:col-span-6 md:grid md:grid-cols-subgrid')} aria-hidden>
              <span className="label py-3 pl-5 text-text-2">Crew member</span>
              {HEADINGS.map((h) => <span key={h} className="label py-3 text-text-2">{h}</span>)}
              <span />
            </li>
            {CREW.map((c, i) => <CrewRow key={c.id} a={c} index={i} selected={c.id === picked} first={c.id === worst} onSelect={() => setPicked(c.id)} />)}
          </ul>
        </section>
      </div>
    </div>
  );
}
