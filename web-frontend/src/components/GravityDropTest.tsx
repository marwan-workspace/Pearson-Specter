'use client';

import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bone, Globe2, Orbit } from 'lucide-react';
import { BONE_LOSS_PER_MONTH, FEMUR_REF, boneEstimate } from '@/lib/crew';
import type { Astronaut } from '@/lib/types';
import { Panel, Stat } from './ui';

const RISK: Record<string, { label: string; color: string }> = {
  low: { label: 'Low', color: 'var(--nominal)' },
  normal: { label: 'Normal', color: 'var(--nominal)' },
  elevated: { label: 'Elevated', color: 'var(--watch)' },
  high: { label: 'High', color: 'var(--critical)' },
};

/** Feature 21 — "If this astronaut landed on Mars or Earth right now, how fragile are their bones?" */
export function GravityDropTest({ a }: { a: Astronaut }) {
  const e = boneEstimate(a);
  const ref = FEMUR_REF[a.sex];
  const series = Array.from({ length: 19 }, (_, i) => {
    const d = i * 30;
    return { d, bmd: Number(boneEstimate(a, d).now.toFixed(3)) };
  });
  const osteopenia = ref.mean - ref.sd;
  const osteoporosis = ref.mean - 2.5 * ref.sd;

  const Landing = ({ where, g, risk, index, icon }: { where: string; g: number; risk: string; index: number; icon: React.ReactNode }) => (
    <div className="well border-l-2 p-4" style={{ borderColor: RISK[risk].color }}>
      <p className="flex items-center gap-2 text-sm font-semibold">{icon} Landing on {where} today <span className="num label font-normal">{g} g</span></p>
      <p className="title mt-1 text-3xl" style={{ color: RISK[risk].color }}>{RISK[risk].label} risk</p>
      <p className="num label mt-1">Fragility index {index.toFixed(2)}. Pre-flight bone on Earth is 1.00.</p>
    </div>
  );

  return (
    <Panel id="gravity" feature="Feature 21" title="Bone strength if they landed today" icon={<Bone className="size-5 text-nasa-bright" aria-hidden />} lead="The gravity drop test: bone is lost in microgravity, so the same landing gets riskier the longer the mission runs.">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Landing where="Mars" g={0.38} risk={e.mars.risk} index={e.mars.index} icon={<Orbit className="size-4 text-text-3" aria-hidden />} />
            <Landing where="Earth" g={1} risk={e.earth.risk} index={e.earth.index} icon={<Globe2 className="size-4 text-text-3" aria-hidden />} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
            <Stat label="Time in space" value={a.daysInSpace} unit="days" />
            <Stat label="Femur BMD now" value={e.now.toFixed(3)} unit="g/cm²" sub={`pre-flight ${e.pre.toFixed(3)}`} />
            <Stat label="Estimated loss" value={`−${e.lossPct.toFixed(1)}`} unit="%" tone={e.lossPct > 5 ? 'watch' : 'nominal'} />
            <Stat label="T-score" value={e.tNow.toFixed(1)} sub={e.who} tone={e.tNow < -1 ? 'watch' : 'nominal'} />
          </div>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-text-3">
            <li>Baseline: NHANES femur scans, {a.sex === 'F' ? 'female' : 'male'} reference {ref.mean} ± {ref.sd} g/cm². <b className="text-watch">Placeholder</b> until the DXXFEM files are loaded.</li>
            <li>Loss rate: {(BONE_LOSS_PER_MONTH * 100).toFixed(2)}% per month in microgravity. <b className="text-watch">Placeholder</b>: the published rate is still an open question.</li>
            <li>Rule: bone strength ∝ density²; landing load ∝ gravity. Fragility = g ÷ strength.</li>
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Estimated femur bone density over time in space</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: -4 }}>
              <CartesianGrid vertical={false} />
              <ReferenceLine y={osteopenia} stroke="var(--watch)" strokeDasharray="4 4" label={{ value: 'osteopenia (T −1)', fill: 'var(--watch)', fontSize: 10, position: 'insideTopRight' }} />
              <ReferenceLine y={osteoporosis} stroke="var(--critical)" strokeDasharray="4 4" label={{ value: 'osteoporosis (T −2.5)', fill: 'var(--critical)', fontSize: 10, position: 'insideTopRight' }} />
              <ReferenceLine x={a.daysInSpace} stroke="var(--line-strong)" label={{ value: 'today', fill: 'var(--text-2)', fontSize: 10, position: 'insideTopLeft' }} />
              <XAxis dataKey="d" type="number" domain={[0, 540]} ticks={[0, 90, 180, 270, 360, 450, 540]} tickFormatter={(d) => `${d} d`} tickLine={false} />
              <YAxis domain={[Math.floor(osteoporosis * 20) / 20, Math.ceil(e.pre * 20) / 20 + 0.05]} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => v.toFixed(2)} />
              <Tooltip content={({ active, payload }) => (active && payload?.length ? <div className="rounded-[4px] border border-line-strong bg-space-2 px-3 py-2 text-xs">Day {payload[0].payload.d}: <b className="num">{payload[0].payload.bmd} g/cm²</b></div> : null)} />
              <Line dataKey="bmd" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <ReferenceDot x={a.daysInSpace} y={Number(e.now.toFixed(3))} r={5} fill="var(--white)" stroke="var(--chart-1)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-sm text-text-3">540 days covers a typical Mars round trip. The line assumes no countermeasure effect, which is the worst case.</p>
        </div>
      </div>
    </Panel>
  );
}
