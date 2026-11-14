import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isDate,objectBody,uuid,RateLimiter,agentInput} from './validation.js';
test('calendar validation handles leap years and rejects normalized impossible dates',()=>{
  assert(isDate('2024-02-29'));for(const bad of ['0000-01-01','2026-02-29','2026-02-30','2026-04-31','2026-13-01','2026-1-01',null])assert(!isDate(bad));
});
test('HTTP boundary rejects non-object JSON, malformed IDs and oversized conversation fields',()=>{
  for(const body of [null,[],true,12,'text'])assert.throws(()=>objectBody(body),e=>e.status===400);
  assert.throws(()=>uuid('pending'),e=>e.status===400);
  assert.throws(()=>agentInput('chat',{messages:[{from:'astronaut',text:'x'.repeat(8001)}]}),e=>e.status===400);
  assert.throws(()=>agentInput('weekly',{periodEnd:'9999-01-01'}),e=>e.status===400);
});
test('rate limiting bounds abusive requests and expires the source window',()=>{
  const limiter=new RateLimiter(2,100);limiter.check('source',0);limiter.check('source',1);assert.throws(()=>limiter.check('source',2),e=>e.status===429);limiter.check('source',101);assert.equal(limiter.entries.size,1);
});
