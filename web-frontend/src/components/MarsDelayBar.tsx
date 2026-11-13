'use client';

import clsx from 'clsx';
import { Stethoscope } from 'lucide-react';
import { fmtDelay, useMission } from '@/lib/mission';
import { EARTH_REVIEW_SEC, LOCATIONS } from '@/lib/conditions';
import type { Location } from '@/lib/types';

const STOPS: Location[] = ['iss', 'moon', 'mars'];

/**
 * Feature 20: distance from Earth. The further out, the longer Earth takes to answer, which delays
 * non-urgent plan approval (4), weekly and emergency reports (6) and mission command replies.
 */
export function MarsDelayBar() {
  const { s, dispatch } = useMission();
  if (!s.ready) return <div className="h-[52px] border-b border-line" aria-hidden />;
  const loc = LOCATIONS[s.location];
  const answer = loc.owltSec * 2 + EARTH_REVIEW_SEC;
  const mars = s.location === 'mars';
  return (
    <div className="border-b border-line bg-space-0">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 md:px-8">
        <fieldset className="flex items-center gap-3">
          <legend className="label float-left mr-3 leading-9">Ship location</legend>
          <div className="flex rounded-[4px] bg-space-1 p-0.5">
            {STOPS.map((k) => (
              <label
                key={k}
                className={clsx(
                  'flex h-8 min-w-14 items-center justify-center rounded-[3px] px-3 text-sm font-semibold transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-nasa-bright',
                  k === s.location ? 'bg-nasa-blue text-white' : 'text-text-3 hover:text-ink',
                )}
              >
                <input type="radio" name="ship-location" className="sr-only" checked={k === s.location} onChange={() => dispatch({ type: 'location', location: k })} />
                {LOCATIONS[k].label}
              </label>
            ))}
          </div>
        </fieldset>
        <dl className="flex gap-x-6 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="label">One-way delay</dt>
            <dd className="num font-semibold">{fmtDelay(loc.owltSec)}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="label">Earth answers in</dt>
            <dd className="num font-semibold">about {fmtDelay(Math.round(answer))}</dd>
          </div>
        </dl>
        <p className={clsx('flex min-w-0 flex-1 basis-64 items-center gap-2 text-sm', mars ? 'font-semibold text-ink' : 'text-text-3')} aria-live="polite">
          {mars && <Stethoscope className="size-4 shrink-0 text-watch" aria-hidden />}
          {loc.note}
        </p>
      </div>
    </div>
  );
}
