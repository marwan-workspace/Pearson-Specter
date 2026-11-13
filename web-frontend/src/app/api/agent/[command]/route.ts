import { BridgeError, call, isCommand } from '@/server/agent-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 512_000;

/** POST /api/agent/<assess|checkin|chat|weekly|emergency> → the manager agent's JSON reply. */
export async function POST(request: Request, { params }: { params: Promise<{ command: string }> }) {
  const { command } = await params;
  if (!isCommand(command)) return Response.json({ error: `Unknown agent command: ${command}` }, { status: 404 });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: 'Request body is too large.' }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Request body must be a JSON object.' }, { status: 400 });

  try {
    return Response.json(await call(command, body), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    const status = e instanceof BridgeError ? e.status : 500;
    return Response.json({ error: e instanceof Error ? e.message : 'The agent failed.' }, { status });
  }
}
