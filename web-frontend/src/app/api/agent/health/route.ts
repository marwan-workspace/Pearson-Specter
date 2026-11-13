import { health } from '@/server/agent-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/agent/health → whether the Gemini-backed agent can be reached, and what is missing if not. */
export async function GET() {
  return Response.json(await health(), { headers: { 'cache-control': 'no-store' } });
}
