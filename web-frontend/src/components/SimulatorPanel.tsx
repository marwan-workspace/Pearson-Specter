'use client';

import { useState } from 'react';
import { RotateCcw, Watch, X, Zap } from 'lucide-react';
import { resetDemo, useMission } from '@/lib/mission';
import { CREW } from '@/lib/crew';
import { CONDITIONS, TIER_LABEL } from '@/lib/conditions';
import type { ConditionId } from '@/lib/types';

/** Feature 10: replays a watch stream and injects an emergency on cue. */
export function SimulatorPanel({ onClose }: { onClose: () => void }) {
  const { s, dispatch } = useMission();
  const [id, setId] = useState(CREW[0].id);
  const [cond, setCond] = useState<ConditionId>('bradycardia');
  const [confirmReset, setConfirmReset] = useState(false);
  const running = !!s.emergencies[id];
  return (
    <div role="dialog" aria-label="Vitals simulator">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="title text-base">Vitals simulator</h2>
          <p className="mt-0.5 text-sm text-text-2">There is no physical watch, so a reading is simulated every 2 s. Inject an emergency to see detection, the response tier and the report.</p>
        </div>
        <button className="btn btn-sm btn-quiet px-2" onClick={onClose} aria-label="Close simulator" autoFocus><X className="size-4" aria-hidden /></button>
      </div>
      <div className="grid gap-3">
        <label className="label grid gap-1">
          Crew member
          <select className="field" value={id} onChange={(e) => setId(e.target.value)}>
            {CREW.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="label grid gap-1">
          Emergency
          <select className="field" value={cond} onChange={(e) => setCond(e.target.value as ConditionId)}>
            {Object.values(CONDITIONS).map((c) => <option key={c.id} value={c.id}>{c.label} ({TIER_LABEL[c.tier].toLowerCase()})</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-red flex-1" onClick={() => dispatch({ type: 'inject', id, condition: cond })}><Zap className="size-4" aria-hidden /> Inject emergency</button>
          <button className="btn btn-ghost" onClick={() => dispatch({ type: 'clear', id })} disabled={!running}>Clear</button>
        </div>
        <button className="btn btn-ghost" onClick={() => dispatch({ type: 'sensor-fault', id })} aria-pressed={!!s.sensorFault[id]}>
          <Watch className="size-4" aria-hidden /> {s.sensorFault[id] ? 'Re-attach watch' : 'Loosen watch (sensor fault)'}
        </button>
        <div className="rule flex items-center justify-between gap-3 pt-3">
          {confirmReset ? (
            <>
              <p className="text-sm text-text-2">Erase saved events, logs and chats?</p>
              <div className="flex gap-2">
                <button className="btn btn-sm btn-quiet" onClick={() => setConfirmReset(false)}>Keep</button>
                <button className="btn btn-sm btn-ghost border-critical/60 text-critical" onClick={resetDemo}>Reset</button>
              </div>
            </>
          ) : (
            <button className="btn btn-sm btn-quiet" onClick={() => setConfirmReset(true)}><RotateCcw className="size-4" aria-hidden /> Reset demo data</button>
          )}
        </div>
      </div>
    </div>
  );
}
