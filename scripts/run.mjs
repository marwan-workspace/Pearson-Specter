import '../backend/env.js';
import {buildInfo} from '../backend/build-info.js';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.join(root,'.runtime');fs.mkdirSync(runtime,{recursive:true});
const stateFile=path.join(runtime,'processes.json');
const node=process.execPath;
const backend=path.join(root,'backend/server.js'),next=path.join(root,'web-frontend/node_modules/next/dist/bin/next');
const dev=process.argv.includes('--dev');

function stopProcess(pid,entry){
  if(!Number.isSafeInteger(pid)||pid<=0)return;
  try {
    // PID files survive crashes. Verify the command before terminating a possibly reused PID.
    const command=process.platform==='win32'
      ? execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],{windowsHide:true,stdio:['ignore','pipe','ignore']}).toString()
      : fs.readFileSync(`/proc/${pid}/cmdline`,'utf8');
    if(!command.includes(entry))throw Error(`PID ${pid} is no longer this project's process; stop it manually if necessary.`);
    if(process.platform==='win32')execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    else process.kill(pid,'SIGTERM');
  }catch(error){if(error.code==='ENOENT'||error.status===128)return;try{process.kill(pid,0);}catch{return;}throw error;}
}
if(fs.existsSync(stateFile)){
  const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  if(state.root!==root)throw Error('The runtime file belongs to another workspace.');
  stopProcess(state.backend,backend);stopProcess(state.frontend,next);fs.unlinkSync(stateFile);
}
if(process.argv.includes('--stop')){console.log('Stopped this workspace’s services.');process.exit(0);}
for(const port of [8000,3000]){
  try{await fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(1500)});throw Error(`Port ${port} is already occupied by an unmanaged process. Stop it before running this command.`);}
  catch(error){if(error.message.includes('unmanaged'))throw error;}
}
const build=`${buildInfo.commit}-${buildInfo.source}-${Date.now()}`;
const env={...process.env,APP_BUILD_ID:build,NODE_ENV:dev?'development':'production'};
execFileSync(node,[path.join(root,'backend/migrate.js')],{cwd:root,env,stdio:'inherit',windowsHide:true});
if(!dev)execFileSync(node,[next,'build'],{cwd:path.join(root,'web-frontend'),env,stdio:'inherit',windowsHide:true});
function launch(entry,args,cwd,name){
  const out=fs.openSync(path.join(runtime,`${name}.log`),'a'),err=fs.openSync(path.join(runtime,`${name}.err`),'a');
  try{const child=spawn(node,[entry,...args],{cwd,env,detached:true,windowsHide:true,stdio:['ignore',out,err]});child.unref();return child.pid;}
  finally{fs.closeSync(out);fs.closeSync(err);}
}
const state={root,build,backend:launch(backend,[],root,'backend')};
try{
  state.frontend=launch(next,[dev?'dev':'start','-p','3000'],path.join(root,'web-frontend'),'frontend');
  fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
  const deadline=Date.now()+45000;
  for(;;){
    try{
      const [api,web]=await Promise.all([
        fetch('http://127.0.0.1:8000/backend/health',{signal:AbortSignal.timeout(8000)}).then(r=>r.json()),
        fetch('http://127.0.0.1:3000/version',{signal:AbortSignal.timeout(8000)}).then(r=>r.json()),
      ]);
      if(api.ok&&api.build===build&&web.build===build){console.log(`Running current ${dev?'development':'production'} build ${build}\nhttp://localhost:3000`);break;}
    }catch{}
    if(Date.now()>deadline)throw Error('Startup did not pass the version/readiness checks. See .runtime logs.');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
}catch(error){stopProcess(state.backend,backend);if(state.frontend)stopProcess(state.frontend,next);throw error;}
