'use client';

import { useState } from 'react';
import { Presentation, RotateCcw, Watch, X, Zap } from 'lucide-react';
import { resetDemo, useMission } from '@/lib/mission';
import { CREW } from '@/lib/crew';
import { CONDITIONS, TIER_LABEL } from '@/lib/conditions';
import type { ConditionId } from '@/lib/types';

/** A different emergency for each crew member, so each suit lights a different zone red. */
const SHOWCASE: { id: string; condition: ConditionId; zone: string }[] = [
  { id: 'elena', condition: 'tachycardia', zone: 'heart' },
  { id: 'kwame', condition: 'fever', zone: 'head' },
  { id: 'hiro', condition: 'high-bp', zone: 'blood pressure' },
  { id: 'maya', condition: 'radiation-sickness', zone: 'radiation' },
];

/** Feature 10: replays a watch stream and injects an emergency on cue. */
export function SimulatorPanel({ onClose }: { onClose: () => void }) {
  const { s, dispatch } = useMission();
  const [id, setId] = useState(CREW[0].id);
  const [cond, setCond] = useState<ConditionId>('bradycardia');
  const [confirmReset, setConfirmReset] = useState(false);
  const running = !!s.emergencies[id];
  const anyRunning = CREW.some((c) => s.emergencies[c.id]);
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
        <div className="well p-3">
          <p className="text-sm font-semibold">Showcase</p>
          <p className="mb-2 text-sm text-text-2">Gives every crew member a different emergency at once: {SHOWCASE.map((x) => `${CREW.find((c) => c.id === x.id)!.name.split(' ')[0]}, ${x.zone}`).join('; ')}.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary flex-1" onClick={() => SHOWCASE.forEach((x) => dispatch({ type: 'inject', id: x.id, condition: x.condition }))}>
              <Presentation className="size-4" aria-hidden /> Start showcase
            </button>
            <button className="btn btn-ghost" onClick={() => CREW.forEach((c) => dispatch({ type: 'clear', id: c.id }))} disabled={!anyRunning}>Clear all</button>
          </div>
        </div>
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
                <button className="btn btn-sm btn-ghost border-critical text-critical" onClick={resetDemo}>Reset</button>
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
