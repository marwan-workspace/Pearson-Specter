'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useSession, backendRequest, dateText } from '@/lib/session';

type CrewRow = { id:string; display_name:string; callsign:string; role:string; command_rank:number; fit_for_command:boolean; latestVitals:Record<string,unknown>|null; latestCheckIn:Record<string,unknown>|null; openEvents:number };
type Decision = { id:string; astronaut_id:string; decision_type:string; rationale:string; proposed_action:string|null; decided_at:string; evidence:Record<string,unknown> };
type Report = { id:string; report_type:string; created_at:string; status:string; arrives_at:string|null; reply_due_at:string|null; summary:string|Record<string,string>; flagged_issues:string[]; replies:{id:string;received_at:string;sender:string;message:string}[] };
type Command = { mission:{destination:string;earth_link_available:boolean;earth_round_trip_seconds:number;earth_review_seconds:number} };
const n=(v:unknown,digits=0)=>typeof v==='number'?v.toFixed(digits):'—';

function Panel({title,children}:{title:string;children:ReactNode}) { return <section className="panel p-5 md:p-6"><h2 className="title mb-4 text-lg">{title}</h2>{children}</section>; }

export function BackendDashboard() {
  const { me, refresh:refreshMe }=useSession();
  const [crew,setCrew]=useState<CrewRow[]>([]); const [decisions,setDecisions]=useState<Decision[]>([]); const [reports,setReports]=useState<Report[]>([]); const [commandInfo,setCommandInfo]=useState<Command|null>(null);
  const [error,setError]=useState(''); const [notice,setNotice]=useState(''); const [busy,setBusy]=useState(false);
  async function refresh() {
    try {
      const [c,d,r,cmd]=await Promise.all([
        backendRequest<{crew:CrewRow[]}>('/crew/overview'),
        backendRequest<{items:Decision[]}>('/decisions/pending'),
        backendRequest<{items:Report[]}>('/reports'),
        backendRequest<Command>('/command'),
      ]);
      setCrew(c.crew);setDecisions(d.items);setReports(r.items);setCommandInfo(cmd);setError('');
    } catch(e) { setError(e instanceof Error?e.message:'Could not load mission data.'); }
  }
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),2000);return()=>clearInterval(timer);},[]);
  async function decide(id:string,action:'approve'|'reject') {
    try { await backendRequest(`/decisions/${id}`,{method:'POST',body:JSON.stringify({action})});setNotice(`Decision ${action}d.`);await refresh(); }
    catch(e){setNotice(e instanceof Error?e.message:'Could not decide.');}
  }
  async function command(action:'handover'|'restore') {
    setBusy(true);setNotice('');try{const r=await backendRequest<{actingLeaderId:string}>(`/command/${action}`,{method:'POST',body:JSON.stringify({reason:action==='handover'?'Voluntary team leader handover':'Acting leader restored command'})});setNotice(`Command updated. Acting leader: ${r.actingLeaderId}.`);await refreshMe();await refresh();}
    catch(e){setNotice(e instanceof Error?e.message:'Command update failed.');}finally{setBusy(false);}
  }
  async function weekly() {
    setBusy(true);setNotice('');
    try { await backendRequest('/weekly',{method:'POST',body:JSON.stringify({periodStart:new Date(Date.now()-7*864e5).toISOString().slice(0,10),periodEnd:new Date().toISOString().slice(0,10)})});setNotice('Weekly report saved to the mission report queue.');await refresh(); }
    catch(e){setNotice(e instanceof Error?e.message:'Could not write the weekly report.');}finally{setBusy(false);}
  }
  async function toggleEarthLink() {
    const available=!(commandInfo?.mission.earth_link_available??true);
    setBusy(true);setNotice('');
    try { await backendRequest('/command/earth-link',{method:'POST',body:JSON.stringify({available})});setNotice(available?'Earth link restored. Queued reports are now in transit.':'Earth link unavailable. New reports will queue.');await refreshMe();await refresh(); }
    catch(e){setNotice(e instanceof Error?e.message:'Could not change Earth link state.');}finally{setBusy(false);}
  }
  async function setLocation(location:string) {
    setBusy(true);setNotice('');
    try { await backendRequest('/command/location',{method:'POST',body:JSON.stringify({location})});setNotice(`Mission location set to ${location.toUpperCase()}.`);await refreshMe();await refresh(); }
    catch(e){setNotice(e instanceof Error?e.message:'Could not update mission location.');}finally{setBusy(false);}
  }
  if(!me?.isActingLeader) return <div className="panel p-6">Opening your private health record…</div>;
  return <div className="grid gap-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="label text-text-2">{me.mission.name} · acting team leader</p><h1 className="display mt-1 text-4xl">Crew overview</h1><p className="mt-2 text-sm text-text-2">Earth link: {commandInfo?.mission.earth_link_available?'Available':'Unavailable'} · one-way delay {((commandInfo?.mission.earth_round_trip_seconds??0)/2).toFixed(1)} s</p></div><div className="flex flex-wrap items-center gap-2"><label className="label">Location<select className="input mt-1" value={(commandInfo?.mission.destination||'Mars').toLowerCase()} onChange={e=>void setLocation(e.target.value)} disabled={busy}><option value="iss">ISS</option><option value="moon">Moon</option><option value="mars">Mars</option></select></label><button className="btn btn-ghost" onClick={()=>void toggleEarthLink()} disabled={busy}>{commandInfo?.mission.earth_link_available?'Simulate link loss':'Restore Earth link'}</button><button className="btn btn-ghost" onClick={()=>void command('handover')} disabled={busy}>Hand over command</button><button className="btn btn-ghost" onClick={()=>void command('restore')} disabled={busy}>Restore command</button><button className="btn btn-primary" onClick={()=>void weekly()} disabled={busy}>{busy?'Working…':'Write weekly report'}</button></div></div>
    {error&&<p role="alert" className="panel border-watch/40 p-4 text-watch">{error}</p>}{notice&&<p role="status" className="panel p-4 text-sm">{notice}</p>}
    <Panel title="Crew status"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="label border-b border-line text-text-2"><tr><th className="py-3">Crew member</th><th>Command</th><th>Latest HR</th><th>Blood oxygen</th><th>Last check-in</th><th>Open alerts</th></tr></thead><tbody>{crew.map(c=><tr key={c.id} className="border-b border-line/70"><td className="py-3"><Link className="font-semibold text-ink hover:underline" href={`/astronaut/${c.callsign.toLowerCase()}`}>{c.display_name}</Link><span className="ml-2 text-xs text-text-2">{c.role}</span></td><td>#{c.command_rank}{!c.fit_for_command?' · unfit':''}</td><td>{n(c.latestVitals?.heart_rate_bpm)} bpm</td><td>{n(c.latestVitals?.spo2_percent)}%</td><td>{dateText(c.latestCheckIn?.completed_at)}</td><td>{c.openEvents}</td></tr>)}</tbody></table>{!crew.length&&<p className="py-6 text-text-2">Loading crew records…</p>}</div></Panel>
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title={`Decisions for you (${decisions.length})`}>
        <div className="grid gap-3">{decisions.map(d=><article key={d.id} className="rounded-xl border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><Link href={`/astronaut/${String((d as any).subject_callsign||'').toLowerCase()}`} className="font-semibold text-ink hover:underline">{(d as any).subject_name||'Crew decision'}</Link><p className="mt-1 text-sm">{d.proposed_action||d.decision_type.replaceAll('_',' ')}</p><p className="mt-1 text-sm text-text-2">{d.rationale}</p><p className="label mt-2">Waiting since {dateText(d.decided_at)}</p></div><div className="flex gap-2"><button className="btn btn-primary" onClick={()=>void decide(d.id,'approve')}>Approve</button><button className="btn btn-ghost" onClick={()=>void decide(d.id,'reject')}>Reject</button></div></div></article>)}{!decisions.length&&<p className="text-sm text-text-2">No decisions are waiting.</p>}</div>
      </Panel>
      <Panel title="Mission reports"><div className="grid max-h-[440px] gap-3 overflow-auto">{reports.map(r=><article className="rounded-xl border border-line p-4" key={r.id}><div className="flex justify-between gap-3"><b className="capitalize">{r.report_type} report · {r.status}</b><span className="label">{dateText(r.created_at)}</span></div>{r.arrives_at&&<p className="label mt-2">Arrives at Earth {dateText(r.arrives_at)}</p>}<p className="mt-2 whitespace-pre-wrap text-sm text-text-2">{typeof r.summary==='string'?r.summary:JSON.stringify(r.summary,null,2)}</p>{Array.isArray(r.flagged_issues)&&r.flagged_issues.length>0&&<p className="mt-2 text-sm text-watch">{r.flagged_issues.join(' · ')}</p>}{r.replies?.map(reply=><p className="mt-3 border-t border-line pt-3 text-sm" key={reply.id}><b>{reply.sender} · {dateText(reply.received_at)}</b><br/>{reply.message}</p>)}</article>)}{!reports.length&&<p className="text-sm text-text-2">No reports have been written yet.</p>}</div></Panel>
    </div>
  </div>;
}
