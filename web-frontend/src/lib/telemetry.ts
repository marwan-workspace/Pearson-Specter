/**
 * TelemetryEngine: one reactive state loop that drives every live widget on the record page — the metric
 * cards, the ECG/pleth oscilloscope, the pipeline visualizer and the 3D suit.
 *
 * THIS IS A SIMULATION. The real watch (backend/server.js -> watch/) stores one reading a minute and knows
 * nothing about suit pressure, CO2 or coolant. The engine is seeded from the astronaut's last stored reading
 * and then streams physiologically coupled values at 1 Hz so the interface can be exercised and demonstrated.
 * Nothing here is written to the database; scenarios and damage exist only in the browser.
 *
 * What is NOT invented: the medical thresholds, condition order, response tiers and the injection lockout
 * come straight from ../watch/rules.json and ../watch/baselines.json, the same files the Python watch reads,
 * and `decide()` below mirrors watch/decide.py's rules-only fallback. Limits for metrics the watch does not
 * measure are marked `source: 'demo'`.
 *
 * Timing: `tick()` advances the model once per simulated second. Between ticks, `sample(now)` interpolates
 * so canvases and the 3D scene can draw at 60 fps without waiting for React.
 */
import rulesFile from '../../../watch/rules.json';
import baselines from '../../../watch/baselines.json';
import type { Tone } from './types';

export type MetricKey = 'hr' | 'spo2' | 'temp' | 'sys' | 'dia' | 'resp' | 'hrv' | 'suit' | 'co2' | 'coolant' | 'rad';
export type Activity = 'rest' | 'stress' | 'exercise';
export type ZoneId = 'helmet' | 'cardio' | 'wrist' | 'rightArm' | 'plss' | 'metabolic' | 'legs';
export type ZoneStatus = 'nominal' | 'warning' | 'critical' | 'fault';
export type ScenarioId = 'nominal' | 'exertion' | 'stress' | 'hypoxia' | 'breach' | 'fault';

type Values = Record<MetricKey, number>;
interface Rule { name: string; flag: string; tier: number; first_response: string; medication: string; states?: string[] }
const RULES = rulesFile.conditions as Rule[];
const T = rulesFile.thresholds;
const TIERS = rulesFile.tiers as Record<string, string>;
const LOCKOUT_S = rulesFile.lockout_minutes * 60;
const REST_HR_HIGH = baselines.rest_hr_high;
/** Flags the decision step may never answer "none" to (watch/decide.py MUST_ACT). */
const MUST_ACT = new Set([...RULES.filter((r) => r.tier === 1).map((r) => r.flag), 'sensor_fault']);

export interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  digits: number;
  /** Display range for bars and charts. */
  range: [number, number];
  /** Alarm limits, and where they come from. */
  low?: number;
  high?: number;
  source: 'rules.json' | 'baselines.json' | 'demo';
  note: string;
}

export const METRICS: Record<MetricKey, MetricDef> = {
  hr: { key: 'hr', label: 'Heart rate', unit: 'bpm', digits: 0, range: [30, 180], low: T.hr_low, high: REST_HR_HIGH, source: 'rules.json', note: `Low below ${T.hr_low} (rules.json). High above ${REST_HR_HIGH} at rest or under stress (baselines.json); normal during exercise.` },
  spo2: { key: 'spo2', label: 'Blood oxygen', unit: '%', digits: 0, range: [80, 100], low: T.spo2_low, source: 'rules.json', note: `Low below ${T.spo2_low}% (rules.json).` },
  temp: { key: 'temp', label: 'Core temperature', unit: '°C', digits: 1, range: [35.5, 39.5], high: T.temp_high, source: 'rules.json', note: `Fever above ${T.temp_high} °C (rules.json).` },
  sys: { key: 'sys', label: 'Arterial pressure', unit: 'mmHg', digits: 0, range: [60, 200], low: T.bp_sys_low, high: T.bp_sys_high, source: 'rules.json', note: `Systolic low below ${T.bp_sys_low}, shock below ${T.bp_sys_shock}, high above ${T.bp_sys_high} (rules.json).` },
  dia: { key: 'dia', label: 'Diastolic', unit: 'mmHg', digits: 0, range: [40, 120], source: 'demo', note: 'Shown with systolic.' },
  resp: { key: 'resp', label: 'Respiration', unit: 'rpm', digits: 0, range: [6, 36], high: 24, source: 'demo', note: 'Demo limit: raised above 24 breaths a minute.' },
  hrv: { key: 'hrv', label: 'Heart-rate variability', unit: 'ms', digits: 0, range: [0, 100], low: 25, source: 'demo', note: 'Demo limit: low below 25 ms.' },
  suit: { key: 'suit', label: 'Suit pressure', unit: 'psi', digits: 2, range: [2.5, 4.6], low: 4.0, source: 'demo', note: 'Nominal 4.3 psi. Demo limit: low below 4.0 psi.' },
  co2: { key: 'co2', label: 'Helmet CO₂', unit: 'mmHg', digits: 1, range: [0, 16], high: 7.6, source: 'demo', note: 'Demo limit: high above 7.6 mmHg.' },
  coolant: { key: 'coolant', label: 'Coolant loop', unit: '°C', digits: 1, range: [10, 34], high: 24, source: 'demo', note: 'Demo limit: warm above 24 °C.' },
  rad: { key: 'rad', label: 'Radiation dose', unit: 'mSv/day', digits: 2, range: [0, 3], high: 2, source: 'demo', note: 'Demo limit: high above 2 mSv a day. The real watch compares the dose rate with a per-location limit.' },
};
/** Card order. Diastolic is shown inside the arterial-pressure card. */
export const CARD_ORDER: MetricKey[] = ['hr', 'spo2', 'sys', 'temp', 'resp', 'hrv', 'suit', 'co2', 'coolant', 'rad'];

export interface ZoneDef { id: ZoneId; number: number; label: string; short: string; subsystems: string[] }
export const ZONES: ZoneDef[] = [
  { id: 'helmet', number: 1, label: 'Helmet & neural visor', short: 'Helmet', subsystems: ['O₂ supply', 'CO₂ scrubber', 'Visor integrity', 'Cognitive fatigue'] },
  { id: 'cardio', number: 2, label: 'Cardiopulmonary core', short: 'Heart & lungs', subsystems: ['Heart', 'Lungs', 'ECG', 'Core temperature'] },
  { id: 'wrist', number: 3, label: 'Left wrist · hybrid watch module', short: 'Watch', subsystems: ['Activity classifier', 'PPG sensor', 'Auto-injector guard'] },
  { id: 'rightArm', number: 4, label: 'Right arm & glove seal', short: 'Right arm', subsystems: ['Pressure seal', 'Micro-meteoroid abrasion', 'Glove heater'] },
  { id: 'plss', number: 5, label: 'PLSS life-support backpack', short: 'PLSS', subsystems: ['Primary & reserve O₂', 'Battery', 'Coolant loop', 'Radiation'] },
  { id: 'metabolic', number: 6, label: 'Core metabolic & thermal zone', short: 'Thermal', subsystems: ['LCVG cooling flow', 'Hydration', 'Caloric burn'] },
  { id: 'legs', number: 7, label: 'Lower extremities & boots', short: 'Legs', subsystems: ['Leg joint torque', 'EMG exertion', 'Circulation'] },
];

export interface ScenarioDef { id: ScenarioId; label: string; summary: string; activity: Activity; faults: ZoneId[] }
export const SCENARIOS: ScenarioDef[] = [
  { id: 'nominal', label: 'Nominal rest', summary: 'Resting, suit sealed, every zone nominal.', activity: 'rest', faults: [] },
  { id: 'exertion', label: 'EVA high exertion', summary: 'Hard work outside: heart, breathing and heat climb. Normal for exercise.', activity: 'exercise', faults: [] },
  { id: 'stress', label: 'Acute stress spike', summary: 'Heart rate and blood pressure jump while variability collapses.', activity: 'stress', faults: [] },
  { id: 'hypoxia', label: 'Hypoxia & O₂ scrubber failure', summary: 'The scrubber fails: CO₂ builds and blood oxygen falls.', activity: 'rest', faults: ['plss'] },
  { id: 'breach', label: 'Right-arm suit breach', summary: 'The right forearm loses pressure and vents gas.', activity: 'stress', faults: ['rightArm'] },
  { id: 'fault', label: 'Wrist sensor fault', summary: 'The watch sensor returns values that cannot be trusted.', activity: 'rest', faults: ['wrist'] },
];

export interface Decision {
  condition: string;
  tier: number;
  action: string;
  firstResponse: string;
  medication: string;
  note: string;
}
export interface Guard { id: 'needs-flag' | 'no-dismiss' | 'lockout' | 'sensor'; label: string; state: 'armed' | 'active' | 'tripped'; detail: string }

export interface Snapshot {
  tick: number;
  /** Simulated seconds since the engine started. */
  simTime: number;
  paused: boolean;
  speed: number;
  scenario: ScenarioId;
  activity: Activity;
  values: Values;
  /** Pressure in the right forearm segment, psi. */
  armPressure: number;
  sensorFault: boolean;
  flags: string[];
  decision: Decision;
  guards: Guard[];
  zones: Record<ZoneId, ZoneStatus>;
  faults: ZoneId[];
  history: Record<MetricKey, number[]>;
  /** Set when "Run assessment" starts, so the 3D view can sweep its scan plane. */
  scanAt: number;
}

const HISTORY = 180;
const NOMINAL: Values = { hr: 64, spo2: 99, temp: 36.8, sys: 118, dia: 76, resp: 14, hrv: 62, suit: 4.3, co2: 3.0, coolant: 18, rad: 0.6 };
/** How fast each value closes on its target per simulated second, and how much it wanders. */
const RATE: Values = { hr: 0.22, spo2: 0.12, temp: 0.035, sys: 0.18, dia: 0.18, resp: 0.2, hrv: 0.2, suit: 0.14, co2: 0.11, coolant: 0.07, rad: 0.05 };
const JITTER: Values = { hr: 1.1, spo2: 0.25, temp: 0.03, sys: 1.6, dia: 1.2, resp: 0.5, hrv: 2.2, suit: 0.006, co2: 0.08, coolant: 0.08, rad: 0.01 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const STATUS_TONE: Record<ZoneStatus, Tone> = { nominal: 'nominal', warning: 'warning', critical: 'critical', fault: 'fault' };
const RANK: Record<ZoneStatus, number> = { nominal: 0, warning: 1, fault: 2, critical: 3 };
const worst = (a: ZoneStatus, b: ZoneStatus) => (RANK[b] > RANK[a] ? b : a);

export class TelemetryEngine {
  private values: Values = { ...NOMINAL };
  private prev: Values = { ...NOMINAL };
  private base: Values = { ...NOMINAL };
  private armPressure = 4.3;
  private prevArm = 4.3;
  private scenario: ScenarioId = 'nominal';
  private activity: Activity = 'rest';
  private faults = new Set<ZoneId>();
  private paused = false;
  private speed = 1;
  private tickNo = 0;
  private simTime = 0;
  private lastTickAt = 0;
  private scanAt = 0;
  private lastDose: Record<string, number> = {};
  private history: Record<MetricKey, number[]>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot;

  constructor() {
    this.history = Object.fromEntries(Object.keys(NOMINAL).map((k) => [k, [] as number[]])) as unknown as Record<MetricKey, number[]>;
    this.snapshot = this.build();
  }

  // ── React binding (useSyncExternalStore) ──
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snapshot;
  private emit() { this.snapshot = this.build(); this.listeners.forEach((fn) => fn()); }

  // ── lifecycle ──
  start() {
    if (this.timer) return;
    this.lastTickAt = performance.now();
    this.timer = setInterval(() => { if (!this.paused && !document.hidden) this.tick(); }, 1000 / this.speed);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  /** Starts the simulated person from the astronaut's last stored reading, where the watch has one. */
  seed(reading: { heart_rate_bpm: number | null; spo2_percent: number | null; systolic_mmhg: number | null; diastolic_mmhg: number | null; temperature_c: number | null; radiation_rate: number | null }) {
    const b = this.base;
    if (reading.heart_rate_bpm) b.hr = reading.heart_rate_bpm;
    if (reading.spo2_percent) b.spo2 = reading.spo2_percent;
    if (reading.systolic_mmhg) b.sys = reading.systolic_mmhg;
    if (reading.diastolic_mmhg) b.dia = reading.diastolic_mmhg;
    if (reading.temperature_c) b.temp = reading.temperature_c;
    if (reading.radiation_rate != null) b.rad = (reading.radiation_rate * 24) / 1000; // µSv/h -> mSv/day
    if (this.tickNo === 0) { this.values = { ...b }; this.prev = { ...b }; this.emit(); }
  }

  // ── controls ──
  setPaused(paused: boolean) { this.paused = paused; if (!paused) this.lastTickAt = performance.now(); this.emit(); }
  setSpeed(speed: number) {
    this.speed = speed;
    if (this.timer) { this.stop(); this.start(); }
    this.emit();
  }
  setScenario(id: ScenarioId) {
    const s = SCENARIOS.find((x) => x.id === id)!;
    this.scenario = id;
    this.activity = s.activity;
    this.faults = new Set(s.faults);
    this.emit();
  }
  /** "Simulate damage here": adds a fault to one zone on top of whatever is running. */
  damage(zone: ZoneId) { this.faults.add(zone); this.emit(); }
  /** "Seal breach / apply countermeasure": clears the zone's fault; if the zone was only strained by activity, the crew member rests. */
  repair(zone: ZoneId) {
    const hadFault = this.faults.delete(zone);
    if (!hadFault && this.snapshot.zones[zone] !== 'nominal') this.activity = 'rest';
    // once the last fault is fixed the emergency is over: the crew member settles back to rest
    if (hadFault && this.faults.size === 0) this.activity = 'rest';
    if (this.faults.size === 0 && this.activity === 'rest') this.scenario = 'nominal';
    this.emit();
  }
  /** Marks the start of an assessment so the 3D view can run its scan sweep. */
  triggerScan() { this.scanAt = performance.now(); this.emit(); }

  // ── the model ──
  private targets(): Values & { arm: number } {
    const t: Values & { arm: number } = { ...this.base, resp: NOMINAL.resp, hrv: NOMINAL.hrv, suit: NOMINAL.suit, co2: NOMINAL.co2, coolant: NOMINAL.coolant, arm: 4.3 };
    const f = this.faults;
    if (this.activity === 'exercise') Object.assign(t, { hr: 148, resp: 28, temp: 37.7, sys: 164, dia: 84, hrv: 24, co2: 5.4, coolant: 23.5, spo2: 97 });
    if (this.activity === 'stress') Object.assign(t, { hr: 132, hrv: 18, sys: 152, dia: 96, resp: 22 });
    if (f.has('plss')) Object.assign(t, { spo2: 84, co2: 12.5, hr: Math.max(t.hr, 118), resp: Math.max(t.resp, 26), coolant: Math.max(t.coolant, 25) }); // scrubber and loop failure
    if (f.has('helmet')) Object.assign(t, { spo2: Math.min(t.spo2, 86), suit: 3.4, co2: Math.max(t.co2, 6), hr: Math.max(t.hr, 122) }); // visor seal leak
    if (f.has('rightArm')) Object.assign(t, { arm: 2.9, suit: Math.min(t.suit, 3.9), hr: Math.max(t.hr, 112) });
    if (f.has('legs')) Object.assign(t, { suit: Math.min(t.suit, 3.8), hr: Math.max(t.hr, 108) }); // boot joint leak
    if (f.has('cardio')) Object.assign(t, { hr: 36, sys: 92, dia: 58, hrv: 12 }); // bradycardia
    if (f.has('metabolic')) Object.assign(t, { temp: 38.7, coolant: 29, hr: Math.max(t.hr, 104) }); // cooling garment failure
    return t;
  }

  private tick() {
    const t = this.targets();
    this.prev = { ...this.values };
    this.prevArm = this.armPressure;
    for (const k of Object.keys(this.values) as MetricKey[]) {
      const [lo, hi] = METRICS[k].range;
      const noise = (Math.random() - 0.5) * 2 * JITTER[k];
      this.values[k] = clamp(this.values[k] + (t[k] - this.values[k]) * RATE[k] + noise, Math.max(0, lo - 5), hi + 5); // no reading here can be negative
    }
    this.values.spo2 = Math.min(100, this.values.spo2);
    if (this.faults.has('wrist')) {
      // a failing optical sensor: readings jump to values no body produces
      this.values.hr = Math.random() < 0.3 ? 0 : 30 + Math.random() * 190;
      this.values.spo2 = 62 + Math.random() * 38;
    }
    this.armPressure += (t.arm - this.armPressure) * 0.22;
    for (const k of Object.keys(this.values) as MetricKey[]) {
      const h = this.history[k];
      h.push(this.values[k]);
      if (h.length > HISTORY) h.shift();
    }
    this.tickNo += 1;
    this.simTime += 1;
    this.lastTickAt = performance.now();
    this.emit();
  }

  /** Values between ticks, for anything that draws every frame. */
  sample(now = performance.now()) {
    const span = 1000 / this.speed;
    const f = this.paused ? 1 : clamp((now - this.lastTickAt) / span, 0, 1);
    const v = {} as Values;
    for (const k of Object.keys(this.values) as MetricKey[]) v[k] = lerp(this.prev[k], this.values[k], f);
    return { values: v, armPressure: lerp(this.prevArm, this.armPressure, f), paused: this.paused, speed: this.speed, sensorFault: this.faults.has('wrist'), activity: this.activity, zones: this.snapshot.zones, scanAt: this.scanAt, faults: this.snapshot.faults };
  }

  /** Abnormal readings only, as in watch/detect.py flags(). */
  private flags(v: Values, sensorFault: boolean): string[] {
    if (sensorFault) return ['sensor_fault'];
    const out: string[] = [];
    if (v.hr < T.hr_low) out.push('hr_low');
    if (v.hr > REST_HR_HIGH) out.push('hr_high');
    if (v.spo2 < T.spo2_low) out.push('spo2_low');
    if (v.sys < T.bp_sys_shock) out.push('bp_shock');
    else if (v.sys < T.bp_sys_low) out.push('bp_low');
    if (v.sys > T.bp_sys_high) out.push('bp_high');
    if (v.temp > T.temp_high) out.push('temp_high');
    return out;
  }

  /** The rules alone, most severe first: watch/decide.py fallback(), plus its injection lockout. */
  private decide(flags: string[]): Decision {
    const rule = RULES.find((r) => flags.includes(r.flag) && (!r.states || r.states.includes(this.activity)));
    if (!rule) return { condition: 'none', tier: 0, action: 'none', firstResponse: '', medication: '', note: flags.length ? 'A flag is raised, but no rule applies to this activity.' : 'No flag raised.' };
    let action = TIERS[String(rule.tier)] ?? 'none';
    let note = '';
    if (action === 'auto_inject') {
      const since = this.simTime - (this.lastDose[rule.name] ?? -Infinity);
      if (since > 0 && since < LOCKOUT_S) {
        action = 'alert_crewmate';
        note = `No second injection: one was given ${Math.floor(since / 60)} min ago.`;
      } else if (!(rule.name in this.lastDose) || since >= LOCKOUT_S) {
        this.lastDose[rule.name] = this.simTime;
      }
    }
    return { condition: rule.name, tier: rule.tier, action, firstResponse: rule.first_response, medication: rule.medication, note };
  }

  private zoneStatus(v: Values, sensorFault: boolean): Record<ZoneId, ZoneStatus> {
    const f = this.faults;
    const z: Record<ZoneId, ZoneStatus> = { helmet: 'nominal', cardio: 'nominal', wrist: 'nominal', rightArm: 'nominal', plss: 'nominal', metabolic: 'nominal', legs: 'nominal' };
    const set = (id: ZoneId, s: ZoneStatus) => { z[id] = worst(z[id], s); };
    // From the readings. Heart rate and oxygen come from the wrist sensor, so they count for nothing while it
    // is faulty; and a hard-working body is expected to run fast and hot, so exercise does not flag the heart.
    const ppg = !sensorFault, working = this.activity === 'exercise';
    if ((ppg && v.spo2 < T.spo2_low) || v.co2 > 9) set('helmet', 'critical');
    else if (v.co2 > 6 || (v.hrv < 25 && !working)) set('helmet', 'warning');
    if ((ppg && v.hr < T.hr_low) || v.sys < T.bp_sys_shock) set('cardio', 'critical');
    else if (!working && ((ppg && v.hr > REST_HR_HIGH) || v.sys > 150 || v.temp > T.temp_high)) set('cardio', 'warning');
    if (v.co2 > 9) set('plss', 'critical');
    else if (v.coolant > 24) set('plss', 'warning');
    if (this.armPressure < 3.6) set('rightArm', 'critical');
    else if (this.armPressure < 4.1) set('rightArm', 'warning');
    if (v.temp > T.temp_high) set('metabolic', 'critical');
    else if (this.activity === 'exercise' || v.coolant > 22 || v.temp > 37.5) set('metabolic', 'warning');
    if (this.activity === 'exercise') set('legs', 'warning');
    if (this.activity === 'stress') { set('helmet', 'warning'); set('cardio', 'warning'); }
    // from injected faults
    for (const id of f) set(id, id === 'wrist' ? 'fault' : 'critical');
    if (sensorFault) set('wrist', 'fault');
    return z;
  }

  private build(): Snapshot {
    const sensorFault = this.faults.has('wrist');
    const flags = this.flags(this.values, sensorFault);
    const decision = this.decide(flags);
    const lockedFor = Object.entries(this.lastDose).map(([, at]) => LOCKOUT_S - (this.simTime - at)).filter((s) => s > 0);
    const guards: Guard[] = [
      { id: 'needs-flag', label: 'No LLM injection without a flag', state: flags.length ? 'active' : 'armed', detail: flags.length ? `Flags raised: ${flags.join(', ')}. Only their conditions may be chosen.` : 'No flag raised, so the LLM is not even called.' },
      { id: 'no-dismiss', label: 'No dismissing an emergency flag', state: flags.some((x) => MUST_ACT.has(x)) ? 'active' : 'armed', detail: flags.some((x) => MUST_ACT.has(x)) ? 'An emergency flag is raised: "none" is refused and the rules answer instead.' : 'Would refuse "none" for a tier-1 or sensor-fault flag.' },
      { id: 'lockout', label: 'Repeat-injection lockout', state: lockedFor.length ? 'tripped' : 'armed', detail: lockedFor.length ? `Locked for ${Math.ceil(Math.max(...lockedFor) / 60)} more min after an automatic injection.` : `Blocks a second automatic injection for ${rulesFile.lockout_minutes} min.` },
      { id: 'sensor', label: 'Sensor-fault detector', state: sensorFault ? 'tripped' : 'armed', detail: sensorFault ? 'Readings cannot be trusted: no medical decision is made from them.' : 'Treats a missing or impossible reading as a fault, never as healthy.' },
    ];
    return {
      tick: this.tickNo, simTime: this.simTime, paused: this.paused, speed: this.speed, scenario: this.scenario, activity: this.activity,
      values: { ...this.values }, armPressure: this.armPressure, sensorFault, flags, decision, guards,
      zones: this.zoneStatus(this.values, sensorFault), faults: [...this.faults],
      history: this.history, scanAt: this.scanAt,
    };
  }
}

/** What the diagnostic card shows for one zone. */
export interface ZoneReport {
  integrity: number;
  readings: { label: string; value: string }[];
  diagnosis: string;
  /** The rules.json response that applies, if the zone's problem is a medical condition the watch knows. */
  protocol: { condition: string; tier: number; action: string; firstResponse: string; medication: string } | null;
  countermeasure: string;
}

const fmt = (k: MetricKey, v: number) => `${v.toFixed(METRICS[k].digits)} ${METRICS[k].unit}`;

export function zoneReport(id: ZoneId, s: Snapshot): ZoneReport {
  const v = s.values;
  const status = s.zones[id];
  const hasFault = s.faults.includes(id);
  const base = status === 'nominal' ? 100 : status === 'warning' ? 84 : status === 'fault' ? 60 : 42;
  const rule = (names: string[]) => (names.includes(s.decision.condition) ? { condition: s.decision.condition, tier: s.decision.tier, action: s.decision.action, firstResponse: s.decision.firstResponse, medication: s.decision.medication } : null);
  switch (id) {
    case 'helmet':
      return {
        integrity: hasFault ? Math.round((v.suit / 4.3) * 100) : base,
        readings: [{ label: 'Blood oxygen', value: fmt('spo2', v.spo2) }, { label: 'Helmet CO₂', value: fmt('co2', v.co2) }, { label: 'Suit pressure', value: fmt('suit', v.suit) }, { label: 'HRV (fatigue)', value: fmt('hrv', v.hrv) }],
        diagnosis: hasFault ? 'Visor seal leak: helmet pressure and blood oxygen are falling.' : v.spo2 < T.spo2_low ? 'Hypoxia: blood oxygen is below the limit.' : v.co2 > 5 ? 'CO₂ is building up in the helmet.' : v.hrv < 25 ? 'Low heart-rate variability: a sign of stress or fatigue.' : 'Visor sealed, breathing gas within limits.',
        protocol: rule(['low_oxygen']),
        countermeasure: hasFault ? 'Reseat visor seal' : 'Purge helmet gas',
      };
    case 'cardio':
      return {
        integrity: base,
        readings: [{ label: 'Heart rate', value: fmt('hr', v.hr) }, { label: 'Arterial pressure', value: `${v.sys.toFixed(0)}/${v.dia.toFixed(0)} mmHg` }, { label: 'Respiration', value: fmt('resp', v.resp) }, { label: 'Core temperature', value: fmt('temp', v.temp) }],
        diagnosis: v.hr < T.hr_low ? 'Bradycardia: heart rate is below the limit.' : v.hr > REST_HR_HIGH && s.activity === 'exercise' ? 'High heart rate, expected during exercise.' : v.hr > REST_HR_HIGH ? `High heart rate while the activity is "${s.activity}".` : v.sys > 150 ? 'Blood pressure is raised.' : 'Heart rhythm and pressure within limits.',
        protocol: rule(['bradycardia', 'shock', 'tachycardia', 'panic_attack', 'high_bp', 'low_bp']),
        countermeasure: 'Start rest protocol',
      };
    case 'wrist':
      return {
        integrity: base,
        readings: [{ label: 'Activity classifier', value: s.sensorFault ? 'unknown' : s.activity }, { label: 'PPG signal', value: s.sensorFault ? 'unreliable' : 'clean' }, { label: 'Auto-injector guard', value: s.guards.find((g) => g.id === 'lockout')!.state === 'tripped' || s.sensorFault ? 'locked' : 'armed' }],
        diagnosis: s.sensorFault ? 'Sensor fault: the watch cannot trust its readings, so the injector is locked out.' : 'Watch sensor healthy; classifier and injector guard armed.',
        protocol: rule(['sensor_fault']),
        countermeasure: 'Reseat watch sensor',
      };
    case 'rightArm':
      return {
        integrity: Math.round(clamp(s.armPressure / 4.3, 0, 1) * 100),
        readings: [{ label: 'Forearm pressure', value: `${s.armPressure.toFixed(2)} psi` }, { label: 'Suit pressure', value: fmt('suit', v.suit) }, { label: 'Glove heater', value: 'on' }],
        diagnosis: s.armPressure < 3.6 ? 'Suit breach: the right forearm is venting gas.' : s.armPressure < 4.1 ? 'Pressure is recovering after a leak.' : 'Arm and glove seals holding at nominal pressure.',
        protocol: null,
        countermeasure: 'Seal breach',
      };
    case 'plss':
      return {
        integrity: base,
        readings: [{ label: 'Helmet CO₂', value: fmt('co2', v.co2) }, { label: 'Coolant loop', value: fmt('coolant', v.coolant) }, { label: 'Radiation dose', value: fmt('rad', v.rad) }, { label: 'Scrubber', value: hasFault ? 'failed' : 'running' }],
        diagnosis: hasFault ? 'CO₂ scrubber failure: the backpack is no longer cleaning the breathing gas.' : v.coolant > 24 ? 'Coolant loop is running warm.' : 'Oxygen, scrubber and coolant loop running normally.',
        protocol: rule(['low_oxygen', 'radiation_sickness']),
        countermeasure: 'Switch to reserve scrubber',
      };
    case 'metabolic':
      return {
        integrity: base,
        readings: [{ label: 'Core temperature', value: fmt('temp', v.temp) }, { label: 'Coolant loop', value: fmt('coolant', v.coolant) }, { label: 'Respiration', value: fmt('resp', v.resp) }, { label: 'Activity', value: s.activity }],
        diagnosis: hasFault ? 'Cooling garment failure: body heat is not being carried away.' : v.temp > T.temp_high ? 'Core temperature is above the fever limit.' : s.activity === 'exercise' ? 'Metabolic heat is high from exertion.' : 'Thermal balance within limits.',
        protocol: rule(['fever']),
        countermeasure: hasFault ? 'Restore cooling flow' : 'Start rest protocol',
      };
    case 'legs':
      return {
        integrity: hasFault ? Math.round((v.suit / 4.3) * 100) : base,
        readings: [{ label: 'Exertion', value: s.activity === 'exercise' ? 'high' : 'low' }, { label: 'Suit pressure', value: fmt('suit', v.suit) }, { label: 'Heart rate', value: fmt('hr', v.hr) }],
        diagnosis: hasFault ? 'Boot joint leak: the lower suit is losing pressure.' : s.activity === 'exercise' ? 'Leg muscles and joints under heavy load.' : 'Leg joints and boots nominal.',
        protocol: null,
        countermeasure: hasFault ? 'Seal breach' : 'Start rest protocol',
      };
  }
}

/** Colour role of one metric card. Rule-based limits come from rules.json; the rest are the demo limits above. */
export function metricStatus(key: MetricKey, s: Snapshot): ZoneStatus {
  const v = s.values[key];
  if (s.sensorFault && (key === 'hr' || key === 'spo2')) return 'fault';
  switch (key) {
    case 'hr': return v < T.hr_low ? 'critical' : v > REST_HR_HIGH && s.activity !== 'exercise' ? 'warning' : 'nominal';
    case 'spo2': return v < T.spo2_low ? 'critical' : v < 94 ? 'warning' : 'nominal';
    case 'temp': return v > T.temp_high ? 'critical' : v > 37.6 ? 'warning' : 'nominal';
    case 'sys': return v < T.bp_sys_shock || v > T.bp_sys_high ? 'critical' : v < T.bp_sys_low || v > 150 ? 'warning' : 'nominal';
    case 'suit': return v < 3.6 ? 'critical' : v < 4.0 ? 'warning' : 'nominal';
    case 'co2': return v > 9 ? 'critical' : v > 7.6 ? 'warning' : 'nominal';
    default: {
      const d = METRICS[key];
      return (d.high !== undefined && v > d.high) || (d.low !== undefined && v < d.low) ? 'warning' : 'nominal';
    }
  }
}
