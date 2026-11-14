import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=createHash('sha256');
for(const file of readdirSync(path.join(root,'backend')).filter(f=>f.endsWith('.js')).sort())hash.update(readFileSync(path.join(root,'backend',file)));
let commit='unknown';
try {commit=execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'rev-parse','--short','HEAD'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','ignore']}).toString().trim();}catch{}
export const buildInfo={commit,source:hash.digest('hex').slice(0,12),build:process.env.APP_BUILD_ID||'local',startedAt:new Date().toISOString()};
