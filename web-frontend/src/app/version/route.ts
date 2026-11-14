export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ build: process.env.APP_BUILD_ID || process.env.NEXT_PUBLIC_APP_BUILD_ID || 'local', mode: process.env.NODE_ENV }, { headers: { 'cache-control': 'no-store' } });
}
