// End-to-end smoke test of the riskiest backend rules against a real PostgreSQL.
// DATABASE_URL_TEST must point at an EMPTY throwaway database: schema.sql is applied to it once.
//   DATABASE_URL_TEST=postgres://... npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const URL = process.env.DATABASE_URL_TEST;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8099, BASE = `http://localhost:${PORT}/backend`, PIN = '1234';
const env = { ...process.env, DATABASE_URL: URL, PORT: String(PORT), WATCH_ENABLED: 'false',
  DEMO_PIN_ELENA: PIN, DEMO_PIN_KWAME: PIN, DEMO_PIN_HIRO: PIN, DEMO_PIN_MAYA: PIN };
let server;

before(async () => {
  if (!URL) return;
  const pool = new pg.Pool({ connectionString: URL });
  if (!(await pool.query("SELECT to_regclass('public.accounts') AS t")).rows[0].t)
    await pool.query(readFileSync(path.join(HERE, '..', 'database', 'schema.sql'), 'utf8'));
  await pool.end();
  execFileSync(process.execPath, ['seed-accounts.js'], { cwd: HERE, env });
  server = spawn(process.execPath, ['server.js'], { cwd: HERE, env });
  await new Promise((ok, fail) => { server.stdout.on('data', (b) => String(b).includes('listening') && ok()); server.on('exit', fail); });
});
after(() => server?.kill());

async function call(p, { cookie, body } = {}) {
  const res = await fetch(BASE + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body && JSON.stringify(body) });
  return { status: res.status, cookie: res.headers.get('set-cookie')?.split(';')[0], data: await res.json() };
}
const login = (name, pin = PIN) => call('/auth/login', { body: { login: name, pin } });

test('a decision can be resolved only once', { skip: !URL && 'set DATABASE_URL_TEST' }, async () => {
  const { cookie } = await login('elena');
  await call('/simulator/inject', { cookie, body: { astronautId: 'kwame', condition: 'radiation_sickness' } });
  const pending = (await call('/decisions/pending', { cookie })).data.items.find((d) => d.decision_type === 'tier3_medication');
  assert.ok(pending, 'the injected tier 3 condition waits for the leader');
  assert.equal((await call(`/decisions/${pending.id}`, { cookie, body: { action: 'approve' } })).status, 200);
  assert.equal((await call(`/decisions/${pending.id}`, { cookie, body: { action: 'reject' } })).status, 409);
});

test('five wrong PINs lock an account until the leader unlocks it', { skip: !URL && 'set DATABASE_URL_TEST' }, async () => {
  for (let i = 1; i <= 5; i++) assert.equal((await login('hiro', '0000')).status, i < 5 ? 401 : 423);
  assert.equal((await login('hiro')).status, 423, 'the right PIN does not open a locked account');
  const { cookie } = await login('elena');
  assert.equal((await call('/accounts/hiro/unlock', { cookie, body: {} })).status, 200);
  assert.equal((await login('hiro')).status, 200);
});

test('bad weekly report dates are a 400, not a crash', { skip: !URL && 'set DATABASE_URL_TEST' }, async () => {
  const { cookie } = await login('elena');
  assert.equal((await call('/weekly', { cookie, body: { periodStart: 'last week' } })).status, 400);
});
