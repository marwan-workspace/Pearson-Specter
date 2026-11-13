'use client';

import { useState } from 'react';
import { Zap, X, Watch } from 'lucide-react';
import { resetDemo, useMission } from '@/lib/mission';
import { CREW } from '@/lib/crew';
import { CONDITIONS, TIER_LABEL } from '@/lib/conditions';
import type { ConditionId } from '@/lib/types';

/** Feature 10 — vitals simulator: replays a watch stream and injects an emergency on cue. */
export function SimulatorPanel({ onClose }: { onClose: () => void }) {
  const { s, dispatch } = useMission();
  const [id, setId] = useState(CREW[0].id);
  const [cond, setCond] = useState<ConditionId>('bradycardia');
  const sel = 'h-11 rounded-lg border border-line-strong bg-space-2 px-3 text-sm';
  return (
    <div className="absolute right-4 top-16 z-50 w-[min(420px,calc(100vw-2rem))] panel p-4 shadow-2xl" role="dialog" aria-label="Vitals simulator">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="eyebrow">Feature 10</p>
          <h2 className="font-semibold">Vitals simulator</h2>
        </div>
        <button className="btn btn-ghost min-h-10 px-2" onClick={onClose} aria-label="Close simulator"><X className="size-4" /></button>
      </div>
      <p className="mb-3 text-xs text-text-3">No physical watch, so a live stream is simulated every 2 s. Inject an emergency to see detection, the response tier, crewmate alerts and an emergency report.</p>
      <div className="grid gap-2">
        <label className="text-xs text-text-2">Astronaut
          <select className={`${sel} mt-1 w-full`} value={id} onChange={(e) => setId(e.target.value)}>
            {CREW.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-text-2">Emergency
          <select className={`${sel} mt-1 w-full`} value={cond} onChange={(e) => setCond(e.target.value as ConditionId)}>
            {Object.values(CONDITIONS).map((c) => <option key={c.id} value={c.id}>{c.label} · {TIER_LABEL[c.tier]}</option>)}
          </select>
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <button className="btn btn-red flex-1" onClick={() => dispatch({ type: 'inject', id, condition: cond })}><Zap className="size-4" /> Inject emergency</button>
          <button className="btn btn-ghost" onClick={() => dispatch({ type: 'clear', id })} disabled={!s.emergencies[id]}>Clear</button>
        </div>
        <button className="btn btn-ghost" onClick={() => dispatch({ type: 'sensor-fault', id })}>
          <Watch className="size-4" /> {s.sensorFault[id] ? 'Re-attach watch' : 'Loosen watch (sensor fault, feature 19)'}
        </button>
        <button className="btn btn-ghost text-text-3" onClick={resetDemo}>Reset demo data</button>
      </div>
    </div>
  );
}
