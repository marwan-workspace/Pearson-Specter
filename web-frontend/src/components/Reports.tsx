'use client';

import clsx from 'clsx';
import { FileText, Globe2, RefreshCw, Siren, WifiOff } from 'lucide-react';
import { fmtDelay, useMission } from '@/lib/mission';
import { useAgent } from '@/lib/agent';
import { LOCATIONS } from '@/lib/conditions';
import { CREW } from '@/lib/crew';
import type { Astronaut, Report } from '@/lib/types';
import { Notice, Panel, ago } from './ui';

function delivery(r: Report, now: number): { label: string; cls: string } {
  if (r.delivery === 'queued') return { label: 'Queued until Earth contact returns', cls: 'text-watch' };
  if (r.delivery === 'replied') return { label: 'Mission command replied', cls: 'text-nominal' };
  if (r.arrivesAt && r.arrivesAt > now) return { label: `In transit, reaches Earth in ${fmtDelay(Math.ceil((r.arrivesAt - now) / 1000))}`, cls: 'text-nasa-bright' };
  if (r.replyDueAt) return { label: `At Earth, reply in ${fmtDelay(Math.max(0, Math.ceil((r.replyDueAt - now) / 1000)))}`, cls: 'text-nasa-bright' };
  return { label: 'Sent to mission command', cls: 'text-nasa-bright' };
}

/** Feature 6: weekly and emergency reports to mission command. Feature 18: they queue while out of contact. */
export function Reports({ a }: { a: Astronaut }) {
  const { s } = useMission();
  const { weeklyReport, live } = useAgent();
  const busy = !!s.pending.weekly;
  const reports = s.reports.filter((r) => r.astronautIds.includes(a.id));
  return (
    <Panel
      id="reports"
      feature="Features 6, 18"
      title="Reports to mission command"
      icon={<Globe2 className="size-5 text-nasa-bright" aria-hidden />}
      lead={<>From {LOCATIONS[s.location].label}, a report takes <span className="num">{fmtDelay(LOCATIONS[s.location].owltSec)}</span> to reach Earth. Replies arrive on their own after the round trip.</>}
      right={
        <button className="btn btn-sm btn-primary" onClick={() => void weeklyReport()} disabled={busy}>
          {busy ? <RefreshCw className="size-4 animate-spin" aria-hidden /> : <FileText className="size-4" aria-hidden />} {busy ? 'Writing report' : live ? 'Write weekly report with Gemini' : 'Write weekly report'}
        </button>
      }
    >
      {!s.earthLink && (
        <div className="mb-4">
          <Notice tone="watch" icon={<WifiOff className="size-4" aria-hidden />}>
            No Earth contact. Reports queue here and send on their own when contact returns. Nothing on board depends on the link.
          </Notice>
        </div>
      )}
      {reports.length === 0 ? (
        <p className="text-sm text-text-3">No reports yet. Write the weekly report to send the first one.</p>
      ) : (
        <ul className="flex flex-col" aria-busy={busy}>
          {reports.map((r) => {
            const d = delivery(r, s.now);
            return (
              <li key={r.id} className={clsx('border-b border-line py-4 first:pt-0 last:border-b-0 last:pb-0', r.kind === 'emergency' && 'border-l-2 border-l-critical pl-4')}>
                <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {r.kind === 'emergency' ? <Siren className="size-4 text-critical" aria-hidden /> : <FileText className="size-4 text-text-3" aria-hidden />}
                    {r.kind === 'emergency' ? 'Emergency report' : 'Weekly report'}
                  </p>
                  <span className="label">{ago(r.createdAt, s.now)}</span>
                  <span className={clsx('num ml-auto text-sm font-semibold', d.cls)}>{d.label}</span>
                </div>
                <p className="max-w-[80ch] text-sm text-text-2">{r.summary[a.id]}</p>
                {r.kind === 'weekly' && (
                  <details className="mt-2 text-sm">
                    <summary className="label">Whole crew, flagged issues and what is attached</summary>
                    <ul className="mt-2 flex max-w-[80ch] flex-col gap-1.5 text-text-2">
                      {CREW.map((c) => <li key={c.id}><b className="text-ink">{c.name}:</b> {r.summary[c.id]}</li>)}
                    </ul>
                    {r.flagged.length > 0 && (
                      <>
                        <p className="label mt-3 text-watch">Flagged for mission command</p>
                        <ul className="list-disc pl-5 text-watch">{r.flagged.map((f, i) => <li key={i}>{f}</li>)}</ul>
                      </>
                    )}
                    <p className="label mt-2">Attached: raw 24 h watch data and the decision log.</p>
                  </details>
                )}
                {r.reply && (
                  <p className="mt-3 max-w-[80ch] border-l-2 border-nominal pl-3 text-sm">
                    <b className="text-nominal">Reply from mission command.</b> {r.reply.text.replace(/^Mission command:\s*/, '')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
