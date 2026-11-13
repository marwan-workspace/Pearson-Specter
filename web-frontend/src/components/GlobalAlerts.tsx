'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { HandHeart, OctagonAlert, Radiation, Syringe, Wind } from 'lucide-react';
import { openEvents, useMission } from '@/lib/mission';
import { CREW, SHELTER_RATE_USV_H, byId } from '@/lib/crew';
import { CONDITIONS, TIER_LABEL } from '@/lib/conditions';

/**
 * Emergency banners on every screen:
 *  – Tier 1 countdown with cancel window (features 7, 12)
 *  – Tier 2 confirm-first prompt with guided breathing (feature 7)
 *  – Tier 3 crewmate emergency alert: who is in trouble and what to give (feature 11)
 *  – Take-shelter warning (feature 14)
 */
export function GlobalAlerts() {
  const { s, dispatch } = useMission();
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (!s.ready) return null;
  const events = openEvents(s);
  const shelter = CREW.filter((c) => (s.vitals[c.id]?.slice(-1)[0]?.radiationRate ?? 0) > SHELTER_RATE_USV_H);
  if (!events.length && !shelter.length) return null;

  return (
    <div className="mx-auto mt-3 flex max-w-[1600px] flex-col gap-2 px-4 md:px-8" aria-live="assertive">
      {shelter.map((c) => (
        <div key={`sh-${c.id}`} role="alert" className="pulse-red flex flex-wrap items-center gap-3 rounded-xl border border-critical/70 bg-critical/15 px-4 py-3">
          <Radiation className="size-6 text-critical" aria-hidden />
          <p className="flex-1 font-semibold">TAKE SHELTER: {c.name}. Dose rate {Math.round(s.vitals[c.id].slice(-1)[0].radiationRate)} µSv/h (limit {SHELTER_RATE_USV_H}).</p>
        </div>
      ))}
      {events.map((e) => {
        const a = byId(e.astronautId)!;
        const spec = CONDITIONS[e.condition];
        const remaining = e.cancelDeadline ? Math.max(0, Math.ceil((e.cancelDeadline - now) / 1000)) : 0;
        return (
          <div key={e.id} role="alert" className="pulse-red flex flex-wrap items-center gap-3 rounded-xl border border-critical/70 bg-[linear-gradient(90deg,rgba(252,61,33,0.25),rgba(11,61,145,0.25))] px-4 py-3">
            <OctagonAlert className="size-6 shrink-0 text-critical" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                <Link href={`/astronaut/${a.id}`} className="underline decoration-dotted">{a.name}</Link>: {spec.label}
                <span className="ml-2 rounded bg-space-0/60 px-2 py-0.5 text-[11px] font-semibold text-text-2">{TIER_LABEL[spec.tier]}</span>
              </p>
              <p className="text-sm text-text-2">
                {e.evidence} · <span className="num text-xs">rule {e.rule?.split(' · ')[0]}</span> · First response: {spec.firstResponse}.{' '}
                {e.state === 'countdown' && <>The watch LLM will inject <b className="text-white">{spec.drug}</b> in <b className="num text-white">{remaining}s</b> unless cancelled. The cancel window and dose limits are the safeguard.</>}
                {e.state === 'awaiting-confirm' && <>Guided breathing started on the watch. Confirm before <b className="text-white">{spec.drug}</b> is given.</>}
                {e.state === 'crewmate-alerted' && <>Crewmate needed: give <b className="text-white">{spec.medication}</b>. The watch cannot inject this.</>}
              </p>
            </div>
            {e.state === 'countdown' && (
              <button className="btn btn-ghost border-white/60" onClick={() => dispatch({ type: 'cancel', eventId: e.id })}>Cancel injection ({remaining}s)</button>
            )}
            {e.state === 'awaiting-confirm' && (
              <>
                <button className="btn btn-red" onClick={() => dispatch({ type: 'confirm', eventId: e.id })}><Syringe className="size-4" aria-hidden /> Confirm dose</button>
                <button className="btn btn-ghost" onClick={() => dispatch({ type: 'decline', eventId: e.id })}><Wind className="size-4" aria-hidden /> Breathing helped, no dose</button>
              </>
            )}
            {e.state === 'crewmate-alerted' && (
              <div className="flex flex-wrap gap-2">
                {CREW.filter((c) => c.id !== e.astronautId).slice(0, 3).map((c) => (
                  <button key={c.id} className="btn btn-primary" onClick={() => dispatch({ type: 'crewmate-gave', eventId: e.id, by: c.name })}>
                    <HandHeart className="size-4" aria-hidden /> Given by {c.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
