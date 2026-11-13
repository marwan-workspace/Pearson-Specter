'use client';

import clsx from 'clsx';
import { astronautStatus, useMission } from '@/lib/mission';
import { SHELTER_RATE_USV_H } from '@/lib/crew';
import type { Astronaut, Status } from '@/lib/types';
import { Astronaut3D } from './three/Astronaut3D';
import { STATUS_META } from './ui';

interface Reading {
  label: string;
  value: string;
  unit: string;
  sub: string;
  tone: Status;
  /** Where the callout sits around the suit on wide screens. */
  pos: string;
  side: 'left' | 'right';
}

function Callout({ r, i }: { r: Reading; i: number }) {
  const off = r.tone !== 'nominal';
  const I = STATUS_META[r.tone].icon;
  return (
    <div className={clsx('stage-in well px-3 py-2 sm:absolute sm:w-[150px] sm:bg-black/55 sm:backdrop-blur-sm', r.pos)} style={{ ['--i' as string]: i }}>
      {/* Leader line toward the suit */}
      <span aria-hidden className={clsx('absolute top-1/2 hidden h-px w-8 bg-white/25 sm:block', r.side === 'left' ? 'left-full' : 'right-full')} />
      <p className="label flex items-center gap-1">
        {r.label}
        {off && <I className="size-3.5" style={{ color: STATUS_META[r.tone].color }} aria-label={STATUS_META[r.tone].label} />}
      </p>
      <p className="num text-2xl font-semibold leading-tight" style={off ? { color: STATUS_META[r.tone].color } : undefined}>
        {r.value} <span className="label font-normal">{r.unit}</span>
      </p>
      <p className="label">{r.sub}</p>
    </div>
  );
}

/**
 * The signature view: the crew member's suit in orbit with their live readings around it.
 * One WebGL canvas serves the whole page; choosing another crew member only swaps the data.
 */
export function Stage({ a, interactive, className }: { a: Astronaut; interactive?: boolean; className?: string }) {
  const { s } = useMission();
  const v = s.vitals[a.id] ?? [];
  const last = v[v.length - 1];
  const fault = !!s.sensorFault[a.id];
  const st = astronautStatus(s, a.id);
  const b = a.baseline;

  const readings: Reading[] = last
    ? [
        { label: 'Heart rate', value: fault ? 'No signal' : String(Math.round(last.heartRate)), unit: fault ? '' : 'bpm', sub: `Baseline ${b.heartRate}`, tone: fault ? 'watch' : Math.abs(last.heartRate - b.heartRate - last.activity * 78) > 25 ? 'critical' : 'nominal', pos: 'sm:left-4 sm:top-[22%]', side: 'left' },
        { label: 'Blood oxygen', value: fault ? 'No signal' : String(Math.round(last.spo2)), unit: fault ? '' : '%', sub: `Baseline ${b.spo2}`, tone: fault ? 'watch' : last.spo2 < 93 ? 'critical' : 'nominal', pos: 'sm:right-4 sm:top-[14%]', side: 'right' },
        { label: 'Blood pressure', value: `${Math.round(last.systolic)}/${Math.round(last.diastolic)}`, unit: 'mmHg', sub: `Baseline ${b.systolic}/${b.diastolic}`, tone: last.systolic > 140 || last.systolic < 90 ? 'watch' : 'nominal', pos: 'sm:left-4 sm:top-[56%]', side: 'left' },
        { label: 'Body temperature', value: last.temp.toFixed(1), unit: '°C', sub: last.radiationRate > SHELTER_RATE_USV_H ? `Radiation ${Math.round(last.radiationRate)} µSv/h` : `Radiation ${Math.round(last.radiationRate)} µSv/h`, tone: last.radiationRate > SHELTER_RATE_USV_H ? 'critical' : last.temp > 38 ? 'watch' : 'nominal', pos: 'sm:right-4 sm:top-[48%]', side: 'right' },
      ]
    : [];

  return (
    <div className={clsx('relative isolate overflow-hidden', className)}>
      {/* Earth's limb: the blue line every spacewalk photo has */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[46%] overflow-hidden">
        <div className="absolute left-1/2 top-[38%] aspect-square w-[240%] -translate-x-1/2 rounded-full border-t border-[oklch(0.8_0.12_250/0.75)] bg-[radial-gradient(closest-side,transparent_82%,oklch(0.42_0.16_262/0.55)_96%,oklch(0.62_0.16_255/0.5)_100%)] shadow-[0_-2px_28px_oklch(0.62_0.17_255/0.45)]" />
      </div>
      <div className="h-[340px] sm:absolute sm:inset-0 sm:h-auto">
        <Astronaut3D
          label={`3D model of ${a.name} in a NASA spacewalk suit. Status ${STATUS_META[st.status].label}.${interactive ? ' Drag to rotate.' : ''}`}
          stripe={a.suitColor}
          status={st.status}
          heartRate={fault ? 0 : (last?.heartRate ?? 60)}
          interactive={interactive}
          stars
        />
      </div>
      <div key={a.id} className="grid grid-cols-2 gap-2 p-3 sm:pointer-events-none sm:absolute sm:inset-0 sm:block sm:p-0" aria-label={`${a.name}, live readings`} role="group">
        {readings.map((r, i) => <Callout key={r.label} r={r} i={i} />)}
      </div>
    </div>
  );
}
