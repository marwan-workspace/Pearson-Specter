'use client';

import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Activity, BedDouble, Bell, Brain, ClipboardList, Droplets, FlaskConical, HeartPulse, Inbox, Pill as PillIcon, Radiation, Stethoscope, Syringe, Thermometer, Users, Gauge, type LucideIcon } from 'lucide-react';
import { clock, dateTime, num, timeAgo, words } from '@/lib/format';
import type { ChainMember, CrewAlert, RecordStreams, StockItem, Vital } from '@/lib/types';
import { AnimatedCheck, ConfirmButton, EmptyState, Panel, Pill, Sparkline, Spinner, StatusPill } from './ui';

/** What every tab needs to run an action: POST to the backend, with one busy key at a time. */
export interface Actions {
  busy: string | null;
  act: (key: string, done: string, path: string, body?: object) => Promise<boolean>;
}

/** A plain list of dated rows inside a panel. */
function Rows<T extends { id: string }>({ items, empty, children, limit = 30 }: { items: T[]; empty: ReactNode; children: (item: T) => ReactNode; limit?: number }) {
  if (!items.length) return <>{empty}</>;
  return (
    <ul className="-my-1 max-h-[440px] divide-y divide-hairline overflow-y-auto">
      {items.slice(0, limit).map((item) => <li key={item.id} className="py-3">{children(item)}</li>)}
    </ul>
  );
}

// ───────────── Vitals ─────────────

function VitalTile({ label, icon: Icon, value, unit, series, color, i, digits = 0, motion = '' }: { motion?: string; label: string; icon: LucideIcon; value: string; unit: string; series: number[]; color: string; i: number; digits?: number }) {
  const range = series.length ? `${num(Math.min(...series), digits)}–${num(Math.max(...series), digits)}` : '—';
  return (
    <div className="panel lift settle min-w-0 p-4" style={{ '--i': i } as CSSProperties}>
      <dt className="label flex items-center gap-1.5"><Icon className={`size-4 ${motion}`} style={{ color }} aria-hidden />{label}</dt>
      <dd className="mt-1">
        <span className="num display glow-accent text-2xl sm:text-3xl">{value}</span><span className="label ml-1">{unit}</span>
        <Sparkline values={series} color={color} />
        <span className="label block">Range {range} over the last {series.length} readings</span>
      </dd>
    </div>
  );
}

export function VitalsTab({ vitals, now }: { vitals: Vital[]; now: number }) {
  const latest = vitals[0];
  if (!latest) return <div className="panel"><EmptyState icon={Activity} title="No readings yet" hint="The watch sends one reading a minute. They appear here as they arrive." /></div>;
  return (
    <div className="grid gap-6">
      <Panel title="Stored watch readings" icon={Activity} action={<span className="label">Updated {timeAgo(latest.observed_at, now)}</span>}>
        <div className="-mx-4 overflow-x-auto px-4 md:-mx-5 md:px-5">
          <table className="table num min-w-[560px]">
            <thead><tr><th scope="col">Time</th><th scope="col">Activity</th><th scope="col">Heart</th><th scope="col">Oxygen</th><th scope="col">Pressure</th><th scope="col">Temp</th><th scope="col">Sensor</th></tr></thead>
            <tbody>
              {vitals.slice(0, 10).map((v) => (
                <tr key={v.id}>
                  <td>{clock(v.observed_at)}</td>
                  <td>{words(v.activity)}</td>
                  <td>{v.heart_rate_bpm == null ? "—" : `${num(v.heart_rate_bpm)} bpm`}</td>
                  <td>{v.spo2_percent == null ? "—" : `${num(v.spo2_percent)}%`}</td>
                  <td>{v.systolic_mmhg == null ? "—" : `${num(v.systolic_mmhg)}/${num(v.diastolic_mmhg)}`}</td>
                  <td>{v.temperature_c == null ? "—" : `${num(v.temperature_c, 1)} °C`}</td>
                  <td>{v.sensor_status === 'ok' ? <Pill tone="nominal">OK</Pill> : <Pill tone="fault">{words(v.sensor_status)}</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ───────────── Events ─────────────

export function EventsTab({ records, alerts, chain, myId, actions }: { records: RecordStreams; alerts: CrewAlert[]; chain: ChainMember[]; myId: string; actions: Actions }) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Panel title="Condition events" icon={Stethoscope} count={records.events.length}>
        <Rows items={records.events} empty={<EmptyState icon={Stethoscope} title="No condition events" hint="The watch opens an event when a reading crosses a rule." />}>
          {(e) => (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-sm font-semibold">{words(e.condition_key)}</b>
                <StatusPill status={e.status} />
                <Pill tone="neutral" icon={null}>{words(e.severity)} severity</Pill>
                <span className="label ml-auto">{dateTime(e.started_at)} · by {words(e.reported_by).toLowerCase()}</span>
              </div>
              {e.summary && <p className="mt-1 text-sm text-secondary">{e.summary}</p>}
              {e.ended_at && <p className="label mt-1">Closed {dateTime(e.ended_at)}</p>}
              {e.reported_by !== 'watch' && ['open','monitoring'].includes(e.status) && <ConfirmButton className="btn btn-sm btn-ghost mt-2" confirmLabel={e.reported_by === 'simulator' ? 'Confirm: end this scenario' : 'Confirm: reviewed and resolved'} disabled={!!actions.busy}
                onConfirm={() => void actions.act(e.id, 'Event resolved. Pending actions cancelled.', `/condition-events/${e.id}/resolve`, {confirmed:true})}>
                {e.reported_by === 'simulator' ? 'End simulator scenario' : 'Mark reviewed and resolved'}
              </ConfirmButton>}
            </>
          )}
        </Rows>
      </Panel>
      <Panel title="Decision log" icon={ClipboardList} count={records.decisions.length} i={1}>
        <Rows items={records.decisions} empty={<EmptyState icon={ClipboardList} title="No decisions logged" hint="Every automatic and human decision about this astronaut is recorded here." />}>
          {(d) => (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-sm font-semibold">{words(d.decision_type)}</b>
                <StatusPill status={d.outcome} />
                <span className="label ml-auto">{dateTime(d.decided_at)} · {words(d.actor).toLowerCase()}</span>
              </div>
              {d.proposed_action && <p className="mt-1 text-sm">{words(d.proposed_action)}</p>}
              {d.rationale && <p className="mt-1 text-sm text-secondary">{d.rationale}</p>}
            </>
          )}
        </Rows>
      </Panel>
      <Panel title="Crew alerts" icon={Bell} count={alerts.length} i={2}>
        <Rows items={alerts} empty={<EmptyState icon={Bell} title="No alerts" hint="Alerts sent to you, or raised about this astronaut, are listed here." />}>
          {(a) => (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-sm font-semibold">{a.alert_text}</b>
                <StatusPill status={a.status} />
                <span className="label ml-auto">To {a.recipient_id === myId ? 'you' : (chain.find((c) => c.id === a.recipient_id)?.display_name ?? 'a crewmate')} · {dateTime(a.created_at)}</span>
              </div>
              {a.action_instructions && <p className="mt-1 text-sm text-secondary">{a.action_instructions}</p>}
              {a.recipient_id === myId && a.status === 'pending' && (
                <button className="btn btn-sm btn-ghost mt-2" disabled={!!actions.busy} onClick={() => void actions.act(a.id, 'Alert acknowledged.', `/alerts/${a.id}/ack`)}>{actions.busy === a.id && <Spinner />}Acknowledge</button>
              )}
            </>
          )}
        </Rows>
      </Panel>
      <Panel title="Command chain" icon={Users} i={3}>
        <ol className="grid gap-2">
          {chain.map((c) => (
            <li key={c.id} className="well flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span><span className="num label mr-2">#{c.command_rank}</span>{c.display_name}</span>
              {c.fit_for_command ? <Pill tone="nominal">Fit</Pill> : <Pill tone="warning">Unfit</Pill>}
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

// ───────────── Care ─────────────

function LabForm({ astronautKey, actions }: { astronautKey: string; actions: Actions }) {
  const [form, setForm] = useState({ panel: '', analyte: '', value: '', unit: '' });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.analyte.trim() && form.unit.trim() && form.value !== '' && Number.isFinite(Number(form.value));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const ok = await actions.act('lab', 'Lab result saved.', '/labs', { astronautId: astronautKey, panelName: form.panel || 'General', results: [{ analyte: form.analyte.trim(), value: Number(form.value), unit: form.unit.trim() }] });
    if (ok) setForm((f) => ({ ...f, analyte: '', value: '', unit: '' }));
  }
  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-hairline pt-4 sm:grid-cols-4">
      <p className="title text-sm sm:col-span-4">Add a result</p>
      <label className="grid gap-1 text-sm">Panel<input className="input" value={form.panel} onChange={set('panel')} placeholder="Blood count" /></label>
      <label className="grid gap-1 text-sm">Analyte<input className="input" value={form.analyte} onChange={set('analyte')} placeholder="Haemoglobin" required /></label>
      <label className="grid gap-1 text-sm">Value<input className="input num" type="number" step="any" inputMode="decimal" value={form.value} onChange={set('value')} required /></label>
      <label className="grid gap-1 text-sm">Unit<input className="input" value={form.unit} onChange={set('unit')} placeholder="g/dL" required /></label>
      <button className="btn btn-primary sm:col-span-4 sm:justify-self-start" disabled={!valid || !!actions.busy}>{actions.busy === 'lab' && <Spinner />}Save lab result</button>
    </form>
  );
}

export function CareTab({ records, stock, astronautKey, isSelf, now, actions }: { records: RecordStreams; stock: StockItem[]; astronautKey: string; isSelf: boolean; now: number; actions: Actions }) {
  const medName = (id: string) => words(stock.find((s) => s.id === id)?.name ?? 'medication');
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Panel title="Treatment plans" icon={ClipboardList} count={records.plan.length}>
        <Rows items={records.plan} empty={<EmptyState icon={ClipboardList} title="No treatment plans" hint="Run an assessment and the agent proposes a plan for the decider to approve." />}>
          {(p) => (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={p.status} />
                <Pill tone={p.urgency === 'routine' ? 'neutral' : p.urgency === 'urgent' ? 'warning' : 'critical'} icon={null}>{words(p.urgency)}</Pill>
                <span className="label ml-auto">{dateTime(p.created_at)} · {words(p.created_by).toLowerCase()}</span>
              </div>
              {p.rationale && <p className="mt-2 text-sm">{p.rationale}</p>}
              <ol className="mt-2 grid gap-1.5">
                {(p.items || []).map((it) => (
                  <li key={it.id} className="well flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="label w-20 shrink-0">{words(it.action_type)}</span>
                    <span className="min-w-0 flex-1">{it.description}</span>
                    <StatusPill status={it.status} />
                  </li>
                ))}
              </ol>
            </>
          )}
        </Rows>
      </Panel>

      <Panel title="Medication log" icon={Syringe} count={records.medications.length} i={1}>
        <Rows items={records.medications} empty={<EmptyState icon={Syringe} title="No medication events" hint="Proposed, confirmed and given doses are logged here." />}>
          {(m) => {
            const secondsLeft = m.cancel_until ? Math.ceil((Date.parse(m.cancel_until) - now) / 1000) : 0;
            return (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-sm font-semibold">{medName(m.medication_id)}</b>
                  <StatusPill status={m.status} />
                  <span className="label ml-auto">{dateTime(m.proposed_at)}</span>
                </div>
                {m.notes && <p className="mt-1 text-sm text-secondary">{m.notes}</p>}
                {isSelf && m.status === 'proposed' && secondsLeft > 0 && (
                  <button className="btn btn-sm btn-danger mt-2" disabled={!!actions.busy} onClick={() => void actions.act(m.id, 'Injection cancelled.', `/events/${m.id}/cancel`)}>{actions.busy === m.id && <Spinner />}Cancel injection <span className="num">({secondsLeft} s left)</span></button>
                )}
                {isSelf && m.status === 'awaiting_confirmation' && (
                  <button className="btn btn-sm btn-primary mt-2" disabled={!!actions.busy} onClick={() => void actions.act(m.id, 'Dose confirmed.', `/events/${m.id}/confirm`)}>{actions.busy === m.id && <Spinner />}Confirm dose</button>
                )}
              </>
            );
          }}
        </Rows>
      </Panel>

      <Panel title="Blood test results" icon={FlaskConical} count={records.labs.length} i={2}>
        {records.labs.length === 0 ? <EmptyState icon={FlaskConical} title="No lab results" hint="Enter a result below to start the record." /> : (
          <div className="-mx-4 max-h-[320px] overflow-auto px-4 md:-mx-5 md:px-5">
            <table className="table min-w-[420px]">
              <thead><tr><th scope="col">Collected</th><th scope="col">Panel</th><th scope="col">Analyte</th><th scope="col">Value</th></tr></thead>
              <tbody>{records.labs.slice(0, 50).map((l) => <tr key={l.id}><td className="num">{dateTime(l.collected_at)}</td><td>{l.panel_name}</td><td>{l.analyte}</td><td className="num font-semibold">{l.value} <span className="label font-normal">{l.unit}</span></td></tr>)}</tbody>
            </table>
          </div>
        )}
        <LabForm astronautKey={astronautKey} actions={actions} />
      </Panel>

      <Panel title="Medication stock" icon={PillIcon} i={3}>
        <p className="mb-3 text-sm text-secondary">Stock stays empty until reviewed doses and quantities are configured. The system will not record an unstocked dose as given.</p>
        {stock.length === 0 ? <EmptyState icon={Inbox} title="No medications listed" /> : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {stock.map((s) => (
              <li key={s.name} className="well flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{words(s.name)} <span className="label">· {s.route}</span></span>
                <b className="num shrink-0 font-semibold">{Number(s.quantity_on_hand)} <span className="label font-normal">{s.stock_unit}</span></b>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ───────────── Wellbeing ─────────────

export function WellbeingTab({ records, now }: { records: RecordStreams; now: number }) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-3">
      <Panel title="Sleep" icon={BedDouble} iconMotion="breathe" count={records.sleep.length}>
        <Rows items={records.sleep} empty={<EmptyState icon={BedDouble} title="No sleep recorded" hint="Sleep is saved from the daily check-in." />}>
          {(s) => (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="num display text-2xl">{num(Number(s.reported_hours), 1)}<span className="label ml-1">h</span></span>
              {s.quality_score != null && <Pill tone="neutral" icon={null}>Quality {num(Number(s.quality_score))}/100</Pill>}
              <span className="label ml-auto">{dateTime(s.started_at)} · {words(s.source).toLowerCase()}</span>
              {s.notes && s.notes !== 'none' && <p className="w-full text-sm text-secondary">{s.notes}</p>}
            </div>
          )}
        </Rows>
      </Panel>
      <Panel title="Daily check-ins" icon={Brain} count={records.checkins.length} i={1}>
        <Rows items={records.checkins} empty={<EmptyState icon={Brain} title="No check-ins yet" hint="The daily check-in with the agent takes about three minutes." />}>
          {(c) => (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <b className="num text-sm font-semibold">{String(c.check_in_date).slice(0, 10)}</b>
                <StatusPill status={c.status} />
                {c.mental_health_score != null && <span className="label ml-auto">Mental health <b className="num text-primary">{c.mental_health_score}</b>/100</span>}
              </div>
              {c.mental_health_score != null && (
                <div className="well mt-2 h-1.5 overflow-hidden" role="img" aria-label={`Mental health score ${c.mental_health_score} of 100`}>
                  <div className="h-full origin-left bg-cobalt transition-transform duration-300" style={{ transform: `scaleX(${Math.min(100, Math.max(0, c.mental_health_score)) / 100})` }} />
                </div>
              )}
              {c.reported_symptoms && c.reported_symptoms !== 'none' && <p className="mt-2 text-sm text-secondary">Symptoms: {c.reported_symptoms}</p>}
            </>
          )}
        </Rows>
      </Panel>
      <Panel title="Root-cause assessments" icon={Stethoscope} count={records.assessment.length} i={2}>
        <Rows items={records.assessment} empty={<EmptyState icon={Stethoscope} title="No assessments yet" hint="Use Run assessment to have the agent review the last 24 hours." />}>
          {(a) => (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={a.urgency === 'routine' ? 'nominal' : a.urgency === 'urgent' ? 'warning' : 'critical'}>{words(a.urgency)}</Pill>
                {now - Date.parse(a.assessed_at) < 45_000 && <span className="fade-in flex items-center gap-1 text-sm font-semibold text-nominal"><AnimatedCheck className="size-5" />Saved</span>}
                <span className="label ml-auto">{dateTime(a.assessed_at)}</span>
              </div>
              <p className="mt-2 text-sm">{a.root_cause_summary}</p>
            </>
          )}
        </Rows>
      </Panel>
    </div>
  );
}
