import './env.js';
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import pg from 'pg';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const c=new pg.Client({connectionString:process.env.DATABASE_URL});
try {
  await c.connect();
  await c.query('SELECT pg_advisory_lock(724810002)');
  if(!(await c.query("SELECT to_regclass('public.schema_migrations') AS t")).rows[0].t)
    await c.query(await readFile(path.join(root,'database/schema.sql'),'utf8'));
  for(const file of (await readdir(path.join(root,'database/migrations'))).filter(f=>/^\d+.*\.sql$/.test(f)).sort()) {
    const version=Number(file.match(/^\d+/)[0]);
    if((await c.query('SELECT 1 FROM schema_migrations WHERE version=$1',[version])).rowCount) continue;
    await c.query(await readFile(path.join(root,'database/migrations',file),'utf8'));
    console.log(`Applied ${file}`);
  }
} finally {await c.end();}
