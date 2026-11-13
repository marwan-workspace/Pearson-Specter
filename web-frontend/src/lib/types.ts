/** Domain types — scoped strictly to the features in FEATURES.md. */

export type Status = 'nominal' | 'watch' | 'critical';

export type VitalKey = 'heartRate' | 'systolic' | 'diastolic' | 'spo2' | 'temp' | 'radiationRate';

export interface VitalSample {
  t: number;
  heartRate: number;
  systolic: number;
  diastolic: number;
  spo2: number;
  temp: number;
  /** µSv/h at the wearer. */
  radiationRate: number;
  /** 0 rest … 1 hard exercise — activity context for false-alarm handling (feature 7). */
  activity: number;
  /** Feature 19 — written while the watch is off the wrist; the zeros are not real vitals. */
  sensorFault?: true;
}

/** Feature 7 — conditions the watch model detects. */
export type ConditionId =
  | 'tachycardia'
  | 'bradycardia'
  | 'radiation-sickness'
  | 'panic-attack'
  | 'low-bp'
  | 'shock'
  | 'high-bp'
  | 'low-oxygen'
  | 'fever';

export type Tier = 1 | 2 | 3;

export interface ConditionSpec {
  id: ConditionId;
  label: string;
  firstResponse: string;
  medication: string;
  watchCanInject: boolean;
  tier: Tier;
  /** Drug name used for stock & dose limits. */
  drug: string;
}

/** A detected event on the watch and its response lifecycle. */
export interface WatchEvent {
  id: string;
  astronautId: string;
  condition: ConditionId;
  detectedAt: number;
  confidence: number;
  evidence: string;
  /** Rule from the rule set that the LLM applied (feature 7). */
  rule: string;
  /**
   * Tier 1: 'countdown' → 'administered' | 'cancelled'
   * Tier 2: 'awaiting-confirm' → 'administered' | 'declined'
   * Tier 3: 'crewmate-alerted' → 'given-by-crewmate'
   */
  state: 'countdown' | 'awaiting-confirm' | 'crewmate-alerted' | 'administered' | 'cancelled' | 'declined' | 'given-by-crewmate' | 'blocked-dose-limit';
  cancelDeadline?: number;
  resolvedAt?: number;
  resolvedBy?: string;
  /** True when activity context explains the reading (suppressed false alarm). */
  suppressed?: boolean;
}

export interface Medication {
  name: string;
  dose: string;
  route: 'oral' | 'injection (watch)' | 'IV' | 'topical';
  schedule: string;
  reason: string;
  /** Times today (epoch ms) and whether taken. */
  today: { at: number; taken: boolean }[];
}

/** Feature 12 — stock on board. */
export interface StockItem {
  drug: string;
  form: string;
  onBoard: number;
  initial: number;
  /** Max doses per astronaut per 24 h (dose limit). */
  maxPer24h: number;
}

export interface MedLogEntry {
  id: string;
  at: number;
  astronautId: string;
  drug: string;
  route: string;
  givenBy: 'watch (automatic)' | 'watch (confirmed)' | string;
  reason: string;
}

export type SleepStage = 'awake' | 'rem' | 'light' | 'deep';

export interface SleepNight {
  date: string;
  start: number;
  end: number;
  hours: number;
  cycles: number;
  efficiency: number;
  stages: Record<SleepStage, number>; // minutes
  /** 5-min epochs, last night only. */
  hypnogram?: { t: number; stage: SleepStage }[];
  /** From the check-in (feature 5): self-rated 1–5. */
  selfRated: number;
  source: 'watch + check-in';
}

export interface MentalCheck {
  date: string;
  /** 0–100, higher = better. */
  score: number;
  answers: { q: string; a: number }[]; // 0–4 scale
  sentToMissionCommand: boolean;
}

export interface CheckInMessage {
  from: 'agent' | 'astronaut';
  text: string;
  at: number;
  /** Agent messages only: written by the Gemini backend, or by the local simulation. */
  source?: 'gemini' | 'simulated';
}

export interface RootCause {
  date: string;
  problem: string;
  confidence: number;
  factors: { source: 'Check-in' | 'Sleep' | 'Mental health' | '24 h vitals'; finding: string; weight: number }[];
}

export type PlanItemKind = 'medication' | 'sleep' | 'therapy' | 'exercise' | 'diet';

export interface PlanItem {
  id: string;
  kind: PlanItemKind;
  text: string;
  urgent: boolean;
  /** Urgent non-medication items proceed directly; other items wait for the decider. */
  approval: 'not-required' | 'pending-team-leader' | 'approved' | 'changed-by-team-leader';
  missionCommandNote?: string;
}

export interface BloodTest {
  id: string;
  date: string;
  enteredBy: string;
  values: Record<string, number>;
}

export interface DecisionLogEntry {
  id: string;
  at: number;
  astronautId?: string;
  actor: 'Watch LLM (rule set)' | 'Manager agent' | 'Root-cause analysis' | 'Mission command' | 'Astronaut' | 'Crewmate';
  decision: string;
  /** Feature 17 — the rule that fired (watch decisions). */
  rule?: string;
  reason: string;
}

export interface Report {
  id: string;
  kind: 'weekly' | 'emergency';
  createdAt: number;
  astronautIds: string[];
  summary: Record<string, string>;
  flagged: string[];
  /** Feature 18 — queued until Earth contact. Feature 20 — then in transit for the light-time delay. */
  delivery: 'queued' | 'sent' | 'replied';
  sentAt?: number;
  /** When the report reaches Earth (sentAt + one-way delay). */
  arrivesAt?: number;
  /** When mission command's reply reaches the ship (round trip + review time). */
  replyDueAt?: number;
  reply?: { at: number; text: string };
}

/** Feature 20 — where the ship is; sets the Earth light-time delay. */
export type Location = 'iss' | 'moon' | 'mars';

export interface Astronaut {
  id: string;
  name: string;
  role: string;
  age: number;
  suitColor: string;
  visorTint: string;
  skin: string;
  baseline: { heartRate: number; systolic: number; diastolic: number; spo2: number; temp: number };
  medications: Medication[];
  /** Feature 21 — sex used to pick the NHANES femur reference group. */
  sex: 'F' | 'M';
  /** Feature 21 — days in microgravity so far (this mission + previous ones). */
  daysInSpace: number;
  /** Feature 22 — family heartbeat recordings, made before launch. */
  family: { name: string; relation: string; bpm: number }[];
  /** Short scenario note for the demo. */
  scenario: string;
}
