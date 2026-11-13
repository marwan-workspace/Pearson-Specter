'use client';

import Link from 'next/link';
import { HandHeart, OctagonAlert, Radiation, Syringe, Wind } from 'lucide-react';
import { openEvents, useMission } from '@/lib/mission';
import { useNow } from '@/lib/hooks';
import { CREW, SHELTER_RATE_USV_H, byId } from '@/lib/crew';
import { CONDITIONS, TIER_LABEL } from '@/lib/conditions';
import { firstName } from './ui';

/**
 * Emergency banners on every screen:
 *  - tier 1 countdown with a cancel window (features 7, 12)
 *  - tier 2 confirm-first prompt with guided breathing (feature 7)
 *  - tier 3 crewmate alert: who is in trouble and what to give (feature 11)
 *  - take-shelter warning (feature 14)
 */
export function GlobalAlerts() {
  const { s, dispatch } = useMission();
  const now = useNow(250) ?? 0;
  if (!s.ready) return null;
  const events = openEvents(s);
  const shelter = CREW.filter((c) => (s.vitals[c.id]?.slice(-1)[0]?.radiationRate ?? 0) > SHELTER_RATE_USV_H);
  if (!events.length && !shelter.length) return null;

  return (
    <div className="mx-auto mt-3 flex max-w-[1680px] flex-col gap-2 px-4 md:px-8" aria-live="assertive">
      {shelter.map((c) => (
        <div key={`sh-${c.id}`} role="alert" className="alert-in pulse-critical flex flex-wrap items-center gap-3 rounded-[6px] border border-critical/70 bg-[oklch(0.22_0.08_30)] px-4 py-3">
          <Radiation className="size-6 shrink-0 text-critical" aria-hidden />
          <p className="flex-1 font-semibold">
            Take shelter now: {c.name}. Dose rate <span className="num">{Math.round(s.vitals[c.id].slice(-1)[0].radiationRate)} µSv/h</span>, limit <span className="num">{SHELTER_RATE_USV_H}</span>.
          </p>
        </div>
      ))}
      {events.map((e) => {
        const a = byId(e.astronautId)!;
        const spec = CONDITIONS[e.condition];
        const remaining = e.cancelDeadline ? Math.max(0, Math.ceil((e.cancelDeadline - now) / 1000)) : 0;
        return (
          <div key={e.id} role="alert" className="alert-in pulse-critical flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[6px] border border-critical/70 bg-[oklch(0.22_0.08_30)] px-4 py-3">
            <OctagonAlert className="size-6 shrink-0 text-critical" aria-hidden />
            <div className="min-w-0 flex-1 basis-72">
              <p className="font-bold">
                <Link href={`/astronaut/${a.id}`} className="underline decoration-white/40 underline-offset-4 hover:decoration-white">{a.name}</Link>: {spec.label}
                <span className="label ml-2 text-text-2">{TIER_LABEL[spec.tier]}</span>
              </p>
              <p className="text-sm text-text-2">
                {e.evidence}. First response: {spec.firstResponse.toLowerCase()}.{' '}
                {e.state === 'countdown' && <>The watch injects <b className="text-ink">{spec.drug}</b> in <b className="num text-ink">{remaining} s</b> unless cancelled.</>}
                {e.state === 'awaiting-confirm' && <>Guided breathing has started on the watch. Confirm before <b className="text-ink">{spec.drug}</b> is given.</>}
                {e.state === 'crewmate-alerted' && <>A crewmate must give <b className="text-ink">{spec.medication}</b>. The watch cannot inject this.</>}
              </p>
              <p className="label num mt-0.5">Rule {e.rule?.split(' · ')[0]}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {e.state === 'countdown' && (
                <button className="btn bg-white text-black hover:bg-white/85" onClick={() => dispatch({ type: 'cancel', eventId: e.id })}>Cancel injection <span className="num">({remaining} s)</span></button>
              )}
              {e.state === 'awaiting-confirm' && (
                <>
                  <button className="btn btn-red" onClick={() => dispatch({ type: 'confirm', eventId: e.id })}><Syringe className="size-4" aria-hidden /> Confirm dose</button>
                  <button className="btn btn-ghost" onClick={() => dispatch({ type: 'decline', eventId: e.id })}><Wind className="size-4" aria-hidden /> Breathing helped, no dose</button>
                </>
              )}
              {e.state === 'crewmate-alerted' &&
                CREW.filter((c) => c.id !== e.astronautId).slice(0, 3).map((c) => (
                  <button key={c.id} className="btn btn-ghost border-white/40" onClick={() => dispatch({ type: 'crewmate-gave', eventId: e.id, by: c.name })}>
                    <HandHeart className="size-4" aria-hidden /> Given by {firstName(c.name)}
                  </button>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
