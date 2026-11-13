import type {
  Astronaut,
  BloodTest,
  CheckInMessage,
  DecisionLogEntry,
  MedLogEntry,
  MentalCheck,
  PlanItem,
  Report,
  RootCause,
  SleepNight,
  SleepStage,
} from './types';
import { seedOf } from './sim';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const T0 = Date.now();
const at = (h: number) => T0 + h * HOUR;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Four fictional crew members, one demo scenario each. */
export const CREW: Astronaut[] = [
  {
    id: 'elena',
    sex: 'F', daysInSpace: 142, family: [{ name: 'Lucas', relation: 'son', bpm: 74 }],
    name: 'Elena Ruiz',
    role: 'Commander',
    age: 46,
    suitColor: '#4c8df0',
    visorTint: '#c9a227',
    skin: '#c68b62',
    baseline: { heartRate: 62, systolic: 116, diastolic: 74, spo2: 98, temp: 36.7 },
    scenario: 'Blood oxygen is running below her own baseline, short of the alarm line. Exercise spikes are still ignored as false alarms.',
    medications: [
      { name: 'Vitamin D3', dose: '1000 IU', route: 'oral', schedule: 'Daily 07:00', reason: 'Bone-loss countermeasure', today: [{ at: at(-6), taken: true }] },
      { name: 'Melatonin', dose: '3 mg', route: 'oral', schedule: 'Nightly 21:30', reason: 'Sleep-window support', today: [{ at: at(8), taken: false }] },
    ],
  },
  {
    id: 'kwame',
    sex: 'M', daysInSpace: 142, family: [{ name: 'Ama', relation: 'daughter', bpm: 92 }, { name: 'Efua', relation: 'wife', bpm: 68 }],
    name: 'Kwame Mensah',
    role: 'Flight Engineer',
    age: 39,
    suitColor: '#b79cff',
    visorTint: '#4c7bd9',
    skin: '#5a3825',
    baseline: { heartRate: 72, systolic: 120, diastolic: 78, spo2: 98, temp: 36.8 },
    scenario: 'Poor sleep and falling mental-health score. At risk of panic attacks.',
    medications: [
      { name: 'Vitamin D3', dose: '1000 IU', route: 'oral', schedule: 'Daily 07:00', reason: 'Bone-loss countermeasure', today: [{ at: at(-6), taken: true }] },
      { name: 'Melatonin', dose: '5 mg', route: 'oral', schedule: 'Nightly 21:30', reason: 'Treatment plan: sleep schedule', today: [{ at: at(8), taken: false }] },
      { name: 'Sertraline', dose: '25 mg', route: 'oral', schedule: 'Daily 08:00 (pending approval)', reason: 'Proposed by root-cause analysis, awaiting mission command', today: [] },
    ],
  },
  {
    id: 'hiro',
    sex: 'M', daysInSpace: 142, family: [{ name: 'Yuki', relation: 'wife', bpm: 66 }],
    name: 'Hiro Nakamura',
    role: 'Mission Specialist',
    age: 51,
    suitColor: '#c9b88a',
    visorTint: '#c9a227',
    skin: '#e0b48f',
    baseline: { heartRate: 66, systolic: 128, diastolic: 82, spo2: 97, temp: 36.6 },
    scenario: 'Blood pressure drifting up. The watch says fine, but he feels ill (manager agent resolves it).',
    medications: [
      { name: 'Lisinopril', dose: '10 mg', route: 'oral', schedule: 'Daily 07:00', reason: 'Pre-existing hypertension', today: [{ at: at(-5), taken: false }] },
      { name: 'Vitamin D3', dose: '1000 IU', route: 'oral', schedule: 'Daily 07:00', reason: 'Bone-loss countermeasure', today: [{ at: at(-5), taken: true }] },
      { name: 'Acetaminophen', dose: '500 mg', route: 'oral', schedule: 'As needed', reason: 'Headache (check-in)', today: [{ at: at(-2), taken: true }] },
    ],
  },
  {
    id: 'maya',
    sex: 'F', daysInSpace: 142, family: [{ name: 'Chidi', relation: 'brother', bpm: 70 }],
    name: 'Maya Okafor',
    role: 'Medical Officer',
    age: 35,
    suitColor: '#5ad1ff',
    visorTint: '#d4462a',
    skin: '#8d5a3b',
    baseline: { heartRate: 60, systolic: 112, diastolic: 70, spo2: 99, temp: 36.7 },
    scenario: 'High radiation dose from yesterday’s EVA during solar activity. Take-shelter warning.',
    medications: [
      { name: 'Vitamin D3', dose: '1000 IU', route: 'oral', schedule: 'Daily 07:00', reason: 'Bone-loss countermeasure', today: [{ at: at(-6), taken: true }] },
      { name: 'Potassium iodide', dose: '130 mg', route: 'oral', schedule: 'Once (post-EVA)', reason: 'Treatment plan after radiation exposure', today: [{ at: at(-9), taken: true }] },
    ],
  },
];

export const byId = (id: string) => CREW.find((c) => c.id === id);

// ───────────── Feature 14 — radiation (mission cumulative before today, mSv) ─────────────
export const PRIOR_DOSE_MSV: Record<string, number> = { elena: 96, kwame: 92, hiro: 101, maya: 128 };
export const DOSE_LIMIT_MSV = 600; // career limit
export const SHELTER_RATE_USV_H = 300; // take-shelter warning threshold

// ───────────── Feature 1 — sleep (watch + check-in) ─────────────
function r(seed: number) {
  let a = seed;
  return () => ((a = Math.imul(a ^ (a >>> 15), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909)) >>> 0) / 4294967296;
}

function hypnogram(start: number, end: number, rand: () => number, fragmented: boolean) {
  const out: { t: number; stage: SleepStage }[] = [];
  const step = 5 * 60_000;
  const total = Math.floor((end - start) / step);
  for (let i = 0; i < total; i++) {
    const c = (i % 18) / 18;
    let s: SleepStage = 'light';
    if (i < 3) s = 'awake';
    else if (c < 0.33 && i / total < 0.6) s = 'deep';
    else if (c > 0.72) s = 'rem';
    if (rand() < (fragmented ? 0.1 : 0.02)) s = 'awake';
    out.push({ t: start + i * step, stage: s });
  }
  return out;
}

export function sleepNights(id: string): SleepNight[] {
  const rand = r(seedOf('sleep' + id));
  const nights: SleepNight[] = [];
  for (let d = 6; d >= 0; d--) {
    const poor = id === 'kwame' ? 1 - d / 9 : id === 'hiro' && d < 2 ? 0.5 : 0;
    const hours = 7.4 - poor * 2.2 + (rand() - 0.5) * 0.5;
    const start = T0 - d * DAY - 10 * HOUR + poor * 1.5 * HOUR;
    const end = start + hours * HOUR / (0.92 - poor * 0.15);
    const mins = hours * 60;
    const deep = Math.round(mins * (0.2 - poor * 0.08));
    const rem = Math.round(mins * 0.22);
    nights.push({
      date: iso(end),
      start,
      end,
      hours: Number(hours.toFixed(1)),
      cycles: Math.max(2, Math.round(hours / 1.5 - poor)),
      efficiency: Math.round((0.92 - poor * 0.15) * 100),
      stages: { deep, rem, light: Math.round(mins - deep - rem), awake: Math.round((end - start) / 60_000 - mins) },
      hypnogram: d === 0 ? hypnogram(start, end, rand, poor > 0.3) : undefined,
      selfRated: Math.max(1, Math.round(4.5 - poor * 3)),
      source: 'watch + check-in',
    });
  }
  return nights;
}

/** Suggested sleep window (feature 1): anchored to the crew schedule, shifted by sleep debt. */
export function suggestedWindow(nights: SleepNight[]) {
  const debt = nights.slice(-3).reduce((a, n) => a + Math.max(0, 8 - n.hours), 0);
  const startH = debt > 3 ? 21 : 21.5;
  const fmt = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;
  return { start: fmt(startH), end: fmt(startH + 8.5), debtHours: Number(debt.toFixed(1)) };
}

// ───────────── Feature 2 — mental health (set questions, scored) ─────────────
export const MH_QUESTIONS = [
  'How would you rate your mood today?',
  'How well are you coping with workload?',
  'How connected do you feel to the crew?',
  'How calm do you feel right now?',
  'How motivated are you about tomorrow?',
];

export function mentalChecks(id: string): MentalCheck[] {
  const rand = r(seedOf('mh' + id));
  const out: MentalCheck[] = [];
  for (let d = 13; d >= 0; d--) {
    const decline = id === 'kwame' ? Math.max(0, (10 - d) / 10) : id === 'hiro' && d < 3 ? 0.2 : 0;
    const answers = MH_QUESTIONS.map((q) => ({ q, a: Math.max(0, Math.min(4, Math.round(3.4 - decline * 1.8 + (rand() - 0.5) * 1.2))) }));
    const score = Math.round((answers.reduce((s, x) => s + x.a, 0) / (4 * answers.length)) * 100);
    out.push({ date: iso(T0 - d * DAY), score, answers, sentToMissionCommand: true });
  }
  return out;
}

export function therapyRecommendation(score: number) {
  if (score >= 70) return null;
  return {
    sessions: score < 50 ? 'Daily 20-min guided session (CBT-based) for 14 days' : 'Daily 15-min breathing & reflection session for 7 days',
    note: 'Recommended by the agent because the mental-health score fell below 70. Results shared with mission command.',
  };
}

// ───────────── Feature 5 — daily check-in transcript (today) ─────────────
export function checkIn(id: string): { completed: boolean; missedYesterday: boolean; messages: CheckInMessage[] } {
  const base = T0 - 3 * HOUR;
  const m = (i: number, from: 'agent' | 'astronaut', text: string): CheckInMessage => ({ from, text, at: base + i * 25_000 });
  if (id === 'kwame')
    return {
      completed: true,
      missedYesterday: true,
      messages: [
        m(0, 'agent', 'Good morning, Kwame. You missed yesterday’s check-in, so let’s cover both days. How did you sleep the last two nights?'),
        m(1, 'astronaut', 'Badly. I keep waking around 03:00 and can’t get back to sleep.'),
        m(2, 'agent', 'Thanks. Your watch agrees: 4 awakenings and only 3 sleep cycles last night. Any racing heart or tight chest?'),
        m(3, 'astronaut', 'Yesterday in the node, for a few minutes. Felt like I couldn’t breathe.'),
        m(4, 'agent', 'Understood. I’ll include that in today’s root-cause analysis. Five quick mental-health questions next, on a 0–4 scale.'),
      ],
    };
  if (id === 'hiro')
    return {
      completed: true,
      missedYesterday: false,
      messages: [
        m(0, 'agent', 'Morning, Hiro. How are you feeling today?'),
        m(1, 'astronaut', 'Not great. Headache since I woke up, a bit dizzy.'),
        m(2, 'agent', 'Your watch shows vitals inside alarm limits, but your report takes priority. I’ll look for the cause. Did you take your lisinopril this morning?'),
        m(3, 'astronaut', 'I don’t think so. Busy start.'),
      ],
    };
  if (id === 'maya')
    return {
      completed: true,
      missedYesterday: false,
      messages: [
        m(0, 'agent', 'Morning, Maya. Any nausea, vomiting or fatigue since yesterday’s EVA?'),
        m(1, 'astronaut', 'Slight nausea last night. Fine now.'),
        m(2, 'agent', 'Noted. Your dose yesterday was elevated. I’m keeping you on the shelter-first plan and tracking symptoms for 72 h.'),
      ],
    };
  return {
    completed: false,
    missedYesterday: false,
    messages: [m(0, 'agent', 'Good morning, Elena. Ready for today’s 3-minute check-in?')],
  };
}

/** Scripted agent replies for continuing a check-in live. */
export const CHECKIN_SCRIPT = [
  'How many hours do you think you slept, and how rested do you feel (1–5)?',
  'Any symptoms today: headache, nausea, dizziness, palpitations?',
  'On a 0–4 scale, how would you rate your mood today?',
  'Thanks. That completes today’s check-in. I’ll run root-cause analysis and update your plan.',
];

// ───────────── Feature 8 — root-cause analysis ─────────────
export function rootCause(id: string): RootCause {
  const date = iso(T0);
  const n = sleepNights(id);
  const last = n[n.length - 1];
  const mh = mentalChecks(id);
  const mhNow = mh[mh.length - 1].score;
  const mhThen = mh[0].score;
  switch (id) {
    case 'kwame':
      return {
        date,
        problem: 'Chronic sleep disruption driving anxiety, with an early panic-attack pattern',
        confidence: 0.78,
        factors: [
          { source: 'Check-in', finding: 'Reports waking at 03:00 and a breathless episode in the node', weight: 0.3 },
          { source: 'Sleep', finding: `${last.hours} h, ${last.cycles} cycles, efficiency ${last.efficiency}% (falling for 7 nights)`, weight: 0.3 },
          { source: 'Mental health', finding: `Score ${mhNow}/100, down from ${mhThen} two weeks ago`, weight: 0.25 },
          { source: '24 h vitals', finding: 'Resting HR +8 bpm above personal baseline', weight: 0.15 },
        ],
      };
    case 'hiro':
      return {
        date,
        problem: 'Missed antihypertensive dose plus short sleep explain the headache and dizziness',
        confidence: 0.82,
        factors: [
          { source: 'Check-in', finding: 'Headache and dizziness, and lisinopril not taken this morning', weight: 0.4 },
          { source: '24 h vitals', finding: 'Systolic BP +16 above personal baseline, still under the alarm limit', weight: 0.35 },
          { source: 'Sleep', finding: `2 short nights (last ${last.hours} h)`, weight: 0.2 },
          { source: 'Mental health', finding: `Score ${mhNow}/100`, weight: 0.05 },
        ],
      };
    case 'maya':
      return {
        date,
        problem: 'Radiation exposure during EVA (solar activity) with mild prodromal nausea',
        confidence: 0.71,
        factors: [
          { source: '24 h vitals', finding: 'Dose rate peaked ~420 µSv/h for 3 h during EVA', weight: 0.55 },
          { source: 'Check-in', finding: 'Slight nausea last night, resolved', weight: 0.3 },
          { source: 'Sleep', finding: 'Normal', weight: 0.1 },
          { source: 'Mental health', finding: 'Normal', weight: 0.05 },
        ],
      };
    default:
      return {
        date,
        problem: 'No underlying problem identified',
        confidence: 0.9,
        factors: [
          { source: '24 h vitals', finding: 'All within personal baseline. Exercise HR spikes explained by activity.', weight: 0.5 },
          { source: 'Sleep', finding: `${last.hours} h, ${last.cycles} cycles`, weight: 0.25 },
          { source: 'Mental health', finding: `Score ${mhNow}/100`, weight: 0.25 },
        ],
      };
  }
}

// ───────────── Feature 4 — treatment plans ─────────────
export function treatmentPlan(id: string): PlanItem[] {
  const p = (i: number, x: Omit<PlanItem, 'id'>): PlanItem => ({ id: `${id}-plan-${i}`, ...x });
  switch (id) {
    case 'kwame':
      return [
        p(1, { kind: 'sleep', text: 'Fixed sleep window 21:00–05:30 for 7 nights; no screens after 20:30', urgent: false, approval: 'approved', missionCommandNote: 'Approved. Reassess on day 7.' }),
        p(2, { kind: 'medication', text: 'Melatonin 5 mg nightly at 21:30', urgent: false, approval: 'approved' }),
        p(3, { kind: 'therapy', text: 'Daily 20-min guided CBT session with the agent', urgent: false, approval: 'approved' }),
        p(4, { kind: 'medication', text: 'Start sertraline 25 mg daily', urgent: false, approval: 'pending-mission-command' }),
        p(5, { kind: 'exercise', text: 'Move treadmill session to the morning (no exercise after 18:00)', urgent: false, approval: 'pending-mission-command' }),
      ];
    case 'hiro':
      return [
        p(1, { kind: 'medication', text: 'Take the missed lisinopril 10 mg now; recheck BP in 2 h', urgent: true, approval: 'not-required' }),
        p(2, { kind: 'diet', text: 'Fluids 2.5 L today; reduce sodium (no rehydratable soups for 3 days)', urgent: false, approval: 'pending-mission-command' }),
        p(3, { kind: 'sleep', text: 'Protect 8 h sleep opportunity for 3 nights', urgent: false, approval: 'approved' }),
      ];
    case 'maya':
      return [
        p(1, { kind: 'medication', text: 'Ondansetron available on the watch (tier 1) if vomiting starts', urgent: true, approval: 'not-required' }),
        p(2, { kind: 'exercise', text: 'No EVA for 7 days; light exercise only', urgent: false, approval: 'approved', missionCommandNote: 'Approved. EVA-5 reassigned.' }),
        p(3, { kind: 'diet', text: 'Antioxidant-rich menu and +500 mL fluids for 3 days', urgent: false, approval: 'pending-mission-command' }),
        p(4, { kind: 'sleep', text: 'Sleep in the shielded crew quarters during the solar event', urgent: true, approval: 'not-required' }),
      ];
    default:
      return [p(1, { kind: 'exercise', text: 'Continue standard countermeasure exercise (ARED + treadmill)', urgent: false, approval: 'approved' })];
  }
}

// ───────────── Feature 15 — blood tests (lab draws, entered manually) ─────────────
export const BLOOD_MARKERS: { key: string; label: string; unit: string; range: [number, number] }[] = [
  { key: 'wbc', label: 'White blood cells', unit: '×10⁹/L', range: [4.0, 11.0] },
  { key: 'rbc', label: 'Red blood cells', unit: '×10¹²/L', range: [4.2, 5.9] },
  { key: 'hgb', label: 'Haemoglobin', unit: 'g/dL', range: [12.0, 17.5] },
  { key: 'plt', label: 'Platelets', unit: '×10⁹/L', range: [150, 400] },
  { key: 'glucose', label: 'Glucose', unit: 'mg/dL', range: [70, 99] },
  { key: 'creatinine', label: 'Creatinine', unit: 'mg/dL', range: [0.6, 1.3] },
  { key: 'calcium', label: 'Calcium', unit: 'mg/dL', range: [8.6, 10.3] },
  { key: 'potassium', label: 'Potassium', unit: 'mmol/L', range: [3.5, 5.1] },
];

export function bloodTests(id: string): BloodTest[] {
  const rand = r(seedOf('blood' + id));
  return [28, 14, 0].map((d, i) => {
    const values: Record<string, number> = {};
    for (const m of BLOOD_MARKERS) {
      const mid = (m.range[0] + m.range[1]) / 2;
      let v = mid + (rand() - 0.5) * (m.range[1] - m.range[0]) * 0.5;
      if (id === 'maya' && m.key === 'wbc' && d === 0) v = 3.6; // post-exposure dip
      if (id === 'maya' && m.key === 'plt' && d === 0) v = 162;
      if (id === 'hiro' && m.key === 'creatinine') v = 1.1 + i * 0.05;
      values[m.key] = Number(v.toFixed(m.range[1] > 50 ? 0 : 1));
    }
    return { id: `bt-${id}-${d}`, date: iso(T0 - d * DAY), enteredBy: 'Maya Okafor (Medical Officer)', values };
  });
}

// ───────────── Feature 12 — medication log seed ─────────────
export const MED_LOG: MedLogEntry[] = [
  { id: 'ml1', at: at(-9), astronautId: 'maya', drug: 'Potassium iodide', route: 'oral', givenBy: 'Maya Okafor (self)', reason: 'Post-EVA radiation plan' },
  { id: 'ml2', at: at(-2), astronautId: 'hiro', drug: 'Acetaminophen', route: 'oral', givenBy: 'Hiro Nakamura (self)', reason: 'Headache (check-in)' },
  { id: 'ml3', at: at(-30), astronautId: 'kwame', drug: 'Melatonin', route: 'oral', givenBy: 'Kwame Mensah (self)', reason: 'Treatment plan: sleep' },
];

// ───────────── Feature 17 — decision log seed ─────────────
export const DECISIONS: DecisionLogEntry[] = [
  { id: 'd1', at: at(-20), astronautId: 'elena', actor: 'Watch LLM (rule set)', decision: 'Suppressed tachycardia alarm (HR 134)', rule: 'ACT-1 · HR > 130 during exercise → suppress (activity context)', reason: 'ARED session in progress' },
  { id: 'd2', at: at(-16), astronautId: 'maya', actor: 'Manager agent', decision: 'Issued take-shelter warning', reason: 'Dose rate 420 µSv/h exceeded the 300 µSv/h threshold during EVA' },
  { id: 'd3', at: at(-9), astronautId: 'maya', actor: 'Root-cause analysis', decision: 'Flagged radiation exposure as underlying problem', reason: 'EVA dose peak + nausea reported in check-in' },
  { id: 'd4', at: at(-2.9), astronautId: 'kwame', actor: 'Root-cause analysis', decision: 'Identified chronic sleep disruption → anxiety', reason: 'Check-in + 7-night sleep decline + falling mental-health score' },
  { id: 'd5', at: at(-2.8), astronautId: 'kwame', actor: 'Manager agent', decision: 'Sent sertraline proposal to mission command (non-urgent)', reason: 'Medication changes that are not urgent require approval' },
  { id: 'd6', at: at(-2.5), astronautId: 'hiro', actor: 'Manager agent', decision: 'Watch/astronaut disagreement resolved in favour of the astronaut report', reason: 'BP +16 vs baseline (sub-alarm) + missed lisinopril + short sleep' },
  { id: 'd7', at: at(-2.4), astronautId: 'hiro', actor: 'Root-cause analysis', decision: 'Urgent plan item: take missed lisinopril now', reason: 'Urgent items proceed without approval' },
];

// ───────────── Feature 6 — weekly report seed ─────────────
export const REPORTS: Report[] = [
  {
    id: 'wk-20',
    kind: 'weekly',
    createdAt: at(-7 * 24),
    astronautIds: ['elena', 'kwame', 'hiro', 'maya'],
    summary: {
      elena: 'Blood oxygen below her baseline all week; otherwise nominal.',
      kwame: 'Sleep efficiency declining (88% → 82%). Mental-health score 68. Behavioural sleep plan started.',
      hiro: 'BP stable on lisinopril. Adherence 7/7.',
      maya: 'Nominal. EVA-5 scheduled.',
    },
    flagged: ['Kwame: early sleep decline'],
    delivery: 'replied',
    reply: { at: at(-6.5 * 24), text: 'Approve Kwame’s sleep plan. Add a daily CBT session if the score falls below 60. Maya cleared for EVA-5.' },
  },
];

// ───────────── Feature 21 — gravity drop test (rules, no ML) ─────────────

/**
 * Femoral-neck reference values for T-scores (young-adult mean and SD, g/cm²).
 * PLACEHOLDER until the NHANES DXXFEM femur scans in raw/raw/nhanes are loaded
 * (they are Git LFS pointers in this checkout).
 */
export const FEMUR_REF = { F: { mean: 0.858, sd: 0.12 }, M: { mean: 0.93, sd: 0.137 } } as const;

/** Pre-flight femoral-neck BMD per astronaut (placeholder, drawn from the NHANES age/sex group). */
export const PREFLIGHT_BMD: Record<string, number> = { elena: 0.84, kwame: 0.95, hiro: 0.86, maya: 0.88 };

/**
 * Femoral-neck loss per month in microgravity. PLACEHOLDER: FEATURES.md lists the published
 * rate as an open question. 1.15 %/month is a commonly cited figure, still to be sourced.
 */
export const BONE_LOSS_PER_MONTH = 0.0115;

export const GRAVITY = { earth: { label: 'Earth', g: 1 }, mars: { label: 'Mars', g: 0.38 } } as const;

export function boneEstimate(a: Astronaut, days = a.daysInSpace) {
  const pre = PREFLIGHT_BMD[a.id] ?? FEMUR_REF[a.sex].mean;
  const months = days / 30.44;
  const now = pre * Math.max(0, 1 - BONE_LOSS_PER_MONTH * months);
  const ref = FEMUR_REF[a.sex];
  const tPre = (pre - ref.mean) / ref.sd;
  const tNow = (now - ref.mean) / ref.sd;
  // Rule: bone strength scales roughly with density squared; landing load scales with gravity.
  const strength = (now / pre) ** 2;
  const fragility = (g: number) => g / strength;
  const cls = (x: number) => (x > 1.3 ? 'high' : x > 1.08 ? 'elevated' : x > 0.6 ? 'normal' : 'low');
  const who = tNow <= -2.5 ? 'Osteoporosis range' : tNow < -1 ? 'Osteopenia range' : 'Normal range';
  return {
    pre,
    now,
    lossPct: (1 - now / pre) * 100,
    tPre,
    tNow,
    who,
    earth: { index: fragility(GRAVITY.earth.g), risk: cls(fragility(GRAVITY.earth.g)) },
    mars: { index: fragility(GRAVITY.mars.g), risk: cls(fragility(GRAVITY.mars.g)) },
  };
}
