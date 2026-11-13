import type { ConditionId, ConditionSpec, StockItem, VitalSample } from './types';

/**
 * Feature 7 — medication per condition, exactly as listed in FEATURES.md.
 * WARNING (from FEATURES.md): not checked against NASA's medical kit or clinical
 * guidelines; contains no doses. Needs medical review before being presented as fact.
 */
export const CONDITIONS: Record<ConditionId, ConditionSpec> = {
  bradycardia: { id: 'bradycardia', label: 'Bradycardia (symptomatic)', firstResponse: 'Alert crew', medication: 'Atropine; epinephrine if atropine fails', watchCanInject: true, tier: 1, drug: 'Atropine' },
  shock: { id: 'shock', label: 'Shock (severe low blood pressure)', firstResponse: 'Lie down, alert crew', medication: 'Epinephrine', watchCanInject: true, tier: 1, drug: 'Epinephrine' },
  'radiation-sickness': { id: 'radiation-sickness', label: 'Radiation sickness', firstResponse: 'Move to shielded area', medication: 'Ondansetron (nausea); filgrastim (bone marrow)', watchCanInject: true, tier: 1, drug: 'Ondansetron' },
  'panic-attack': { id: 'panic-attack', label: 'Panic attack', firstResponse: 'Guided breathing on the watch', medication: 'Lorazepam or midazolam', watchCanInject: true, tier: 2, drug: 'Midazolam' },
  tachycardia: { id: 'tachycardia', label: 'Tachycardia (abnormal rhythm)', firstResponse: 'Breathing / vagal manoeuvres', medication: 'Adenosine; metoprolol', watchCanInject: false, tier: 3, drug: 'Metoprolol' },
  'low-bp': { id: 'low-bp', label: 'Low blood pressure (not shock)', firstResponse: 'Lie down, fluids', medication: 'Midodrine (oral)', watchCanInject: false, tier: 3, drug: 'Midodrine' },
  'high-bp': { id: 'high-bp', label: 'High blood pressure (emergency)', firstResponse: 'Rest, recheck', medication: 'Labetalol or nicardipine (IV); captopril (oral)', watchCanInject: false, tier: 3, drug: 'Captopril' },
  'low-oxygen': { id: 'low-oxygen', label: 'Low blood oxygen', firstResponse: 'Supplemental O₂, alert crew', medication: 'Oxygen', watchCanInject: false, tier: 3, drug: 'Oxygen' },
  fever: { id: 'fever', label: 'Fever', firstResponse: 'Rest, fluids, recheck', medication: 'Acetaminophen (oral)', watchCanInject: false, tier: 3, drug: 'Acetaminophen' },
};

export const TIER_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Tier 1 · Automatic injection',
  2: 'Tier 2 · Confirm first',
  3: 'Tier 3 · Crewmate gives it',
};

/** Cancel window before a tier-1 automatic injection (feature 12). */
export const CANCEL_WINDOW_MS = 15_000;

/** Feature 12 — initial on-board stock. Quantities are placeholders pending medical review. */
export const INITIAL_STOCK: StockItem[] = [
  { drug: 'Atropine', form: 'Watch cartridge', onBoard: 8, initial: 8, maxPer24h: 3 },
  { drug: 'Epinephrine', form: 'Watch cartridge', onBoard: 8, initial: 8, maxPer24h: 2 },
  { drug: 'Ondansetron', form: 'Watch cartridge', onBoard: 10, initial: 10, maxPer24h: 3 },
  { drug: 'Midazolam', form: 'Watch cartridge', onBoard: 6, initial: 6, maxPer24h: 1 },
  { drug: 'Filgrastim', form: 'Injection (crew)', onBoard: 4, initial: 4, maxPer24h: 1 },
  { drug: 'Metoprolol', form: 'Oral tablet', onBoard: 30, initial: 30, maxPer24h: 2 },
  { drug: 'Adenosine', form: 'IV (crew)', onBoard: 6, initial: 6, maxPer24h: 3 },
  { drug: 'Midodrine', form: 'Oral tablet', onBoard: 30, initial: 30, maxPer24h: 3 },
  { drug: 'Captopril', form: 'Oral tablet', onBoard: 20, initial: 20, maxPer24h: 2 },
  { drug: 'Labetalol', form: 'IV (crew)', onBoard: 6, initial: 6, maxPer24h: 2 },
  { drug: 'Oxygen', form: 'Mask (crew)', onBoard: 12, initial: 12, maxPer24h: 6 },
  { drug: 'Acetaminophen', form: 'Oral tablet', onBoard: 60, initial: 60, maxPer24h: 4 },
];

/**
 * Feature 7 — the watch rule set. FEATURES.md: an LLM applies rules derived from the datasets;
 * there is no trained ML model. This function is the deterministic stand-in for the LLM applying
 * the rules (swap in the real LLM call here). Every result names the rule that fired (feature 17).
 * Rules compare against the astronaut's own baseline (feature 13) and use activity context so
 * exercise-driven tachycardia is not flagged (false-alarm handling).
 */
export const RULES = {
  RAD1: 'RAD-1 · dose rate > 5000 µSv/h, or > 1500 µSv/h with cumulative dose > 400 mSv',
  SHK1: 'SHK-1 · systolic < 75 mmHg with HR > 110 (3 samples)',
  BRD1: 'BRD-1 · HR < 42 bpm sustained (3 samples)',
  OXY1: 'OXY-1 · SpO₂ < 90% (3 samples)',
  HBP1: 'HBP-1 · systolic > 175 mmHg (3 samples)',
  LBP1: 'LBP-1 · systolic < 90 mmHg (3 samples)',
  FEV1: 'FEV-1 · temperature > 38.2 °C (3 samples)',
  ACT1: 'ACT-1 · HR > 130 during exercise → suppress (activity context)',
  PAN1: 'PAN-1 · HR 130–150 at rest and systolic +15 vs own recent BP',
  TAC1: 'TAC-1 · HR > 130 at rest, no exercise',
} as const;
export function detect(
  recent: VitalSample[],
  baseline: { heartRate: number; systolic: number; spo2: number; temp: number },
  cumulativeDoseMSv: number,
): { condition: ConditionId; confidence: number; evidence: string; rule: string; suppressed?: boolean } | null {
  if (recent.length < 3) return null;
  const last = recent.slice(-3);
  // Reference window: the astronaut's own readings just before now (personal baseline, feature 13).
  const ref = recent.slice(0, -3);
  const refSys = ref.length ? ref.reduce((a, s) => a + s.systolic, 0) / ref.length : baseline.systolic;
  const avg = (k: keyof VitalSample) => last.reduce((a, s) => a + (s[k] as number), 0) / last.length;
  const hr = avg('heartRate');
  const sys = avg('systolic');
  const spo2 = avg('spo2');
  const temp = avg('temp');
  const act = avg('activity');
  const rad = avg('radiationRate');

  if (rad > 5000 || (rad > 1500 && cumulativeDoseMSv > 400))
    return { condition: 'radiation-sickness', rule: RULES.RAD1, confidence: 0.81, evidence: `Dose rate ${Math.round(rad)} µSv/h (cumulative ${cumulativeDoseMSv.toFixed(0)} mSv)` };
  if (sys < 75 && hr > 110) return { condition: 'shock', rule: RULES.SHK1, confidence: 0.88, evidence: `BP ${Math.round(sys)} systolic with HR ${Math.round(hr)}` };
  if (hr < 42) return { condition: 'bradycardia', rule: RULES.BRD1, confidence: 0.9, evidence: `HR ${Math.round(hr)} bpm (baseline ${baseline.heartRate})` };
  if (spo2 < 90) return { condition: 'low-oxygen', rule: RULES.OXY1, confidence: 0.86, evidence: `SpO₂ ${Math.round(spo2)}%` };
  if (sys > 175) return { condition: 'high-bp', rule: RULES.HBP1, confidence: 0.84, evidence: `BP ${Math.round(sys)} systolic (baseline ${baseline.systolic})` };
  if (sys < 90) return { condition: 'low-bp', rule: RULES.LBP1, confidence: 0.77, evidence: `BP ${Math.round(sys)} systolic` };
  if (temp > 38.2) return { condition: 'fever', rule: RULES.FEV1, confidence: 0.8, evidence: `Temp ${temp.toFixed(1)} °C` };
  if (hr > 130) {
    if (act > 0.6) return { condition: 'tachycardia', rule: RULES.ACT1, confidence: 0.3, evidence: `HR ${Math.round(hr)} during exercise`, suppressed: true };
    // Panic: fast HR together with a sharp BP rise vs. the astronaut's own recent BP; tachycardia otherwise.
    if (hr < 150 && sys - refSys > 15) return { condition: 'panic-attack', rule: RULES.PAN1, confidence: 0.74, evidence: `HR ${Math.round(hr)} at rest, BP ${Math.round(sys)} (+${Math.round(sys - refSys)} in minutes), no exercise` };
    return { condition: 'tachycardia', rule: RULES.TAC1, confidence: 0.83, evidence: `HR ${Math.round(hr)} bpm at rest` };
  }
  return null;
}

/** Score 0–100 for the last 24 h of one vital vs. personal baseline (feature 3 + 13). */
export function scoreSeries(values: number[], baseline: number, tolerance: number) {
  if (!values.length) return 100;
  const out = values.filter((v) => Math.abs(v - baseline) > tolerance).length / values.length;
  return Math.round(100 * (1 - out));
}

/** Feature 20 — one-way light time to Earth (seconds) and labels. */
export const LOCATIONS = {
  iss: { label: 'ISS', owltSec: 0.5, note: 'Low Earth orbit. Near-live contact with mission command.' },
  moon: { label: 'Moon', owltSec: 1.3, note: 'About 1.3 s each way. Mission command can still guide in real time.' },
  mars: { label: 'Mars', owltSec: 750, note: '3 to 22 min each way (12.5 min shown). Earth cannot help in time, so the onboard system acts as the doctor.' },
} as const;
/** Time mission command needs to review before replying (demo value). */
export const EARTH_REVIEW_SEC = 30;
