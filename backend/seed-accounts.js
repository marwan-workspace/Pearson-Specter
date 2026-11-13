import './env.js';
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
const scrypt=promisify(scryptCb); const {Pool}=pg;
if(!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before seeding accounts.');
const crew=[['ELENA','DEMO_PIN_ELENA'],['KWAME','DEMO_PIN_KWAME'],['HIRO','DEMO_PIN_HIRO'],['MAYA','DEMO_PIN_MAYA']];
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try {
  for(const [login,key] of crew) {
    const pin=process.env[key]; if(!pin||!/^[0-9]{4,12}$/.test(pin)) throw new Error(`${key} must be set to a 4 to 12 digit PIN.`);
    const salt=randomBytes(16).toString('hex'); const hash=`scrypt$${salt}$${(await scrypt(pin,salt,64)).toString('hex')}`;
    await pool.query(`INSERT INTO accounts(astronaut_id,login,pin_hash) SELECT id,lower(callsign),$2 FROM astronauts WHERE callsign=$1
      ON CONFLICT(astronaut_id) DO UPDATE SET login=EXCLUDED.login,pin_hash=EXCLUDED.pin_hash,failed_attempts=0,locked=false`,[login,hash]);
  }
  console.log('Demo accounts provisioned. Logins: elena, kwame, hiro, maya.');
} finally { await pool.end(); }
