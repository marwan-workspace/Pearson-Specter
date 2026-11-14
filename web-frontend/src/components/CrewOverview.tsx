'use client';

import Link from 'next/link';
import { useCallback, useState, type CSSProperties } from 'react';
import { CheckCheck, ChevronRight, ClipboardList, Crown, FileText, Inbox, Radio, Rocket, Users, Wifi, WifiOff } from 'lucide-react';
import { backendRequest, useSession } from '@/lib/session';
import { usePoll, useNow } from '@/lib/hooks';
import { dateTime, isStale, num, timeAgo, words } from '@/lib/format';
import type { CommandInfo, CrewMember, Decision, Report } from '@/lib/types';
import { Avatar, ConfirmButton, EmptyState, ErrorBanner, Panel, Pill, Skeleton, SkeletonRows, Spinner, StatusPill, Toast, type Notice } from './ui';

const LOCATIONS = ['iss', 'moon', 'mars'] as const;
const LOCATION_LABEL: Record<string, string> = { iss: 'ISS', moon: 'Moon', mars: 'Mars' };

function Reading({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="num text-lg font-semibold leading-tight">{value}<span className="label ml-1 font-normal">{unit}</span></dd>
    </div>
  );
}

function CrewCard({ member, isLeader, now, i }: { member: CrewMember; isLeader: boolean; now: number; i: number }) {
  const v = member.latestVitals;
  const stale = isStale(v?.observed_at, now);
  const fault = !!v && v.sensor_status !== 'ok';
  return (
    <li className="settle" style={{ '--i': i } as CSSProperties}>
      <Link href={`/astronaut/${member.callsign.toLowerCase()}`} className="panel lift nudge-host group flex h-full flex-col gap-4 p-4 md:p-5" aria-label={`Open ${member.display_name}'s record`}>
        <div className="flex items-start gap-3">
          <Avatar name={member.display_name} />
          <div className="min-w-0 flex-1">
            <p className="title flex items-center gap-1.5 truncate text-base">
              {member.display_name}
              {isLeader && <Crown className="size-4 shrink-0 text-warning" aria-label="Acting leader" />}
            </p>
            <p className="label">{words(member.role)} · rank {member.command_rank}{!member.fit_for_command && ' · unfit for command'}</p>
          </div>
          <ChevronRight className="nudge mt-1 size-5 shrink-0 text-muted" aria-hidden />
        </div>
        <dl className="grid grid-cols-4 gap-2">
          <Reading label="Heart" value={num(v?.heart_rate_bpm)} unit="bpm" />
          <Reading label="Oxygen" value={num(v?.spo2_percent)} unit="%" />
          <Reading label="Pressure" value={v?.systolic_mmhg ? `${num(v.systolic_mmhg)}/${num(v.diastolic_mmhg)}` : '—'} unit="" />
          <Reading label="Temp" value={num(v?.temperature_c, 1)} unit="°C" />
        </dl>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          {member.openEvents > 0 ? <Pill tone="critical">{member.openEvents} open {member.openEvents === 1 ? 'event' : 'events'}</Pill> : <Pill tone="nominal">No open events</Pill>}
          {fault && <Pill tone="fault">Sensor {v.sensor_status}</Pill>}
          <span className="label ml-auto flex items-center gap-1.5">
            {!v ? 'No readings yet' : stale ? <>Stale · {timeAgo(v.observed_at, now)}</> : <><span className="beacon" aria-hidden />Live · {timeAgo(v.observed_at, now)}</>}
          </span>
        </div>
      </Link>
    </li>
  );
}

/** Weekly summaries are stored as JSON text keyed by astronaut id; emergency ones are a plain sentence. */
function ReportSummary({ summary, crew }: { summary: string; crew: CrewMember[] }) {
  let perPerson: Record<string, string> | null = null;
  try { const parsed: unknown = JSON.parse(summary); if (parsed && typeof parsed === 'object') perPerson = parsed as Record<string, string>; } catch { /* plain text */ }
  if (!perPerson) return <p className="whitespace-pre-wrap text-secondary">{summary}</p>;
  return (
    <dl className="grid gap-2">
      {Object.entries(perPerson).map(([id, text]) => (
        <div key={id}>
          <dt className="font-semibold">{crew.find((c) => c.id === id)?.display_name ?? 'Crew member'}</dt>
          <dd className="text-secondary">{String(text)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CrewOverview() {
  const { me, refresh: refreshMe } = useSession();
  const [crew, setCrew] = useState<CrewMember[] | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [command, setCommand] = useState<CommandInfo | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const now = useNow();

  const refresh = useCallback(async () => {
    try {
      const [c, d, r, cmd] = await Promise.all([
        backendRequest<{ crew: CrewMember[] }>('/crew/overview'),
        backendRequest<{ items: Decision[] }>('/decisions/pending'),
        backendRequest<{ items: Report[] }>('/reports'),
        backendRequest<CommandInfo>('/command'),
      ]);
      setCrew(c.crew); setDecisions(d.items); setReports(r.items); setCommand(cmd); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load mission data.'); }
  }, []);
  usePoll(refresh, 2000);

  /** Runs one leader action: marks it busy, reports the outcome in a toast, then reloads. */
  async function run(key: string, done: string, path: string, body: object, alsoMe = false) {
    setBusy(key);
    try {
      await backendRequest(path, { method: 'POST', body: JSON.stringify(body) });
      if (path.startsWith('/decisions/')) setDecisions((prev) => prev.filter((d) => d.id !== key));
      setNotice({ tone: 'nominal', text: done });
      if (alsoMe) await refreshMe();
      await refresh();
    } catch (e) { setNotice({ tone: 'critical', text: e instanceof Error ? e.message : 'That did not work.' }); }
    finally { setBusy(null); }
  }

  /** Approves every waiting decision one at a time (a plan is closed only after its last item, so they must not race). */
  async function approveAll() {
    const queue = decisions;
    let ok = 0; const failed: string[] = [];
    for (const [i, d] of queue.entries()) {
      setBusy(`all:${i + 1}/${queue.length}`);
      try {
        await backendRequest(`/decisions/${d.id}`, { method: 'POST', body: JSON.stringify({ action: 'approve' }) });
        ok++; setDecisions((prev) => prev.filter((x) => x.id !== d.id));
      } catch (e) { failed.push(`${d.subject_name || 'Crew member'}: ${e instanceof Error ? e.message : 'failed'}`); }
    }
    setNotice(failed.length
      ? { tone: 'warning', text: `Approved ${ok} of ${queue.length}. Not approved: ${failed.join(' ')}` }
      : { tone: 'nominal', text: `All ${ok} decisions approved.` });
    await refresh();
    setBusy(null);
  }

  if (!me) return null;
  const mission = command?.mission;
  const location = (mission?.destination || me.mission.destination || '').toLowerCase();
  const openEvents = crew?.reduce((n, c) => n + c.openEvents, 0) ?? 0;
  const week = () => ({ periodStart: new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), periodEnd: new Date().toISOString().slice(0, 10) });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">{me.mission.name} · acting team leader</p>
          <h1 className="display mt-1 text-3xl md:text-4xl">Crew overview</h1>
        </div>
        <button className={`btn btn-primary ${busy === 'weekly' ? 'working' : ''}`} disabled={!!busy} onClick={() => void run('weekly', 'Weekly report written. It is at the top of Mission reports.', '/weekly', week())}>
          {busy === 'weekly' ? <Spinner /> : <FileText className="size-4" aria-hidden />}
          {busy === 'weekly' ? 'Writing report…' : 'Write weekly report'}
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Crew on mission', value: crew ? String(crew.length) : null, hint: crew ? `${crew.filter((c) => c.fit_for_command).length} fit for command` : '' },
          { label: 'Open health events', value: crew ? String(openEvents) : null, hint: !crew ? '' : openEvents ? 'Needs attention' : 'All clear', alert: openEvents > 0 },
          { label: 'Decisions waiting for you', value: crew ? String(decisions.length) : null, hint: !crew ? '' : decisions.length ? 'Oldest first below' : 'Nothing pending', alert: decisions.length > 0 },
          { label: 'One-way delay to Earth', value: mission ? `${(mission.earth_round_trip_seconds / 2).toFixed(1)} s` : null, hint: mission ? (mission.earth_link_available ? 'Link available' : 'Link down: reports queue') : '', alert: mission ? !mission.earth_link_available : false },
        ].map((s, i) => (
          <div key={s.label} className="panel lift settle p-4" style={{ '--i': i } as CSSProperties}>
            <dt className="label">{s.label}</dt>
            <dd className="num display glow-accent mt-1 text-3xl">{s.value ?? <Skeleton className="h-8 w-16" />}</dd>
            <p className={`mt-1 text-sm ${s.alert ? 'text-warning' : 'text-secondary'}`}>{s.hint || ' '}</p>
          </div>
        ))}
      </dl>

      <section aria-labelledby="crew-h">
        <h2 id="crew-h" className="title mb-3 flex items-center gap-2 text-base"><Users className="size-4 text-muted" aria-hidden />Crew status</h2>
        {!crew ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading crew">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44 w-full" />)}</div>
        ) : crew.length === 0 ? (
          <div className="panel"><EmptyState icon={Users} title="No active crew" hint="Crew members appear here once they are added to the mission." /></div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {crew.map((c, i) => <CrewCard key={c.id} member={c} isLeader={c.id === (command?.actingLeaderId ?? me.actingLeaderId)} now={now} i={i} />)}
          </ul>
        )}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <Panel title="Decisions for you" icon={ClipboardList} count={decisions.length} i={1}>
          {!crew ? <SkeletonRows /> : decisions.length === 0 ? (
            <EmptyState icon={Inbox} title="No decisions are waiting" hint="Treatment plans and doses that need your approval show up here." />
          ) : (
            <div className="grid gap-3">
            {decisions.length > 1 && (
              <ConfirmButton className={`btn btn-sm btn-primary justify-self-start ${busy?.startsWith('all:') ? 'working' : ''}`} confirmLabel={`Approve all ${decisions.length}?`} disabled={!!busy} onConfirm={() => void approveAll()}>
                {busy?.startsWith('all:') ? <><Spinner />Approving {busy.slice(4)}…</> : <><CheckCheck className="size-4" aria-hidden />Approve all {decisions.length}</>}
              </ConfirmButton>
            )}
            <ul className="grid gap-3">
              {decisions.map((d) => (
                <li key={d.id} className="alert-in well p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/astronaut/${String(d.subject_callsign || '').toLowerCase()}`} className="link text-sm font-semibold">{d.subject_name || 'Crew member'}</Link>
                    <Pill tone="warning">{words(d.decision_type)}</Pill>
                    <span className="label ml-auto">Waiting since {timeAgo(d.decided_at, now)}</span>
                  </div>
                  <p className="mt-2 text-sm">{d.proposed_action ? words(d.proposed_action) : words(d.decision_type)}</p>
                  {d.rationale && d.rationale !== d.proposed_action && <p className="mt-1 text-sm text-secondary">{d.rationale}</p>}
                  <div className="mt-3 flex gap-2">
                    <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => void run(d.id, 'Decision approved.', `/decisions/${d.id}`, { action: 'approve' })}>{busy === d.id && <Spinner />}Approve</button>
                    <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => void run(d.id, 'Decision rejected.', `/decisions/${d.id}`, { action: 'reject' })}>Reject</button>
                  </div>
                </li>
              ))}
            </ul>
            </div>
          )}
        </Panel>

        <Panel title="Mission reports" icon={Radio} count={reports.length} i={2}>
          {!crew ? <SkeletonRows /> : reports.length === 0 ? (
            <EmptyState icon={FileText} title="No reports yet" hint="Write a weekly report, or one is sent automatically after an emergency." />
          ) : (
            <ul className="grid max-h-[460px] gap-2 overflow-auto">
              {reports.map((r) => (
                <li key={r.id}>
                  <details className="group rounded-[var(--radius-control)] border border-hairline">
                    <summary className="row flex min-h-[44px] flex-wrap items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm">
                      <ChevronRight className="size-4 text-muted transition-transform group-open:rotate-90" aria-hidden />
                      <b className="font-semibold">{words(r.report_type)} report</b>
                      <StatusPill status={r.status} />
                      <span className="label ml-auto">{dateTime(r.created_at)}</span>
                    </summary>
                    <div className="grid gap-2 border-t border-hairline p-3 text-sm">
                      {r.arrives_at && <p className="label">Reaches Earth {dateTime(r.arrives_at)}</p>}
                      <ReportSummary summary={r.summary} crew={crew} />
                      {r.flagged_issues?.length > 0 && <p className="flex flex-wrap gap-1.5">{r.flagged_issues.map((f) => <Pill key={f} tone="warning">{words(f)}</Pill>)}</p>}
                      {r.replies?.map((reply) => (
                        <p key={reply.id} className="well p-3"><b className="font-semibold">{reply.sender}</b> <span className="label">· {dateTime(reply.received_at)}</span><br />{reply.message}</p>
                      ))}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Mission controls" icon={Rocket} i={3}>
          {!mission ? <SkeletonRows /> : (
            <div className="grid gap-5">
              <fieldset disabled={!!busy}>
                <legend className="label mb-2">Location (sets the delay and radiation limits)</legend>
                <div className="well grid grid-cols-3 gap-1 p-1">
                  {LOCATIONS.map((loc) => (
                    <label key={loc} className={`btn btn-sm cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-accent ${location === loc ? 'border-hairline-accent bg-accent-dim text-accent' : 'btn-quiet'}`}>
                      <input type="radio" name="location" className="sr-only" checked={location === loc} onChange={() => void run('location', `Mission location set to ${LOCATION_LABEL[loc]}.`, '/command/location', { location: loc }, true)} />
                      {LOCATION_LABEL[loc]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold">{mission.earth_link_available ? <Wifi className="size-4 text-nominal" aria-hidden /> : <WifiOff className="size-4 text-warning" aria-hidden />}Earth link</p>
                  <p className="label">{mission.earth_link_available ? 'Reports are sent as they are written.' : 'Reports queue until the link is back.'}</p>
                </div>
                <button role="switch" aria-checked={mission.earth_link_available} aria-label="Earth link available" disabled={!!busy}
                  onClick={() => void run('link', mission.earth_link_available ? 'Earth link marked down. New reports will queue.' : 'Earth link restored. Queued reports are on their way.', '/command/earth-link', { available: !mission.earth_link_available }, true)}
                  className={`relative h-7 w-12 shrink-0 rounded-full border border-edge transition-colors duration-200 ${mission.earth_link_available ? 'bg-accent' : 'bg-elevated'}`}>
                  <span className={`absolute left-0.5 top-0.5 size-[22px] rounded-full bg-primary shadow transition-transform duration-200 ${mission.earth_link_available ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              <div className="border-t border-hairline pt-4">
                <p className="text-sm font-semibold">Command</p>
                <p className="label mb-3">Handing over marks you unfit and moves command down the chain.</p>
                <div className="flex flex-wrap gap-2">
                  <ConfirmButton className="btn btn-sm btn-ghost" confirmLabel="Confirm handover" disabled={!!busy} onConfirm={() => void run('handover', 'Command handed over.', '/command/handover', { reason: 'Voluntary team leader handover' }, true)}>Hand over command</ConfirmButton>
                  <ConfirmButton className="btn btn-sm btn-ghost" confirmLabel="Confirm restore" disabled={!!busy} onConfirm={() => void run('restore', 'Command restored to rank 1.', '/command/restore', { reason: 'Acting leader restored command' }, true)}>Restore rank 1</ConfirmButton>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>
      <Toast notice={notice} onClose={() => setNotice(null)} />
    </div>
  );
}
