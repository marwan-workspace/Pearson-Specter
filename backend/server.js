import './env.js';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const scrypt = promisify(scryptCb);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = Number(process.env.PORT || 8000);
const COOKIE = 'crew_session';
const SESSION_MS = 12 * 60 * 60 * 1000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 12, idleTimeoutMillis: 30_000 });
const watchPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, idleTimeoutMillis: 30_000 });

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const sha256 = (v) => createHash('sha256').update(v).digest('hex');
const iso = (v) => v instanceof Date ? v.toISOString() : v;
const json = (res, status, value, headers = {}) => {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(body);
};
const cookie = (res, value, maxAge) => res.setHeader('set-cookie', `${COOKIE}=${value}; Path=/backend; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
const getCookie = (req) => (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
const parseBody = async (req) => {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 1_000_000) throw new HttpError(413, 'Request body is too large.'); chunks.push(chunk); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Request body must be valid JSON.'); }
};
const pinHash = async (pin, salt = randomBytes(16).toString('hex')) => `scrypt$${salt}$${(await scrypt(pin, salt, 64)).toString('hex')}`;
const pinMatches = async (pin, encoded) => {
  const [, salt, expected] = String(encoded || '').split('$');
  if (!salt || !expected) return false;
  const got = await scrypt(pin, salt, 64);
  const exp = Buffer.from(expected, 'hex');
  return got.length === exp.length && timingSafeEqual(got, exp);
};
const runPython = (args, input, timeoutMs = 65_000) => new Promise((resolve, reject) => {
  const bin = process.env.PYTHON_BIN || (process.platform === 'win32' ? path.join(ROOT, '.venv', 'Scripts', 'python.exe') : path.join(ROOT, '.venv', 'bin', 'python'));
  const child = spawn(bin, args, { cwd: ROOT, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  const timer = setTimeout(() => { child.kill(); reject(new HttpError(504, 'Python worker timed out.')); }, timeoutMs);
  child.stdout.on('data', (b) => { if (stdout.length < 2_000_000) stdout += b; });
  child.stderr.on('data', (b) => { if (stderr.length < 20_000) stderr += b; });
  child.on('error', (e) => { clearTimeout(timer); reject(new HttpError(503, `Could not start Python worker: ${e.message}`)); });
  child.on('close', (code) => {
    clearTimeout(timer);
    try { const result = JSON.parse(stdout.trim().split(/\r?\n/).pop() || 'null'); if (code === 0 && result && typeof result === 'object') resolve(result); else reject(new HttpError(502, result?.error || stderr.trim().split(/\r?\n/).pop() || 'Python worker failed.')); }
    catch { reject(new HttpError(502, `Python worker returned invalid JSON: ${stderr.trim().slice(-500)}`)); }
  });
  child.stdin.end(JSON.stringify(input));
});

async function appTransaction(token, fn) {
  const c = await pool.connect();
  try {
    // The whole session setup goes to the database as ONE message: with a remote database every round trip
    // costs a third of a second, and this ran five of them on every request. The statements still run in order.
    // tokenHash is safe to inline: sha256() always yields exactly 64 hex characters, whatever the cookie held.
    if (!token) await c.query('BEGIN; SET LOCAL ROLE app_user');
    else {
      const tokenHash = sha256(token);
      const results = await c.query(`BEGIN; SET LOCAL ROLE app_user;
        SELECT set_config('app.session_hash', '${tokenHash}', true);
        SELECT set_config('app.astronaut_id', COALESCE((SELECT astronaut_id::text FROM sessions
          WHERE token_hash='${tokenHash}' AND expires_at > now()), ''), true);
        SELECT a.*, m.name AS mission_name, m.destination, m.earth_round_trip_seconds,
          m.earth_link_available, m.earth_review_seconds
        FROM astronauts a JOIN missions m ON m.id=a.mission_id WHERE a.id=app_astronaut_id()`);
      const a = results[results.length - 1];
      if (!a.rowCount) throw new HttpError(401, 'Please sign in again.');
      c.astronaut = a.rows[0];
    }
    const out = await fn(c);
    await c.query('COMMIT'); return out;
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

async function watchTransaction(fn) {
  const c = await watchPool.connect();
  try { await c.query('BEGIN'); await c.query('SET LOCAL ROLE watch_service'); const out = await fn(c); await c.query('COMMIT'); return out; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

const actingLeader = async (c, missionId) => (await c.query('SELECT acting_leader($1) AS id', [missionId])).rows[0].id;
const deciderFor = async (c, id) => (await c.query('SELECT decider_for($1) AS id', [id])).rows[0].id;
const requireLeader = async (c) => { if (await actingLeader(c, c.astronaut.mission_id) !== c.astronaut.id) throw new HttpError(403, 'Only the acting leader can do this.'); };
const resolveAstronaut = async (c, key) => {
  const q = await c.query('SELECT id FROM astronauts WHERE mission_id=$2 AND (id::text=$1 OR lower(callsign)=lower($1))', [String(key), c.astronaut.mission_id]);
  if (!q.rowCount) throw new HttpError(404, 'Astronaut not found.');
  return q.rows[0].id;
};
const assertVisible = async (c, id) => {
  if (id !== c.astronaut.id && await deciderFor(c, id) !== c.astronaut.id) throw new HttpError(403, 'You cannot access this astronaut’s record.');
};

async function login(body, res) {
  const login = String(body.login || '').trim().toLowerCase(); const pin = String(body.pin || '');
  if (!login || !/^\d{4,12}$/.test(pin)) throw new HttpError(400, 'Enter a login and a 4 to 12 digit PIN.');
  const token = randomBytes(32).toString('base64url');
  const result = await appTransaction(null, async (c) => {
    const q = await c.query(`SELECT ac.id, ac.astronaut_id, ac.pin_hash, ac.failed_attempts, ac.locked
      FROM accounts ac WHERE lower(ac.login)=lower($1) FOR UPDATE`, [login]);
    if (!q.rowCount) { await pinMatches(pin, await pinHash('0000')); throw new HttpError(401, 'Login or PIN is incorrect.'); }
    const a = q.rows[0];
    if (a.locked || a.failed_attempts >= 5) throw new HttpError(423, 'This account is locked. Ask the acting leader to unlock it.');
    if (!(await pinMatches(pin, a.pin_hash))) {
      const failures = a.failed_attempts + 1;
      await c.query('UPDATE accounts SET failed_attempts=$2, locked=$3 WHERE id=$1', [a.id, failures, failures >= 5]);
      return { authError: failures >= 5 ? 423 : 401, message: failures >= 5 ? 'This account is locked after five incorrect PINs.' : 'Login or PIN is incorrect.' };
    }
    await c.query('UPDATE accounts SET failed_attempts=0 WHERE id=$1', [a.id]);
    await c.query('INSERT INTO sessions(token_hash, astronaut_id, expires_at) VALUES($1,$2,now()+($3 * interval \'1 millisecond\'))', [sha256(token), a.astronaut_id, SESSION_MS]);
    return { astronautId: a.astronaut_id };
  });
  if (result.authError) throw new HttpError(result.authError, result.message);
  cookie(res, token, Math.floor(SESSION_MS / 1000));
  return { ok: true, ...result };
}

async function readTable(c, table, id, since) {
  if(table==='plan') {
    const after=since&&Number.isFinite(Date.parse(since))?new Date(since).toISOString():null;
    const result=await c.query(`SELECT p.*,COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'position',i.position,'action_type',i.action_type,
      'description',i.description,'status',i.status,'starts_at',i.starts_at,'ends_at',i.ends_at) ORDER BY i.position) FILTER (WHERE i.id IS NOT NULL),'[]'::jsonb) AS items
      FROM treatment_plans p LEFT JOIN treatment_plan_items i ON i.treatment_plan_id=p.id
      WHERE p.astronaut_id=$1 AND ($2::timestamptz IS NULL OR p.created_at>$2)
      GROUP BY p.id ORDER BY p.created_at DESC LIMIT 500`,[id,after]);
    return {items:result.rows};
  }
  const spec = {
    vitals: ['vital_samples', 'observed_at'], sleep: ['sleep_sessions', 'started_at'], mental: ['check_ins', 'completed_at'],
    checkins: ['check_ins', 'started_at'], assessment: ['health_assessments', 'assessed_at'], plan: ['treatment_plans', 'created_at'],
    medications: ['medication_events', 'proposed_at'], labs: ['lab_results', 'collected_at'], events: ['condition_events', 'started_at'], decisions: ['decisions', 'decided_at'],
  }[table];
  if (!spec) throw new HttpError(404, 'No such astronaut data collection.');
  const [rel, time] = spec;
  const after = since && Number.isFinite(Date.parse(since)) ? new Date(since).toISOString() : null;
  const result = await c.query(`SELECT * FROM ${rel} WHERE astronaut_id=$1 AND ($2::timestamptz IS NULL OR ${time}>$2) ORDER BY ${time} DESC LIMIT 5000`, [id, after]);
  return { items: result.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k,v]) => [k, iso(v)]))) };
}

async function route(req, res, url) {
  const method = req.method || 'GET'; let pathName;
  try { pathName = decodeURIComponent(url.pathname.replace(/^\/backend\/?/, '/')); } catch { throw new HttpError(400, 'Malformed URL.'); }
  const body = ['POST','PUT','PATCH'].includes(method) ? await parseBody(req) : {};
  if (method === 'GET' && pathName === '/health') {
    try { const q = await pool.query('SELECT 1'); return { ok: q.rowCount === 1, service: 'javascript-backend', agent: process.env.GEMINI_API_KEY ? 'configured' : 'uses-python-worker' }; }
    catch { throw new HttpError(503, 'Database is unavailable.'); }
  }
  if (method === 'POST' && pathName === '/auth/login') return login(body, res);

  const token = getCookie(req);
  if (method === 'POST' && pathName === '/auth/logout') {
    if (token) await appTransaction(token, async (c) => { await c.query('DELETE FROM sessions WHERE token_hash=$1', [sha256(token)]); });
    cookie(res, '', 0); return { ok: true };
  }
  if (!token) throw new HttpError(401, 'Sign in to continue.');

  return appTransaction(token, async (c) => {
    const a = c.astronaut;
    if (method === 'GET' && pathName === '/me') {
      const leaderId = await actingLeader(c, a.mission_id); const deciderId = await deciderFor(c, a.id);
      return { astronaut: { id:a.id, name:a.display_name, callsign:a.callsign, role:a.role, rank:a.command_rank, fitForCommand:a.fit_for_command }, actingLeaderId:leaderId, isActingLeader:leaderId===a.id, deciderId, mission:{ id:a.mission_id, name:a.mission_name, destination:a.destination, earthLinkAvailable:a.earth_link_available, earthRoundTripSeconds:a.earth_round_trip_seconds, earthReviewSeconds:a.earth_review_seconds } };
    }
    const dataMatch = pathName.match(/^\/astronauts\/([^/]+)\/(vitals|sleep|mental|checkins|assessment|plan|medications|labs|events|decisions)$/);
    if (method === 'GET' && dataMatch) { const [, key, table] = dataMatch; const id=await resolveAstronaut(c,key); await assertVisible(c,id); return readTable(c,table,id,url.searchParams.get('since')); }
    if (method === 'GET' && pathName === '/crew/overview') {
      // One query, one round trip: the leader check and each member's latest reading, check-in and open events.
      // (It was 13 queries, which is over four seconds against a remote database, on a page that polls.)
      const q = await c.query(`SELECT m.id, m.display_name, m.callsign, m.role, m.command_rank, m.fit_for_command,
          (SELECT to_jsonb(v) FROM vital_samples v WHERE v.astronaut_id=m.id ORDER BY v.observed_at DESC LIMIT 1) AS "latestVitals",
          (SELECT to_jsonb(ci) FROM check_ins ci WHERE ci.astronaut_id=m.id ORDER BY ci.check_in_date DESC LIMIT 1) AS "latestCheckIn",
          (SELECT count(*)::int FROM condition_events e WHERE e.astronaut_id=m.id AND e.status IN ('open','monitoring')) AS "openEvents"
        FROM astronauts m WHERE m.mission_id=$1 AND m.active AND acting_leader(m.mission_id)=$2 ORDER BY m.command_rank`, [a.mission_id, a.id]);
      if (!q.rowCount) throw new HttpError(403, 'Only the acting leader can do this.');
      return { crew:q.rows, actingLeaderId:a.id };
    }
    if (method === 'GET' && pathName === '/decisions/pending') {
      const q = await c.query(`SELECT d.*,subject.callsign AS subject_callsign,subject.display_name AS subject_name
        FROM decisions d JOIN astronauts subject ON subject.id=d.astronaut_id WHERE d.outcome='proposed'
        AND d.decision_type NOT IN ('tier1_auto','watch_event')
        AND (d.decision_type<>'tier2_dose' OR d.escalated_to_astronaut_id IS NOT NULL)
        AND (decider_for(d.astronaut_id)=$1 OR d.escalated_to_astronaut_id=$1)
        ORDER BY d.decided_at`, [a.id]); return { items:q.rows };
    }
    const decisionMatch = pathName.match(/^\/decisions\/([^/]+)$/);
    if (method === 'POST' && decisionMatch) {
      if (!['approve','reject'].includes(body.action)) throw new HttpError(400,'Action must be approve or reject.');
      const pending=await c.query("SELECT id,decision_type FROM decisions WHERE id=$1 AND outcome='proposed'",[decisionMatch[1]]);
      if(body.action==='approve' && pending.rows[0]?.decision_type==='tier2_dose') {
        const dose=await c.query(`SELECT me.id FROM medication_events me JOIN medications m ON m.id=me.medication_id
          WHERE me.decision_id=$1 AND me.quantity IS NOT NULL AND me.quantity_unit=m.stock_unit
            AND EXISTS (SELECT 1 FROM medication_inventory i WHERE i.mission_id=me.mission_id
              AND i.medication_id=me.medication_id AND i.quantity_on_hand>=me.quantity
              AND (i.expires_on IS NULL OR i.expires_on>=CURRENT_DATE)) FOR UPDATE OF me`,[decisionMatch[1]]);
        if(!dose.rowCount) throw new HttpError(409,'This dose cannot be approved until its reviewed quantity and matching stock are configured.');
      }
      const q = await c.query(`UPDATE decisions SET outcome=$1, decided_by_astronaut_id=$2, decided_at=now()
        WHERE id=$3 AND outcome='proposed' AND decision_type NOT IN ('tier1_auto','watch_event')
          AND (decision_type<>'tier2_dose' OR escalated_to_astronaut_id IS NOT NULL)
          AND (decider_for(astronaut_id)=$2 OR escalated_to_astronaut_id=$2) RETURNING *`, [body.action==='approve'?'accepted':'rejected',a.id,decisionMatch[1]]);
      if (!q.rowCount) throw new HttpError(409,'This decision was already resolved or is not yours to decide.');
      const decision=q.rows[0];
      if(decision.decision_type==='tier2_dose') {
        const dose=await c.query(`UPDATE medication_events SET status=$2,
          confirmed_at=CASE WHEN $2='confirmed' THEN now() ELSE confirmed_at END,
          confirmed_by_astronaut_id=CASE WHEN $2='confirmed' THEN $3 ELSE confirmed_by_astronaut_id END
          WHERE decision_id=$1 AND status='awaiting_confirmation' RETURNING id`,[decision.id,body.action==='approve'?'confirmed':'declined',a.id]);
        if(!dose.rowCount) throw new HttpError(409,'The dose is no longer waiting for a decision.');
      }
      if(decision.decision_type==='plan_approval') {
        const evidence=decision.evidence||{}; const newStatus=body.action==='approve'?'active':'skipped';
        if(evidence.treatmentPlanItemId) await c.query('UPDATE treatment_plan_items SET status=$2 WHERE id=$1',[evidence.treatmentPlanItemId,newStatus]);
        if(evidence.treatmentPlanId) {
          const anyPending=await c.query("SELECT 1 FROM decisions WHERE outcome='proposed' AND evidence->>'treatmentPlanId'=$1 LIMIT 1",[evidence.treatmentPlanId]);
          if(!anyPending.rowCount) await c.query('UPDATE treatment_plans SET status=$2,approved_by_astronaut_id=$3,approved_at=now() WHERE id=$1',[evidence.treatmentPlanId,body.action==='approve'?'approved':'rejected',a.id]);
        }
      }
      return decision;
    }
    const eventMatch = pathName.match(/^\/events\/([^/]+)\/(cancel|confirm|given)$/);
    if (method === 'POST' && eventMatch) {
      const [, id, action] = eventMatch;
      if (action==='given') {
        const r=await c.query('SELECT administer_alerted_medication($1,$2) AS ok',[id,a.id]);
        if (!r.rows[0].ok) throw new HttpError(409,'The event is not assigned to you, has not been approved, or its 60 second approval window has not elapsed.');
        return {ok:true};
      }
      const q = await c.query('SELECT me.* FROM medication_events me WHERE me.id=$1 FOR UPDATE OF me',[id]);
      if (!q.rowCount) throw new HttpError(404,'Medication event not found.');
      const ev=q.rows[0];
      if (action==='cancel' || action==='confirm') {
        if (ev.astronaut_id !== a.id) throw new HttpError(403,'Only the astronaut can confirm or cancel this dose.');
        if (action==='cancel') {
          if (!ev.cancel_until || new Date(ev.cancel_until) < new Date()) throw new HttpError(409,'The cancel window has ended.');
          const r=await c.query("UPDATE medication_events SET status='cancelled',cancelled_at=now() WHERE id=$1 AND status IN ('proposed','awaiting_confirmation') RETURNING *",[id]);
          if (!r.rowCount) throw new HttpError(409,'This medication event is no longer open.');
          if(ev.decision_id) await c.query("UPDATE decisions SET outcome='cancelled',decided_by_astronaut_id=$2,decided_at=now() WHERE id=$1 AND outcome='proposed'",[ev.decision_id,a.id]);
          return r.rows[0];
        }
        const available=await c.query(`SELECT me.id FROM medication_events me JOIN medications m ON m.id=me.medication_id
          WHERE me.id=$1 AND me.quantity IS NOT NULL AND me.quantity_unit=m.stock_unit
            AND EXISTS (SELECT 1 FROM medication_inventory i WHERE i.mission_id=me.mission_id
              AND i.medication_id=me.medication_id AND i.quantity_on_hand>=me.quantity
              AND (i.expires_on IS NULL OR i.expires_on>=CURRENT_DATE)) FOR UPDATE OF me`,[id]);
        if(!available.rowCount) throw new HttpError(409,'This dose cannot be confirmed until its reviewed quantity and matching stock are configured.');
        if(ev.decision_id) {
          const d=await c.query("UPDATE decisions SET outcome='accepted',decided_by_astronaut_id=$2,decided_at=now() WHERE id=$1 AND outcome='proposed' AND decision_type='tier2_dose' AND astronaut_id=$2 RETURNING id",[ev.decision_id,a.id]);
          if(!d.rowCount) throw new HttpError(409,'This dose decision was already resolved.');
        }
        const r=await c.query("UPDATE medication_events SET status='confirmed',confirmed_at=now(),confirmed_by_astronaut_id=$2 WHERE id=$1 AND status='awaiting_confirmation' RETURNING *",[id,a.id]);
        if (!r.rowCount) throw new HttpError(409,'This dose is not waiting for confirmation.');
        return r.rows[0];
      }
    }
    if (method === 'GET' && pathName === '/alerts') {
      const q=await c.query(`SELECT ca.* FROM crew_alerts ca LEFT JOIN condition_events e ON e.id=ca.condition_event_id
        WHERE ca.recipient_id=$1 OR e.astronaut_id=$1 OR decider_for(e.astronaut_id)=$1
        ORDER BY ca.created_at DESC LIMIT 200`,[a.id]); return {items:q.rows};
    }
    const ackMatch=pathName.match(/^\/alerts\/([^/]+)\/ack$/);
    if (method==='POST' && ackMatch) { const q=await c.query("UPDATE crew_alerts SET status='acknowledged',acknowledged_at=now() WHERE id=$1 AND recipient_id=$2 AND status='pending' RETURNING *",[ackMatch[1],a.id]); if(!q.rowCount) throw new HttpError(404,'Alert not found or already acknowledged.'); return q.rows[0]; }
    if (method==='GET' && pathName==='/command') {
      const roster=await c.query('SELECT id,display_name,callsign,command_rank,fit_for_command,active FROM astronauts WHERE mission_id=$1 ORDER BY command_rank',[a.mission_id]);
      const handovers=await c.query('SELECT * FROM command_handovers WHERE mission_id=$1 ORDER BY created_at DESC LIMIT 100',[a.mission_id]);
      const mission=(await c.query('SELECT destination,earth_link_available,earth_round_trip_seconds,earth_review_seconds FROM missions WHERE id=$1',[a.mission_id])).rows[0];
      return { actingLeaderId:await actingLeader(c,a.mission_id), crew:roster.rows, handovers:handovers.rows, mission };
    }
    if(method==='POST' && pathName==='/command/earth-link') {
      await requireLeader(c);
      if(typeof body.available!=='boolean') throw new HttpError(400,'available must be a boolean.');
      const q=await c.query('SELECT set_mission_earth_link($1,$2,$3) AS ok',[a.mission_id,a.id,body.available]);
      if(!q.rows[0].ok) throw new HttpError(404,'Mission not found.');
      return {mission:(await c.query('SELECT earth_link_available,earth_round_trip_seconds,earth_review_seconds FROM missions WHERE id=$1',[a.mission_id])).rows[0]};
    }
    if(method==='POST' && pathName==='/command/location') {
      await requireLeader(c);
      if(!['iss','moon','mars'].includes(String(body.location||'').toLowerCase())) throw new HttpError(400,'location must be iss, moon, or mars.');
      const changed=await c.query('SELECT set_mission_location($1,$2,$3) AS ok',[a.mission_id,a.id,String(body.location).toLowerCase()]);
      if(!changed.rows[0].ok) throw new HttpError(404,'Mission not found.');
      return {mission:(await c.query('SELECT destination,earth_link_available,earth_round_trip_seconds,earth_review_seconds FROM missions WHERE id=$1',[a.mission_id])).rows[0]};
    }
    if (method==='POST' && pathName==='/command/handover') {
      await requireLeader(c); const roster=await c.query('SELECT id FROM astronauts WHERE mission_id=$1 AND active AND fit_for_command AND id<>$2 ORDER BY command_rank LIMIT 1',[a.mission_id,a.id]);
      if(!roster.rowCount) throw new HttpError(409,'There is no fit astronaut below the current leader.');
      const target=roster.rows[0].id; await c.query('UPDATE astronauts SET fit_for_command=false WHERE id=$1',[a.id]);
      await c.query('INSERT INTO command_handovers(mission_id,from_astronaut_id,to_astronaut_id,reason,trigger) VALUES($1,$2,$3,$4,\'voluntary\')',[a.mission_id,a.id,target,String(body.reason||'Voluntary handover')]);
      return {actingLeaderId:target};
    }
    if (method==='POST' && pathName==='/command/restore') {
      await requireLeader(c); const rank1=await c.query('SELECT id,fit_for_command FROM astronauts WHERE mission_id=$1 ORDER BY command_rank LIMIT 1',[a.mission_id]);
      if(!rank1.rowCount) throw new HttpError(409,'No command chain is configured.');
      await c.query('UPDATE astronauts SET fit_for_command=true WHERE id=$1',[rank1.rows[0].id]);
      await c.query('INSERT INTO command_handovers(mission_id,from_astronaut_id,to_astronaut_id,reason,trigger) VALUES($1,$2,$3,$4,\'restore\')',[a.mission_id,a.id,rank1.rows[0].id,String(body.reason||'Acting leader restored command')]);
      return {actingLeaderId:rank1.rows[0].id};
    }
    const unlock=pathName.match(/^\/accounts\/([^/]+)\/unlock$/);
    if(method==='POST' && unlock) {
      const leader=await actingLeader(c,a.mission_id); const target=await resolveAstronaut(c,unlock[1]);
      const targetLeader=leader===target;
      const allowed=targetLeader?await deciderFor(c,target)===a.id:a.id===leader;
      if(!allowed) throw new HttpError(403,'Only the acting leader, or their decider for the leader account, can unlock it.');
      const q=await c.query('UPDATE accounts SET failed_attempts=0,locked=false WHERE astronaut_id=$1 RETURNING astronaut_id',[target]);
      if(!q.rowCount) throw new HttpError(404,'Account not found.'); return {ok:true};
    }
    if(method==='GET' && pathName==='/reports') {
      // no raw_data: the list polls every 2 s and only shows summaries; GET /reports/:id has the full row
      const q=await c.query(`SELECT r.id,r.mission_id,r.astronaut_id,r.report_type,r.created_at,r.period_start,r.period_end,r.status,r.summary,
        r.flagged_issues,r.sent_at,r.arrives_at,r.reply_due_at,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'received_at',x.received_at,'sender',x.sender,'message',x.message) ORDER BY x.received_at)
        FROM mission_command_replies x WHERE x.report_id=r.id),'[]'::jsonb) AS replies
        FROM mission_reports r ORDER BY r.created_at DESC LIMIT 200`); return {items:q.rows};
    }
    const report=pathName.match(/^\/reports\/([^/]+)$/);
    if(method==='GET' && report) { const q=await c.query('SELECT * FROM mission_reports WHERE id=$1',[report[1]]); if(!q.rowCount) throw new HttpError(404,'Report not found.'); return q.rows[0]; }
    const chatRead=pathName.match(/^\/astronauts\/([^/]+)\/chat$/);
    if(method==='GET' && chatRead) {
      const subject=await resolveAstronaut(c,chatRead[1]);
      if(subject!==a.id) throw new HttpError(403,'Free-agent conversations are private to the astronaut.');
      const q=await c.query(`SELECT c.id,c.started_at,c.ended_at,c.summary,
        COALESCE(jsonb_agg(jsonb_build_object('speaker',m.speaker,'text',m.message_text,'sentAt',m.sent_at) ORDER BY m.sent_at) FILTER (WHERE m.id IS NOT NULL),'[]'::jsonb) AS messages
        FROM agent_conversations c LEFT JOIN agent_messages m ON m.conversation_id=c.id
        WHERE c.astronaut_id=$1 GROUP BY c.id ORDER BY c.started_at DESC LIMIT 20`,[subject]); return {items:q.rows};
    }
    if(method==='POST' && pathName==='/labs') {
      const subject=await resolveAstronaut(c,body.astronautId||a.id); await assertVisible(c,subject);
      const tests=Array.isArray(body.results)?body.results:[];
      if(!tests.length || tests.length>100) throw new HttpError(400,'Provide 1 to 100 lab result rows.');
      const rows=[];
      for(const x of tests) {
        if(!x.analyte || !Number.isFinite(Number(x.value)) || !x.unit) throw new HttpError(400,'Each lab result needs analyte, numeric value, and unit.');
        const q=await c.query(`INSERT INTO lab_results(astronaut_id,entered_by_astronaut_id,collected_at,panel_name,analyte,value,unit,reference_low,reference_high,source_notes)
          VALUES($1,$2,COALESCE($3::timestamptz,now()),$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[subject,a.id,body.collectedAt||null,String(body.panelName||'General').slice(0,100),String(x.analyte).slice(0,100),Number(x.value),String(x.unit).slice(0,30),x.referenceLow??null,x.referenceHigh??null,x.notes??null]);
        rows.push(q.rows[0]);
      }
      return {items:rows};
    }
    if(method==='GET' && pathName==='/medications') {
      const q=await c.query(`SELECT m.id,m.name,m.route,m.stock_unit,COALESCE(sum(i.quantity_on_hand),0) AS quantity_on_hand
        FROM medications m LEFT JOIN medication_inventory i ON i.medication_id=m.id AND i.mission_id=$1
          AND (i.expires_on IS NULL OR i.expires_on>=CURRENT_DATE)
        WHERE m.active GROUP BY m.id ORDER BY m.name`,[a.mission_id]); return {items:q.rows};
    }
    if(method==='GET' && pathName==='/rules') {
      const q=await c.query(`SELECT rs.name AS rule_set,rs.version,r.condition_key,r.response_tier,r.enabled,r.probability,r.threshold,r.response
        FROM rule_sets rs JOIN rules r ON r.rule_set_id=rs.id
        WHERE (rs.mission_id IS NULL OR rs.mission_id=$1) AND rs.status='active' ORDER BY rs.created_at DESC,r.condition_key`,[a.mission_id]);
      return {items:q.rows};
    }
    if(method==='POST' && ['/checkin','/chat','/assess','/weekly','/emergency'].includes(pathName)) return runAgent(c,pathName.slice(1),body);
    if(method==='POST' && pathName==='/simulator/inject') { await requireLeader(c); return inject(c,body.astronautId,body.condition); }
    if(method==='POST' && pathName==='/simulator/sensor-fault') {
      await requireLeader(c); const subject=await resolveAstronaut(c,body.astronautId);
      const q=await c.query('SELECT simulate_sensor_fault($1) AS event_id',[subject]); return {eventId:q.rows[0].event_id};
    }
    throw new HttpError(404,'Backend endpoint not found.');
  });
}

// Gemini gets one summary row per hour or day, not the watch's one row per minute (1,440 a day per astronaut)
const vitalSummary=async(c,id,bucket,from,to)=>(await c.query(`SELECT date_trunc($2,observed_at) AS period,count(*)::int AS samples,
    round(avg(heart_rate_bpm)::numeric,1) AS hr_avg,min(heart_rate_bpm) AS hr_min,max(heart_rate_bpm) AS hr_max,
    round(avg(systolic_mmhg)::numeric) AS sys_avg,min(systolic_mmhg) AS sys_min,max(systolic_mmhg) AS sys_max,round(avg(diastolic_mmhg)::numeric) AS dia_avg,
    min(spo2_percent) AS spo2_min,round(avg(spo2_percent)::numeric,1) AS spo2_avg,max(temperature_c) AS temp_max,max(radiation_rate) AS radiation_max,
    count(*) FILTER (WHERE sensor_status<>'ok')::int AS sensor_problems
  FROM vital_samples WHERE astronaut_id=$1 AND observed_at>=$3::timestamptz AND observed_at<$4::timestamptz GROUP BY 1 ORDER BY 1`,[id,bucket,from,to])).rows;

async function runAgent(c, command, body) {
  const astr=body.astronautId ? await resolveAstronaut(c,body.astronautId) : '';
  if(command==='weekly') {
    await requireLeader(c);
    const members=(await c.query('SELECT id FROM astronauts WHERE mission_id=$1 AND active ORDER BY command_rank',[c.astronaut.mission_id])).rows;
    const start=body.periodStart || new Date(Date.now()-7*864e5).toISOString().slice(0,10); const end=body.periodEnd || new Date().toISOString().slice(0,10);
    if(![start,end].every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d)))||start>end) throw new HttpError(400,'periodStart and periodEnd must be dates (YYYY-MM-DD), start first.');
    const astronauts=[]; const dayAfterEnd=new Date(Date.parse(end)+864e5).toISOString().slice(0,10);
    for(const m of members) {
      const [checkins,vitals,sleep,events,decisions,medications,plans]=await Promise.all([
        c.query('SELECT * FROM check_ins WHERE astronaut_id=$1 AND check_in_date BETWEEN $2 AND $3',[m.id,start,end]),
        vitalSummary(c,m.id,'day',start,dayAfterEnd),
        c.query('SELECT * FROM sleep_sessions WHERE astronaut_id=$1 AND started_at >= $2::date AND started_at < ($3::date + 1)',[m.id,start,end]),
        c.query('SELECT * FROM condition_events WHERE astronaut_id=$1 AND started_at >= $2::date AND started_at < ($3::date + 1)',[m.id,start,end]),
        c.query('SELECT * FROM decisions WHERE astronaut_id=$1 AND decided_at >= $2::date AND decided_at < ($3::date + 1)',[m.id,start,end]),
        c.query('SELECT * FROM medication_events WHERE astronaut_id=$1 AND proposed_at >= $2::date AND proposed_at < ($3::date + 1)',[m.id,start,end]),
        c.query(`SELECT p.*,COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.position) FILTER(WHERE i.id IS NOT NULL),'[]'::jsonb) AS items
          FROM treatment_plans p LEFT JOIN treatment_plan_items i ON i.treatment_plan_id=p.id
          WHERE p.astronaut_id=$1 AND p.created_at >= $2::date AND p.created_at < ($3::date + 1) GROUP BY p.id`,[m.id,start,end]),
      ]);
      astronauts.push({id:m.id,checkIns:checkins.rows,vitals,sleep:sleep.rows,events:events.rows,decisions:decisions.rows,medications:medications.rows,plans:plans.rows});
    }
    const data=await runPython(['-m','overview','weekly'],{periodStart:start,periodEnd:end,astronauts});
    const q=await c.query(`INSERT INTO mission_reports(mission_id,astronaut_id,report_type,period_start,period_end,status,summary,raw_data,flagged_issues)
      VALUES($1,$2,'weekly',$3,$4,'queued',$5,$6::jsonb,$7::jsonb)
      ON CONFLICT (mission_id,astronaut_id,report_type,period_start) WHERE report_type='weekly'
      DO UPDATE SET period_end=EXCLUDED.period_end,summary=EXCLUDED.summary,raw_data=EXCLUDED.raw_data,flagged_issues=EXCLUDED.flagged_issues
      RETURNING *`,[c.astronaut.mission_id,c.astronaut.id,start,end,JSON.stringify(data.summary),JSON.stringify(data.rawData),JSON.stringify(data.flagged)]);
    return { ...data, id:q.rows[0].id };
  }
  if(!astr) throw new HttpError(400,'astronautId is required.'); await assertVisible(c,astr);
  if(command!=='assess' && astr!==c.astronaut.id) throw new HttpError(403,'This agent action is available only for your own astronaut account.');
  if(command==='assess') {
    const [vital,sleep,mental,checks,events]=await Promise.all([
      vitalSummary(c,astr,'hour',new Date(Date.now()-864e5).toISOString(),new Date().toISOString()),
      c.query('SELECT * FROM sleep_sessions WHERE astronaut_id=$1 ORDER BY started_at DESC LIMIT 7',[astr]),
      c.query('SELECT * FROM check_ins WHERE astronaut_id=$1 ORDER BY check_in_date DESC LIMIT 1',[astr]),
      c.query('SELECT * FROM check_in_answers WHERE check_in_id=(SELECT id FROM check_ins WHERE astronaut_id=$1 ORDER BY check_in_date DESC LIMIT 1)',[astr]),
      c.query("SELECT * FROM condition_events WHERE astronaut_id=$1 AND started_at>now()-interval '24 hours' ORDER BY started_at DESC",[astr]),
    ]);
    const day={astronautId:astr,date:body.date||new Date().toISOString().slice(0,10),vitals24h:vital,sleep:sleep.rows,
      mental:mental.rows[0]?{score:mental.rows[0].mental_health_score}:null,checkIn:{record:mental.rows[0]||null,answers:checks.rows},watchEvents:events.rows};
    const data=await runPython(['-m','overview','assess'],day);
    const assessment=(await c.query(`INSERT INTO health_assessments(astronaut_id,window_start,window_end,root_cause_summary,contributing_data,urgency)
      VALUES($1,now()-interval '24 hours',now(),$2,$3::jsonb,$4) RETURNING id`,[astr,data.rootCause.problem,JSON.stringify({rootCause:data.rootCause}),data.urgency])).rows[0];
    const planStatus=data.plan.some(p=>p.approval!=='not-required')?'awaiting_approval':'active';
    const plan=(await c.query(`INSERT INTO treatment_plans(astronaut_id,health_assessment_id,created_by,urgency,status,rationale)
      VALUES($1,$2,'manager_agent',$3,$4,$5) RETURNING id`,[astr,assessment.id,data.urgency,planStatus,data.rootCause.problem])).rows[0];
    for(let i=0;i<data.plan.length;i++) {
      const p=data.plan[i]; const status=p.approval==='not-required'?'active':'planned';
      const item=(await c.query(`INSERT INTO treatment_plan_items(treatment_plan_id,position,action_type,description,status) VALUES($1,$2,$3,$4,$5) RETURNING id`,[plan.id,i,p.kind,p.text,status])).rows[0];
      if(p.approval!=='not-required') await c.query(`INSERT INTO decisions(astronaut_id,decision_type,actor,rationale,evidence,proposed_action,outcome)
        VALUES($1,'plan_approval','manager_agent',$2,$3::jsonb,$4,'proposed')`,[astr,p.text,JSON.stringify({treatmentPlanId:plan.id,treatmentPlanItemId:item.id}),p.text]);
    }
    return { ...data, assessmentId:assessment.id, planId:plan.id };
  }
  if(command==='checkin') {
    const messages=Array.isArray(body.messages)?body.messages:[];
    const data=await runPython(['-m','overview','checkin'],{...body,astronautId:astr});
    const date=body.date||new Date().toISOString().slice(0,10);
    const transcript=[...messages,{from:'agent',text:data.message?.text||'',at:data.message?.at||Date.now()}];
    // sleep is stored once, by the message that completes the check-in, not again for every later message
    const wasCompleted=(await c.query('SELECT status FROM check_ins WHERE astronaut_id=$1 AND check_in_date=$2',[astr,date])).rows[0]?.status==='completed';
    const q=await c.query(`INSERT INTO check_ins(astronaut_id,check_in_date,started_at,completed_at,status,mood_score,mental_health_score,reported_symptoms,agent_summary,transcript)
      VALUES($1,$2,now(),CASE WHEN $3 THEN now() ELSE NULL END,CASE WHEN $3 THEN 'completed' ELSE 'in_progress' END,$4,$5,$6,$7,$8::jsonb)
      ON CONFLICT(astronaut_id,check_in_date) DO UPDATE SET completed_at=EXCLUDED.completed_at,status=EXCLUDED.status,mood_score=EXCLUDED.mood_score,
        mental_health_score=COALESCE(EXCLUDED.mental_health_score,check_ins.mental_health_score),reported_symptoms=COALESCE(EXCLUDED.reported_symptoms,check_ins.reported_symptoms),agent_summary=EXCLUDED.agent_summary,transcript=EXCLUDED.transcript RETURNING id`,
        [astr,date,data.completed,data.mental?.score??null,data.mental?.score??null,data.answers?.symptoms??null,data.message?.text??null,JSON.stringify(transcript)]);
    const checkId=q.rows[0].id;
    const answers={...(data.answers||{}),...(data.mental?{mentalAnswers:data.mental.answers}:{})};
    // lists (the five mental-health answers) are kept as JSON text; neither value column could hold them before
    for(const [key,value] of Object.entries(answers)) if(value!==undefined&&value!==null) await c.query(`INSERT INTO check_in_answers(check_in_id,question_key,answer_text,answer_number) VALUES($1,$2,$3,$4)
      ON CONFLICT(check_in_id,question_key) DO UPDATE SET answer_text=EXCLUDED.answer_text,answer_number=EXCLUDED.answer_number,answered_at=now()`,[checkId,key,typeof value==='string'?value:typeof value==='object'?JSON.stringify(value):null,typeof value==='number'?value:null]);
    if(data.completed&&!wasCompleted&&Number.isFinite(data.answers?.sleepHours)) await c.query(`INSERT INTO sleep_sessions(astronaut_id,started_at,ended_at,source,reported_hours,quality_score,notes)
      VALUES($1,now()-interval '1 day',now()-interval '1 day'+($2*interval '1 hour'),'check_in',$2,$3,$4)`,[astr,data.answers.sleepHours,data.answers.sleepRating?data.answers.sleepRating*20:null,data.answers.symptoms]);
    return { ...data, checkInId:checkId };
  }
  if(command==='chat') {
    const vitals=await vitalSummary(c,astr,'hour',new Date(Date.now()-864e5).toISOString(),new Date().toISOString());
    const mental=await c.query('SELECT mental_health_score FROM check_ins WHERE astronaut_id=$1 AND mental_health_score IS NOT NULL ORDER BY check_in_date DESC LIMIT 1',[astr]);
    const data=await runPython(['-m','overview','chat'],{...body,context:{vitals24h:vitals,mental:mental.rows[0]||null}});
    const safeSummary=mental.rows[0]?.mental_health_score==null?'Private manager-agent chat closed.':`Private manager-agent chat closed; latest mental-health score is ${mental.rows[0].mental_health_score}/100.`;
    // the client sends the whole history each turn: keep one conversation and store only what is new
    const messages=Array.isArray(body.messages)?body.messages:[];
    let convId=body.conversationId?(await c.query('SELECT id FROM agent_conversations WHERE id::text=$1 AND astronaut_id=$2',[String(body.conversationId),astr])).rows[0]?.id:null;
    const reused=!!convId;
    if(reused) await c.query('UPDATE agent_conversations SET summary=$2,ended_at=now() WHERE id=$1',[convId,safeSummary]);
    else convId=(await c.query(`INSERT INTO agent_conversations(astronaut_id,channel,status,summary,ended_at) VALUES($1,'dashboard','closed',$2,now()) RETURNING id`,[astr,safeSummary])).rows[0].id;
    for(const m of reused?messages.slice(-1):messages) await c.query(`INSERT INTO agent_messages(conversation_id,speaker,message_text) VALUES($1,$2,$3)`,[convId,m.from==='astronaut'?'astronaut':'manager_agent',String(m.text||'').slice(0,8000)]);
    await c.query(`INSERT INTO agent_messages(conversation_id,speaker,message_text) VALUES($1,'manager_agent',$2)`,[convId,String(data.message?.text||'')]);
    return { ...data, conversationId:convId };
  }
  if(command==='emergency') {
    const data=await runPython(['-m','overview','emergency'],body);
    const result=await c.query(`INSERT INTO mission_reports(mission_id,astronaut_id,report_type,summary,raw_data,flagged_issues)
      VALUES($1,$2,'emergency',$3,$4::jsonb,$5::jsonb) RETURNING *`,[c.astronaut.mission_id,astr,data.summary?.[astr]||'Emergency event',JSON.stringify(data.rawData||{}),JSON.stringify(data.flagged||[])]);
    return { ...data, id:result.rows[0].id };
  }
  throw new HttpError(404,'Unknown agent command.');
}

async function inject(c, astronautId, condition) {
  if(!astronautId || !condition) throw new HttpError(400,'astronautId and condition are required.');
  const subject=await resolveAstronaut(c,astronautId);
  const q=await c.query('SELECT simulate_condition($1,$2) AS event_id',[subject,String(condition).toLowerCase().replace(/-/g,'_')]);
  return {eventId:q.rows[0].event_id};
}

const BASELINES = {
  elena:{hr:62,sys:116,dia:74,spo2:98,temp:36.7}, kwame:{hr:72,sys:120,dia:78,spo2:98,temp:36.8},
  hiro:{hr:66,sys:128,dia:82,spo2:97,temp:36.6}, maya:{hr:60,sys:112,dia:70,spo2:99,temp:36.7},
};
const jitter=(n,spread)=>Number((n+(Math.random()-.5)*spread).toFixed(1));

async function watchTick() {
  const crew=await watchTransaction(async c => (await c.query(`SELECT a.id,a.callsign,a.mission_id,lower(m.destination) AS location
    FROM astronauts a JOIN missions m ON m.id=a.mission_id WHERE a.active ORDER BY a.mission_id,a.command_rank`)).rows);
  if(!crew.length) return;
  const inputs=[];
  for(const member of crew) {
    const b=BASELINES[member.callsign.toLowerCase()] || {hr:68,sys:118,dia:76,spo2:98,temp:36.7};
    const reading={hr_mean:jitter(b.hr,5),hr_std:jitter(1.8,1),acc_std:jitter(1.1,.8),eda_mean:jitter(.35,.2),eda_slope:jitter(0,.04),
      temp_mean:jitter(32,.4),temp:jitter(b.temp,.4),bp_sys:jitter(b.sys,8),bp_dia:jitter(b.dia,6),spo2:jitter(b.spo2,1.2),radiation:jitter(.25,.1),location:member.location};
    const lastDoseRows=await watchTransaction(async c => (await c.query(`SELECT ce.condition_key,extract(epoch from max(me.administered_at)) AS at
      FROM medication_events me JOIN condition_events ce ON ce.id=me.condition_event_id
      WHERE me.astronaut_id=$1 AND me.status='administered' AND me.administered_at>now()-interval '1 day' GROUP BY ce.condition_key`,[member.id])).rows);
    inputs.push({reading,lastDose:Object.fromEntries(lastDoseRows.map(r=>[r.condition_key,Number(r.at)]))});
  }
  // one Python process per tick: scikit-learn and the model load once, not once per astronaut
  let results;
  try { results=(await runPython(['-m','watch.backend_worker'],{crew:inputs},12_000*crew.length)).results; }
  // a server-side failure says nothing about the astronauts' watches: log it, raise no crew alert
  catch(e) { console.error('watch worker:',e.message); return; }
  for(const [i,member] of crew.entries()) {
    const {reading}=inputs[i]; const result=results[i];
    const decision=result.decision; const metric={hr:reading.hr_mean,sys:reading.bp_sys,dia:reading.bp_dia,spo2:reading.spo2,temp:reading.temp,radiation:reading.radiation};
    await watchTransaction(async c=>{
      await c.query(`INSERT INTO vital_samples(astronaut_id,observed_at,source,activity,heart_rate_bpm,systolic_mmhg,diastolic_mmhg,spo2_percent,temperature_c,radiation_rate,radiation_rate_unit,sensor_status,payload)
        VALUES($1,now(),'watch',$2,$3,$4,$5,$6,$7,$8,'µSv/h',$9,$10::jsonb)`,[member.id,result.state,metric.hr,metric.sys,metric.dia,metric.spo2,metric.temp,metric.radiation,result.flags.includes('sensor_fault')?'fault':'ok',JSON.stringify({reading,flags:result.flags})]);
      const current=!result.flags.length || decision.condition==='none' ? '' : decision.condition;
      // one event per episode: close watch events whose condition has cleared, and do not repeat one still open
      await c.query(`UPDATE condition_events SET status='resolved',ended_at=now() WHERE astronaut_id=$1 AND reported_by='watch'
        AND status IN ('open','monitoring') AND condition_key<>$2`,[member.id,current]);
      if(!current) return;
      if((await c.query(`SELECT 1 FROM condition_events WHERE astronaut_id=$1 AND reported_by='watch' AND condition_key=$2
        AND status IN ('open','monitoring')`,[member.id,current])).rowCount) return;
      const rule=(await c.query(`SELECT r.id FROM rules r JOIN rule_sets rs ON rs.id=r.rule_set_id WHERE rs.mission_id=$1 AND rs.status='active' AND r.condition_key=$2 AND r.enabled ORDER BY rs.created_at DESC LIMIT 1`,[member.mission_id,decision.condition])).rows[0];
      const severity=decision.tier===1?'critical':decision.tier===2?'high':'moderate';
      const ev=(await c.query(`INSERT INTO condition_events(astronaut_id,started_at,condition_key,severity,reported_by,summary)
        VALUES($1,now(),$2,$3,'watch',$4) RETURNING id`,[member.id,decision.condition,severity,decision.explanation])).rows[0];
      // the first stocked drug named in the rule's text: "lorazepam or midazolam" -> lorazepam (tests/test_watch.py checks every rule)
      const medicationId=['low_oxygen','sensor_fault'].includes(decision.condition)?null:(await c.query(`SELECT id FROM medications
        WHERE strpos(lower($1),lower(name))>0 ORDER BY strpos(lower($1),lower(name)) LIMIT 1`,[String(decision.medication||'')])).rows[0]?.id||null;
      const decisionType=decision.tier===1?'tier1_auto':decision.tier===2?'tier2_dose':medicationId?'tier3_medication':'watch_event';
      const outcome=decisionType==='watch_event'?'accepted':'proposed';
      const d=(await c.query(`INSERT INTO decisions(astronaut_id,condition_event_id,rule_id,decision_type,actor,rationale,evidence,proposed_action,outcome)
      VALUES($1,$2,$3,$4,'watch_llm',$5,$6::jsonb,$7,$8) RETURNING id`,[member.id,ev.id,rule?.id||null,decisionType,decision.explanation,JSON.stringify({reading,flags:result.flags,activity:result.state,source:decision.source}),decision.action,outcome])).rows[0];
      let medicationEventId=null;
      if(medicationId) {
        const status=decision.action==='auto_inject'?'proposed':decision.action==='ask_confirm'?'awaiting_confirmation':'crew_action_required';
        const cancelUntil=decision.action==='auto_inject'?new Date(Date.now()+15_000):null;
        medicationEventId=(await c.query(`INSERT INTO medication_events(astronaut_id,mission_id,medication_id,condition_event_id,decision_id,proposed_at,cancel_until,status,notes)
          VALUES($1,$2,$3,$4,$5,now(),$6,$7,$8) RETURNING id`,[member.id,member.mission_id,medicationId,ev.id,d.id,cancelUntil,status,decision.explanation])).rows[0].id;
      }
      const recipients=await c.query('SELECT id FROM astronauts WHERE mission_id=$1 AND active AND id<>$2',[member.mission_id,member.id]);
      if(decision.tier===1||decision.tier===3) for(const r of recipients.rows) await c.query(`INSERT INTO crew_alerts(condition_event_id,medication_event_id,recipient_id,alert_text,action_instructions)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(condition_event_id,recipient_id) DO NOTHING`,[ev.id,medicationEventId,r.id,`${member.callsign} needs help: ${decision.condition}`,`${decision.first_response}${decision.medication?`. ${decision.medication}`:''}`]);
      // same text as overview.agent.emergency_report, built here so no Python process runs inside this transaction
      if(decision.tier===1 || decision.condition==='low_oxygen') await c.query(`INSERT INTO mission_reports(mission_id,astronaut_id,report_type,summary,raw_data,flagged_issues)
        VALUES($1,$2,'emergency',$3,$4::jsonb,$5::jsonb)`,[member.mission_id,member.id,`${decision.condition}: ${decision.action}, ${decision.medication||'no medication'}. ${decision.explanation}`,
        JSON.stringify({decision,reading}),JSON.stringify([decision.condition])]);
    });
  }
}

async function processDeadlines() {
  await watchTransaction(async c=>{
    await c.query('DELETE FROM sessions WHERE expires_at<now()');
    const reports=await c.query(`UPDATE mission_reports SET status='replied'
      WHERE status='sent' AND reply_due_at<=now() RETURNING id,report_type`);
    for(const report of reports.rows) {
      const message=report.report_type==='emergency'
        ? 'Emergency report received. Continue the onboard response and monitoring; send an update if the condition changes.'
        : 'Weekly report received. Onboard treatment decisions remain with the crew. Mission command has recorded the report for review.';
      await c.query(`INSERT INTO mission_command_replies(report_id,sender,message,instructions)
        VALUES($1,'Mission command (simulated)',$2,'{}'::jsonb)`,[report.id,message]);
    }
    await c.query(`UPDATE decisions d SET outcome='completed',decided_at=now()
      WHERE d.outcome='proposed' AND EXISTS (SELECT 1 FROM medication_events me WHERE me.decision_id=d.id AND me.status='administered')`);
    const due=await c.query(`SELECT id,astronaut_id,mission_id,condition_event_id,decision_id FROM medication_events
      WHERE status='proposed' AND cancel_until<=now() FOR UPDATE`);
    for(const event of due.rows) {
      const result=await c.query('SELECT administer_watch_medication($1) AS ok',[event.id]);
      if(!result.rows[0].ok) {
        await c.query(`UPDATE medication_events SET status='unavailable',notes=concat_ws(' ',notes,
          'Dose withheld: reviewed dose quantity and matching on-board stock are required.') WHERE id=$1 AND status='proposed'`,[event.id]);
        await c.query(`UPDATE decisions SET outcome='rejected',decided_at=now(),rationale=concat_ws(' ',rationale,
          'Dose withheld because reviewed quantity and matching stock are not configured.') WHERE id=$1 AND outcome='proposed'`,[event.decision_id]);
        await c.query(`UPDATE crew_alerts SET action_instructions=concat_ws(' ',action_instructions,
          'Medication dose withheld pending reviewed dose and inventory configuration.') WHERE condition_event_id=$1`,[event.condition_event_id]);
        await c.query("UPDATE condition_events SET status='monitoring' WHERE id=$1",[event.condition_event_id]);
        continue;
      }
      await c.query("UPDATE condition_events SET status='monitoring' WHERE id=$1",[event.condition_event_id]);
      await c.query("UPDATE crew_alerts SET status='resolved' WHERE condition_event_id=$1",[event.condition_event_id]);
      const leader=await actingLeader(c,event.mission_id);
      if(leader===event.astronaut_id) {
        const next=(await c.query(`SELECT id FROM astronauts WHERE mission_id=$1 AND active AND fit_for_command AND id<>$2 ORDER BY command_rank LIMIT 1`,[event.mission_id,leader])).rows[0];
        if(next) {
          await c.query('UPDATE astronauts SET fit_for_command=false WHERE id=$1',[leader]);
          await c.query('INSERT INTO command_handovers(mission_id,from_astronaut_id,to_astronaut_id,reason,trigger,decision_id) VALUES($1,$2,$3,$4,\'tier1_given\',$5)',[event.mission_id,leader,next.id,'Tier 1 medication administered after cancel window',event.decision_id]);
        }
      }
    }
    const tier2=await c.query(`UPDATE decisions d SET escalated_from_astronaut_id=d.astronaut_id,
      escalated_to_astronaut_id=decider_for(d.astronaut_id)
      WHERE d.outcome='proposed' AND d.decision_type='tier2_dose' AND d.escalated_to_astronaut_id IS NULL
        AND d.decided_at<=now()-interval '60 seconds' AND decider_for(d.astronaut_id) IS NOT NULL RETURNING id`);
    const plans=await c.query(`SELECT d.id,d.astronaut_id,decider_for(d.astronaut_id) AS current_decider,a.mission_id
      FROM decisions d JOIN astronauts a ON a.id=d.astronaut_id
      WHERE d.outcome='proposed' AND d.decision_type='plan_approval' AND d.escalated_to_astronaut_id IS NULL
        AND d.decided_at<=now()-interval '12 hours'`);
    for(const d of plans.rows) {
      const next=(await c.query(`SELECT id FROM astronauts WHERE mission_id=$1 AND active AND fit_for_command
        AND command_rank>(SELECT command_rank FROM astronauts WHERE id=$2) ORDER BY command_rank LIMIT 1`,[d.mission_id,d.current_decider])).rows[0];
      if(!next) continue;
      await c.query('UPDATE decisions SET escalated_from_astronaut_id=$2,escalated_to_astronaut_id=$3 WHERE id=$1 AND escalated_to_astronaut_id IS NULL',[d.id,d.current_decider,next.id]);
      await c.query(`INSERT INTO command_handovers(mission_id,from_astronaut_id,to_astronaut_id,reason,trigger,decision_id)
        VALUES($1,$2,$3,'Treatment plan approval timed out; this decision moved down one position','timeout',$4)`,[d.mission_id,d.current_decider,next.id,d.id]);
    }
    return tier2.rowCount;
  });
}

let watchBusy=false;
async function backgroundTick() {
  if(watchBusy) return; watchBusy=true;
  try { await watchTick(); } catch(e) { console.error('background watch tick:',e); }
  finally { watchBusy=false; }
}
let deadlineBusy=false;
async function deadlineTick() {
  if(deadlineBusy) return; deadlineBusy=true;
  try { await processDeadlines(); } catch(e) { console.error('background deadline tick:',e); }
  finally { deadlineBusy=false; }
}

const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const result = await route(req,res,url);
    if (!res.headersSent) json(res,200,result);
  } catch(e) {
    if(res.headersSent) { res.destroy(); return; }
    const status=e instanceof HttpError?e.status:500;
    if(status===500) console.error(e);
    json(res,status,{error:status===500?'Internal server error.':e.message});
  }
});

server.listen(PORT, () => console.log(`JavaScript backend listening on http://localhost:${PORT}/backend`));
if(process.env.WATCH_ENABLED!=='false') {
  setInterval(backgroundTick, Math.max(5000,Number(process.env.WATCH_TICK_MS||60_000)));
  setInterval(deadlineTick, 1_000);
  void deadlineTick();
  void backgroundTick();
}
process.on('SIGTERM', async () => { server.close(); await Promise.all([pool.end(),watchPool.end()]); process.exit(0); });
