import {HttpError,uuid} from './validation.js';
export const streams={vitals:['vital_samples','observed_at'],sleep:['sleep_sessions','started_at'],mental:['check_ins','completed_at'],checkins:['check_ins','started_at'],assessment:['health_assessments','assessed_at'],plan:['treatment_plans','created_at'],medications:['medication_events','proposed_at'],labs:['lab_results','collected_at'],events:['condition_events','started_at'],decisions:['decisions','decided_at']};
const fields={
  vitals:"id,astronaut_id,observed_at,source,activity,heart_rate_bpm,systolic_mmhg,diastolic_mmhg,spo2_percent,temperature_c,radiation_rate,radiation_rate_unit,sensor_status,COALESCE(payload->'flags','[]'::jsonb) AS flags",
  mental:'id,check_in_date,started_at,completed_at,status,mood_score,mental_health_score,updated_at',
  decisions:'id,astronaut_id,condition_event_id,decided_at,decision_type,actor,rationale,proposed_action,outcome,decided_by_astronaut_id,escalated_to_astronaut_id,updated_at',
};
function date(value){if(!value)return null;if(!Number.isFinite(Date.parse(value)))throw new HttpError(400,'Invalid history cursor.');return value;}
function sql(name,since,before,beforeId,limit,active){
  const [table,time]=streams[name];const changed=name==='vitals'?time:'updated_at';
  if(name==='plan')return `SELECT p.*,COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'position',i.position,'action_type',i.action_type,'description',i.description,'status',i.status,'starts_at',i.starts_at,'ends_at',i.ends_at) ORDER BY i.position) FILTER(WHERE i.id IS NOT NULL),'[]'::jsonb) AS items
    FROM treatment_plans p LEFT JOIN treatment_plan_items i ON i.treatment_plan_id=p.id WHERE p.astronaut_id=$1
    AND (${since} IS NULL OR p.updated_at>${since}) AND (${before} IS NULL OR (p.created_at,p.id)<(${before},COALESCE(${beforeId},'00000000-0000-0000-0000-000000000000'::uuid))) GROUP BY p.id ORDER BY p.created_at DESC,p.id DESC LIMIT ${limit+1}`;
  const activeFilter=name==='events'&&active?"AND status IN ('open','monitoring')":'';
  return `SELECT ${fields[name]||'*'} FROM ${table} WHERE astronaut_id=$1 AND (${since} IS NULL OR ${changed}>${since})
    AND (${before} IS NULL OR (${time},id)<(${before},COALESCE(${beforeId},'00000000-0000-0000-0000-000000000000'::uuid))) ${activeFilter}
    ${name==='mental'?'AND mental_health_score IS NOT NULL':''} ORDER BY ${time} DESC,id DESC LIMIT ${limit+1}`;
}
export async function readRecord(c,id,params) {
  const selected=params.get('streams')?.split(',')||Object.keys(streams);
  if(!selected.length || selected.some(s=>!streams[s]))throw new HttpError(400,'Unknown record stream.');
  const args=[id],pages={},limits={};
  const columns=[...new Set(selected)].map(name=>{
    const active=name==='events'&&params.get('activeEvents')==='true';
    const limit=active?1000:name==='vitals'?240:name==='checkins'?1:100;limits[name]=limit;
    const before=params.get(`before_${name}`)?.split('|');
    args.push(active?null:date(params.get(name)),date(before?.[0]),before?.[1]?uuid(before[1]):null);
    return `COALESCE((SELECT jsonb_agg(x) FROM (${sql(name,`$${args.length-2}::timestamptz`,`$${args.length-1}::timestamptz`,`$${args.length}::uuid`,limit,active)}) x),'[]'::jsonb) AS ${name}`;
  });
  columns.push("COALESCE((SELECT jsonb_agg(e ORDER BY e.started_at DESC) FROM condition_events e WHERE e.astronaut_id=$1 AND e.status IN ('open','monitoring')),'[]'::jsonb) AS \"_activeEvents\"");
  const out=(await c.query(`SELECT ${columns.join(',')}`,args)).rows[0];
  for(const name of Object.keys(limits)){
    const rows=out[name];const more=rows.length>limits[name];out[name]=rows.slice(0,limits[name]);
    const last=out[name].at(-1);
    pages[name]={hasMore:more,before:more?`${last[streams[name][1]]}|${last.id}`:null};
  }
  return {...out,_pages:pages};
}
export async function readTable(c,name,id,since,params=new URLSearchParams()) {
  if(!streams[name])throw new HttpError(404,'No such record stream.');
  const p=new URLSearchParams(params);p.set('streams',name);if(since)p.set(name,since);
  const out=await readRecord(c,id,p);return {items:out[name],nextCursor:out._pages[name].before};
}
