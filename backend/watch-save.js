// One watch reading for one astronaut, written in the caller's transaction (role watch_service): the vitals row,
// and one condition event per episode, with its decision, dose, crew alerts and emergency report.
// Its own module so backend/smoke.test.js can drive it with a fixed result, no Python or Gemini needed.
import { readFileSync } from 'node:fs';
const rules=JSON.parse(readFileSync(new URL('../watch/rules.json',import.meta.url),'utf8'));
export async function saveWatchResult(c, member, reading, result) {
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,31))",[member.id]);
  // Repair linked actions left open by older releases, without changing administered medication history.
  await c.query(`WITH closed AS (SELECT id FROM condition_events WHERE astronaut_id=$1 AND status IN ('resolved','false_alarm')),
    alerts AS (UPDATE crew_alerts SET status='resolved' WHERE condition_event_id IN (SELECT id FROM closed) AND status IN ('pending','acknowledged')),
    doses AS (UPDATE medication_events SET status='cancelled',cancelled_at=now(),notes=concat_ws(' ',notes,'Closed event; pending action reconciled.')
      WHERE condition_event_id IN (SELECT id FROM closed) AND status IN ('proposed','awaiting_confirmation','confirmed','crew_action_required'))
    UPDATE decisions SET outcome='cancelled',decided_at=now(),rationale=concat_ws(' ',rationale,'Closed event; pending action reconciled.')
      WHERE condition_event_id IN (SELECT id FROM closed) AND outcome='proposed'`,[member.id]);
  const decision=result.decision; const metric={hr:reading.hr_mean,sys:reading.bp_sys,dia:reading.bp_dia,spo2:reading.spo2,temp:reading.temp,radiation:reading.radiation};
  await c.query(`INSERT INTO vital_samples(astronaut_id,observed_at,source,activity,heart_rate_bpm,systolic_mmhg,diastolic_mmhg,spo2_percent,temperature_c,radiation_rate,radiation_rate_unit,sensor_status,payload)
    VALUES($1,now(),'watch',$2,$3,$4,$5,$6,$7,$8,'µSv/h',$9,$10::jsonb)`,[member.id,result.state,metric.hr,metric.sys,metric.dia,metric.spo2,metric.temp,metric.radiation,result.flags.includes('sensor_fault')?'fault':'ok',JSON.stringify({reading,flags:result.flags})]);
  const current=!result.flags.length || decision.condition==='none' ? '' : decision.condition;
  // A different winning condition is not proof that an earlier condition cleared. A faulty sensor is
  // not proof of physiological recovery either. Close an episode only after its own flag clears.
  const episodes=(await c.query(`SELECT id,condition_key FROM condition_events WHERE astronaut_id=$1
    AND reported_by='watch' AND status IN ('open','monitoring')`,[member.id])).rows;
  for(const episode of episodes) {
    const rule=rules.conditions.find(r=>r.name===episode.condition_key);
    if(rule && !result.flags.includes(rule.flag) && (episode.condition_key==='sensor_fault' || !result.flags.includes('sensor_fault')))
      await c.query('SELECT close_condition_event($1,$2)',[episode.id,'Resolved after a valid watch reading cleared the flag.']);
  }
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
}
