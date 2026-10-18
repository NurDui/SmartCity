import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Worker} from 'node:worker_threads';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {reserveYandexQuota,cleanupYandexQuota} from '../lib/yandex-quota.ts';
import {resolveYandexPolicy,YANDEX_QUOTA_POLICY} from '../lib/yandex-policy.ts';

const configured={YANDEX_GEOCODER_ENABLED:'true',YANDEX_FREE_ELIGIBILITY_CONFIRMED:'true',YANDEX_QUOTA_DEDICATED_BUDGET_CONFIRMED:'true',YANDEX_GEOCODER_API_KEY:'test-server-key-not-real',YANDEX_GEOCODER_SIGNING_SECRET:'MDEyMzQ1Njc4OWFiY2RlZg==',YANDEX_QUOTA_HMAC_SECRET:'test-only-secret-with-more-than-32-bytes'};
const migration=await readFile(new URL('../drizzle/0000_futuristic_cable.sql',import.meta.url),'utf8');
const scope=YANDEX_QUOTA_POLICY.scope;
const clock="CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
function adapter(db){return {prepare(sql){return {bind(...values){return {async first(){return db.prepare(sql).get(...values)??null;},async run(){return db.prepare(sql).run(...values);}};}};}};}
function database(){const db=new DatabaseSync(':memory:');db.exec(migration);return db;}
const reserve=(db,changes={})=>reserveYandexQuota({service:'geocoder',env:configured,clientIp:'203.0.113.10',db:db?adapter(db):null,...changes});
function fill(db,count,{age=3600000,identity='other-user',prefix='old'}={}){
 const insert=db.prepare(`INSERT INTO yandex_quota_reservations VALUES (?, ?, ?, ?, ${clock}-?)`);
 db.exec('BEGIN');try{for(let i=0;i<count;i++)insert.run(`${prefix}-${i}`,scope,i%2?'geocoder':'previous-approved-product',identity,age);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
}

test('all products remain disabled without explicit eligibility, dedicated budget, signing and shared DB',async()=>{
 assert.deepEqual(resolveYandexPolicy('geocoder'),{enabled:false,reason:'feature_disabled'});
 const cases=[['YANDEX_GEOCODER_ENABLED','feature_disabled'],['YANDEX_FREE_ELIGIBILITY_CONFIRMED','eligibility_unconfirmed'],['YANDEX_QUOTA_DEDICATED_BUDGET_CONFIRMED','dedicated_budget_unconfirmed'],['YANDEX_GEOCODER_API_KEY','missing_key'],['YANDEX_GEOCODER_SIGNING_SECRET','missing_signing_secret'],['YANDEX_QUOTA_HMAC_SECRET','missing_hmac_secret']];
 for(const [key,reason] of cases){const env={...configured};delete env[key];assert.equal(resolveYandexPolicy('geocoder',env,true).reason,reason);}
 for(const invalid of ['short','AAAAAAAAAAAAAAAAAAAAA!','A'.repeat(25),'====','YWJjZA=='])assert.equal(resolveYandexPolicy('geocoder',{...configured,YANDEX_GEOCODER_SIGNING_SECRET:invalid},true).reason,'missing_signing_secret');
 assert.equal(resolveYandexPolicy('geocoder',configured,false).reason,'missing_database');
 for(const service of ['javascript-api','tiles','panorama','search','routing','suggest','static-maps','geocoder-v2',null,{}])assert.equal(resolveYandexPolicy(service,configured,true).reason,'unsupported_service');
 assert.equal((await reserve(null)).reason,'missing_database');
});

test('successful grants store pseudonymous HMACs only and minimum spacing blocks bursts',async()=>{
 const db=database();try{
  const grant=await reserve(db);assert.equal(grant.allowed,true);
  const row=db.prepare('SELECT * FROM yandex_quota_reservations').get();assert.match(row.identity_hash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(row).includes('203.0.113.10'));assert.ok(!JSON.stringify(row).includes(configured.YANDEX_GEOCODER_API_KEY));assert.equal(row.scope,scope);assert.equal(row.reserved_at_ms,grant.reservedAtMs);
  const burst=await reserve(db,{clientIp:'203.0.113.11'});assert.equal(burst.allowed,false);assert.equal(burst.reason,'quota_or_rate_limit');assert.equal(db.prepare('SELECT COUNT(*) n FROM yandex_quota_reservations').get().n,1);
 }finally{db.close();}
});

test('rolling 24h global budget spans products, visitors and calendar boundaries',async()=>{
 const db=database();try{
  fill(db,900,{age:23*3600000});
  const blocked=await reserve(db);assert.equal(blocked.allowed,false);assert.equal(blocked.reason,'quota_or_rate_limit');
  db.exec(`UPDATE yandex_quota_reservations SET reserved_at_ms=${clock}-25*3600000`);
  const allowed=await reserve(db);assert.equal(allowed.allowed,true);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM yandex_quota_reservations WHERE reserved_at_ms>=${clock}-86400000`).get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM yandex_quota_reservations').get().n,901);
 }finally{db.close();}
});

test('per-IP quota survives key rotation and normalizes equivalent IPv6 addresses',async()=>{
 const db=database();try{
  const first=await reserve(db,{clientIp:'2001:db8::1'});assert.equal(first.allowed,true);
  const identity=db.prepare('SELECT identity_hash FROM yandex_quota_reservations WHERE id=?').get(first.reservationId).identity_hash;
  db.exec(`UPDATE yandex_quota_reservations SET reserved_at_ms=${clock}-3600000`);
  fill(db,59,{identity,prefix:'same-user'});
  const next=await reserve(db,{clientIp:'2001:0db8:0000:0000:0000:0000:0000:0001',env:{...configured,YANDEX_GEOCODER_API_KEY:'rotated-key'}});assert.equal(next.allowed,false);assert.equal(next.reason,'quota_or_rate_limit');
  const other=await reserve(db,{clientIp:'2001:db8::2'});assert.equal(other.allowed,true);
 }finally{db.close();}
});

test('storage, malformed edge identity and configuration errors fail closed without memory fallback',async()=>{
 let reads=0;const broken={prepare(){reads++;throw new Error('DB unavailable');}};
 assert.equal((await reserveYandexQuota({service:'geocoder',env:configured,db:broken,clientIp:'203.0.113.10'})).reason,'quota_storage_unavailable');assert.equal(reads,1);
 for(const clientIp of [undefined,'','203.0.113.10, 1.1.1.1','not-an-ip','999.1.2.3','203.0.113.10:123'])assert.equal((await reserveYandexQuota({service:'geocoder',env:configured,db:broken,clientIp})).reason,'invalid_client_ip');
 assert.equal(reads,1);
 const denied=await reserveYandexQuota({service:'geocoder',env:{},db:broken,clientIp:'203.0.113.10'});assert.equal(denied.reason,'feature_disabled');assert.equal(reads,1);
});

test('reservations remain spent after caller errors and cleanup cannot release current quota',async()=>{
 const db=database();try{
  fill(db,899);
  const grant=await reserve(db);assert.equal(grant.allowed,true);
  try{throw new Error('simulated provider failure after grant');}catch{/* No quota refund is performed. */}
  db.exec(`UPDATE yandex_quota_reservations SET reserved_at_ms=${clock}-5000 WHERE id='${grant.reservationId}'`);
  assert.equal(await cleanupYandexQuota(adapter(db)),true);
  assert.equal((await reserve(db,{clientIp:'203.0.113.12'})).allowed,false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM yandex_quota_reservations').get().n,900);
 }finally{db.close();}
});

test('48h cleanup removes only expired pseudonyms, not current rolling budget or 25h safety history',async()=>{
 const db=database();try{
  fill(db,2,{age:49*3600000,prefix:'expired'});fill(db,3,{age:25*3600000,prefix:'retained'});fill(db,4,{age:2*3600000,prefix:'current'});
  assert.equal(await cleanupYandexQuota(adapter(db)),true);assert.equal(db.prepare('SELECT COUNT(*) n FROM yandex_quota_reservations').get().n,7);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM yandex_quota_reservations WHERE reserved_at_ms>=${clock}-86400000`).get().n,4);
 }finally{db.close();}
});

test('independent concurrent SQLite writers cannot overspend the final shared reservation',async()=>{
 const root=path.resolve(tmpdir());const folder=await mkdtemp(path.join(root,'seruen-yandex-quota-test-'));const file=path.join(folder,'shared.sqlite');
 const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL');db.exec(migration);fill(db,899);
 const workers=[];
 try{
  const gate=new SharedArrayBuffer(4);let ready=0;
  const code=`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');(async()=>{const {reserveYandexQuota}=await import(workerData.module);const db=new DatabaseSync(workerData.file);db.exec('PRAGMA busy_timeout=5000');const adapter={prepare(sql){return {bind(...values){return {async first(){return db.prepare(sql).get(...values)??null;},async run(){return db.prepare(sql).run(...values);}};}};}};parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(workerData.gate),0,0);const result=await reserveYandexQuota({service:'geocoder',env:workerData.env,db:adapter,clientIp:workerData.ip});db.close();parentPort.postMessage({result});})().catch(error=>{parentPort.postMessage({error:error.message});});`;
  const results=await Promise.all(Array.from({length:8},(_,index)=>new Promise((resolve,reject)=>{
   const worker=new Worker(code,{eval:true,workerData:{module:new URL('../lib/yandex-quota.ts',import.meta.url).href,file,gate,env:configured,ip:`203.0.113.${20+index}`}});workers.push(worker);worker.on('error',reject);worker.on('message',message=>{if(message.ready){if(++ready===8){Atomics.store(new Int32Array(gate),0,1);Atomics.notify(new Int32Array(gate),0,8);}}else if(message.error)reject(new Error(message.error));else resolve(message.result);});
  })));
  assert.equal(results.filter(result=>result.allowed).length,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM yandex_quota_reservations').get().n,900);
 }finally{
  await Promise.all(workers.map(worker=>worker.terminate()));db.close();
  // Explicitly verify the absolute cleanup target remains the named test directory.
  assert.equal(path.dirname(path.resolve(folder)),root);assert.ok(path.basename(folder).startsWith('seruen-yandex-quota-test-'));await rm(folder,{recursive:true,force:true});
 }
});
