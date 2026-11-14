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
import {randomUUID} from 'node:crypto';

const URL = process.env.DATABASE_URL_TEST;
if(!URL&&(process.env.CI||process.env.REQUIRE_DB_TESTS))throw new Error('DATABASE_URL_TEST is required; database tests must not be skipped in CI.');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8099, BASE = `http://localhost:${PORT}/backend`, PIN = '1234';
const env = { ...process.env, DATABASE_URL: URL, PORT: String(PORT), WATCH_ENABLED: 'false', NODE_ENV:'test',AGENT_JOBS_DISABLED:'true',
  DEMO_PIN_ELENA: PIN, DEMO_PIN_KWAME: PIN, DEMO_PIN_HIRO: PIN, DEMO_PIN_MAYA: PIN };
let server;

before(async () => {
  if (!URL) {if(process.env.CI||process.env.REQUIRE_DB_TESTS)throw new Error('DATABASE_URL_TEST is required for database verification.');return;}
  execFileSync(process.execPath, ['migrate.js'], { cwd: HERE, env });
  execFileSync(process.execPath, ['seed-accounts.js'], { cwd: HERE, env });
  server = spawn(process.execPath, ['server.js'], { cwd: HERE, env });
  server.stderr.on('data', b=>process.stderr.write(b));
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
    const plan = (await db.query("INSERT INTO treatment_plans(astronaut_id,created_by,urgency,status,rationale) VALUES($1,'manager_agent','routine','awaiting_approval','Test plan') RETURNING id", [subject])).rows[0];
    const item = (await db.query("INSERT INTO treatment_plan_items(treatment_plan_id,position,action_type,description) VALUES($1,0,'monitoring','Review the next watch reading') RETURNING id", [plan.id])).rows[0];
    const decision = (await db.query("INSERT INTO decisions(astronaut_id,decision_type,actor,evidence,outcome,rationale) VALUES($1,'plan_approval','manager_agent',$2,'proposed','Test decision') RETURNING id", [subject, JSON.stringify({ treatmentPlanId: plan.id, treatmentPlanItemId: item.id })])).rows[0];
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
    const plan = (await db.query("INSERT INTO treatment_plans(astronaut_id,created_by,urgency,status,rationale) VALUES($1,'manager_agent','routine','awaiting_approval','Test plan') RETURNING id", [subject])).rows[0];
    const ids = [];
    for (const position of [0, 1]) {
      const item = (await db.query("INSERT INTO treatment_plan_items(treatment_plan_id,position,action_type,description) VALUES($1,$2,'monitoring','Step') RETURNING id", [plan.id, position])).rows[0];
      ids.push((await db.query("INSERT INTO decisions(astronaut_id,decision_type,actor,evidence,outcome,rationale) VALUES($1,'plan_approval','manager_agent',$2,'proposed','Test decision') RETURNING id", [subject, JSON.stringify({ treatmentPlanId: plan.id, treatmentPlanItemId: item.id })])).rows[0].id);
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

async function withDb(fn){const db=new pg.Pool({connectionString:URL,max:4});try{return await fn(db);}finally{await db.end();}}
async function transaction(db,actor,fn,role='app_user'){
  const c=await db.connect();try{await c.query('BEGIN');await c.query(`SET LOCAL ROLE ${role}`);if(actor)await c.query("SELECT set_config('app.astronaut_id',$1,true)",[actor]);const out=await fn(c);await c.query('COMMIT');return out;}
  catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function planFixture(db,n=1,escalated=null){
  const crew=Object.fromEntries((await db.query('SELECT callsign,id FROM astronauts')).rows.map(x=>[x.callsign,x.id]));
  const plan=(await db.query("INSERT INTO treatment_plans(astronaut_id,created_by,urgency,status,rationale) VALUES($1,'manager_agent','routine','awaiting_approval','Regression fixture') RETURNING id",[crew.KWAME])).rows[0];
  const decisions=[];
  for(let i=0;i<n;i++){
    const item=(await db.query("INSERT INTO treatment_plan_items(treatment_plan_id,position,action_type,description) VALUES($1,$2,'monitoring','Regression fixture') RETURNING id",[plan.id,i])).rows[0];
    const d=(await db.query("INSERT INTO decisions(astronaut_id,decision_type,actor,rationale,evidence,outcome,escalated_to_astronaut_id) VALUES($1,'plan_approval','manager_agent','Regression fixture',$2,'proposed',$3) RETURNING id",[crew.KWAME,{treatmentPlanId:plan.id,treatmentPlanItemId:item.id},escalated?crew[escalated]:null])).rows[0];
    decisions.push({...d,itemId:item.id});
  }
  return{...plan,crew,decisions};
}

test('concurrent sibling approvals finalize the parent and duplicate clicks are rejected', {skip:!URL},async()=>withDb(async db=>{
  const p=await planFixture(db,2);const {cookie}=await login('elena');
  const results=await Promise.all(p.decisions.map(d=>call(`/decisions/${d.id}`,{cookie,body:{action:'approve'}})));
  assert.deepEqual(results.map(r=>r.status),[200,200]);
  assert.equal((await db.query('SELECT status FROM treatment_plans WHERE id=$1',[p.id])).rows[0].status,'approved');
  assert.equal((await call(`/decisions/${p.decisions[0].id}`,{cookie,body:{action:'approve'}})).status,409);
}));

test('an escalated recipient can reject only the linked plan item and finalize its plan', {skip:!URL},async()=>withDb(async db=>{
  const p=await planFixture(db,1,'HIRO');const {cookie}=await login('hiro');
  assert.equal((await call(`/decisions/${p.decisions[0].id}`,{cookie,body:{action:'reject'}})).status,200);
  const saved=(await db.query('SELECT p.status,i.status AS item FROM treatment_plans p JOIN treatment_plan_items i ON i.treatment_plan_id=p.id WHERE p.id=$1',[p.id])).rows[0];
  assert.deepEqual(saved,{status:'rejected',item:'skipped'});
  assert.equal((await call('/astronauts/kwame/record',{cookie})).status,403,'escalation does not grant access to the whole private record');
}));

const reading={hr_mean:125,bp_sys:120,bp_dia:78,spo2:98,temp:36.8,radiation:.2};
const flagged={state:'rest',flags:['hr_high'],decision:{condition:'tachycardia',tier:3,action:'alert_crewmate',medication:'adenosine',explanation:'Regression fixture',first_response:'Check the reading',source:'rules'}};
const calm={state:'rest',flags:[],decision:{condition:'none'}};
async function watchFixture(db,member,result){const {saveWatchResult}=await import('./watch-save.js');return transaction(db,null,c=>saveWatchResult(c,member,reading,result),'watch_service');}

test('recovery resolves the episode, alerts, unadministered medication and pending decision together', {skip:!URL},async()=>withDb(async db=>{
  const m=(await db.query("SELECT id,callsign,mission_id FROM astronauts WHERE callsign='HIRO'")).rows[0];
  await watchFixture(db,m,flagged);
  const event=(await db.query("SELECT id,updated_at FROM condition_events WHERE astronaut_id=$1 AND condition_key='tachycardia' AND status='open' ORDER BY started_at DESC LIMIT 1",[m.id])).rows[0];
  const {cookie}=await login('elena');
  assert.equal((await call(`/condition-events/${event.id}/resolve`,{cookie,body:{confirmed:true}})).status,409,'a watch alarm cannot be manually hidden');
  await watchFixture(db,m,calm);
  assert.equal((await db.query('SELECT status FROM condition_events WHERE id=$1',[event.id])).rows[0].status,'resolved');
  assert((await db.query('SELECT status FROM crew_alerts WHERE condition_event_id=$1',[event.id])).rows.every(r=>r.status==='resolved'));
  assert((await db.query('SELECT status FROM medication_events WHERE condition_event_id=$1',[event.id])).rows.every(r=>r.status==='cancelled'));
  assert((await db.query('SELECT outcome FROM decisions WHERE condition_event_id=$1',[event.id])).rows.every(r=>r.outcome==='cancelled'));
  const delta=await call(`/astronauts/hiro/record?streams=events&events=${encodeURIComponent(event.updated_at.toISOString())}`,{cookie});
  assert.equal(delta.status,200);assert(delta.data.events.some(e=>e.id===event.id&&e.status==='resolved'));assert.equal(delta.data._activeEvents.length,0);
}));

test('sensor failure and a second abnormal condition do not erase an existing physiological episode', {skip:!URL},async()=>withDb(async db=>{
  const m=(await db.query("SELECT id,callsign,mission_id FROM astronauts WHERE callsign='HIRO'")).rows[0];
  await watchFixture(db,m,flagged);
  await watchFixture(db,m,{state:'unknown',flags:['sensor_fault'],decision:{condition:'sensor_fault',tier:3,action:'alert_crewmate',medication:'',explanation:'Sensor unavailable',first_response:'Check sensor',source:'rules'}});
  assert.equal((await db.query("SELECT count(*)::int AS n FROM condition_events WHERE astronaut_id=$1 AND status='open' AND reported_by='watch'",[m.id])).rows[0].n,2);
  await watchFixture(db,m,flagged);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM condition_events WHERE astronaut_id=$1 AND status='open' AND reported_by='watch'",[m.id])).rows[0].n,1);
  await watchFixture(db,m,{state:'rest',flags:['hr_high','temp_high'],decision:{condition:'fever',tier:3,action:'alert_crewmate',medication:'acetaminophen',explanation:'Second flag',first_response:'Check temperature',source:'rules'}});
  assert.equal((await db.query("SELECT count(*)::int AS n FROM condition_events WHERE astronaut_id=$1 AND status='open' AND reported_by='watch'",[m.id])).rows[0].n,2,'selecting another condition does not erase a flag that is still raised');
  await watchFixture(db,m,calm);
}));

test('normal watch readings preserve simulator events until explicitly ended', {skip:!URL},async()=>withDb(async db=>{
  const {cookie}=await login('elena');const injected=await call('/simulator/inject',{cookie,body:{astronautId:'hiro',condition:'bradycardia'}});assert.equal(injected.status,200);
  const m=(await db.query("SELECT id,callsign,mission_id FROM astronauts WHERE callsign='HIRO'")).rows[0];await watchFixture(db,m,calm);
  assert.equal((await db.query('SELECT status FROM condition_events WHERE id=$1',[injected.data.eventId])).rows[0].status,'open');
  const outsider=(await login('maya')).cookie;
  assert.equal((await call(`/condition-events/${injected.data.eventId}/resolve`,{cookie:outsider,body:{confirmed:true}})).status,403);
  assert.equal((await call(`/condition-events/${injected.data.eventId}/resolve`,{cookie,body:{confirmed:true}})).status,200);
  assert.equal((await db.query('SELECT status FROM condition_events WHERE id=$1',[injected.data.eventId])).rows[0].status,'resolved');
}));

test('concurrent and late check-in replies produce one sleep record and cannot reopen completion', {skip:!URL},async()=>withDb(async db=>{
  const {saveCheckin}=await import('./checkin-store.js');const actor=(await db.query("SELECT id FROM astronauts WHERE callsign='MAYA'")).rows[0].id;
  const complete={completed:true,message:{text:'Complete'},mental:{score:85,answers:[]},answers:{sleepHours:7.5,sleepRating:4,symptoms:'none'}};
  await Promise.all([1,2].map(()=>transaction(db,actor,c=>saveCheckin(c,actor,'2026-11-12',complete,[]))));
  await transaction(db,actor,c=>saveCheckin(c,actor,'2026-11-12',{completed:false,message:{text:'Old reply'},answers:{}},[]));
  const q=(await db.query("SELECT ci.status,(SELECT count(*)::int FROM sleep_sessions WHERE source_check_in_id=ci.id) AS sleeps FROM check_ins ci WHERE astronaut_id=$1 AND check_in_date='2026-11-12'",[actor])).rows[0];
  assert.deepEqual(q,{status:'completed',sleeps:1});
}));

test('dashboard snapshot, tab-limited records and equal-timestamp history pagination work', {skip:!URL},async()=>withDb(async db=>{
  const {cookie}=await login('elena');const snapshot=await call('/dashboard',{cookie});assert.equal(snapshot.status,200);assert.equal(snapshot.data.crew.length,4);assert(snapshot.data.command.crew.length===4);
  const initial=await call('/astronauts/elena/record?streams=vitals,events&activeEvents=true',{cookie});assert.equal(initial.status,200);assert(!('assessment' in initial.data));assert(initial.data.vitals.every(v=>!('payload' in v)));
  const actor=snapshot.data.crew.find(c=>c.callsign==='ELENA').id;
  await db.query("INSERT INTO lab_results(astronaut_id,collected_at,panel_name,analyte,value,unit) SELECT $1,'2026-11-12','Regression fixture','test',n,'unit' FROM generate_series(1,125) n",[actor]);
  const page1=await call('/astronauts/elena/record?streams=labs',{cookie});assert.equal(page1.data.labs.length,100);
  const page2=await call(`/astronauts/elena/record?streams=labs&before_labs=${encodeURIComponent(page1.data._pages.labs.before)}`,{cookie});assert.equal(page2.data.labs.length,25);assert.equal(new Set([...page1.data.labs,...page2.data.labs].map(x=>x.id)).size,125);
  assert.equal((await call('/dashboard',{cookie:(await login('maya')).cookie})).status,403);
}));

test('bad body shapes, calendar dates, cursors and record IDs return 400 without server errors', {skip:!URL},async()=>{
  const {cookie}=await login('elena');
  const invalid=await fetch(BASE+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:'null'});assert.equal(invalid.status,400);
  assert.equal((await call('/reports/not-a-uuid',{cookie})).status,400);
  assert.equal((await call('/weekly',{cookie,body:{periodStart:'2026-02-30',periodEnd:'2026-03-03'}})).status,400);
  assert.equal((await call('/astronauts/elena/record?streams=unknown',{cookie})).status,400);
  assert.equal((await call('/astronauts/elena/record?streams=vitals&vitals=not-a-date',{cookie})).status,400);
});

test('agent jobs deduplicate requests, enforce capacity and isolate private results across actors', {skip:!URL},async()=>withDb(async db=>{
  const {AgentJobs}=await import('./agent-jobs.js');
  const crew=Object.fromEntries((await db.query('SELECT callsign,id FROM astronauts')).rows.map(x=>[x.callsign,x.id]));
  let release;const barrier=new Promise(resolve=>{release=resolve;});let calls=0;
  const tx=fn=>transaction(db,null,fn,'watch_service');
  const jobs=new AgentJobs(tx,async()=>{calls++;await barrier;return{answer:42};},{concurrency:1});
  const key=randomUUID(),input={astronautId:'hiro',date:'2026-11-14'};
  const enqueue=(actor,body,k=randomUUID(),queue=jobs)=>transaction(db,actor,c=>queue.enqueue(c,actor,'a'.repeat(64),'assess',body,k));
  const first=await enqueue(crew.HIRO,input,key);
  assert.equal((await enqueue(crew.HIRO,input)).id,first.id);
  assert.equal((await enqueue(crew.HIRO,{date:input.date,astronautId:input.astronautId})).id,first.id,'field order does not defeat deduplication');
  await assert.rejects(enqueue(crew.HIRO,{...input,date:'2026-11-13'},key),e=>e.status===409);
  await enqueue(crew.HIRO,{...input,date:'2026-11-13'});
  await assert.rejects(enqueue(crew.HIRO,{...input,date:'2026-11-12'}),e=>e.status===429);
  await assert.rejects(enqueue(crew.MAYA,input,randomUUID(),new AgentJobs(tx,()=>({}),{capacity:1})),e=>e.status===503);
  await assert.rejects(transaction(db,crew.MAYA,c=>jobs.get(c,first.id)),e=>e.status===404);
  await jobs.drain();
  const other=new AgentJobs(tx,async()=>{throw Error('A second worker must not run');},{concurrency:1});await other.drain();
  assert.equal(calls,1);release();
  const until=Date.now()+3000;
  while(Date.now()<until){const done=(await db.query("SELECT count(*)::int AS n FROM agent_jobs WHERE astronaut_id=$1 AND status='succeeded'",[crew.HIRO])).rows[0].n;if(done===2&&!jobs.active&&!jobs.draining)break;await new Promise(r=>setTimeout(r,10));}
  const saved=await transaction(db,crew.HIRO,c=>jobs.get(c,first.id));assert.equal(saved.status,'succeeded');assert.deepEqual(saved.result,{answer:42});assert(!('session_hash' in saved));
  assert.equal((await enqueue(crew.HIRO,input,key)).id,first.id,'a completed idempotent replay returns its original result');
  jobs.stop();other.stop();
}));

test('the upgrade repairs a historical rejected decision whose item and parent were left waiting', {skip:!URL},async()=>withDb(async db=>{
  const p=await planFixture(db,1,'HIRO');
  await db.query("UPDATE decisions SET outcome='rejected',decided_by_astronaut_id=$2 WHERE id=$1",[p.decisions[0].id,p.crew.HIRO]);
  await db.query(readFileSync(path.join(HERE,'../database/migrations/002_reliability.sql'),'utf8'));
  const saved=(await db.query('SELECT p.status,i.status AS item FROM treatment_plans p JOIN treatment_plan_items i ON i.treatment_plan_id=p.id WHERE p.id=$1',[p.id])).rows[0];
  assert.deepEqual(saved,{status:'rejected',item:'skipped'});
}));
