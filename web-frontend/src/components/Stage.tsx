'use client';

import Link from 'next/link';
import { useState } from 'react';
import clsx from 'clsx';
import { Activity, ArrowRight, Brain, CircleOff, Heart, Radiation, Wind } from 'lucide-react';
import { astronautStatus, useMission, type MissionState } from '@/lib/mission';
import { SHELTER_RATE_USV_H } from '@/lib/crew';
import { bodyZones, type BodyZone, type ZoneId } from '@/lib/zones';
import type { Astronaut, Status } from '@/lib/types';
import { Astronaut3D } from './three/Astronaut3D';
import { Rolling } from './Rolling';
import { STATUS_META } from './ui';

export interface Reading {
  label: string;
  /** null means the watch is giving no signal for this reading. */
  value: string | null;
  unit: string;
  sub: string;
  tone: Status;
}

/** The four live readings, in a fixed order, shared by the overview stage and the record header. */
export function liveReadings(s: MissionState, a: Astronaut): Reading[] {
  const last = s.vitals[a.id]?.slice(-1)[0];
  if (!last) return [];
  const fault = !!s.sensorFault[a.id];
  const b = a.baseline;
  return [
    { label: 'Heart rate', value: fault ? null : String(Math.round(last.heartRate)), unit: 'bpm', sub: `Baseline ${b.heartRate}`, tone: fault ? 'watch' : Math.abs(last.heartRate - b.heartRate - last.activity * 78) > 25 ? 'critical' : 'nominal' },
    { label: 'Blood oxygen', value: fault ? null : String(Math.round(last.spo2)), unit: '%', sub: `Baseline ${b.spo2}`, tone: fault ? 'watch' : last.spo2 < 90 ? 'critical' : last.spo2 < 93 ? 'watch' : 'nominal' },
    { label: 'Blood pressure', value: `${Math.round(last.systolic)}/${Math.round(last.diastolic)}`, unit: 'mmHg', sub: `Baseline ${b.systolic}/${b.diastolic}`, tone: last.systolic > 140 || last.systolic < 90 ? 'watch' : 'nominal' },
    { label: 'Temperature', value: last.temp.toFixed(1), unit: '°C', sub: `Radiation ${Math.round(last.radiationRate)} µSv/h`, tone: last.radiationRate > SHELTER_RATE_USV_H ? 'critical' : last.temp > 38 ? 'watch' : 'nominal' },
  ];
}

/** One reading. Number and unit sit together; a missing signal is spelled out with its own symbol. */
export function ReadingValue({ r, size = 'lg', rollKey }: { r: Reading; size?: 'lg' | 'md'; rollKey: string }) {
  const off = r.tone !== 'nominal';
  const I = STATUS_META[r.tone].icon;
  return (
    <>
      <p className="label flex items-center gap-1.5 text-text-2">
        {r.label}
        {off && r.value !== null && <I className="size-4" style={{ color: STATUS_META[r.tone].color }} aria-label={STATUS_META[r.tone].label} strokeWidth={2.5} />}
      </p>
      {r.value === null ? (
        <p className={clsx('flex items-center gap-1.5 whitespace-nowrap font-semibold leading-tight text-watch', size === 'lg' ? 'text-xl' : 'text-lg')}>
          <CircleOff className="size-5 shrink-0" aria-hidden strokeWidth={2.5} /> No signal
        </p>
      ) : (
        <p className={clsx('num whitespace-nowrap font-semibold leading-none', size === 'lg' ? 'text-[1.75rem]' : 'text-2xl')} style={off ? { color: STATUS_META[r.tone].color } : undefined}>
          <Rolling text={r.value} rollKey={rollKey} />
          <span className="ml-1 text-sm font-normal text-text-2">{r.unit}</span>
        </p>
      )}
      <p className="label mt-1">{r.sub}</p>
    </>
  );
}

/* Fixed seats around the suit: two per side, clear of the helmet. Leader lines run outward from the suit
   and stop short of the text. */
const SEATS = [
  { pos: 'sm:left-4 sm:top-[26%]', side: 'left' },
  { pos: 'sm:right-4 sm:top-[26%]', side: 'right' },
  { pos: 'sm:left-4 sm:top-[60%]', side: 'left' },
  { pos: 'sm:right-4 sm:top-[60%]', side: 'right' },
] as const;

const ZONE_ICON: Record<ZoneId, typeof Heart> = { heart: Heart, lungs: Wind, head: Brain, circulation: Activity, radiation: Radiation };
const RANK: Record<Status, number> = { critical: 0, watch: 1, nominal: 2 };

/**
 * Body check: the same zones that glow on the suit, as buttons. Pick one here or on the suit itself.
 * Until someone picks, it follows whichever zone is in the most trouble, so a new problem shows itself.
 */
function BodyCheck({ a, zones, selected, hovered, onPick, onHover, onRecord }: { a: Astronaut; zones: BodyZone[]; selected: BodyZone | null; hovered: ZoneId | null; onPick: (id: ZoneId) => void; onHover: (id: ZoneId | null) => void; onRecord?: boolean }) {
  return (
    <div className="border-t border-line">
      <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-5" role="group" aria-label={`${a.name}, body check`}>
        {zones.map((z, i) => {
          const I = ZONE_ICON[z.id];
          const S = STATUS_META[z.status].icon;
          const on = selected?.id === z.id;
          const off = z.status !== 'nominal';
          return (
            <button
              key={z.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(z.id)}
              onPointerEnter={() => onHover(z.id)}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onHover(z.id)}
              onBlur={() => onHover(null)}
              className={clsx('zone-btn relative flex min-h-16 flex-col items-start gap-0.5 px-3 py-2.5 text-left focus-visible:-outline-offset-2', on || hovered === z.id ? 'bg-space-2' : 'bg-space-1', i === zones.length - 1 && 'col-span-2 sm:col-span-1')}
            >
              <span aria-hidden className={clsx('absolute inset-x-0 top-0 h-[3px] origin-left bg-ink transition-transform duration-200 ease-out', on ? 'scale-x-100' : 'scale-x-0')} />
              <span className="flex items-center gap-1.5 text-sm font-semibold" style={off ? { color: STATUS_META[z.status].color } : undefined}>
                <I className={clsx('zone-icon size-4 shrink-0', z.id === 'heart' && z.value !== null && 'zone-heart')} aria-hidden strokeWidth={2.5} />
                {z.label}
                {off && <S className="size-4 shrink-0" aria-label={STATUS_META[z.status].label} strokeWidth={2.5} />}
              </span>
              <span className={clsx('num whitespace-nowrap text-sm', z.value === null ? 'font-semibold text-watch' : 'text-text-2')}>{z.value ?? 'No signal'}</span>
            </button>
          );
        })}
      </div>
      <div className="min-h-[76px] border-t border-line px-5 py-3 md:px-6" aria-live="polite">
        {selected ? (
          <div key={selected.id} className="settle flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <p className="min-w-0 max-w-[60ch] text-[0.9375rem]">
              <b style={selected.status !== 'nominal' ? { color: STATUS_META[selected.status].color } : undefined}>
                {selected.label}, {STATUS_META[selected.status].label.toLowerCase()}.
              </b>{' '}
              {selected.detail}
            </p>
            {onRecord ? (
              <a href={`#${selected.section}`} className="link nudge-host flex shrink-0 items-center gap-1 text-sm">See the trend <ArrowRight className="nudge size-4" aria-hidden /></a>
            ) : (
              <Link href={`/astronaut/${a.id}#${selected.section}`} className="link nudge-host flex shrink-0 items-center gap-1 text-sm">See the trend <ArrowRight className="nudge size-4" aria-hidden /></Link>
            )}
          </div>
        ) : (
          <p className="text-[0.9375rem] text-text-2">Every zone is within this astronaut&rsquo;s own baseline. Pick a zone on the suit, or above, to see its reading.</p>
        )}
      </div>
    </div>
  );
}

/**
 * The signature view: the suit, precisely lit against orbital navy, with the live readings in fixed
 * seats around it and body zones that glow where something is wrong. One WebGL canvas serves the page;
 * choosing another crew member only swaps the data.
 */
export function Stage({ a, interactive, readouts = true, onRecord, className }: { a: Astronaut; interactive?: boolean; readouts?: boolean; onRecord?: boolean; className?: string }) {
  const { s } = useMission();
  const last = s.vitals[a.id]?.slice(-1)[0];
  const fault = !!s.sensorFault[a.id];
  const st = astronautStatus(s, a.id);
  const readings = readouts ? liveReadings(s, a) : [];
  const zones = bodyZones(s, a);

  // The user's pick is remembered per crew member; with no pick, follow the zone in most trouble.
  const [pick, setPick] = useState<{ crew: string; zone: ZoneId | null } | null>(null);
  const [hovered, setHovered] = useState<ZoneId | null>(null);
  const worst = [...zones].sort((x, y) => RANK[x.status] - RANK[y.status])[0];
  const auto = worst && worst.status !== 'nominal' ? worst.id : null;
  const selectedId = pick && pick.crew === a.id ? pick.zone : auto;
  const selected = zones.find((z) => z.id === selectedId) ?? null;
  const onPick = (id: ZoneId) => setPick({ crew: a.id, zone: selectedId === id ? null : id });

  return (
    <>
      <div className={clsx('relative isolate overflow-hidden bg-space-deep', className)}>
        {/* Orbital light, as on the VitaCuff page: a soft blue bloom high on the right, navy everywhere else */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(110%_80%_at_72%_22%,#16245a_0%,#0a1433_46%,#060e1c_100%)]" />
        {/* A subtle Earth horizon. It stays below the readouts, so no text ever sits on its bright edge. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[22%] overflow-hidden">
          <div className="absolute left-1/2 top-[45%] aspect-square w-[260%] -translate-x-1/2 rounded-full border-t border-[#7fa8e6] bg-[radial-gradient(closest-side,#0b1d44_97%,#17408f_99.4%,#3d76d6_100%)] shadow-[0_-1px_18px_rgba(88,140,235,0.45)]" />
        </div>
        <div className={clsx(readouts ? 'h-[300px] sm:absolute sm:inset-0 sm:h-auto' : 'absolute inset-0')}>
          <Astronaut3D
            label={`3D model of ${a.name} in a NASA spacewalk suit. Status ${STATUS_META[st.status].label}. Body zones glow where there is a problem; the same zones are listed as buttons below.${interactive ? ' Drag to rotate.' : ''}`}
            stripe={a.suitColor}
            status={st.status}
            heartRate={fault ? 0 : (last?.heartRate ?? 60)}
            interactive={interactive}
            stars
            zones={zones.map(({ id, status }) => ({ id, status }))}
            selectedZone={selectedId}
            hoveredZone={hovered}
            onZonePick={onPick}
            onZoneHover={setHovered}
          />
        </div>
        {readouts && (
          <div key={a.id} className="settle grid grid-cols-2 gap-px border-t border-line bg-line sm:pointer-events-none sm:absolute sm:inset-0 sm:block sm:border-0 sm:bg-transparent" aria-label={`${a.name}, live readings`} role="group">
            {readings.map((r, i) => (
              <div key={r.label} className={clsx('bg-space-0 px-4 py-3 sm:absolute sm:w-[152px] sm:rounded-[4px] sm:border sm:border-line sm:bg-space-0 sm:px-3 sm:py-2.5', SEATS[i].pos)}>
                <span aria-hidden className={clsx('absolute top-1/2 hidden h-px w-6 bg-line-strong sm:block', SEATS[i].side === 'left' ? 'left-[calc(100%+6px)]' : 'right-[calc(100%+6px)]')} />
                <ReadingValue r={r} rollKey={a.id} />
              </div>
            ))}
          </div>
        )}
      </div>
      <BodyCheck a={a} zones={zones} selected={selected} hovered={hovered} onPick={onPick} onHover={setHovered} onRecord={onRecord} />
    </>
  );
}
