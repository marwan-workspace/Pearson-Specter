'use client';

import { Orbit, Stethoscope } from 'lucide-react';
import { fmtDelay, useMission } from '@/lib/mission';
import { EARTH_REVIEW_SEC, LOCATIONS } from '@/lib/conditions';
import type { Location } from '@/lib/types';

const STOPS: Location[] = ['iss', 'moon', 'mars'];

/**
 * Feature 20 — Mars delay bar. The further out, the longer Earth takes to answer. Affects
 * non-urgent plan approval (4), weekly and emergency reports (6) and mission command replies.
 */
export function MarsDelayBar() {
  const { s, dispatch } = useMission();
  if (!s.ready) return <div className="h-14 border-b border-line" aria-hidden />;
  const loc = LOCATIONS[s.location];
  const idx = STOPS.indexOf(s.location);
  const answer = loc.owltSec * 2 + EARTH_REVIEW_SEC;
  const mars = s.location === 'mars';
  return (
    <div className={`border-b ${mars ? 'border-nasa-red/50 bg-[linear-gradient(90deg,rgba(252,61,33,0.18),rgba(11,61,145,0.18))]' : 'border-line bg-space-1/70'}`}>
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 md:px-8">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-3">
          <Orbit className="size-4 text-nasa-bright" aria-hidden /> <span className="text-nasa-red">20</span> Distance from Earth
        </p>
        <div className="flex min-w-[240px] flex-1 items-center gap-3 sm:max-w-md">
          <label htmlFor="mars-delay" className="sr-only">Ship location: ISS, Moon or Mars</label>
          <div className="flex-1">
            <input
              id="mars-delay"
              type="range"
              min={0}
              max={2}
              step={1}
              value={idx}
              onChange={(e) => dispatch({ type: 'location', location: STOPS[Number(e.target.value)] })}
              aria-valuetext={loc.label}
              className="h-11 w-full cursor-pointer accent-[var(--nasa-red)]"
            />
            <div className="-mt-2 flex justify-between text-[11px] font-semibold">
              {STOPS.map((k) => (
                <button key={k} type="button" onClick={() => dispatch({ type: 'location', location: k })} className={`rounded px-1 ${k === s.location ? 'text-white' : 'text-text-3 hover:text-white'}`}>
                  {LOCATIONS[k].label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div>
            <dt className="text-[11px] text-text-3">One-way delay</dt>
            <dd className="num font-semibold">{fmtDelay(loc.owltSec)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-text-3">Earth answers in</dt>
            <dd className="num font-semibold">≈ {fmtDelay(Math.round(answer))}</dd>
          </div>
        </dl>
        <p className={`flex max-w-xl items-center gap-2 text-sm ${mars ? 'font-semibold text-white' : 'text-text-2'}`}>
          {mars && <Stethoscope className="size-4 shrink-0 text-nasa-red" aria-hidden />}
          {loc.note}
        </p>
      </div>
    </div>
  );
}
