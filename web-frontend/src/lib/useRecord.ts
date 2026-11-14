'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {backendRequest} from './session';
import {usePoll} from './hooks';
import type {ChainMember,ChatMessage,CheckIn,ConditionEvent,CrewAlert,Decision,RecordStreams,StockItem} from './types';
type Stream=keyof RecordStreams;
type Row={id:string;updated_at?:string}&Record<string,unknown>;
const TIME:Record<Stream,string>={vitals:'observed_at',sleep:'started_at',mental:'completed_at',checkins:'started_at',assessment:'assessed_at',plan:'created_at',medications:'proposed_at',labs:'collected_at',events:'started_at',decisions:'decided_at'};
const PROFILE:Record<string,Stream[]>={vitals:[],events:['decisions'],care:['plan','medications','labs'],wellbeing:['sleep','mental','assessment'],agent:['checkins']};
const EMPTY:RecordStreams={vitals:[],sleep:[],mental:[],checkins:[],assessment:[],plan:[],medications:[],labs:[],events:[],decisions:[]};
export const VITALS_WINDOW_MS=3*3600_000;
export interface Related {alerts:CrewAlert[];stock:StockItem[];pending:Decision[];chain:ChainMember[];checkin:ChatMessage[];chat:{id:string;messages:ChatMessage[]}|null}
type Page={hasMore:boolean;before:string|null};
type Reply=Partial<Record<Stream,Row[]>>&{_pages:Partial<Record<Stream,Page>>;_activeEvents:ConditionEvent[]};
function merge(previous:Row[],rows:Row[],name:Stream){
  const entries=new Map(previous.map(x=>[x.id,x]));for(const row of rows)entries.set(row.id,row);
  return [...entries.values()].sort((a,b)=>Date.parse(String(b[TIME[name]]||''))-Date.parse(String(a[TIME[name]]||'')));
}
export function useRecord(astronautKey:string,isSelf:boolean,profile='vitals'){
  const [records,setRecords]=useState<RecordStreams|null>(null);
  const [related,setRelated]=useState<Omit<Related,'checkin'>|null>(null);
  const [activeEvents,setActiveEvents]=useState<ConditionEvent[]>([]);
  const [pages,setPages]=useState<Partial<Record<Stream,Page>>>({});
  const [streamError,setStreamError]=useState(''),[relatedError,setRelatedError]=useState('');
  const [loadingHistory,setLoadingHistory]=useState(false);
  const [loadedProfile,setLoadedProfile]=useState<string|null>(null);
  const cursor=useRef<Partial<Record<Stream,string>>>({});
  const flight=useRef<Promise<void>|null>(null);
  const key=encodeURIComponent(astronautKey);
  const selected=useMemo<Stream[]>(()=>['vitals','events',...(PROFILE[profile]||[])],[profile]);
  const history=useMemo<Stream[]>(()=>profile==='vitals'?['vitals']:profile==='events'?['events','decisions']:profile==='agent'?[]:PROFILE[profile]||[],[profile]);
  const load=useCallback(async(force=false):Promise<void>=>{
    // A tab switch or explicit refresh waits for the previous poll, then requests the new profile.
    if(flight.current){if(force){await flight.current;return load(true);}return;}
    const work=(async()=>{
      try{
        const p=new URLSearchParams({streams:selected.join(','),activeEvents:String(profile!=='events')});
        for(const name of selected){const since=!force?cursor.current[name]:undefined;if(since)p.set(name,since);else if(name==='vitals')p.set(name,new Date(Date.now()-VITALS_WINDOW_MS).toISOString());}
        const out=await backendRequest<Reply>(`/astronauts/${key}/record?${p}`);
        setActiveEvents(out._activeEvents);
        for(const name of selected){
          const dates=(out[name]||[]).map(x=>String(name==='vitals'?x.observed_at:x.updated_at||x[TIME[name]]||'')).filter(Boolean).sort();
          if(dates.length)cursor.current[name]=dates.at(-1);
        }
        setRecords(prev=>{
          const next={...(prev||EMPTY)} as unknown as Record<Stream,Row[]>;
          for(const name of selected){const rows=out[name]||[];next[name]=force||!prev||name==='events'&&profile!=='events'?rows:merge(next[name],rows,name);}
          if(profile==='events')next.events=merge(next.events,out._activeEvents as unknown as Row[],'events');
          next.vitals=next.vitals.filter(v=>Date.parse(String(v.observed_at))>=Date.now()-VITALS_WINDOW_MS).slice(0,2000);
          return next as unknown as RecordStreams;
        });
        if(force)setPages(prev=>({...prev,...out._pages}));
        setLoadedProfile(profile);
        setStreamError('');
      }catch(e){setStreamError(e instanceof Error?e.message:'Could not load the record.');}
    })();
    flight.current=work;try{await work;}finally{flight.current=null;}
  },[key,profile,selected]);
  const loadRelated=useCallback(async()=>{
    try{const out=await backendRequest<Omit<Related,'checkin'>>(`/astronauts/${key}/related?chat=${isSelf&&profile==='agent'}`);setRelated(out);setRelatedError('');}
    catch(e){setRelatedError(e instanceof Error?e.message:'Could not load actions and alerts.');}
  },[key,isSelf,profile]);
  useEffect(()=>{void load(true);},[load]);
  usePoll(()=>load(false),5000);
  usePoll(loadRelated,15000,profile);
  const reload=useCallback(()=>Promise.all([load(true),loadRelated()]).then(()=>undefined),[load,loadRelated]);
  const resolveDecision=useCallback((d:Decision)=>{
    setRelated(prev=>prev?{...prev,pending:prev.pending.filter(x=>x.id!==d.id)}:prev);
    setRecords(prev=>prev?{...prev,decisions:prev.decisions.map(x=>x.id===d.id?d:x)}:prev);
  },[]);
  const loadMore=useCallback(async()=>{
    if(loadingHistory)return;setLoadingHistory(true);
    try{await Promise.all(history.filter(name=>pages[name]?.hasMore).map(async name=>{
      const p=new URLSearchParams({streams:name,[`before_${name}`]:pages[name]!.before!});
      const out=await backendRequest<Reply>(`/astronauts/${key}/record?${p}`);
      setRecords(prev=>prev?{...prev,[name]:merge(prev[name] as unknown as Row[],out[name]||[],name)} as RecordStreams:prev);
      setPages(prev=>({...prev,[name]:out._pages[name]}));
    }));}catch(e){setStreamError(e instanceof Error?e.message:'Could not load earlier records.');}finally{setLoadingHistory(false);}
  },[key,history,pages,loadingHistory]);
  const checkin=useMemo<ChatMessage[]>(()=>{
    const saved=(records?.checkins as CheckIn[]|undefined)?.find(x=>x.transcript?.length);
    return(saved?.transcript||[]).map(m=>({from:m.from==='agent'?'agent':'astronaut',text:String(m.text||''),at:Number(m.at)||Date.now()}));
  },[records?.checkins]);
  const withCheckin=useMemo(()=>related?{...related,checkin}:null,[related,checkin]);
  return {records,related:withCheckin,activeEvents,profileReady:loadedProfile===profile,error:streamError||relatedError,reload,resolveDecision,loadMore,loadingHistory,hasMore:history.some(name=>pages[name]?.hasMore)};
}
