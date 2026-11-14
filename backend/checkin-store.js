import {HttpError} from './validation.js';

export async function saveCheckin(c,astr,date,data,messages) {
  // The same date may arrive from two tabs or an older worker may finish last.
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,32))',[`${astr}:${date}`]);
  const existing=(await c.query('SELECT * FROM check_ins WHERE astronaut_id=$1 AND check_in_date=$2 FOR UPDATE',[astr,date])).rows[0];
  if(existing?.status==='completed') return {checkInId:existing.id,completed:true,alreadyCompleted:true,
    message:{from:'agent',text:existing.agent_summary||'This check-in is already complete.',at:Date.now()},mental:{score:existing.mental_health_score}};
  if(existing?.transcript?.length>messages.length+1)throw new HttpError(409,'A newer check-in reply is already saved. Refresh the conversation.');
  if(data.completed && (!Number.isFinite(data.answers?.sleepHours) || data.answers.sleepHours<0 || data.answers.sleepHours>24
    || !Number.isFinite(data.mental?.score) || data.mental.score<0 || data.mental.score>100)) throw new HttpError(502,'The check-in response is incomplete. Please try again.');
  const transcript=[...messages,{from:'agent',text:data.message?.text||'',at:data.message?.at||Date.now()}];
  const q=await c.query(`INSERT INTO check_ins(astronaut_id,check_in_date,started_at,completed_at,status,mood_score,mental_health_score,reported_symptoms,agent_summary,transcript)
    VALUES($1,$2,now(),CASE WHEN $3 THEN now() ELSE NULL END,CASE WHEN $3 THEN 'completed' ELSE 'in_progress' END,$4,$4,$5,$6,$7::jsonb)
    ON CONFLICT(astronaut_id,check_in_date) DO UPDATE SET completed_at=EXCLUDED.completed_at,status=EXCLUDED.status,mood_score=EXCLUDED.mood_score,
      mental_health_score=COALESCE(EXCLUDED.mental_health_score,check_ins.mental_health_score),reported_symptoms=COALESCE(EXCLUDED.reported_symptoms,check_ins.reported_symptoms),agent_summary=EXCLUDED.agent_summary,transcript=EXCLUDED.transcript
    RETURNING id`,[astr,date,data.completed,data.mental?.score??null,data.answers?.symptoms??null,data.message?.text??null,JSON.stringify(transcript)]);
  const checkId=q.rows[0].id;
  const answers={...(data.answers||{}),...(data.mental?{mentalAnswers:data.mental.answers}:{})};
  for(const [key,value] of Object.entries(answers)) if(value!==undefined && value!==null) await c.query(`INSERT INTO check_in_answers(check_in_id,question_key,answer_text,answer_number) VALUES($1,$2,$3,$4)
    ON CONFLICT(check_in_id,question_key) DO UPDATE SET answer_text=EXCLUDED.answer_text,answer_number=EXCLUDED.answer_number,answered_at=now()`,
    [checkId,key,typeof value==='string'?value:typeof value==='object'?JSON.stringify(value):null,typeof value==='number'?value:null]);
  if(data.completed) await c.query(`INSERT INTO sleep_sessions(astronaut_id,source_check_in_id,started_at,ended_at,source,reported_hours,quality_score,notes)
    VALUES($1,$2,($3::date::timestamp AT TIME ZONE 'UTC')-interval '1 day',($3::date::timestamp AT TIME ZONE 'UTC')-interval '1 day'+($4*interval '1 hour'),'check_in',$4,$5,$6)
    ON CONFLICT(source_check_in_id) WHERE source_check_in_id IS NOT NULL DO NOTHING`,
    [astr,checkId,date,data.answers.sleepHours,data.answers.sleepRating?data.answers.sleepRating*20:null,'Reported for the preceding night; clock times not measured. '+(data.answers.symptoms||'')]);
  return {...data,checkInId:checkId};
}
