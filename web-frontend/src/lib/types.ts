/** Shapes of the rows the backend returns (backend/server.js, database/schema.sql). Only the fields the UI reads. */

/** Colour role of a status. `fault` is for sensor faults and lockouts: a broken instrument, not a sick astronaut. */
export type Tone = 'nominal' | 'warning' | 'critical' | 'fault' | 'info' | 'neutral';

export interface Vital {
  id: string;
  observed_at: string;
  activity: string | null;
  heart_rate_bpm: number | null;
  systolic_mmhg: number | null;
  diastolic_mmhg: number | null;
  spo2_percent: number | null;
  temperature_c: number | null;
  radiation_rate: number | null;
  sensor_status: 'ok' | 'suspect' | 'detached' | 'fault';
}

export interface CrewMember {
  id: string;
  display_name: string;
  callsign: string;
  role: string;
  command_rank: number;
  fit_for_command: boolean;
  latestVitals: Vital | null;
  latestCheckIn: CheckIn | null;
  openEvents: number;
}

export interface ChainMember {
  id: string;
  display_name: string;
  callsign: string;
  command_rank: number;
  fit_for_command: boolean;
  active: boolean;
}

export interface Mission {
  destination: string;
  earth_link_available: boolean;
  earth_round_trip_seconds: number;
  earth_review_seconds: number;
}

export interface CommandInfo {
  actingLeaderId: string;
  crew: ChainMember[];
  mission: Mission;
}

export interface ConditionEvent {
  id: string;
  started_at: string;
  ended_at: string | null;
  condition_key: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  status: 'open' | 'monitoring' | 'resolved' | 'false_alarm';
  reported_by: string;
  summary: string | null;
}

export interface Decision {
  id: string;
  astronaut_id: string;
  decided_at: string;
  decision_type: string;
  actor: string;
  rationale: string | null;
  proposed_action: string | null;
  outcome: 'proposed' | 'accepted' | 'rejected' | 'cancelled' | 'completed' | 'superseded';
  subject_callsign?: string;
  subject_name?: string;
}

export interface MedicationEvent {
  id: string;
  medication_id: string;
  proposed_at: string;
  cancel_until: string | null;
  administered_at: string | null;
  status: 'proposed' | 'awaiting_confirmation' | 'confirmed' | 'cancelled' | 'administered' | 'crew_action_required' | 'declined' | 'unavailable';
  quantity: number | null;
  quantity_unit: string | null;
  notes: string | null;
}

export interface StockItem {
  id: string;
  name: string;
  route: string;
  stock_unit: string;
  quantity_on_hand: string | number;
}

export interface PlanItem {
  id: string;
  position: number;
  action_type: string;
  description: string;
  status: string;
}

export interface Plan {
  id: string;
  created_at: string;
  created_by: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  status: string;
  rationale: string | null;
  items: PlanItem[];
}

export interface Lab {
  id: string;
  collected_at: string;
  panel_name: string;
  analyte: string;
  value: number;
  unit: string;
  reference_low: number | null;
  reference_high: number | null;
}

export interface CheckIn {
  id: string;
  check_in_date: string;
  started_at: string;
  completed_at: string | null;
  status: 'in_progress' | 'completed' | 'missed' | 'incomplete';
  mental_health_score: number | null;
  reported_symptoms: string | null;
  transcript: { from: string; text: string; at?: number }[] | null;
}

export interface SleepSession {
  id: string;
  started_at: string;
  source: string;
  reported_hours: number | null;
  quality_score: number | null;
  notes: string | null;
}

export interface Assessment {
  id: string;
  assessed_at: string;
  root_cause_summary: string;
  urgency: 'routine' | 'urgent' | 'emergency';
}

export interface CrewAlert {
  id: string;
  created_at: string;
  recipient_id: string;
  medication_event_id: string | null;
  alert_text: string;
  action_instructions: string | null;
  status: 'pending' | 'acknowledged' | 'resolved' | 'cancelled';
}

export interface Report {
  id: string;
  report_type: 'weekly' | 'emergency';
  created_at: string;
  status: string;
  arrives_at: string | null;
  summary: string;
  flagged_issues: string[];
  replies: { id: string; received_at: string; sender: string; message: string }[];
}

export interface ChatMessage {
  from: 'astronaut' | 'agent';
  text: string;
  at: number;
}

/** The ten per-astronaut streams of GET /backend/astronauts/:id/<name>. */
export interface RecordStreams {
  vitals: Vital[];
  sleep: SleepSession[];
  mental: CheckIn[];
  checkins: CheckIn[];
  assessment: Assessment[];
  plan: Plan[];
  medications: MedicationEvent[];
  labs: Lab[];
  events: ConditionEvent[];
  decisions: Decision[];
}
