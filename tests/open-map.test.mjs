import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {cityPoint,parseRoute,parseSearch,parseGeoapifySearch,parseGraphHopperRoute,reserveService,searchCity,walkingRoute} from '../lib/open-map.ts';
import {llmConfig} from '../lib/llm-config.ts';
const migration=await readFile(new URL('../drizzle/0001_old_falcon.sql',import.meta.url),'utf8');
const budgetMigration=await readFile(new URL('../drizzle/0002_provider_budgets.sql',import.meta.url),'utf8');
function database(){const db=new DatabaseSync(':memory:');db.exec(migration);db.exec(budgetMigration);return db;}
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
test('Geoapify geocodes within Astana, charges one shared credit and caches without exposing key',async()=>{
 const previous=process.env.GEOAPIFY_API_KEY;process.env.GEOAPIFY_API_KEY='test-geocoder-secret';
 const db=database();let calls=0;
 try{
  const a=adapter(db),fetcher=async(url,init)=>{
   calls++;const u=new URL(url);assert.equal(u.origin,'https://api.geoapify.com');assert.equal(u.pathname,'/v1/geocode/search');
   assert.equal(u.searchParams.get('apiKey'),'test-geocoder-secret');assert.equal(u.searchParams.get('lang'),'ru');assert.equal(u.searchParams.get('limit'),'5');
   assert.match(u.searchParams.get('filter'),/rect:71\.15,50\.9,71\.8,51\.35/);assert.equal(init.redirect,'manual');
   return json({results:[{place_id:'geo-1',formatted:'Байтерек, Астана, Казахстан',lat:51.1283,lon:71.4306},{place_id:'foreign',formatted:'Косшы',lat:50.95,lon:71.3}]});
  };
  const found=await searchCity('Байтерек','ru',a,fetcher);assert.equal(found.length,1);assert.equal(found[0].source,'Geoapify / OpenStreetMap');assert.equal(found[0].sourceUrl,'https://www.geoapify.com/');
  assert.equal((await searchCity('Байтерек','ru',a,fetcher)).length,1);assert.equal(calls,1);
  assert.equal(db.prepare("SELECT SUM(units) n FROM provider_budget_reservations WHERE scope='geoapify-credits-v1'").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM service_reservations").get().n,0);
  assert.ok(!JSON.stringify(found).includes('test-geocoder-secret'));
  assert.equal(parseGeoapifySearch({results:[{formatted:'Astana',lat:0,lon:0}]}).length,0);
 }finally{db.close();if(previous===undefined)delete process.env.GEOAPIFY_API_KEY;else process.env.GEOAPIFY_API_KEY=previous;}
});
const ghRaw={paths:[{points_encoded:false,distance:842.7,time:612296,points:{type:'LineString',coordinates:[[71.4306,51.1283],[71.4233,51.132]]},snapped_waypoints:{type:'LineString',coordinates:[[71.4306,51.1283],[71.4233,51.132]]},instructions:[{sign:0,street_name:'Достық',distance:800},{sign:-2,street_name:'Түркістан',distance:42.7},{sign:4,street_name:'',distance:0}]}]};
test('GraphHopper uses genuine foot profile, converts milliseconds and charges exactly one credit',async()=>{
 const previous=process.env.GRAPHHOPPER_API_KEY;process.env.GRAPHHOPPER_API_KEY='test-route-secret';
 const db=database();
 try{
  const route=await walkingRoute({lat:51.1283,lon:71.4306},{lat:51.132,lon:71.4233},adapter(db),async(url,init)=>{
   const u=new URL(url);assert.equal(u.origin,'https://graphhopper.com');assert.equal(u.pathname,'/api/1/route');assert.equal(u.searchParams.get('profile'),'foot');
   assert.deepEqual(u.searchParams.getAll('point'),['51.1283,71.4306','51.132,71.4233']);assert.equal(u.searchParams.get('points_encoded'),'false');assert.equal(u.searchParams.has('algorithm'),false);assert.equal(init.redirect,'manual');return json(ghRaw);
  });
  assert.equal(route.distance,843);assert.equal(route.duration,612);assert.equal(route.snappedMeters,0);assert.equal(route.steps[0].type,'depart');assert.equal(route.steps[1].modifier,'left');assert.equal(route.steps[2].type,'arrive');
  assert.equal(route.source,'GraphHopper / OpenStreetMap');assert.equal(route.sourceUrl,'https://www.graphhopper.com/');
  assert.equal(db.prepare("SELECT SUM(units) n FROM provider_budget_reservations WHERE scope='graphhopper-credits-v1'").get().n,1);
  assert.ok(!JSON.stringify(route).includes('test-route-secret'));
 }finally{db.close();if(previous===undefined)delete process.env.GRAPHHOPPER_API_KEY;else process.env.GRAPHHOPPER_API_KEY=previous;}
});
test('configured provider failures keep credit spent and never fall back to another provider',async()=>{
 const previous=process.env.GRAPHHOPPER_API_KEY;process.env.GRAPHHOPPER_API_KEY='test-route-secret';
 const db=database();let calls=0;
 try{
  const a=adapter(db),fetcher=async(url)=>{calls++;assert.equal(new URL(url).hostname,'graphhopper.com');return new Response('{}',{status:429,headers:{'Content-Type':'application/json'}});};
  await assert.rejects(()=>walkingRoute({lat:51.1,lon:71.4},{lat:51.12,lon:71.42},a,fetcher),e=>e.status===429);
  await assert.rejects(()=>walkingRoute({lat:51.1,lon:71.4},{lat:51.12,lon:71.42},a,fetcher),e=>e.status===429);
  assert.equal(calls,1);assert.equal(db.prepare('SELECT SUM(units) n FROM provider_budget_reservations').get().n,1);
  for(const change of [r=>r.paths[0].points_encoded=true,r=>r.paths[0].time=-1,r=>r.paths[0].snapped_waypoints.coordinates[0]=[71.7,51.2],r=>r.paths[0].points.coordinates.push([0,0]),r=>r.paths[0].instructions[0].distance=-1]){
   const r=structuredClone(ghRaw);change(r);assert.throws(()=>parseGraphHopperRoute(r,{lat:51.1283,lon:71.4306},{lat:51.132,lon:71.4233}));
  }
 }finally{db.close();if(previous===undefined)delete process.env.GRAPHHOPPER_API_KEY;else process.env.GRAPHHOPPER_API_KEY=previous;}
});
test('production provider caps stop Geoapify at 2500 and GraphHopper at 400 credits',async()=>{
 const oldGeo=process.env.GEOAPIFY_API_KEY,oldRoute=process.env.GRAPHHOPPER_API_KEY;
 process.env.GEOAPIFY_API_KEY='test-geocoder-secret';process.env.GRAPHHOPPER_API_KEY='test-route-secret';
 const db=database();try{
  const a=adapter(db),old=Date.now()-120000;let geoCalls=0,routeCalls=0;
  db.prepare('INSERT INTO provider_budget_reservations(id,scope,units,at) VALUES(?,?,?,?)').run('previous-geo','geoapify-credits-v1',2499,old);
  db.prepare('INSERT INTO provider_budget_reservations(id,scope,units,at) VALUES(?,?,?,?)').run('previous-route','graphhopper-credits-v1',399,old);
  const geo=async()=>{geoCalls++;return json({results:[]});},route=async()=>{routeCalls++;return json(ghRaw);};
  await searchCity('Абая','ru',a,geo);await walkingRoute({lat:51.1283,lon:71.4306},{lat:51.132,lon:71.4233},a,route);
  db.exec('UPDATE provider_budget_reservations SET at=at-3000');
  await assert.rejects(()=>searchCity('Республика','ru',a,geo),e=>e.status===429);
  await assert.rejects(()=>walkingRoute({lat:51.1283,lon:71.4306},{lat:51.132,lon:71.4233},a,route),e=>e.status===429);
  assert.equal(geoCalls,1);assert.equal(routeCalls,1);
  assert.equal(db.prepare("SELECT SUM(units) n FROM provider_budget_reservations WHERE scope='geoapify-credits-v1'").get().n,2500);
  assert.equal(db.prepare("SELECT SUM(units) n FROM provider_budget_reservations WHERE scope='graphhopper-credits-v1'").get().n,400);
 }finally{db.close();if(oldGeo===undefined)delete process.env.GEOAPIFY_API_KEY;else process.env.GEOAPIFY_API_KEY=oldGeo;if(oldRoute===undefined)delete process.env.GRAPHHOPPER_API_KEY;else process.env.GRAPHHOPPER_API_KEY=oldRoute;}
});
