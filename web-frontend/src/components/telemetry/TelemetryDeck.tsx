'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Activity, Box, Droplets, FlaskConical, Gauge, Pause, Play, Radiation, RotateCcw, RotateCw, ScanLine, ShieldAlert, Snowflake, Thermometer, Waves, Wind, Wrench, X, Zap, type LucideIcon } from 'lucide-react';
import { CARD_ORDER, METRICS, SCENARIOS, STATUS_TONE, ZONES, metricStatus, zoneReport, type MetricKey, type Snapshot, type TelemetryEngine, type ZoneId, type ZoneStatus } from '@/lib/telemetry';
import { useTelemetry } from '@/lib/useTelemetry';
import { clock, words } from '@/lib/format';
import { Panel, Pill, Skeleton } from '../ui';
import { EcgCanvas } from './EcgCanvas';
import { HeartIcon, LungsIcon, ReticleIcon } from './icons';
import { Pipeline } from './Pipeline';

const SuitViewport = dynamic(() => import('./SuitViewport'), { ssr: false, loading: () => <Skeleton className="absolute inset-3 h-auto w-auto" /> });

const TONE_VAR: Record<ZoneStatus, string> = { nominal: 'var(--status-nominal)', warning: 'var(--status-warning)', critical: 'var(--status-critical)', fault: 'var(--status-fault)' };
const ICON: Partial<Record<MetricKey, LucideIcon>> = { spo2: Droplets, sys: Gauge, temp: Thermometer, hrv: Waves, suit: Box, co2: Wind, coolant: Snowflake, rad: Radiation };
const simClock = (s: number) => `T+${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/** What the assessment button is doing. The parent runs the real request and moves through these. */
export type AssessStage = 'idle' | 'scanning' | 'evaluating' | 'saved';
export const ASSESS_LABEL: Record<AssessStage, string> = { idle: 'Run assessment', scanning: 'Scanning biometrics…', evaluating: 'Evaluating ML + Gemini rules…', saved: 'Saved' };

function MetricCard({ k, s, selected, onSelect, barRef, i }: { k: MetricKey; s: Snapshot; selected: boolean; onSelect: () => void; barRef: (el: HTMLSpanElement | null) => void; i: number }) {
  const d = METRICS[k];
  const status = metricStatus(k, s);
  const Icon = ICON[k];
  const v = s.values[k];
  const shown = k === 'sys' ? `${v.toFixed(0)}/${s.values.dia.toFixed(0)}` : v.toFixed(d.digits);
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} className={`panel lift settle metric min-w-0 p-3 text-left ${selected ? 'metric-on' : ''}`} style={{ '--i': i, '--tone': TONE_VAR[status] } as CSSProperties}>
      <span className="label flex min-h-8 items-center gap-1.5" style={{ color: status === 'nominal' ? undefined : TONE_VAR[status] }}>
        {k === 'hr' ? <HeartIcon bpm={s.sensorFault ? 0 : v} /> : k === 'resp' ? <LungsIcon rpm={v} /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
        <span className="min-w-0 leading-tight">{d.label}</span>
      </span>
      <span className="mt-1 block truncate">
        <span className="num display glow-cyan text-xl 2xl:text-2xl" style={{ color: status === 'nominal' ? undefined : TONE_VAR[status] }}>{shown}</span>
        <span className="label ml-1">{d.unit}</span>
      </span>
      {/* the level bar is moved every frame by the deck, between the 1 Hz digit ticks */}
      <span className="well mt-2 block h-1 overflow-hidden border-0"><span ref={barRef} className="block h-full origin-left" style={{ background: TONE_VAR[status], transform: 'scaleX(0)' }} /></span>
      <span className="sr-only">{status === 'nominal' ? 'Within limits.' : `Status ${status}.`} {selected ? 'Details shown.' : 'Show details.'}</span>
    </button>
  );
}

function Trend({ k, s }: { k: MetricKey; s: Snapshot }) {
  const d = METRICS[k];
  const data = s.history[k];
  const w = 640, h = 150, pad = 6;
  const lo = Math.min(d.range[0], ...data), hi = Math.max(d.range[1], ...data);
  const y = (v: number) => h - pad - ((v - lo) / (hi - lo || 1)) * (h - pad * 2);
  const pts = data.map((v, i) => `${(pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2)).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const min = data.length ? Math.min(...data) : NaN, max = data.length ? Math.max(...data) : NaN;
  const avg = data.length ? data.reduce((a, b) => a + b, 0) / data.length : NaN;
  const f = (v: number) => (Number.isFinite(v) ? v.toFixed(d.digits) : '—');
  return (
    <div className="hud fade-in mt-3 p-4" role="region" aria-label={`${d.label} trend`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="title text-sm">{d.label} over the last {data.length} s</h3>
        <dl className="num flex gap-4 text-sm">
          {[['Min', min], ['Avg', avg], ['Max', max]].map(([label, v]) => <div key={label as string} className="flex gap-1.5"><dt className="label">{label}</dt><dd className="font-semibold">{f(v as number)} <span className="label">{d.unit}</span></dd></div>)}
        </dl>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-36 w-full" role="img" aria-label={`${d.label}: minimum ${f(min)}, average ${f(avg)}, maximum ${f(max)} ${d.unit}`}>
        {[d.low, d.high].map((limit, i) => limit === undefined ? null : <line key={i} x1={pad} x2={w - pad} y1={y(limit)} y2={y(limit)} stroke="var(--status-warning)" strokeWidth="1" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />)}
        {data.length > 1 && <polyline points={pts} fill="none" stroke="var(--accent-cyan)" strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
      </svg>
      <p className="mt-2 text-sm text-secondary">{d.note} <span className="label">Limit source: {d.source === 'demo' ? 'demo value, not a clinical limit' : d.source}.</span></p>
    </div>
  );
}

function DiagnosticCard({ zone, s, engine, onClose, onResetCamera, onRunAssessment, stage, canAssess }: {
  zone: ZoneId; s: Snapshot; engine: TelemetryEngine; onClose: () => void; onResetCamera: () => void; onRunAssessment: () => void; stage: AssessStage; canAssess: boolean;
}) {
  const def = ZONES.find((z) => z.id === zone)!;
  const report = zoneReport(zone, s);
  const status = s.zones[zone];
  return (
    <aside className="hud pop-in p-4" aria-label={`${def.label} diagnostics`} style={{ '--origin': 'top center' } as CSSProperties}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label">Zone {def.number}</p>
          <h3 className="title text-base">{def.label}</h3>
        </div>
        <button className="btn btn-sm btn-icon btn-quiet shrink-0" onClick={onClose} aria-label="Close diagnostics"><X className="size-4" aria-hidden /></button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Pill tone={STATUS_TONE[status]}>{words(status)}</Pill>
        <span className="text-sm">Structural integrity <b className="num font-semibold" style={{ color: TONE_VAR[status] }}>{report.integrity}%</b></span>
      </div>
      <div className="well mt-2 h-1.5 overflow-hidden border-0" role="img" aria-label={`Integrity ${report.integrity} percent`}>
        <div className="h-full origin-left transition-transform duration-500" style={{ background: TONE_VAR[status], transform: `scaleX(${report.integrity / 100})` }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {report.readings.map((r) => <div key={r.label} className="well px-2.5 py-1.5"><dt className="label">{r.label}</dt><dd className="num text-sm font-semibold">{r.value}</dd></div>)}
      </dl>
      <p className="mt-3 text-sm">{report.diagnosis}</p>
      <div className="well mt-3 p-2.5 text-sm">
        <p className="label">rules.json protocol</p>
        {report.protocol ? (
          <p className="mt-1"><b className="font-semibold">{words(report.protocol.condition)}</b> · tier {report.protocol.tier} · {words(report.protocol.action).toLowerCase()}. {report.protocol.firstResponse}.{report.protocol.medication && <span className="text-secondary"> Medication named by the rules (no dose, needs medical review): {report.protocol.medication}.</span>}</p>
        ) : <p className="mt-1 text-secondary">No medical rule applies to this zone right now.</p>}
      </div>
      <p className="label mt-3">{def.subsystems.join(' · ')}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className={`btn btn-sm btn-primary ${stage !== 'idle' && stage !== 'saved' ? 'working' : ''}`} disabled={!canAssess || stage !== 'idle'} onClick={onRunAssessment}><ScanLine className="size-4" aria-hidden />{ASSESS_LABEL[stage]}</button>
        <button className="btn btn-sm btn-ghost" disabled={status === 'nominal'} onClick={() => engine.repair(zone)}><Wrench className="size-4" aria-hidden />{report.countermeasure}</button>
        <button className="btn btn-sm btn-danger" disabled={s.faults.includes(zone)} onClick={() => engine.damage(zone)}><Zap className="size-4" aria-hidden />Simulate damage here</button>
        <button className="btn btn-sm btn-ghost" onClick={onResetCamera}><RotateCcw className="size-4" aria-hidden />Reset 3D camera</button>
      </div>
    </aside>
  );
}

function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`btn btn-sm ${on ? 'seg-on' : 'btn-ghost'}`}>{children}</button>;
}

export function TelemetryDeck({ engine, seededAt, onRunAssessment, stage, canAssess }: { engine: TelemetryEngine; seededAt: string | null; onRunAssessment: () => void; stage: AssessStage; canAssess: boolean }) {
  const s = useTelemetry(engine);
  const [metric, setMetric] = useState<MetricKey | null>(null);
  const [zone, setZone] = useState<ZoneId | null>(null);
  const [xray, setXray] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [reset, setReset] = useState(0);
  const bars = useRef<Partial<Record<MetricKey, HTMLSpanElement | null>>>({});

  // 60 fps: the level bars glide between the 1 Hz ticks, written straight to the DOM
  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const { values } = engine.sample(now);
      for (const k of CARD_ORDER) {
        const el = bars.current[k];
        if (!el) continue;
        const [lo, hi] = METRICS[k].range;
        el.style.transform = `scaleX(${Math.min(1, Math.max(0.02, (values[k] - lo) / (hi - lo))).toFixed(4)})`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  const resetCamera = () => { setZone(null); setReset((n) => n + 1); };
  const abnormal = ZONES.filter((z) => s.zones[z.id] !== 'nominal').length;

  return (
    <div className="grid gap-6">
      {/* Telemetry control bar */}
      <section aria-label="Telemetry controls" className="hud settle flex flex-wrap items-center gap-x-4 gap-y-3 p-3">
        <button type="button" aria-pressed={!s.paused} onClick={() => engine.setPaused(!s.paused)} className={`btn btn-sm ${s.paused ? 'btn-ghost' : 'live-btn'}`}>
          {s.paused ? <><Play className="size-4" aria-hidden />Paused · resume</> : <><span className="beacon" aria-hidden />Live stream<Pause className="size-4 opacity-70" aria-hidden /></>}
        </button>
        <div role="group" aria-label="Playback speed" className="well flex gap-1 p-1">
          {[1, 2, 5].map((x) => <button key={x} type="button" aria-pressed={s.speed === x} onClick={() => engine.setSpeed(x)} className={`btn btn-sm num min-h-8 px-3 ${s.speed === x ? 'seg-on' : 'btn-quiet'}`}>{x}x</button>)}
        </div>
        <span className="num label">{simClock(s.simTime)}</span>
        <p className="ml-auto flex items-center gap-2 text-sm text-secondary">
          <Pill tone="info" icon={FlaskConical}>Simulated stream</Pill>
          <span className="hidden md:inline">{seededAt ? `Started from the watch reading stored at ${clock(seededAt)}.` : 'No stored reading yet: started from nominal values.'} Not saved to the record.</span>
        </p>
      </section>

      {/* Scenario and damage simulator */}
      <section aria-label="Scenario and damage simulator" className="settle" style={{ '--i': 1 } as CSSProperties}>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((sc) => {
            const on = s.scenario === sc.id;
            const tone = sc.id === 'nominal' ? 'var(--status-nominal)' : sc.id === 'fault' ? 'var(--status-fault)' : sc.id === 'hypoxia' || sc.id === 'breach' ? 'var(--status-critical)' : 'var(--status-warning)';
            return (
              <button key={sc.id} type="button" aria-pressed={on} title={sc.summary} onClick={() => engine.setScenario(sc.id)} className={`btn btn-sm scenario ${on ? 'scenario-on' : 'btn-ghost'}`} style={{ '--tone': tone } as CSSProperties}>
                <span className="size-2 shrink-0 rounded-full" style={{ background: tone }} aria-hidden />{sc.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-secondary" aria-live="polite">{SCENARIOS.find((x) => x.id === s.scenario)!.summary}</p>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* 3D digital twin */}
        <Panel title="Suit and body digital twin" icon={Box} i={2} action={abnormal ? <Pill tone="critical" icon={ShieldAlert}>{abnormal} {abnormal === 1 ? 'zone' : 'zones'} flagged</Pill> : <Pill tone="nominal">All zones nominal</Pill>}>
          <div className="scope relative h-[420px] overflow-hidden rounded-[var(--radius-control)] sm:h-[520px]">
            <SuitViewport engine={engine} selected={zone} onSelect={setZone} xray={xray} autoRotate={autoRotate} statuses={s.zones} resetSignal={reset} />
            <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-2">
              <div role="group" aria-label="Render mode" className="hud pointer-events-auto flex gap-1 rounded-[var(--radius-control)] p-1">
                <button type="button" aria-pressed={!xray} onClick={() => setXray(false)} className={`btn btn-sm min-h-8 ${!xray ? 'seg-on' : 'btn-quiet'}`}>Suit exterior</button>
                <button type="button" aria-pressed={xray} onClick={() => setXray(true)} className={`btn btn-sm min-h-8 ${xray ? 'seg-on' : 'btn-quiet'}`}>X-ray biometrics</button>
              </div>
              <div className="pointer-events-auto flex gap-1">
                <Toggle on={autoRotate} onChange={setAutoRotate}><RotateCw className="size-4" aria-hidden /><span className="hidden sm:inline">Auto-rotate</span><span className="sr-only sm:hidden">Auto-rotate</span></Toggle>
                <button type="button" className="btn btn-sm btn-ghost" onClick={resetCamera}><RotateCcw className="size-4" aria-hidden /><span className="hidden sm:inline">Reset</span><span className="sr-only sm:hidden">Reset camera</span></button>
              </div>
            </div>
            {stage === 'scanning' && <p className="hud pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 px-3 py-1.5 text-sm"><ReticleIcon />Scanning helmet to boots</p>}
            <p className="label pointer-events-none absolute bottom-2 right-3 hidden sm:block">Drag to rotate · scroll to zoom · click a part</p>
          </div>
          <div role="group" aria-label="Jump to a zone" className="mt-3 flex flex-wrap gap-1.5">
            {ZONES.map((z) => (
              <button key={z.id} type="button" aria-pressed={zone === z.id} onClick={() => setZone(zone === z.id ? null : z.id)} className={`btn btn-sm min-h-9 ${zone === z.id ? 'seg-on' : 'btn-ghost'}`}>
                <span className="size-2 shrink-0 rounded-full" style={{ background: TONE_VAR[s.zones[z.id]], boxShadow: `0 0 8px ${TONE_VAR[s.zones[z.id]]}` }} aria-hidden />
                <span className="num">{z.number}</span> {z.short}
                <span className="sr-only">, {s.zones[z.id]}</span>
              </button>
            ))}
          </div>
          {zone && <div className="mt-3"><DiagnosticCard zone={zone} s={s} engine={engine} onClose={() => setZone(null)} onResetCamera={resetCamera} onRunAssessment={onRunAssessment} stage={stage} canAssess={canAssess} /></div>}
        </Panel>

        <div className="grid min-w-0 gap-6">
          <Panel title="Cardiac and pulse oscilloscope" icon={Activity} i={3} action={<span className="num label">{s.sensorFault ? 'signal unreliable' : `${s.values.hr.toFixed(0)} bpm · R-R ${(60000 / Math.max(25, s.values.hr)).toFixed(0)} ms`}</span>}>
            <EcgCanvas engine={engine} />
          </Panel>
          <section aria-label="Live metrics">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {CARD_ORDER.map((k, i) => <MetricCard key={k} k={k} s={s} i={i} selected={metric === k} onSelect={() => setMetric(metric === k ? null : k)} barRef={(el) => { bars.current[k] = el; }} />)}
            </div>
            {metric ? <Trend k={metric} s={s} /> : <p className="label mt-3">Select a metric to see its trend, range and limits.</p>}
          </section>
        </div>
      </div>

      <Panel title="Hybrid watch pipeline" icon={ShieldAlert} i={4}>
        <Pipeline s={s} />
      </Panel>
    </div>
  );
}
