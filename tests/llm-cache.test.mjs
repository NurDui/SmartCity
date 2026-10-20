import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {readLlmCache,writeLlmCache} from '../lib/llm-cache.ts';
import {validateGeneratedPlan} from '../lib/llm.ts';
const migration=await readFile(new URL('../drizzle/0004_llm_idea_cache.sql',import.meta.url),'utf8');
const key='a'.repeat(64);
const plan={recommendations:[{id:'cafe',why:'Подойдёт для спокойной кофейной паузы.',actions:['Выберите удобный темп для знакомства с местом.']}]};
function database(){const db=new DatabaseSync(':memory:');db.exec(migration);return db;}
function adapter(db){return {prepare(sql){return {bind(...values){return {async first(){return db.prepare(sql).get(...values)??null;},async run(){return db.prepare(sql).run(...values);}};}};}};}

test('cache retains only validated idea fields with a 30-minute expiration',async()=>{
 const db=database();try{
  const a=adapter(db),before=Date.now();
  await writeLlmCache(a,key,{...plan,location:{lat:51.123456,lon:71.432109},query:'private input',token:'secret'});
  assert.deepEqual(await readLlmCache(a,key),plan);
  const row=db.prepare('SELECT * FROM llm_idea_cache').get();
  assert.ok(row.expires>=before+30*60000&&row.expires<=Date.now()+30*60000);
  assert.deepEqual(Object.keys(row).sort(),['expires','key','value']);
  for(const forbidden of ['private input','51.123456','71.432109','secret','location','query'])assert.ok(!row.value.includes(forbidden));
  db.prepare('UPDATE llm_idea_cache SET expires=?').run(Date.now()-1);
  assert.equal(await readLlmCache(a,key),null);
 }finally{db.close();}
});
test('wrong prompt hash, malformed or oversized rows and unavailable DB are safe cache misses',async()=>{
 const db=database();try{
  const a=adapter(db);
  await writeLlmCache(a,key,plan);assert.equal(await readLlmCache(a,'b'.repeat(64)),null);
  for(const value of ['{bad-json',JSON.stringify({recommendations:['x'.repeat(16001)]})]){
   db.prepare('UPDATE llm_idea_cache SET value=?').run(value);assert.equal(await readLlmCache(a,key),null);
  }
  assert.equal(await readLlmCache(undefined,key),null);
  assert.equal(await readLlmCache({prepare(){throw new Error('D1 unavailable')}},key),null);
  await writeLlmCache({prepare(){throw new Error('D1 unavailable')}},key,plan);
  assert.equal(await readLlmCache(a,'raw-query-or-coordinates'),null);
 }finally{db.close();}
});
test('failures and empty plans are never cached; current IDs and language must still validate a hit',async()=>{
 const db=database();try{
  const a=adapter(db);
  for(const failure of [null,{}, {error:'provider failed'},{recommendations:[]},{recommendations:[{id:'a',why:'x'.repeat(1000),actions:[]}]}])await writeLlmCache(a,key,failure);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM llm_idea_cache').get().n,0);
  await writeLlmCache(a,key,plan);const cached=await readLlmCache(a,key);
  assert.ok(validateGeneratedPlan(cached,['cafe'],'ru'));
  assert.equal(validateGeneratedPlan(cached,['another-place'],'ru'),null);
  assert.equal(validateGeneratedPlan(cached,['cafe'],'en'),null);
 }finally{db.close();}
});
