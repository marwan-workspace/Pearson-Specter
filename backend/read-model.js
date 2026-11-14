import {HttpError} from './validation.js';
const list=sql=>`COALESCE((SELECT jsonb_agg(x) FROM (${sql}) x),'[]'::jsonb)`;
const vital=`SELECT (to_jsonb(v)-'payload') || jsonb_build_object('flags',COALESCE(v.payload->'flags','[]'::jsonb)) FROM vital_samples v WHERE v.astronaut_id=m.id ORDER BY v.observed_at DESC LIMIT 1`;
const crew=`SELECT m.id,m.display_name,m.callsign,m.role,m.command_rank,m.fit_for_command,
  (${vital}) AS "latestVitals",
  (SELECT jsonb_build_object('id',ci.id,'mental_health_score',ci.mental_health_score,'status',ci.status,'check_in_date',ci.check_in_date) FROM check_ins ci WHERE ci.astronaut_id=m.id ORDER BY ci.check_in_date DESC LIMIT 1) AS "latestCheckIn",
  (SELECT count(*)::int FROM condition_events e WHERE e.astronaut_id=m.id AND e.status IN ('open','monitoring')) AS "openEvents",
  ${list("SELECT e.id,e.condition_key,e.reported_by,e.status,e.severity FROM condition_events e WHERE e.astronaut_id=m.id AND e.status IN ('open','monitoring') ORDER BY e.started_at DESC")} AS "activeEvents"
  FROM astronauts m WHERE m.mission_id=$1 AND m.active ORDER BY m.command_rank`;
const pending=`SELECT d.*,s.display_name AS subject_name,s.callsign AS subject_callsign FROM decisions d JOIN astronauts s ON s.id=d.astronaut_id
  WHERE d.outcome='proposed' AND d.decision_type NOT IN ('tier1_auto','watch_event')
    AND (d.decision_type<>'tier2_dose' OR d.escalated_to_astronaut_id IS NOT NULL)
    AND (decider_for(d.astronaut_id)=$2 OR d.escalated_to_astronaut_id=$2) ORDER BY d.decided_at`;
const reports=`SELECT r.id,r.mission_id,r.astronaut_id,r.report_type,r.created_at,r.period_start,r.period_end,r.status,r.summary,r.flagged_issues,r.sent_at,r.arrives_at,r.reply_due_at,
  ${list('SELECT x.id,x.received_at,x.sender,x.message FROM mission_command_replies x WHERE x.report_id=r.id ORDER BY x.received_at')} AS replies
  FROM mission_reports r ORDER BY r.created_at DESC LIMIT 50`;
const command=`SELECT acting_leader($1) AS "actingLeaderId",
  ${list('SELECT id,display_name,callsign,command_rank,fit_for_command,active FROM astronauts WHERE mission_id=$1 ORDER BY command_rank')} AS crew,
  (SELECT jsonb_build_object('destination',destination,'earth_link_available',earth_link_available,'earth_round_trip_seconds',earth_round_trip_seconds,'earth_review_seconds',earth_review_seconds) FROM missions WHERE id=$1) AS mission`;

export async function dashboard(c,a) {
  const q=await c.query(`SELECT ${list(crew)} AS crew,${list(pending)} AS decisions,${list(reports)} AS reports,
    (SELECT to_jsonb(cmd) FROM (${command}) cmd) AS command WHERE acting_leader($1)=$2`,[a.mission_id,a.id]);
  if(!q.rowCount)throw new HttpError(403,'Only the acting leader can do this.');
  return q.rows[0];
}
export async function related(c,a,subject,chat=false) {
  const q=await c.query(`SELECT
    ${list('SELECT ca.* FROM crew_alerts ca JOIN condition_events e ON e.id=ca.condition_event_id WHERE e.astronaut_id=$3 ORDER BY ca.created_at DESC LIMIT 100')} AS alerts,
    ${list("SELECT m.id,m.name,m.route,m.stock_unit,COALESCE(sum(i.quantity_on_hand),0) AS quantity_on_hand FROM medications m LEFT JOIN medication_inventory i ON i.medication_id=m.id AND i.mission_id=$1 AND (i.expires_on IS NULL OR i.expires_on>=CURRENT_DATE) WHERE m.active GROUP BY m.id ORDER BY m.name")} AS stock,
    ${list(`SELECT p.* FROM (${pending}) p WHERE p.astronaut_id=$3`)} AS pending,
    ${list('SELECT id,display_name,callsign,command_rank,fit_for_command,active FROM astronauts WHERE mission_id=$1 ORDER BY command_rank')} AS chain,
    (SELECT to_jsonb(conv) FROM (SELECT ac.id,
      ${list("SELECT CASE WHEN speaker='astronaut' THEN 'astronaut' ELSE 'agent' END AS \"from\",message_text AS text,(extract(epoch FROM sent_at)*1000)::bigint AS at FROM agent_messages WHERE conversation_id=ac.id ORDER BY sent_at LIMIT 100")} AS messages
      FROM agent_conversations ac WHERE ac.astronaut_id=$3 AND ac.astronaut_id=$2 AND $4::boolean ORDER BY ac.started_at DESC LIMIT 1) conv) AS chat`,[a.mission_id,a.id,subject,chat]);
  return q.rows[0];
}
