import type { Astronaut, ConditionId, VitalSample } from './types';

export const STEP_MS = 5 * 60_000; // history resolution
export const LIVE_MS = 2_000; // live tick

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const n = (r: () => number, a: number) => (r() + r() - 1) * a;
export const seedOf = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/** Daily routine → activity level (exercise blocks raise HR legitimately). */
function activityAt(t: number) {
  const h = new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60;
  if (h >= 22 || h < 6) return 0; // sleep
  if ((h >= 10 && h < 11) || (h >= 16 && h < 16.5)) return 0.9; // ARED / treadmill
  return 0.25;
}

/** Feature 10 — emergency overlays injected on cue. */
export function applyEmergency(s: VitalSample, c: ConditionId | null, k: number): VitalSample {
  if (!c) return s;
  const m = (a: number, b: number) => a + (b - a) * k;
  switch (c) {
    case 'bradycardia': return { ...s, heartRate: m(s.heartRate, 36), systolic: m(s.systolic, 92) };
    case 'tachycardia': return { ...s, heartRate: m(s.heartRate, 168), activity: 0.1 };
    case 'panic-attack': return { ...s, heartRate: m(s.heartRate, 138), systolic: m(s.systolic, 165), activity: 0.1 };
    case 'shock': return { ...s, heartRate: m(s.heartRate, 128), systolic: m(s.systolic, 68), diastolic: m(s.diastolic, 40) };
    case 'low-bp': return { ...s, systolic: m(s.systolic, 84), diastolic: m(s.diastolic, 52) };
    case 'high-bp': return { ...s, systolic: m(s.systolic, 186), diastolic: m(s.diastolic, 118) };
    case 'low-oxygen': return { ...s, spo2: m(s.spo2, 86), heartRate: m(s.heartRate, 104) };
    case 'fever': return { ...s, temp: m(s.temp, 38.9), heartRate: m(s.heartRate, 98) };
    case 'radiation-sickness': return { ...s, radiationRate: m(s.radiationRate, 9000), heartRate: m(s.heartRate, 96) };
  }
}

/** One sample for an astronaut at time t, before emergency overlays. */
export function sampleAt(a: Astronaut, t: number, r: () => number): VitalSample {
  const act = activityAt(t);
  const b = a.baseline;
  const circ = Math.sin(((t / 3_600_000) % 24 - 4) / 24 * Math.PI * 2);
  let s: VitalSample = {
    t,
    activity: act,
    heartRate: b.heartRate + act * 78 + circ * 3 + n(r, 2.5),
    systolic: b.systolic + act * 18 + circ * 3 + n(r, 3),
    diastolic: b.diastolic + act * 6 + circ * 2 + n(r, 2),
    spo2: Math.min(100, b.spo2 + n(r, 0.6) - act * 0.8),
    temp: b.temp + circ * 0.25 + act * 0.3 + n(r, 0.05),
    radiationRate: 18 + n(r, 3), // ~0.43 mSv/day cruise background, µSv/h
  };
  // Scenario flavour.
  if (a.id === 'hiro') s = { ...s, systolic: s.systolic + 16, diastolic: s.diastolic + 9 }; // drifting hypertension
  if (a.id === 'kwame') s = { ...s, heartRate: s.heartRate + 8 }; // elevated resting HR from stress
  if (a.id === 'maya') {
    const h = (t - (Date.now() - 24 * 3_600_000)) / 3_600_000;
    if (h > 14 && h < 17) s = { ...s, radiationRate: 420 + n(r, 40), activity: 0.6 }; // EVA during solar activity
  }
  return s;
}

export function history(a: Astronaut, now: number, hours = 24): VitalSample[] {
  const r = rng(seedOf(a.id));
  const out: VitalSample[] = [];
  for (let t = now - hours * 3_600_000; t <= now; t += STEP_MS) out.push(sampleAt(a, t, r));
  return out;
}

/** Cumulative mission dose in mSv from a rate series (µSv/h at STEP_MS). */
export function doseFromSeries(series: VitalSample[]) {
  return series.reduce((acc, s) => acc + (s.radiationRate * (STEP_MS / 3_600_000)) / 1000, 0);
}

export const liveRng = rng(7);
