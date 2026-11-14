'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Activity, BedDouble, Bell, ChevronLeft, ClipboardList, FlaskConical, HeartPulse, MessagesSquare, Stethoscope, Syringe, Zap } from 'lucide-react';
import { backendRequest, useSession } from '@/lib/session';
import { useNow } from '@/lib/hooks';
import { useTelemetryEngine } from '@/lib/useTelemetry';
import { useRecord } from '@/lib/useRecord';
import { isStale, timeAgo, words } from '@/lib/format';
import type { ChatMessage, Decision } from '@/lib/types';
import { AgentChat } from './AgentChat';
import { ASSESS_LABEL, TelemetryDeck, type AssessStage } from './telemetry/TelemetryDeck';
import { ReticleIcon } from './telemetry/icons';
import { CareTab, EventsTab, VitalsTab, WellbeingTab, type Actions } from './RecordSections';
import { AnimatedCheck, Avatar, ConfirmButton, ErrorBanner, Panel, Pill, Skeleton, Spinner, Tabs, Toast, type Notice, type TabDef } from './ui';

type TabId = 'vitals' | 'events' | 'care' | 'wellbeing' | 'agent';
type AgentReply = { message: { text: string; at?: number }; completed?: boolean; conversationId?: string };

export function RecordPage({ astronautKey }: { astronautKey: string }) {
  const { me } = useSession();
  const isSelf = me?.astronaut.callsign.toLowerCase() === astronautKey.toLowerCase();
  const [tab, setTab] = useState<TabId>('vitals');
  const { records, related, activeEvents, profileReady, error, reload, resolveDecision, loadMore, hasMore, loadingHistory } = useRecord(astronautKey, isSelf, tab);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [checkin, setCheckin] = useState<ChatMessage[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [sending, setSending] = useState<'chat' | 'checkin' | null>(null);
  const now = useNow(1000); // the cancel-window countdown needs seconds
  const engine = useTelemetryEngine();
  const [stage, setStage] = useState<AssessStage>('idle');
  const seededAt = records?.vitals[0]?.observed_at ?? null;
  // the simulated stream starts from the astronaut's last stored reading
  useEffect(() => { const first = records?.vitals[0]; if (first) engine.seed(first); }, [engine, seededAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // The tab is part of the address (#care), so a reload or a shared link opens the same section.
  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as TabId;
    if (['vitals', 'events', 'care', 'wellbeing', 'agent'].includes(fromHash)) setTab(fromHash);
  }, []);
  const chooseTab = useCallback((id: string) => { setTab(id as TabId); window.history.replaceState(null, '', `#${id}`); }, []);

  // Saved conversations come from the server; they never overwrite a message that is being sent.
  useEffect(() => {
    if (!related || sending) return;
    if (related.checkin.length) setCheckin(related.checkin);
    if (related.chat) { setChat(related.chat.messages); setChatId(related.chat.id); }
  }, [related, sending]);

  const act: Actions['act'] = useCallback(async (key, done, path, body = {}) => {
    setBusy(key);
    try {
      const result = await backendRequest<Decision>(path, { method: 'POST', body: JSON.stringify(body) });
      if (path.startsWith('/decisions/')) resolveDecision(result);
      setNotice({ tone: 'nominal', text: done });
      await reload();
      return true;
    } catch (e) {
      setNotice({ tone: 'critical', text: e instanceof Error ? e.message : 'That did not work.' });
      return false;
    } finally { setBusy(null); }
  }, [reload, resolveDecision]);

  /** Run assessment: the 3D scan sweeps while the real request runs; the button names each stage. */
  async function runAssessment() {
    if (stage !== 'idle' || busy) return;
    setStage('scanning');
    engine.triggerScan();
    const request = act('assess', 'Assessment saved. See Wellbeing and Care.', '/assess', { astronautId: astronautKey, date: new Date().toISOString().slice(0, 10) });
    await new Promise((r) => setTimeout(r, 2600)); // the length of the scan sweep
    setStage((s) => (s === 'scanning' ? 'evaluating' : s));
    const ok = await request;
    setStage(ok ? 'saved' : 'idle');
    if (ok) {
      chooseTab('wellbeing');
      setTimeout(() => setStage('idle'), 3500);
    }
  }

  async function send(kind: 'chat' | 'checkin', text: string) {
    const history = [...(kind === 'chat' ? chat : checkin), { from: 'astronaut' as const, text, at: Date.now() }];
    (kind === 'chat' ? setChat : setCheckin)(history);
    setSending(kind);
    try {
      const result = await backendRequest<AgentReply>(`/${kind}`, { method: 'POST', body: JSON.stringify({
        astronautId: astronautKey, date: new Date().toISOString().slice(0, 10), missedYesterday: false,
        messages: history.map((m) => ({ from: m.from, text: m.text })), ...(kind === 'chat' && chatId ? { conversationId: chatId } : {}),
      }) });
      if (result.conversationId) setChatId(result.conversationId);
      (kind === 'chat' ? setChat : setCheckin)([...history, { from: 'agent', text: result.message.text, at: result.message.at || Date.now() }]);
      if (kind === 'checkin' && result.completed) setNotice({ tone: 'nominal', text: 'Check-in complete. Thank you.' });
      void reload();
    } catch (e) { setNotice({ tone: 'critical', text: e instanceof Error ? e.message : 'The agent could not reply.' }); }
    finally { setSending(null); }
  }

  if (!me) return null;
  const person = related?.chain.find((c) => c.callsign.toLowerCase() === astronautKey.toLowerCase());
  const name = person?.display_name ?? words(astronautKey.toLowerCase());
  const actions: Actions = { busy, act };
  const latest = records?.vitals[0];
  const openEvents = activeEvents;
  const myAlerts = related?.alerts.filter((a) => a.recipient_id === me.astronaut.id && (a.status === 'pending' || a.status === 'acknowledged')) ?? [];
  const pending = related?.pending ?? [];
  const careBadge = records?.medications.filter((m) => m.status === 'proposed' || m.status === 'awaiting_confirmation').length ?? 0;

  const tabs: TabDef[] = [
    { id: 'vitals', label: 'Telemetry', icon: HeartPulse, motion: 'beat' },
    { id: 'events', label: 'Events', icon: Stethoscope, badge: openEvents.length },
    { id: 'care', label: 'Care', icon: Syringe, badge: careBadge },
    { id: 'wellbeing', label: 'Wellbeing', icon: BedDouble, motion: 'breathe' },
    ...(isSelf ? [{ id: 'agent', label: 'Agent', icon: MessagesSquare }] : []),
  ];
  const current = tabs.some((t) => t.id === tab) ? tab : 'vitals';

  return (
    <div className="grid gap-6">
      {me.isActingLeader && !isSelf && <Link href="/" className="link flex w-fit items-center gap-1 text-sm"><ChevronLeft className="size-4" aria-hidden />Crew overview</Link>}

      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} size="size-14" />
        <div className="min-w-0 flex-1 basis-56">
          <p className="label">{me.mission.name} · {isSelf ? 'your private record' : 'decider view'}</p>
          <h1 className="display truncate text-3xl md:text-4xl">{name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!records ? <Skeleton className="h-6 w-40" /> : (
              <>
                {openEvents.length ? <Pill tone={openEvents.some(e => e.reported_by === 'watch' && e.severity === 'critical') ? 'critical' : 'warning'}>{openEvents.length} unresolved {openEvents.length === 1 ? 'event' : 'events'}</Pill> : <Pill tone="nominal">No open events</Pill>}
                {person && !person.fit_for_command && <Pill tone="warning">Unfit for command</Pill>}
                {latest && latest.sensor_status !== 'ok' && <Pill tone="fault">Sensor {latest.sensor_status}</Pill>}
                <span className="label flex items-center gap-1.5">
                  {!latest ? 'No readings yet' : isStale(latest.observed_at, now) ? `Readings stale · ${timeAgo(latest.observed_at, now)}` : <><span className="beacon" aria-hidden />Live{latest.activity ? ` · ${words(latest.activity).toLowerCase()}` : ''} · {timeAgo(latest.observed_at, now)}</>}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={`btn btn-primary ${stage === 'scanning' || stage === 'evaluating' ? 'working' : ''}`} disabled={!!busy || !records || stage !== 'idle'} onClick={() => void runAssessment()} aria-live="polite">
            {stage === 'idle' ? <Activity className="size-4" aria-hidden /> : stage === 'saved' ? <AnimatedCheck className="size-5" /> : <ReticleIcon />}
            {ASSESS_LABEL[stage]}
          </button>
          {me.isActingLeader && (
            <details className="relative">
              <summary className="btn btn-ghost"><Zap className="size-4" aria-hidden />Simulate</summary>
              <div className="pop-in hud absolute right-0 z-20 mt-2 grid w-64 gap-2 p-3">
                <p className="label">Inject a test scenario for this astronaut.</p>
                <ConfirmButton className="btn btn-sm btn-ghost" confirmLabel="Confirm: inject bradycardia" disabled={!!busy} onConfirm={() => void act('sim', 'Bradycardia scenario injected.', '/simulator/inject', { astronautId: astronautKey, condition: 'bradycardia' })}>Bradycardia (tier 1)</ConfirmButton>
                <ConfirmButton className="btn btn-sm btn-ghost" confirmLabel="Confirm: inject sensor fault" disabled={!!busy} onConfirm={() => void act('sim', 'Sensor fault injected.', '/simulator/sensor-fault', { astronautId: astronautKey })}>Sensor fault</ConfirmButton>
              </div>
            </details>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void reload()} />}
      {!!openEvents.length && <div className="well p-3 text-sm text-secondary">
        {latest?.sensor_status === 'ok' && latest.flags?.length === 0 ? 'The latest stored watch reading is within limits. ' : ''}
        {openEvents.some(e => e.reported_by === 'simulator') ? 'A stored simulator scenario is still open; end it in Events after review. ' : ''}
        Stored events remain separate from the browser simulation below. Watch events close on a valid recovered reading; other events require review.
      </div>}

      {myAlerts.length > 0 && (
        <section aria-label="Alerts for you" className="grid gap-3">
          {myAlerts.map((a) => (
            <article key={a.id} role="alert" className={`alert-in critical-surface flex flex-wrap items-center gap-3 p-4 ${a.status === 'pending' ? 'pulse' : ''}`}>
              <Bell className="size-5 shrink-0 text-critical" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{a.alert_text}</p>
                {a.action_instructions && <p className="text-sm text-secondary">{a.action_instructions}</p>}
                <p className="label mt-1">{timeAgo(a.created_at, now)} · {words(a.status)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {a.status === 'pending' && <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => void act(a.id, 'Alert acknowledged.', `/alerts/${a.id}/ack`)}>{busy === a.id && <Spinner />}Acknowledge</button>}
                {a.medication_event_id && <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => void act(`${a.id}-given`, 'Medication recorded as given.', `/events/${a.medication_event_id}/given`)}>{busy === `${a.id}-given` && <Spinner />}Mark medication given</button>}
              </div>
            </article>
          ))}
        </section>
      )}

      {pending.length > 0 && (
        <Panel title="Needs your decision" icon={ClipboardList} count={pending.length}>
          <ul className="grid gap-3 lg:grid-cols-2">
            {pending.map((d) => (
              <li key={d.id} className="well p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-sm font-semibold">{d.subject_name || 'Crew member'}</b>
                  <Pill tone="warning">{words(d.decision_type)}</Pill>
                  <span className="label ml-auto">Waiting since {timeAgo(d.decided_at, now)}</span>
                </div>
                <p className="mt-2 text-sm">{words(d.proposed_action || d.decision_type)}</p>
                {d.rationale && d.rationale !== d.proposed_action && <p className="mt-1 text-sm text-secondary">{d.rationale}</p>}
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => void act(d.id, 'Decision approved.', `/decisions/${d.id}`, { action: 'approve' })}>{busy === d.id && <Spinner />}Approve</button>
                  <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => void act(d.id, 'Decision rejected.', `/decisions/${d.id}`, { action: 'reject' })}>Reject</button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Tabs tabs={tabs} value={current} onChange={chooseTab} label={`${name}'s record`} />

      <div role="tabpanel" id={`panel-${current}`} aria-labelledby={`tab-${current}`} tabIndex={-1} key={current} className="fade-in">
        {!records || !profileReady ? (
          error ? null : (
            <div className="grid gap-4" role="status" aria-label="Loading record">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-36 w-full" />)}</div>
              <Skeleton className="h-64 w-full" />
            </div>
          )
        ) : current === 'vitals' ? (
          <div className="grid gap-6">
            <TelemetryDeck engine={engine} seededAt={seededAt} onRunAssessment={() => void runAssessment()} stage={stage} canAssess={!busy} />
            <VitalsTab vitals={records.vitals} now={now} />
          </div>
        )
          : current === 'events' ? <EventsTab records={records} alerts={related?.alerts ?? []} chain={related?.chain ?? []} myId={me.astronaut.id} actions={actions} />
          : current === 'care' ? <CareTab records={records} stock={related?.stock ?? []} astronautKey={astronautKey} isSelf={isSelf} now={now} actions={actions} />
          : current === 'wellbeing' ? <WellbeingTab records={records} now={now} />
          : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Daily check-in" icon={FlaskConical}>
                <AgentChat label="Daily check-in" messages={checkin} busy={sending === 'checkin'} onSend={(t) => void send('checkin', t)} emptyTitle="Start today's check-in" emptyHint="Say hello. The agent asks about sleep, symptoms and five mood questions. It takes about three minutes." placeholder="Answer the agent…" />
              </Panel>
              <Panel title="Private chat with the agent" icon={MessagesSquare} i={1}>
                <AgentChat label="Private chat" messages={chat} busy={sending === 'chat'} onSend={(t) => void send('chat', t)} emptyTitle="Ask the agent anything" emptyHint="Only you can read this conversation. In an emergency, alert a crewmate." placeholder="Write a message…" />
              </Panel>
            </div>
          )}
      </div>
      <Toast notice={notice} onClose={() => setNotice(null)} />
      {hasMore && <button className="btn btn-ghost justify-self-start" disabled={loadingHistory} onClick={() => void loadMore()}>{loadingHistory ? <Spinner /> : null}Load earlier records</button>}
    </div>
  );
}
