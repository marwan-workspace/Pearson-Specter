/**
 * Browser-side client for the manager agent. Every call goes to this app's own
 * /api/agent/* routes; `src/server/agent-bridge.ts` forwards them to the Python/Gemini backend.
 *
 * Request and response shapes mirror `overview/agent.py`. Responses are checked before use so a
 * malformed LLM reply can never reach the UI as a crash.
 */
import type { MentalCheck, PlanItem, Report, RootCause } from './types';

export interface BackendHealth {
  mode: 'python' | 'http' | 'off';
  ready: boolean;
  model: string | null;
  checks: { label: string; ok: boolean; hint?: string }[];
}

export class AgentApiError extends Error {}

type Msg = { from: 'agent' | 'astronaut'; text: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !v.trim()) throw new AgentApiError(`The agent reply is missing ${what}.`);
  return v;
};

async function post(command: string, body: unknown, signal?: AbortSignal, timeoutMs = 65_000): Promise<Record<string, unknown>> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let res: Response;
  try {
    res = await fetch(`/api/agent/${command}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new AgentApiError(e instanceof DOMException && e.name === 'TimeoutError' ? 'The agent took too long to answer.' : 'The dashboard server is not reachable.');
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new AgentApiError(isObj(data) && typeof data.error === 'string' ? data.error : `The agent answered ${res.status}.`);
  if (!isObj(data)) throw new AgentApiError('The agent reply was not JSON.');
  return data;
}

function messageText(data: Record<string, unknown>) {
  if (!isObj(data.message)) throw new AgentApiError('The agent reply is missing its message.');
  return str(data.message.text, 'its message text');
}

function mental(v: unknown): MentalCheck | null {
  if (!isObj(v) || typeof v.score !== 'number' || !Array.isArray(v.answers)) return null;
  const answers = v.answers.filter(isObj).map((a) => ({ q: String(a.q ?? ''), a: Number(a.a) })).filter((a) => a.q && a.a >= 0 && a.a <= 4);
  if (!answers.length) return null;
  return { date: typeof v.date === 'string' ? v.date : new Date().toISOString().slice(0, 10), score: Math.max(0, Math.min(100, Math.round(v.score))), answers, sentToMissionCommand: true };
}

const SOURCES: RootCause['factors'][number]['source'][] = ['Check-in', 'Sleep', 'Mental health', '24 h vitals'];
const KINDS: PlanItem['kind'][] = ['medication', 'sleep', 'therapy', 'exercise', 'diet'];
const APPROVALS: PlanItem['approval'][] = ['not-required', 'pending-mission-command', 'approved', 'changed-by-mission-command'];

export const agentApi = {
  async health(signal?: AbortSignal): Promise<BackendHealth> {
    const res = await fetch('/api/agent/health', { cache: 'no-store', signal });
    const d: unknown = await res.json().catch(() => null);
    if (!res.ok || !isObj(d) || typeof d.ready !== 'boolean') throw new AgentApiError('The health check failed.');
    return {
      mode: d.mode === 'http' || d.mode === 'off' ? d.mode : 'python',
      ready: d.ready,
      model: typeof d.model === 'string' ? d.model : null,
      checks: Array.isArray(d.checks) ? d.checks.filter(isObj).map((c) => ({ label: String(c.label ?? ''), ok: c.ok === true, hint: typeof c.hint === 'string' ? c.hint : undefined })) : [],
    };
  },

  /** Feature 9: any-time chat with the manager agent. */
  async chat(input: { astronautId: string; messages: Msg[]; context: Record<string, unknown> }, signal?: AbortSignal) {
    return { text: messageText(await post('chat', input, signal)) };
  },

  /** Features 5 and 2: one step of the daily check-in. `mental` arrives once all five questions are scored. */
  async checkin(input: { astronautId: string; date: string; missedYesterday: boolean; messages: Msg[] }, signal?: AbortSignal) {
    const d = await post('checkin', input, signal);
    return { text: messageText(d), completed: d.completed === true, mental: mental(d.mental) };
  },

  /** Features 8 and 4: root cause and treatment plan for the last 24 hours. */
  async assess(input: Record<string, unknown> & { astronautId: string; date: string }, signal?: AbortSignal): Promise<{ rootCause: RootCause; plan: PlanItem[]; urgency: string }> {
    const d = await post('assess', input, signal);
    if (!isObj(d.rootCause) || !Array.isArray(d.plan)) throw new AgentApiError('The assessment is missing its root cause or plan.');
    const rc = d.rootCause;
    const factors = (Array.isArray(rc.factors) ? rc.factors : []).filter(isObj).map((f) => ({
      source: SOURCES.includes(f.source as never) ? (f.source as RootCause['factors'][number]['source']) : '24 h vitals',
      finding: String(f.finding ?? ''),
      weight: Math.max(0, Math.min(1, Number(f.weight) || 0)),
    }));
    const plan = d.plan.filter(isObj).map((p, i): PlanItem => ({
      id: typeof p.id === 'string' ? p.id : `${input.astronautId}-${input.date}-${i}`,
      kind: KINDS.includes(p.kind as never) ? (p.kind as PlanItem['kind']) : 'exercise',
      text: String(p.text ?? ''),
      urgent: p.urgent === true,
      approval: APPROVALS.includes(p.approval as never) ? (p.approval as PlanItem['approval']) : p.urgent === true && p.kind !== 'medication' ? 'not-required' : 'pending-mission-command', // same rule as overview/agent.py: medication always waits
    })).filter((p) => p.text);
    return {
      rootCause: { date: typeof rc.date === 'string' ? rc.date : input.date, problem: str(rc.problem, 'the problem'), confidence: Math.max(0, Math.min(1, Number(rc.confidence) || 0)), factors },
      plan,
      urgency: typeof d.urgency === 'string' ? d.urgency : 'routine',
    };
  },

  /** Feature 6: weekly report for mission command. */
  async weekly(input: { periodStart: string; periodEnd: string; astronauts: ({ id: string } & Record<string, unknown>)[] }, signal?: AbortSignal): Promise<Pick<Report, 'summary' | 'flagged'>> {
    const d = await post('weekly', input, signal);
    if (!isObj(d.summary)) throw new AgentApiError('The weekly report is missing its summaries.');
    const summary: Record<string, string> = {};
    for (const a of input.astronauts) summary[a.id] = typeof d.summary[a.id] === 'string' ? (d.summary[a.id] as string) : 'No summary was produced for this astronaut.';
    return { summary, flagged: Array.isArray(d.flagged) ? d.flagged.filter((f): f is string => typeof f === 'string') : [] };
  },
};
