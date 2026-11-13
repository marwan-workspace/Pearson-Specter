'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { backendRequest, useSession } from '@/lib/session';

type Row=Record<string,any>;
type Message={from:'astronaut'|'agent';text:string;at:number};
const streams=['vitals','sleep','mental','checkins','assessment','plan','medications','labs','events','decisions'] as const;
const timeKey:Record<string,string>={vitals:'observed_at',sleep:'started_at',mental:'completed_at',checkins:'started_at',assessment:'assessed_at',plan:'created_at',medications:'proposed_at',labs:'collected_at',events:'started_at',decisions:'decided_at'};
const dateText=(v:any)=>v?new Date(v).toLocaleString():'—';
const friendly=(s:string)=>s.replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
const val=(v:any)=>v==null?'—':typeof v==='object'?JSON.stringify(v):String(v);

function Card({title,children}:{title:string;children:ReactNode}) {return <section className="panel p-5 md:p-6"><h2 className="title mb-4 text-lg">{title}</h2>{children}</section>;}
function Rows({items}:{items:Row[]}) {
  if(!items.length)return <p className="text-sm text-text-2">No records yet.</p>;
  return <div className="grid max-h-[420px] gap-2 overflow-auto">{items.slice(0,100).map((row,i)=><details key={row.id||i} className="rounded-xl border border-line px-4 py-3"><summary className="flex cursor-pointer list-none justify-between gap-3 text-sm"><b>{row.condition_key||row.panel_name||row.status||row.action_type||row.analyte||row.source||'Record'}</b><span className="label">{dateText(row.observed_at||row.started_at||row.assessed_at||row.created_at||row.proposed_at||row.collected_at||row.completed_at)}</span></summary><dl className="mt-3 grid gap-x-4 gap-y-2 border-t border-line pt-3 sm:grid-cols-2">{Object.entries(row).filter(([k])=>k!=='id').map(([k,v])=><div key={k} className="min-w-0"><dt className="label">{friendly(k)}</dt><dd className="break-words text-sm">{val(v)}</dd></div>)}</dl></details>)}</div>;
}

export function BackendRecord({astronautKey}:{astronautKey:string}) {
  const {me}=useSession();
  const [records,setRecords]=useState<Record<string,Row[]>>({}); const [cursor,setCursor]=useState<Record<string,string>>({});
  const [alerts,setAlerts]=useState<Row[]>([]); const [stock,setStock]=useState<Row[]>([]); const [decisions,setDecisions]=useState<Row[]>([]);
  const [command,setCommand]=useState<Row[]>([]);
  const [checkin,setCheckin]=useState<Message[]>([]); const [chat,setChat]=useState<Message[]>([]); const [entry,setEntry]=useState(''); const [busy,setBusy]=useState(false); const [notice,setNotice]=useState(''); const polling=useRef(false);
  const [panelName,setPanelName]=useState(''); const [analyte,setAnalyte]=useState(''); const [labValue,setLabValue]=useState(''); const [labUnit,setLabUnit]=useState('');
  const isSelf=me?.astronaut.callsign.toLowerCase()===astronautKey.toLowerCase();
  const loadStreams=useCallback(async(initial=false)=>{
    if(polling.current)return; polling.current=true;
    try {
      const next:Record<string,Row[]>= { ...records }; const nextCursor={...cursor};
      for(const name of streams) {
        const since=!initial?cursor[name]:undefined;
        const query=since?`?since=${encodeURIComponent(since)}`:'';
        const result=await backendRequest<{items:Row[]}>(`/astronauts/${encodeURIComponent(astronautKey)}/${name}${query}`);
        const items=result.items||[];
        if(initial) next[name]=items;
        else if(items.length) { const have=new Set((next[name]||[]).map(x=>x.id)); next[name]=[...items.filter(x=>!have.has(x.id)),...(next[name]||[])]; }
        const key=timeKey[name]; const latest=items.map(x=>x[key]).filter(Boolean).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
        if(latest&&(!nextCursor[name]||Date.parse(latest)>Date.parse(nextCursor[name]))) nextCursor[name]=latest;
      }
      setRecords(next);setCursor(nextCursor);
    } catch(e) { setNotice(e instanceof Error?e.message:'Could not load the astronaut record.'); }
    finally {polling.current=false;}
  },[astronautKey,records,cursor]);

  const loadRelated=useCallback(async()=>{
    try {
      const [a,s,d,ch,ci,cmd]=await Promise.all([
        backendRequest<{items:Row[]}>('/alerts'), backendRequest<{items:Row[]}>('/medications'),
        backendRequest<{items:Row[]}>('/decisions/pending'),
        isSelf?backendRequest<{items:Row[]}>(`/astronauts/${encodeURIComponent(astronautKey)}/chat`):Promise.resolve({items:[]}),
        backendRequest<{items:Row[]}>(`/astronauts/${encodeURIComponent(astronautKey)}/checkins`),
        backendRequest<{crew:Row[]}>('/command'),
      ]);
      setAlerts(a.items);setStock(s.items);setDecisions(d.items);setCommand(cmd.crew);
      const latestCheckin=ci.items.find(x=>Array.isArray(x.transcript)&&x.transcript.length);
      if(latestCheckin)setCheckin(latestCheckin.transcript.map((m:any)=>({from:m.from==='agent'?'agent':'astronaut',text:String(m.text||''),at:Number(m.at)||Date.now()})));
      if(ch.items[0]) setChat((ch.items[0].messages||[]).map((m:any)=>({from:m.speaker==='astronaut'?'astronaut':'agent',text:String(m.text||''),at:Date.parse(m.sentAt)||Date.now()})));
    } catch(e) {setNotice(e instanceof Error?e.message:'Could not load alerts and decisions.');}
  },[astronautKey,isSelf]);

  useEffect(()=>{void loadStreams(true);void loadRelated();const t=setInterval(()=>{void loadStreams(false);void loadRelated();},2000);return()=>clearInterval(t);},[loadStreams,loadRelated]);

  async function act(path:string,body:Row={}) {setBusy(true);setNotice('');try{await backendRequest(path,{method:'POST',body:JSON.stringify(body)});setNotice('Saved.');await Promise.all([loadStreams(true),loadRelated()]);}catch(e){setNotice(e instanceof Error?e.message:'Action failed.');}finally{setBusy(false);}}
  async function send(kind:'chat'|'checkin') {
    const text=entry.trim();if(!text||!me)return;const next=[...(kind==='chat'?chat:checkin),{from:'astronaut' as const,text,at:Date.now()}];
    (kind==='chat'?setChat:setCheckin)(next);setEntry('');setBusy(true);setNotice('');
    try {const result=await backendRequest<{message:{text:string;at?:number};completed?:boolean;mental?:Row}>(`/${kind}`,{method:'POST',body:JSON.stringify({astronautId:astronautKey,date:new Date().toISOString().slice(0,10),missedYesterday:false,messages:next.map(m=>({from:m.from,text:m.text}))})});
      const reply={from:'agent' as const,text:result.message.text,at:result.message.at||Date.now()};
      (kind==='chat'?setChat:setCheckin)([...next,reply]);setNotice(kind==='checkin'&&result.completed?'Check-in complete.':'Agent replied.');
      await loadStreams(true);
    } catch(e){setNotice(e instanceof Error?e.message:'The agent could not reply.');}
    finally{setBusy(false);}
  }
  async function submitLab(event:FormEvent) {
    event.preventDefault(); if(!analyte.trim()||!labUnit.trim()||!Number.isFinite(Number(labValue)))return;
    await act('/labs',{astronautId:astronautKey,panelName:panelName||'General',results:[{analyte,value:Number(labValue),unit:labUnit}]});
    setAnalyte('');setLabValue('');setLabUnit('');
  }
  const display=records;
  if(!me)return null;
  const title=astronautKey.toUpperCase();
  return <div className="grid gap-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="label text-text-2">{me.mission.name} · {isSelf?'your private record':`decider view · ${title}`}</p><h1 className="display mt-1 text-4xl">{title} health record</h1></div><div className="flex flex-wrap gap-2"><button className="btn btn-ghost" onClick={()=>void act('/assess',{astronautId:astronautKey,date:new Date().toISOString().slice(0,10)})} disabled={busy}>Run assessment</button>{me.isActingLeader&&<><button className="btn btn-ghost" onClick={()=>void act('/simulator/inject',{astronautId:astronautKey,condition:'bradycardia'})} disabled={busy}>Inject bradycardia</button><button className="btn btn-ghost" onClick={()=>void act('/simulator/sensor-fault',{astronautId:astronautKey})} disabled={busy}>Inject sensor fault</button></>}</div></div>
    {notice&&<p role="status" className="panel p-4 text-sm">{notice}</p>}
    {!isSelf&&!me.isActingLeader&&<p className="panel p-4 text-sm text-text-2">The database controls this record’s visibility for your account.</p>}
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Vitals · 24 hour stream"><Rows items={display.vitals||[]} /></Card>
      <Card title="Condition events"><Rows items={display.events||[]} /></Card>
      <Card title="Decision log"><Rows items={display.decisions||[]} /></Card>
      <Card title="Sleep"><Rows items={display.sleep||[]} /></Card>
      <Card title="Mental health and check-ins"><Rows items={display.mental||[]} /><div className="mt-4"><Rows items={display.checkins||[]} /></div></Card>
      <Card title="Root cause assessments"><Rows items={display.assessment||[]} /></Card>
      <Card title="Treatment plans"><Rows items={display.plan||[]} />{decisions.length>0&&<div className="mt-4 grid gap-2">{decisions.map(d=><div className="rounded-lg border border-line p-3" key={d.id}><p className="text-xs text-text-2">{d.subject_name||d.subject_callsign||d.astronaut_id}</p><p className="text-sm">{d.proposed_action||d.rationale}</p><div className="mt-2 flex gap-2"><a className="btn btn-ghost" href={`/astronaut/${String(d.subject_callsign||'').toLowerCase()}`}>Open record</a><button className="btn btn-primary" onClick={()=>void act(`/decisions/${d.id}`,{action:'approve'})}>Approve</button><button className="btn btn-ghost" onClick={()=>void act(`/decisions/${d.id}`,{action:'reject'})}>Reject</button></div></div>)}</div>}</Card>
      <Card title="Medication log and stock">
        <p className="mb-3 text-sm text-text-2">Inventory is empty until medically reviewed quantities and stock are configured; the backend will not record an unstocked dose as administered.</p>
        <Rows items={display.medications||[]} />
        <div className="mt-3 grid gap-2">{(display.medications||[]).map(m=><div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"><span>{m.status} · {dateText(m.proposed_at)}</span><span className="flex gap-2">{isSelf&&m.status==='proposed'&&<button className="btn btn-ghost" onClick={()=>void act(`/events/${m.id}/cancel`)}>Cancel</button>}{isSelf&&m.status==='awaiting_confirmation'&&<button className="btn btn-primary" onClick={()=>void act(`/events/${m.id}/confirm`)}>Confirm dose</button>}</span></div>)}</div>
        <div className="mt-4 grid gap-2">{stock.map(x=><p className="flex justify-between rounded-lg border border-line px-3 py-2 text-sm" key={x.name}><span>{x.name} · {x.route}</span><b>{val(x.quantity_on_hand)} {x.stock_unit}</b></p>)}</div>
      </Card>
      <Card title="Blood test results"><Rows items={display.labs||[]} /><form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={submitLab}><label className="grid gap-1 text-sm">Panel<input className="input" value={panelName} onChange={e=>setPanelName(e.target.value)} placeholder="Blood count" /></label><label className="grid gap-1 text-sm">Analyte<input className="input" value={analyte} onChange={e=>setAnalyte(e.target.value)} required /></label><label className="grid gap-1 text-sm">Value<input className="input" type="number" step="any" value={labValue} onChange={e=>setLabValue(e.target.value)} required /></label><label className="grid gap-1 text-sm">Unit<input className="input" value={labUnit} onChange={e=>setLabUnit(e.target.value)} required /></label><button className="btn btn-primary sm:col-span-2" disabled={busy}>Save lab result</button></form></Card>
      <Card title="Crew alerts"><div className="grid gap-3">{alerts.map(alert=><article key={alert.id} className="rounded-xl border border-line p-4"><p className="font-semibold">{alert.alert_text}</p>{alert.action_instructions&&<p className="mt-1 text-sm text-text-2">{alert.action_instructions}</p>}<p className="label mt-2">{dateText(alert.created_at)} · {alert.status}</p><div className="mt-3 flex gap-2">{alert.recipient_id===me.astronaut.id&&alert.status==='pending'&&<button className="btn btn-ghost" onClick={()=>void act(`/alerts/${alert.id}/ack`)}>Acknowledge</button>}{alert.recipient_id===me.astronaut.id&&alert.medication_event_id&&<button className="btn btn-primary" onClick={()=>void act(`/events/${alert.medication_event_id}/given`)}>Mark medication given</button>}</div></article>)}{!alerts.length&&<p className="text-sm text-text-2">No alerts.</p>}</div></Card>
      <Card title="Command chain"><ol className="grid gap-2">{command.map(c=><li key={c.id} className="flex justify-between rounded-lg border border-line px-3 py-2 text-sm"><span>#{c.command_rank} · {c.display_name}</span><b>{c.fit_for_command?'Fit':'Unfit'}</b></li>)}</ol></Card>
    </div>
    {isSelf&&<div className="grid gap-6 lg:grid-cols-2">
      <Card title="Daily check-in"><Chat messages={checkin} onSend={()=>void send('checkin')} value={entry} setValue={setEntry} busy={busy} /></Card>
      <Card title="Private manager-agent chat"><Chat messages={chat} onSend={()=>void send('chat')} value={entry} setValue={setEntry} busy={busy} /></Card>
    </div>}
  </div>;
}

function Chat({messages,onSend,value,setValue,busy}:{messages:Message[];onSend:()=>void;value:string;setValue:(v:string)=>void;busy:boolean}) {
  function submit(e:FormEvent){e.preventDefault();onSend();}
  return <><div className="grid max-h-72 gap-2 overflow-auto">{messages.slice(-20).map((m,i)=><p key={i} className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${m.from==='astronaut'?'ml-auto bg-space-3':'border border-line'}`}>{m.text}</p>)}{!messages.length&&<p className="text-sm text-text-2">Start a conversation. The server saves the result.</p>}</div><form className="mt-4 flex gap-2" onSubmit={submit}><input className="input min-w-0 flex-1" value={value} onChange={e=>setValue(e.target.value)} placeholder="Write a message…" /><button className="btn btn-primary" disabled={busy||!value.trim()}>Send</button></form></>;
}
