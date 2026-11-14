'use client';

import { BrainCircuit, Cpu, Gauge, ShieldCheck, type LucideIcon } from 'lucide-react';
import { words } from '@/lib/format';
import type { Snapshot } from '@/lib/telemetry';
import { Pill } from '../ui';

/**
 * The watch's decision path, as the Python code runs it (watch/detect.py -> watch/decide.py -> rules.json):
 * classify the activity, check fixed thresholds, ask Gemini only if a flag is raised, then take the response
 * from the rules. Here the stages are fed by the simulated stream, and stage 3 shows the rules-only answer,
 * because the page does not call Gemini on every tick.
 */
function Stage({ n, icon: Icon, title, active, children }: { n: number; icon: LucideIcon; title: string; active: boolean; children: React.ReactNode }) {
  return (
    <li className={`well stage relative min-w-0 flex-1 p-3 ${active ? 'stage-on' : ''}`}>
      <p className="label flex items-center gap-1.5">
        <span className="num grid size-5 place-items-center rounded-full bg-accent-dim text-xs font-bold text-accent">{n}</span>
        <Icon className="size-4" aria-hidden />
      </p>
      <p className="title mt-1.5 text-sm">{title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-secondary">{children}</div>
    </li>
  );
}

/** The link between two stages. Data packets travel along it while the next stage is being used. */
function Link({ flowing }: { flowing: boolean }) {
  return (
    <li aria-hidden className={`link-flow ${flowing ? 'flowing' : ''}`}>
      <i /><i /><i />
    </li>
  );
}

export function Pipeline({ s }: { s: Snapshot }) {
  const flagged = s.flags.length > 0;
  const live = !s.paused;
  return (
    <div className="grid gap-4">
      <ol className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        <Stage n={1} icon={Cpu} title="Activity classification" active={live}>
          {s.sensorFault ? <Pill tone="fault">Unknown</Pill> : <Pill tone={s.activity === 'rest' ? 'nominal' : 'warning'}>{words(s.activity)}</Pill>}
          <span>activity class</span>
        </Stage>
        <Link flowing={live} />
        <Stage n={2} icon={Gauge} title="Thresholds" active={live}>
          {flagged ? s.flags.map((f) => <Pill key={f} tone={f === 'sensor_fault' ? 'fault' : 'critical'}>{f}</Pill>) : <Pill tone="nominal">No flags</Pill>}
        </Stage>
        <Link flowing={live && flagged} />
        <Stage n={3} icon={BrainCircuit} title="Decision rules" active={live && flagged}>
          {flagged ? <><Pill tone="info">Flag raised</Pill><span>Response: {words(s.decision.condition)}</span></> : <><Pill tone="neutral">Standby</Pill><span>No response needed</span></>}
        </Stage>
        <Link flowing={live && flagged} />
        <Stage n={4} icon={ShieldCheck} title="Safety checks" active={live && flagged}>
          {s.decision.condition === 'none' ? <span>{s.decision.note}</span> : (
            <>
              <Pill tone={s.decision.tier === 1 ? 'critical' : 'warning'}>Tier {s.decision.tier}</Pill>
              <Pill tone="neutral" icon={null}>{words(s.decision.action)}</Pill>
              <span className="w-full">{s.decision.firstResponse}{s.decision.note && ` ${s.decision.note}`}</span>
            </>
          )}
        </Stage>
      </ol>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {s.guards.map((g) => (
          <li key={g.id} className="well p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">{g.label}</p>
              <Pill tone={g.state === 'tripped' ? (g.id === 'sensor' ? 'fault' : 'critical') : g.state === 'active' ? 'warning' : 'nominal'}>{words(g.state)}</Pill>
            </div>
            <p className="mt-1 text-sm text-secondary">{g.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
