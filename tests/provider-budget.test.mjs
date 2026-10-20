import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {reserveProviderBudget,cleanupProviderBudget} from '../lib/provider-budget.ts';
const migration=await readFile(new URL('../drizzle/0002_provider_budgets.sql',import.meta.url),'utf8');
function database(){const db=new DatabaseSync(':memory:');db.exec(migration);return db;}
function adapter(db){return {prepare(sql){return {bind(...values){return {async first(){return db.prepare(sql).get(...values)??null;},async run(){return db.prepare(sql).run(...values);}};}};}};}

test('weighted shared ledger atomically enforces both minute and rolling-day costs',async()=>{
 const db=database();try{
  const a=adapter(db),budget={scope:'credits-test',units:1500,limits:[{windowMs:86400000,limit:2500},{windowMs:60000,limit:2000}]};
  await reserveProviderBudget(a,budget);db.exec('UPDATE provider_budget_reservations SET at=at-3000');
  await assert.rejects(()=>reserveProviderBudget(a,{...budget,units:1000}),e=>e.status===429);
  db.exec('UPDATE provider_budget_reservations SET at=at-61000');await reserveProviderBudget(a,{...budget,units:1000});
  db.exec('UPDATE provider_budget_reservations SET at=at-3000');await assert.rejects(()=>reserveProviderBudget(a,{...budget,units:1}),e=>e.status===429);
  assert.equal(db.prepare('SELECT SUM(units) n FROM provider_budget_reservations').get().n,2500);
  db.exec('UPDATE provider_budget_reservations SET at=at-86400001');await reserveProviderBudget(a,budget);
 }finally{db.close();}
});
test('parallel cost reservations cannot overdraw and unavailable ledger fails closed',async()=>{
 const db=database();try{
  const budget={scope:'parallel-test',units:3,limits:[{windowMs:86400000,limit:10}],minIntervalMs:0};
  const results=await Promise.allSettled(Array.from({length:20},()=>reserveProviderBudget(adapter(db),budget)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,3);assert.equal(db.prepare('SELECT SUM(units) n FROM provider_budget_reservations').get().n,9);
  await assert.rejects(()=>reserveProviderBudget(undefined,budget),e=>e.status===503);
  await assert.rejects(()=>reserveProviderBudget({prepare(){throw new Error('DB down')}},budget),e=>e.status===503);
  assert.deepEqual(Object.keys(db.prepare('SELECT * FROM provider_budget_reservations LIMIT 1').get()).sort(),['at','id','scope','units']);
 }finally{db.close();}
});
test('bad budget configuration cannot disable protection; cleanup only expires old reservations',async()=>{
 const db=database();try{
  const a=adapter(db),budget={scope:'cleanup-test',units:1,limits:[{windowMs:86400000,limit:400}]};
  for(const change of [{units:0},{units:-1},{units:1.5},{limits:[]},{scope:'bad scope'},{limits:[{windowMs:172800000,limit:400}]},{limits:[{windowMs:86400000,limit:0}]}])await assert.rejects(()=>reserveProviderBudget(a,{...budget,...change}),e=>e.status===503);
  await reserveProviderBudget(a,budget);await cleanupProviderBudget(a);assert.equal(db.prepare('SELECT COUNT(*) n FROM provider_budget_reservations').get().n,1);
  db.exec('UPDATE provider_budget_reservations SET at=at-172800001');await cleanupProviderBudget(a);assert.equal(db.prepare('SELECT COUNT(*) n FROM provider_budget_reservations').get().n,0);
 }finally{db.close();}
});
