'use client';

import { Globe2, Inbox, Siren, WifiOff } from 'lucide-react';
import { fmtDelay, useMission } from '@/lib/mission';
import { LOCATIONS } from '@/lib/conditions';
import { CREW } from '@/lib/crew';
import type { Astronaut } from '@/lib/types';
import { Panel, ago } from './ui';

/** Feature 6 — weekly check-in with mission command (+ emergency reports); feature 18 — queue while out of contact. */
export function Reports({ a }: { a: Astronaut }) {
  const { s, dispatch } = useMission();
  const reports = s.reports.filter((r) => r.astronautIds.includes(a.id));
  return (
    <Panel
      id="reports"
      feature="Feature 6 · Weekly check-in with mission command · Feature 18 · Works without Earth contact"
      title="Reports to mission command"
      icon={<Globe2 className="size-5 text-nasa-bright" aria-hidden />}
      right={<button className="btn btn-primary" onClick={() => dispatch({ type: 'weekly-report' })}>Generate weekly report</button>}
    >
      <p className="mb-3 text-sm text-text-2">
        Ship at <b className="text-white">{LOCATIONS[s.location].label}</b>: reports take {fmtDelay(LOCATIONS[s.location].owltSec)} to reach Earth, and replies arrive automatically after the round trip.
      </p>
      {!s.earthLink && (
        <p className="mb-3 flex items-center gap-2 rounded-lg border border-watch/60 bg-watch/10 px-3 py-2 text-sm text-watch">
          <WifiOff className="size-4" aria-hidden /> No Earth contact. Reports are queued and send automatically when contact returns. Nothing onboard depends on the link.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {reports.length === 0 && <li className="text-sm text-text-3"><Inbox className="mr-1 inline size-4" aria-hidden /> No reports yet.</li>}
        {reports.map((r) => (
          <li key={r.id} className={`rounded-xl border p-3 ${r.kind === 'emergency' ? 'border-critical/60 bg-critical/10' : 'border-line bg-space-0/40'}`}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {r.kind === 'emergency' ? <Siren className="size-4 text-critical" aria-hidden /> : <Globe2 className="size-4 text-nasa-bright" aria-hidden />}
              <b className="capitalize">{r.kind} report</b>
              <span className="text-xs text-text-3">{ago(r.createdAt, s.now)}</span>
              <span className={`num ml-auto rounded-full border px-2 py-0.5 text-[11px] font-semibold ${r.delivery === 'queued' ? 'border-watch/60 text-watch' : r.delivery === 'replied' ? 'border-nominal/50 text-nominal' : 'border-nasa-bright/60 text-nasa-bright'}`}>
                {r.delivery === 'queued'
                  ? 'Queued: no Earth contact'
                  : r.delivery === 'replied'
                    ? 'Mission command replied'
                    : r.arrivesAt && r.arrivesAt > s.now
                      ? `In transit: reaches Earth in ${fmtDelay(Math.ceil((r.arrivesAt - s.now) / 1000))}`
                      : r.replyDueAt
                        ? `At Earth: reply in ${fmtDelay(Math.max(0, Math.ceil((r.replyDueAt - s.now) / 1000)))}`
                        : 'Sent to mission command'}
              </span>
            </div>
            <p className="text-sm">{r.summary[a.id]}</p>
            {r.kind === 'weekly' && (
              <details className="mt-1 text-sm">
                <summary className="cursor-pointer text-xs text-text-3">Whole-crew summary, raw data and flagged issues</summary>
                <ul className="mt-1 list-disc pl-5 text-text-2">
                  {CREW.map((c) => <li key={c.id}><b className="text-white">{c.name}:</b> {r.summary[c.id]}</li>)}
                </ul>
                {r.flagged.length > 0 && <p className="mt-1 text-watch">Flagged: {r.flagged.join(' · ')}</p>}
                <p className="mt-1 text-xs text-text-3">Includes the raw 24 h watch data and the decision log.</p>
              </details>
            )}
            {r.reply && (
              <p className="mt-2 rounded-lg border border-nominal/40 bg-nominal/10 px-3 py-2 text-sm">
                <b className="text-nominal">Mission command reply:</b> {r.reply.text}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
