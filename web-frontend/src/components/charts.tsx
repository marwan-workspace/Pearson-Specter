'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MentalCheck, SleepNight, SleepStage, VitalSample } from '@/lib/types';
import { fmtTime } from './ui';

const tick = (t: number) => fmtTime(t);

function Tip({ active, payload, label, unit, fmt }: { active?: boolean; payload?: { name?: string; value?: number | string; color?: string }[]; label?: number | string; unit?: string; fmt?: (l: number | string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[4px] border border-line-strong bg-space-2 px-3 py-2 text-xs shadow-[0_12px_32px_rgba(0,0,0,0.6)]">
      <p className="mb-1 font-semibold">{fmt ? fmt(label!) : typeof label === 'number' ? `${fmtTime(label)} UTC` : label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-text-2">
            <span className="inline-block h-0.5 w-3" style={{ background: p.color }} /> {p.name}
          </span>
          <span className="num font-semibold">{typeof p.value === 'number' ? Number(p.value.toFixed(1)) : p.value}{unit ? ` ${unit}` : ''}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; area?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={i.area ? 'inline-block h-3 w-4 rounded-sm' : 'inline-block w-4'}
            style={i.area ? { background: i.color, opacity: 0.5 } : { height: 2, background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)` : i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Single vital over 24 h with the astronaut's personal baseline band (feature 13). */
export function VitalChart({ data, k, name, unit, baseline, tolerance, color = 'var(--chart-1)', height = 170, domain }: {
  data: VitalSample[];
  k: keyof VitalSample;
  name: string;
  unit: string;
  baseline: number;
  tolerance: number;
  color?: string;
  height?: number;
  domain?: [number | 'auto', number | 'auto'];
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -4 }}>
        <defs>
          <linearGradient id={`g-${String(k)}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.3} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <ReferenceArea y1={baseline - tolerance} y2={baseline + tolerance} fill="var(--nominal)" fillOpacity={0.08} ifOverflow="hidden" />
        <ReferenceLine y={baseline} stroke="var(--text-3)" strokeDasharray="3 3" />
        <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} tickLine={false} minTickGap={40} />
        <YAxis domain={domain ?? ['auto', 'auto']} tickLine={false} axisLine={false} width={48} />
        <Tooltip content={<Tip unit={unit} />} />
        <Area type="monotone" dataKey={k as string} name={name} stroke={color} strokeWidth={2} fill={`url(#g-${String(k)})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BPChart({ data, baseline, height = 170 }: { data: VitalSample[]; baseline: { systolic: number; diastolic: number }; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -4 }}>
        <CartesianGrid vertical={false} />
        <ReferenceArea y1={baseline.systolic - 12} y2={baseline.systolic + 12} fill="var(--nominal)" fillOpacity={0.08} />
        <ReferenceLine y={140} stroke="var(--watch)" strokeDasharray="4 4" label={{ value: 'high 140', fill: 'var(--watch)', fontSize: 10, position: 'insideTopRight' }} />
        <ReferenceLine y={90} stroke="var(--watch)" strokeDasharray="4 4" label={{ value: 'low 90', fill: 'var(--watch)', fontSize: 10, position: 'insideBottomRight' }} />
        <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} tickLine={false} minTickGap={40} />
        <YAxis domain={[40, 200]} tickLine={false} axisLine={false} width={48} />
        <Tooltip content={<Tip unit="mmHg" />} />
        <Line type="monotone" dataKey="systolic" name="Systolic" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="diastolic" name="Diastolic" stroke="var(--chart-3)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export const STAGE: Record<SleepStage, { label: string; color: string; y: number }> = {
  awake: { label: 'Awake', color: '#f2b84b', y: 3 },
  rem: { label: 'REM', color: '#5fd3c4', y: 2 },
  light: { label: 'Light', color: '#8db6ff', y: 1 },
  deep: { label: 'Deep', color: '#2f5fd0', y: 0 },
};
const ORDER: SleepStage[] = ['deep', 'light', 'rem', 'awake'];

export function Hypnogram({ night, height = 150 }: { night: SleepNight; height?: number }) {
  const data = (night.hypnogram ?? []).map((e) => ({ t: e.t, y: STAGE[e.stage].y, stage: STAGE[e.stage].label }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 6 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} tickLine={false} minTickGap={40} />
        <YAxis type="number" domain={[0, 3]} ticks={[0, 1, 2, 3]} tickFormatter={(v: number) => STAGE[ORDER[v]].label} tickLine={false} axisLine={false} width={46} />
        <Tooltip content={({ active, payload }) => (active && payload?.length ? <div className="rounded-[4px] border border-line-strong bg-space-2 px-3 py-2 text-xs">{fmtTime(payload[0].payload.t)} UTC · <b>{payload[0].payload.stage}</b></div> : null)} />
        <Line type="stepAfter" dataKey="y" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SleepWeek({ nights, height = 190 }: { nights: SleepNight[]; height?: number }) {
  const data = nights.map((n) => ({ date: n.date.slice(5), ...Object.fromEntries(ORDER.map((s) => [s, Number((n.stages[s] / 60).toFixed(2))])), cycles: n.cycles }));
  return (
    <div className="flex flex-col gap-2">
      <Legend items={[...ORDER].reverse().map((s) => ({ label: STAGE[s].label, color: STAGE[s].color, area: true }))} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -4 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} />
          <YAxis unit="h" tickLine={false} axisLine={false} width={48} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<Tip unit="h" fmt={(l) => `Night ending ${l}`} />} />
          {ORDER.map((s, i) => (
            <Bar key={s} dataKey={s} name={STAGE[s].label} stackId="a" fill={STAGE[s].color} stroke="var(--space-1)" strokeWidth={1} radius={i === ORDER.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MentalTrend({ checks, height = 170 }: { checks: MentalCheck[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={checks.map((c) => ({ date: c.date.slice(5), score: c.score }))} margin={{ top: 6, right: 8, bottom: 0, left: -4 }}>
        <defs>
          <linearGradient id="g-mh" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--chart-1)" stopOpacity={0.3} />
            <stop offset="1" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <ReferenceArea y1={0} y2={55} fill="var(--critical)" fillOpacity={0.06} />
        <ReferenceLine y={70} stroke="var(--watch)" strokeDasharray="4 4" label={{ value: 'therapy below 70', fill: 'var(--watch)', fontSize: 10, position: 'insideTopRight' }} />
        <XAxis dataKey="date" tickLine={false} minTickGap={20} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={48} />
        <Tooltip content={<Tip fmt={(l) => String(l)} />} />
        <Area type="monotone" dataKey="score" name="Score" stroke="var(--chart-1)" strokeWidth={2} fill="url(#g-mh)" dot={{ r: 2.5, fill: 'var(--chart-1)' }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RadiationChart({ data, shelter, height = 170 }: { data: VitalSample[]; shelter: number; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
        <defs>
          <linearGradient id="g-rad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--chart-2)" stopOpacity={0.4} />
            <stop offset="1" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <ReferenceLine y={shelter} stroke="var(--critical)" strokeDasharray="4 4" label={{ value: `take shelter ${shelter}`, fill: 'var(--critical)', fontSize: 10, position: 'insideTopRight' }} />
        <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} tickLine={false} minTickGap={40} />
        <YAxis scale="log" domain={[5, 20000]} allowDataOverflow ticks={[10, 100, 1000, 10000]} tickLine={false} axisLine={false} width={52} />
        <Tooltip content={<Tip unit="µSv/h" />} />
        <Area type="monotone" dataKey="radiationRate" name="Dose rate" stroke="var(--chart-2)" strokeWidth={2} fill="url(#g-rad)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
