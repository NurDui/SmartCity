import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {generateSelection} from '../lib/llm.ts';
import {parseRequest,buildResponse,retrieve,summerWeather} from '../lib/rag.ts';
import {reserveProviderBudget} from '../lib/provider-budget.ts';
import {getRuntimeConfig} from '../lib/provider-config.ts';

const migration=await readFile(new URL('../drizzle/0002_provider_budgets.sql',import.meta.url),'utf8');
const cacheMigration=await readFile(new URL('../drizzle/0004_llm_idea_cache.sql',import.meta.url),'utf8');
const point={lat:51.123456,lon:71.432109};
const poi={id:'catalogue-cafe',name:'Кофейня',...point,description:'Кофейня для спокойной паузы.',tags:['coffee','food','уют'],category:'Кофейня',indoor:true,bank:'left',durationMinutes:20,image:'',sourceUrl:'https://example.test/place',sourceName:'Source',collectedAt:'2026-10-20',openingHours:null,rating:null,address:'Astana',links:{twoGis:'https://2gis.kz/'},estimatedCostKzt:null};
const places=[poi];
const request=parseRequest({query:'кофе private-home-secret 51.123456 71.432109',location:{...point,label:'private-origin-label'},durationMinutes:90,mood:'coffee',weatherMode:'summer',indoorOnly:false,groupSize:2,language:'ru'});
const validPlan={recommendations:[{id:poi.id,why:'Подойдёт для спокойной кофейной паузы.',actions:['Выберите удобный темп для знакомства с местом.']}]};
function database(){const db=new DatabaseSync(':memory:');db.exec(migration);db.exec(cacheMigration);return db;}
function adapter(db){return {prepare(sql){return {bind(...values){return {async first(){return db.prepare(sql).get(...values)??null;},async run(){return db.prepare(sql).run(...values);}};}};}};}
function authorize(db){return async units=>{
 await reserveProviderBudget(db,{scope:'llm-requests-v2',units:1,limits:[{windowMs:60000,limit:20},{windowMs:86400000,limit:800}]});
 await reserveProviderBudget(db,{scope:'llm-tokens-v2',units,limits:[{windowMs:60000,limit:6000},{windowMs:86400000,limit:160000}]});
};}
function completion(plan=validPlan){return Response.json({choices:[{message:{content:JSON.stringify(plan)}}]});}
function template(selected){return buildResponse(places,request,summerWeather,'verified catalogue',selected?.recommendations.map(p=>p.id));}

test('LLM dispatch waits for both shared quota grants and sends only sanitized candidate context',async()=>{
 const db=database();let calls=0,allowAuthorization,reserved,markAuthorizationReached;
 const gate=new Promise(resolve=>{allowAuthorization=resolve;});
 const authorizationReached=new Promise(resolve=>{markAuthorizationReached=resolve;});
 try{
  const resultPromise=generateSelection(places,request,summerWeather,{key:'dummy-llm-key',authorize:async units=>{
   reserved=units;markAuthorizationReached();await gate;await authorize(adapter(db))(units);
  },fetcher:async(url,init)=>{
   calls++;assert.equal(db.prepare('SELECT COUNT(*) n FROM provider_budget_reservations').get().n,2);
   const payload=JSON.parse(init.body),context=JSON.parse(payload.messages.find(m=>m.role==='user').content);
   for(const forbidden of ['private-home-secret','private-origin-label','51.123456','71.432109'])assert.ok(!init.body.includes(forbidden));
   assert.ok(!Object.hasOwn(context,'query'));assert.ok(!Object.hasOwn(context,'location'));assert.deepEqual(context.records.map(p=>p.id),retrieve(places,request,summerWeather).slice(0,3).map(c=>c.poi.id));
   assert.ok(reserved>=new TextEncoder().encode(init.body).length+payload.max_completion_tokens);
   assert.equal(init.headers.Authorization,'Bearer dummy-llm-key');assert.equal(init.redirect,'manual');return completion();
  }});
  await Promise.race([authorizationReached,resultPromise.then(()=>{throw new Error('Generation completed without reaching the authorization gate');})]);
  assert.equal(calls,0);assert.ok(reserved>0&&reserved<=6000);
  allowAuthorization();const selected=await resultPromise;assert.deepEqual(selected,validPlan);assert.equal(calls,1);
  const ledger=JSON.stringify(db.prepare('SELECT * FROM provider_budget_reservations').all());
  for(const forbidden of ['private-home-secret','51.123456','dummy-llm-key','catalogue-cafe'])assert.ok(!ledger.includes(forbidden));
 }finally{allowAuthorization?.();db.close();}
});

test('validated prompt cache avoids both quota authorization and upstream calls for an identical selection',async()=>{
 const db=database();let authorizations=0,calls=0;
 try{
  const a=adapter(db),options={key:'dummy-llm-key',db:a,authorize:async units=>{authorizations++;await authorize(a)(units);},fetcher:async()=>{calls++;return completion();}};
  assert.deepEqual(await generateSelection(places,request,summerWeather,options),validPlan);
  const before=db.prepare('SELECT SUM(units) n FROM provider_budget_reservations').get().n;
  assert.deepEqual(await generateSelection(places,request,summerWeather,options),validPlan);
  assert.equal(authorizations,1);assert.equal(calls,1);assert.equal(db.prepare('SELECT SUM(units) n FROM provider_budget_reservations').get().n,before);
  const cached=db.prepare('SELECT * FROM llm_idea_cache').get();assert.equal(cached.key.length,64);
  for(const forbidden of ['private-home-secret','private-origin-label','51.123456','71.432109','dummy-llm-key'])assert.ok(!JSON.stringify(cached).includes(forbidden));
  // Changing the model changes the sanitized request identity, so it must miss.
  let denied=0;
  assert.equal(await generateSelection(places,request,summerWeather,{...options,model:'another-test-model',authorize:async()=>{denied++;throw new Error('quota denied');}}),null);
  assert.equal(denied,1);assert.equal(calls,1);
 }finally{db.close();}
});

test('cache hits are revalidated: foreign IDs, unsupported claims and expired ideas cannot bypass quota',async()=>{
 const db=database();let calls=0,denied=0;
 try{
  const a=adapter(db);
  assert.deepEqual(await generateSelection(places,request,summerWeather,{key:'dummy-llm-key',db:a,authorize:authorize(a),fetcher:async()=>{calls++;return completion();}}),validPlan);
  const denyOptions={key:'dummy-llm-key',db:a,authorize:async()=>{denied++;throw new Error('quota denied');},fetcher:async()=>{calls++;return completion();}};
  for(const change of [{id:'foreign-place'},{why:'Билет стоит 500 тенге.'}]){
   db.prepare('UPDATE llm_idea_cache SET value=?').run(JSON.stringify({recommendations:[{...validPlan.recommendations[0],...change}]}));
   assert.equal(await generateSelection(places,request,summerWeather,denyOptions),null);
  }
  db.prepare('UPDATE llm_idea_cache SET value=?,expires=?').run(JSON.stringify(validPlan),Date.now()-1);
  assert.equal(await generateSelection(places,request,summerWeather,denyOptions),null);
  assert.equal(denied,3);assert.equal(calls,1);
 }finally{db.close();}
});

test('quota denial or missing D1 skips the LLM and leaves grounded template recommendations available',async()=>{
 for(const denied of [authorize(undefined),async()=>{throw Object.assign(new Error('rate_limited'),{status:429});}]){
  let calls=0;
  const selected=await generateSelection(places,request,summerWeather,{key:'dummy-llm-key',authorize:denied,fetcher:async()=>{calls++;return completion();}});
  assert.equal(selected,null);assert.equal(calls,0);
  const result=template(selected);assert.equal(result.mode,'template');assert.equal(result.trace.llmUsed,false);assert.equal(result.recommendations.length,1);assert.equal(result.recommendations[0].poi.id,poi.id);assert.equal(result.recommendations[0].poi.rating,null);
 }
});

test('HTTP errors, malformed output and unsupported facts spend their reservation and safely fall back',async()=>{
 const failures=[
  async()=>new Response('{}',{status:429,headers:{'Content-Type':'application/json'}}),
  async()=>{throw new Error('provider timeout');},
  async()=>Response.json({choices:[{message:{content:'not JSON'}}]}),
  async()=>completion({recommendations:[{...validPlan.recommendations[0],id:'invented-place'}]}),
  async()=>completion({recommendations:[{...validPlan.recommendations[0],why:'Билет стоит 500 тенге.'}]}),
 ];
 for(const failure of failures){
  const db=database();try{
   let calls=0;
   const selected=await generateSelection(places,request,summerWeather,{key:'dummy-llm-key',authorize:authorize(adapter(db)),fetcher:async(...args)=>{calls++;return failure(...args);}});
   assert.equal(selected,null);assert.equal(calls,1);assert.equal(template(selected).mode,'template');
   assert.equal(db.prepare("SELECT SUM(units) n FROM provider_budget_reservations WHERE scope='llm-requests-v2'").get().n,1);
   assert.ok(db.prepare("SELECT SUM(units) n FROM provider_budget_reservations WHERE scope='llm-tokens-v2'").get().n>1200);
  }finally{db.close();}
 }
});

test('all new provider keys remain server-only in public runtime configuration',()=>{
 const env={LLM_API_KEY:'secret-llm',GEOAPIFY_API_KEY:'secret-geocode',GRAPHHOPPER_API_KEY:'secret-route',LLM_PROVIDER:'groq',LLM_MODEL:'openai/gpt-oss-20b'};
 const config=getRuntimeConfig(env),serialized=JSON.stringify(config);
 assert.equal(config.geocodingProvider,'geoapify');assert.equal(config.routingProvider,'graphhopper');
 for(const value of Object.values(env).filter(value=>value.startsWith('secret-')))assert.ok(!serialized.includes(value));
 assert.ok(!serialized.includes('LLM_API_KEY'));assert.ok(!serialized.includes('GEOAPIFY_API_KEY'));assert.ok(!serialized.includes('GRAPHHOPPER_API_KEY'));
});
