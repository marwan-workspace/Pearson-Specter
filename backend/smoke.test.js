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

test('plan approval persists a valid item status and approves the parent plan', { skip: !URL && 'set DATABASE_URL_TEST' }, async () => {
  const db = new pg.Pool({ connectionString: URL });
  try {
    const subject = (await db.query("SELECT id FROM astronauts WHERE callsign='KWAME'")).rows[0].id;
    const plan = (await db.query("INSERT INTO treatment_plans(astronaut_id,created_by,urgency,status) VALUES($1,'manager_agent','routine','awaiting_approval') RETURNING id", [subject])).rows[0];
    const item = (await db.query("INSERT INTO treatment_plan_items(treatment_plan_id,position,action_type,description) VALUES($1,0,'monitoring','Review the next watch reading') RETURNING id", [plan.id])).rows[0];
    const decision = (await db.query("INSERT INTO decisions(astronaut_id,decision_type,actor,evidence,outcome) VALUES($1,'plan_approval','manager_agent',$2,'proposed') RETURNING id", [subject, JSON.stringify({ treatmentPlanId: plan.id, treatmentPlanItemId: item.id })])).rows[0];
    const { cookie } = await login('elena');
    const approved = await call(`/decisions/${decision.id}`, { cookie, body: { action: 'approve' } });
    assert.equal(approved.status, 200);
    assert.equal(approved.data.outcome, 'accepted');
    const saved = (await db.query('SELECT p.status AS plan_status,i.status AS item_status,d.outcome FROM treatment_plans p JOIN treatment_plan_items i ON i.treatment_plan_id=p.id JOIN decisions d ON d.id=$2 WHERE p.id=$1', [plan.id, decision.id])).rows[0];
    assert.deepEqual(saved, { plan_status: 'approved', item_status: 'planned', outcome: 'accepted' });
    assert.equal((await call(`/decisions/${decision.id}`, { cookie, body: { action: 'approve' } })).status, 409);
  } finally { await db.end(); }
});

test('a plan with one item rejected and the last one approved ends approved', { skip: !URL && 'set DATABASE_URL_TEST' }, async () => {
  const db = new pg.Pool({ connectionString: URL });
  try {
    const subject = (await db.query("SELECT id FROM astronauts WHERE callsign='KWAME'")).rows[0].id;
    const plan = (await db.query("INSERT INTO treatment_plans(astronaut_id,created_by,urgency,status) VALUES($1,'manager_agent','routine','awaiting_approval') RETURNING id", [subject])).rows[0];
    const ids = [];
    for (const position of [0, 1]) {
      const item = (await db.query("INSERT INTO treatment_plan_items(treatment_plan_id,position,action_type,description) VALUES($1,$2,'monitoring','Step') RETURNING id", [plan.id, position])).rows[0];
      ids.push((await db.query("INSERT INTO decisions(astronaut_id,decision_type,actor,evidence,outcome) VALUES($1,'plan_approval','manager_agent',$2,'proposed') RETURNING id", [subject, JSON.stringify({ treatmentPlanId: plan.id, treatmentPlanItemId: item.id })])).rows[0].id);
    }
    const { cookie } = await login('elena');
    assert.equal((await call(`/decisions/${ids[0]}`, { cookie, body: { action: 'reject' } })).status, 200);
    assert.equal((await call(`/decisions/${ids[1]}`, { cookie, body: { action: 'approve' } })).status, 200);
    assert.equal((await db.query('SELECT status FROM treatment_plans WHERE id=$1', [plan.id])).rows[0].status, 'approved');
  } finally { await db.end(); }
});

test('the watch opens one event per episode and closes it when the reading clears', { skip: !URL && 'set DATABASE_URL_TEST' }, async () => {
  const { saveWatchResult } = await import('./watch-save.js');
  const db = new pg.Pool({ connectionString: URL });
  try {
    const member = (await db.query("SELECT id,callsign,mission_id FROM astronauts WHERE callsign='MAYA'")).rows[0];
    const reading = { hr_mean: 128, bp_sys: 120, bp_dia: 78, spo2: 98, temp: 36.8, radiation: 0.2 };
    const flagged = { state: 'rest', flags: ['hr_high'], decision: { condition: 'tachycardia', tier: 3, action: 'alert_crewmate', medication: '', explanation: 'smoke test', first_response: 'Check on them', source: 'rules' } };
    const tick = async (result) => {
      const c = await db.connect();
      try { await c.query('BEGIN'); await c.query('SET LOCAL ROLE watch_service'); await saveWatchResult(c, member, reading, result); await c.query('COMMIT'); }
      catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    };
    const open = async () => (await db.query("SELECT count(*)::int AS n FROM condition_events WHERE astronaut_id=$1 AND reported_by='watch' AND status IN ('open','monitoring')", [member.id])).rows[0].n;
    await tick(flagged);
    await tick(flagged);
    assert.equal(await open(), 1, 'a reading that stays flagged does not open a second event');
    await tick({ state: 'rest', flags: [], decision: { condition: 'none' } });
    assert.equal(await open(), 0, 'a clear reading closes the episode');
  } finally { await db.end(); }
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
