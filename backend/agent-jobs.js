import {createHash} from 'node:crypto';
import {HttpError,uuid} from './validation.js';
const view=row=>({id:row.id,status:row.status,command:row.command,createdAt:row.created_at,startedAt:row.started_at,...(row.status==='succeeded'?{result:row.result}:{}),...(row.status==='failed'?{error:row.error}:{})});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export class AgentJobs {
  constructor(transaction,run,{concurrency=2,capacity=32}={}) {this.transaction=transaction;this.run=run;this.concurrency=concurrency;this.capacity=capacity;this.active=0;this.draining=false;}
  async enqueue(c,actor,sessionHash,command,input,requestKey) {
    uuid(requestKey);
    await c.query('SELECT pg_advisory_xact_lock(724810003)');
    const fingerprint=createHash('sha256').update(JSON.stringify(canonical({command,input}))).digest('hex');
    const existing=(await c.query("SELECT * FROM agent_jobs WHERE astronaut_id=$1 AND (request_key=$2 OR (fingerprint=$3 AND status IN ('queued','running'))) ORDER BY created_at DESC LIMIT 1",[actor,requestKey,fingerprint])).rows[0];
    if(existing){if(existing.request_key===requestKey && existing.fingerprint!==fingerprint)throw new HttpError(409,'This request ID belongs to a different request.');return view(existing);}
    const counts=(await c.query("SELECT agent_queue_depth() AS total,count(*)::int AS own FROM agent_jobs WHERE astronaut_id=$1 AND status IN ('queued','running')",[actor])).rows[0];
    if(counts.total>=this.capacity)throw new HttpError(503,'The service is busy. Please try again shortly.');
    if(counts.own>=2)throw new HttpError(429,'Your previous requests are still being processed. Wait for them to finish.');
    const row=(await c.query('INSERT INTO agent_jobs(astronaut_id,request_key,fingerprint,session_hash,command,input) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[actor,requestKey,fingerprint,sessionHash,command,input])).rows[0];
    return view(row);
  }
  async get(c,id) {const row=(await c.query('SELECT * FROM agent_jobs WHERE id=$1',[uuid(id)])).rows[0];if(!row)throw new HttpError(404,'Request not found. Refresh the record before trying again.');return view(row);}
  start(){this.timer=setInterval(()=>{if(Date.now()>=(this.nextCheck||0))void this.drain();},2000);this.timer.unref();void this.drain();}
  wake(){this.nextCheck=0;void this.drain();}
  stop(){clearInterval(this.timer);}
  async drain(){
    if(this.draining||this.active>=this.concurrency)return;this.draining=true;
    try {
      while(this.active<this.concurrency){
        const job=await this.transaction(async c=>{
          await c.query('SELECT pg_advisory_xact_lock(724810003)');
          await c.query("UPDATE agent_jobs SET status='failed',finished_at=now(),error='The worker was interrupted. Refresh the record before retrying.' WHERE status='running' AND started_at<now()-interval '3 minutes'");
          await c.query("DELETE FROM agent_jobs WHERE finished_at<now()-interval '1 day'");
          const counts=(await c.query("SELECT count(*) FILTER(WHERE status='running')::int AS running,count(*) FILTER(WHERE status='queued')::int AS queued FROM agent_jobs WHERE status IN ('queued','running')")).rows[0];
          if(counts.running>=this.concurrency)return null;
          // Oldest first, and a strict global running limit even with multiple backend processes.
          return (await c.query("UPDATE agent_jobs SET status='running',started_at=now() WHERE id=(SELECT id FROM agent_jobs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *")).rows[0];
        });
        if(!job){this.nextCheck=Date.now()+15000;break;}
        this.active++;
        void this.execute(job).finally(()=>{this.active--;void this.drain();});
      }
    }catch(e){console.error('agent job queue:',e.message);}finally{this.draining=false;}
  }
  async execute(job){
    try {
      const result=await this.run({sessionHash:job.session_hash},job.command,job.input);
      await this.transaction(c=>c.query("UPDATE agent_jobs SET status='succeeded',result=$2,finished_at=now() WHERE id=$1 AND status='running'",[job.id,result]));
    }catch(e){
      console.error('agent job failed:',job.id,job.command,e.message);
      const error=e instanceof HttpError?e.message:'The request could not be completed. Refresh the record and try again.';
      await this.transaction(c=>c.query("UPDATE agent_jobs SET status='failed',error=$2,finished_at=now() WHERE id=$1 AND status='running'",[job.id,error])).catch(err=>console.error('agent job persistence:',err.message));
    }
  }
}
