/**
 * Server-only bridge between the dashboard and the Gemini-backed manager agent.
 *
 * THIS IS THE PLACE TO CONNECT THE BACKEND. Two ways, picked by environment variables
 * (see `.env.example`):
 *
 *  1. Python bridge (default, no extra server needed)
 *     Runs `python -m overview <command>` in the repo root and pipes JSON through stdin/stdout,
 *     exactly the contract documented in `overview/agent.py`. The Gemini key stays in the repo's
 *     git-ignored `.env`; it is never sent to the browser.
 *
 *  2. HTTP backend
 *     Set AGENT_BACKEND_URL=http://localhost:8000 and requests are forwarded to
 *     POST {AGENT_BACKEND_URL}/<command> with the same JSON bodies, and GET {AGENT_BACKEND_URL}/health.
 *
 * The browser only ever talks to this app's own /api/agent/* routes, so there is no CORS to set up
 * and no secret in client code.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const COMMANDS = ['assess', 'checkin', 'chat', 'weekly', 'emergency'] as const;
export type AgentCommand = (typeof COMMANDS[number]);
export const isCommand = (c: string): c is AgentCommand => (COMMANDS as readonly string[]).includes(c);

export interface BridgeHealth {
  /** How the dashboard reaches the agent. */
  mode: 'python' | 'http' | 'off';
  /** True when a Gemini call is expected to work. */
  ready: boolean;
  /** Model name if it is configured where the dashboard can see it. */
  model: string | null;
  checks: { label: string; ok: boolean; hint?: string }[];
}

export class BridgeError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 60_000);
const MAX_OUTPUT = 2_000_000;

function config() {
  const mode = (process.env.AGENT_MODE ?? '').toLowerCase();
  const url = process.env.AGENT_BACKEND_URL?.replace(/\/+$/, '');
  const dir = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.AGENT_BACKEND_DIR ?? '..');
  return { off: mode === 'off', url, dir };
}

/** Prefer the repo's virtualenv, then AGENT_PYTHON, then whatever `python` is on PATH. */
function pythonBin(dir: string) {
  if (process.env.AGENT_PYTHON) return process.env.AGENT_PYTHON;
  const venv = process.platform === 'win32' ? path.join(dir, '.venv', 'Scripts', 'python.exe') : path.join(dir, '.venv', 'bin', 'python');
  if (existsSync(venv)) return venv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

/** Reads one key from the backend's .env without ever returning the value to a caller that would expose it. */
function envValue(dir: string, key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  try {
    for (const line of readFileSync(path.join(dir, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && m[1] === key) return m[2].trim().replace(/^["']|["']$/g, '') || undefined;
    }
  } catch {
    /* no .env yet */
  }
  return undefined;
}

function run(bin: string, args: string[], cwd: string, input: string | null, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new BridgeError(`The agent did not answer within ${Math.round(timeoutMs / 1000)} s.`, 504));
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < 20_000) stderr += d.toString('utf8');
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new BridgeError(`Could not start Python (${bin}): ${e.message}`, 503));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.on('error', () => undefined); // process exited before reading stdin
    child.stdin.end(input ?? '');
  });
}

let sdkCheck: { at: number; ok: boolean; hint?: string } | null = null;

async function pythonSdkReady(dir: string) {
  if (sdkCheck && Date.now() - sdkCheck.at < 60_000) return sdkCheck;
  try {
    const r = await run(pythonBin(dir), ['-c', 'import google.genai'], dir, null, 15_000);
    sdkCheck = { at: Date.now(), ok: r.code === 0, hint: r.code === 0 ? undefined : 'Run: pip install -r requirements.txt' };
  } catch (e) {
    sdkCheck = { at: Date.now(), ok: false, hint: e instanceof Error ? e.message : 'Python is not available' };
  }
  return sdkCheck;
}

export async function health(): Promise<BridgeHealth> {
  const { off, url, dir } = config();
  if (off) return { mode: 'off', ready: false, model: null, checks: [{ label: 'Agent bridge', ok: false, hint: 'AGENT_MODE=off in the environment' }] };

  if (url) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5_000), cache: 'no-store' });
      const body = (await res.json().catch(() => ({}))) as { model?: unknown };
      return {
        mode: 'http',
        ready: res.ok,
        model: typeof body.model === 'string' ? body.model : null,
        checks: [{ label: `Backend at ${url}`, ok: res.ok, hint: res.ok ? undefined : `Answered ${res.status}` }],
      };
    } catch {
      return { mode: 'http', ready: false, model: null, checks: [{ label: `Backend at ${url}`, ok: false, hint: 'Not reachable. Is the server running?' }] };
    }
  }

  const agentModule = existsSync(path.join(dir, 'overview', 'agent.py')) && existsSync(path.join(dir, 'llm.py'));
  const key = !!envValue(dir, 'GEMINI_API_KEY') || !!envValue(dir, 'GOOGLE_API_KEY');
  const sdk = agentModule ? await pythonSdkReady(dir) : { ok: false, hint: 'Skipped' };
  return {
    mode: 'python',
    ready: agentModule && key && sdk.ok,
    model: envValue(dir, 'GEMINI_MODEL') ?? null,
    checks: [
      { label: 'Agent code (overview/agent.py, llm.py)', ok: agentModule, hint: agentModule ? undefined : 'Not found. Set AGENT_BACKEND_DIR to the repo root.' },
      { label: 'Python with google-genai', ok: sdk.ok, hint: sdk.hint },
      { label: 'GEMINI_API_KEY', ok: key, hint: key ? undefined : 'Add GEMINI_API_KEY=… to the .env file in the repo root.' },
    ],
  };
}

/** Sends one command to the agent and returns its JSON reply. Throws BridgeError with a status code. */
export async function call(command: AgentCommand, body: unknown): Promise<unknown> {
  const { off, url, dir } = config();
  if (off) throw new BridgeError('The agent bridge is switched off (AGENT_MODE=off).', 503);

  if (url) {
    let res: Response;
    try {
      res = await fetch(`${url}/${command}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch (e) {
      throw new BridgeError(e instanceof Error && e.name === 'TimeoutError' ? 'The backend timed out.' : 'The backend is not reachable.', 504);
    }
    const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
    if (!res.ok || data === null) throw new BridgeError(typeof data?.error === 'string' ? data.error : `The backend answered ${res.status}.`, 502);
    return data;
  }

  const r = await run(pythonBin(dir), ['-m', 'overview', command], dir, JSON.stringify(body), TIMEOUT_MS);
  let data: unknown = null;
  try {
    data = JSON.parse(r.stdout.trim().split(/\r?\n/).pop() ?? '');
  } catch {
    /* handled below */
  }
  if (r.code === 0 && data && typeof data === 'object') return data;
  const err = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : r.stderr.trim().split(/\r?\n/).pop() || `python -m overview ${command} exited with code ${r.code}`;
  throw new BridgeError(err, 502);
}
