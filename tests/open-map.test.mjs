import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {cityPoint,parseRoute,parseSearch,reserveService,searchCity,walkingRoute} from '../lib/open-map.ts';
import {llmConfig} from '../lib/llm-config.ts';
const migration=await readFile(new URL('../drizzle/0001_old_falcon.sql',import.meta.url),'utf8');
function database(){const db=new DatabaseSync(':memory:');db.exec(migration);return db;}
function adapter(db){return {prepare(sql){return {bind(...values){return {async first(){return db.prepare(sql).get(...values)??null;},async run(){return db.prepare(sql).run(...values);}};}};}};}
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const raw={code:'Ok',waypoints:[{distance:1},{distance:12}],routes:[{distance:857,duration:686,geometry:{type:'LineString',coordinates:[[71.4306,51.1283],[71.4233,51.132]]},legs:[{steps:[{maneuver:{type:'turn',modifier:'left'},name:'Достық',distance:857}]}]}]};
test('city bounds and malformed inputs reject before upstream calls',async()=>{
 for(const value of [null,{lat:NaN,lon:71.4},{lat:51.1,lon:'71.4'},{lat:55,lon:71.4}])assert.throws(()=>cityPoint(value));
 let calls=0;await assert.rejects(()=>searchCity('@private','ru',undefined,async()=>{calls++;return json([])}));await assert.rejects(()=>walkingRoute({lat:0,lon:0},{lat:51,lon:71.4},undefined,async()=>{calls++;return json(raw)}));assert.equal(calls,0);
});
test('shared quota atomically enforces burst and rolling-day caps, no DB fails closed',async()=>{
 await assert.rejects(()=>reserveService(undefined,'test'),e=>e.status===503);
 const db=database();try{const a=adapter(db);const results=await Promise.allSettled(Array.from({length:20},()=>reserveService(a,'same-scope',2)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);db.exec("UPDATE service_reservations SET at=at-3000");await reserveService(a,'same-scope',2);db.exec("UPDATE service_reservations SET at=at-3000");await assert.rejects(()=>reserveService(a,'same-scope',2),e=>e.status===429);assert.equal(db.prepare('SELECT count(*) n FROM service_reservations').get().n,2);}finally{db.close();}
});
test('Nominatim uses bounded explicit search, identifies app and caches public results for 24h',async()=>{
 const db=database();let calls=0;try{const fetcher=async(url,init)=>{calls++;const u=new URL(url);assert.equal(u.hostname,'nominatim.openstreetmap.org');assert.equal(u.searchParams.get('bounded'),'1');assert.equal(u.searchParams.get('countrycodes'),'kz');assert.equal(u.searchParams.get('accept-language'),'kk');assert.match(init.headers['User-Agent'],/SeruenAstana/);assert.equal(init.redirect,'manual');return json([{place_id:1,lat:'51.128',lon:'71.43',display_name:'Байтерек, Астана'}]);};const a=adapter(db);assert.equal((await searchCity('Байтерек','kk',a,fetcher)).length,1);assert.equal((await searchCity('Байтерек','kk',a,fetcher)).length,1);assert.equal(calls,1);const cached=db.prepare('SELECT * FROM geocode_cache').get();assert.equal(cached.key.length,64);assert.ok(!JSON.stringify(db.prepare('SELECT * FROM service_reservations').all()).includes('Байтерек'));assert.ok(cached.expires>Date.now()+23*3600000);}finally{db.close();}
});
test('routing dispatches to dedicated foot graph and retains genuine geometry/time',async()=>{
 const db=database();try{const route=await walkingRoute({lat:51.1283,lon:71.4306},{lat:51.132,lon:71.4233},adapter(db),async(url,init)=>{assert.match(url,/routing\.openstreetmap\.de\/routed-foot\/route/);assert.equal(init.redirect,'manual');return json(raw);});assert.equal(route.distance,857);assert.equal(route.duration,686);assert.equal(route.steps[0].modifier,'left');assert.equal(route.snappedMeters,12);assert.deepEqual(Object.keys(db.prepare('SELECT * FROM service_reservations').get()).sort(),['at','id','scope']);}finally{db.close();}
});
test('provider failures spend quota; redirects, remote geometry and distant snaps are rejected',async()=>{
 const db=database();try{let calls=0;const a=adapter(db);const fetcher=async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://elsewhere.example'}})};await assert.rejects(()=>walkingRoute({lat:51.1,lon:71.4},{lat:51.12,lon:71.42},a,fetcher));await assert.rejects(()=>walkingRoute({lat:51.1,lon:71.4},{lat:51.12,lon:71.42},a,fetcher),e=>e.status===429);assert.equal(calls,1);
 for(const mutate of [r=>r.routes[0].geometry.coordinates.push([0,0]),r=>r.waypoints[0].distance=900,r=>r.routes[0].duration=-1,r=>r.code='NoRoute']){const r=structuredClone(raw);mutate(r);assert.throws(()=>parseRoute(r));}
 assert.equal(parseSearch([{lat:'0',lon:'0',display_name:'Elsewhere'}]).length,0);
 }finally{db.close();}
});
test('LLM provider configuration is server allowlisted and requires model/key',()=>{
 assert.equal(llmConfig({}),null);assert.equal(llmConfig({LLM_PROVIDER:'https://untrusted',LLM_API_KEY:'key',LLM_MODEL:'model'}),null);assert.equal(llmConfig({LLM_PROVIDER:'groq',LLM_API_KEY:'key'}),null);assert.equal(llmConfig({LLM_PROVIDER:'groq',LLM_API_KEY:'key',LLM_MODEL:'model'}).url,'https://api.groq.com/openai/v1/chat/completions');
});
