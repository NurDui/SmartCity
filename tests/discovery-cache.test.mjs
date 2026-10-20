import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {parseVisitAstanaEvents} from "../lib/visit-events.ts";
import {cachedPublicDiscovery} from "../lib/discovery-cache.ts";
import {freshPublicItems,discover} from "../lib/live-data.ts";
const now=Date.parse("2026-10-20T08:00:00Z");
const migration=await readFile(new URL("../drizzle/0003_public_discovery_cache.sql",import.meta.url),"utf8");
function adapter(db){return {prepare(sql){return {bind(...values){return {async first(){return db.prepare(sql).get(...values)??null;},async run(){return db.prepare(sql).run(...values);}};}};}};}
const card=(dates="01.10.2026 - 31.10.2026",url="https://ticketon.kz/event/example")=>`<div class="upcoming"><h5 class="upcoming__title">Выставка</h5><div class="upcoming__date">${dates}</div><img src="/upload/poster.jpg" alt="poster"><a href="${url}" class="upcoming__buy">Билеты</a></div>`;
const parse=(html)=>parseVisitAstanaEvents(html,{date:"2026-10-20",now});
const listing=()=>({status:"live",source:"Test city listing",updatedAt:new Date(now).toISOString(),items:parse(card()),message:"Test"});
test("multi-day public notices expose date precision and do not invent venue, price or hours",()=>{
 const [event]=parse(card());assert.equal(event.datePrecision,"day");assert.equal(event.sourceDateRange,"01.10.2026 – 31.10.2026");
 for(const key of ["lat","lon","distanceMeters","priceKzt"])assert.equal(event[key],null);
 assert.match(event.sourceUrl,/start=2026-10-20$/);
 assert.equal(parse(card()+card()).length,1);
});
test("only valid current intervals and allowlisted public links become event notices",()=>{
 for(const dates of ["01.10.2026 - 19.10.2026","21.10.2026 - 31.10.2026","31.02.2026 - 31.10.2026","31.10.2026 - 01.10.2026","01.01.2024 - 31.10.2026"])assert.equal(parse(card(dates)).length,0);
 for(const url of ["javascript:alert(1)","https://ticketon.kz.evil.example/e","http://ticketon.kz/e","https://user:pass@ticketon.kz/e"])assert.equal(parse(card(undefined,url)).length,0);
});
test("cached public entries are rechecked at request time; expired films and overnight notices disappear",()=>{
 const place={lat:51.13,lon:71.43},entry={...listing().items[0],datePrecision:undefined,lat:51.14,lon:71.44,startsAt:"2026-10-20T12:00:00+05:00",endsAt:undefined};
 assert.equal(freshPublicItems({...listing(),items:[entry]},"cinema",place,now).items.length,0);
 assert.equal(freshPublicItems(listing(),"events",place,Date.parse("2026-10-31T19:00:00Z")).items.length,0);
 assert.equal(freshPublicItems(listing(),"events",place,now).items[0].distanceMeters,null);
 const current={...entry,startsAt:"2026-10-20T19:00:00+05:00"};
 const first=freshPublicItems({...listing(),items:[current]},"cinema",place,now).items[0];
 const second=freshPublicItems({...listing(),items:[current]},"cinema",{lat:51.16,lon:71.48},now).items[0];
 assert.notEqual(first.distanceMeters,second.distanceMeters);
});
test("D1 admits only one public-source refresh and caches serializable public data across requests",async()=>{
 const db=new DatabaseSync(":memory:");db.exec(migration);
 try{
  const store=adapter(db);let resolve;let calls=0;
  const first=cachedPublicDiscovery(store,"events:2026-10-20:ru",now,()=>{calls++;return new Promise(r=>{resolve=r;});});
  await new Promise(r=>setImmediate(r));
  await assert.rejects(cachedPublicDiscovery(store,"events:2026-10-20:ru",now,async()=>{calls++;return listing();}),/progress/);
  resolve(listing());await first;
  const cached=await cachedPublicDiscovery(store,"events:2026-10-20:ru",now+1000,async()=>{calls++;return listing();});
  assert.equal(calls,1);assert.equal(cached.items.length,1);
  const row=db.prepare("SELECT * FROM public_discovery_cache").get();
  assert.deepEqual(Object.keys(row).sort(),["expires","key","value"]);
  for(const token of ["latitude","longitude","ipAddress","deviceLocation"])assert.ok(!row.value.includes(token));
 }finally{db.close();}
});
test("production cache outage fails closed without contacting public upstreams",async()=>{
 let calls=0;
 const result=await discover({lat:51.13,lon:71.43},{now,env:{},requireSharedCache:true,db:{prepare(){throw new Error("offline");}},fetcher:async()=>{calls++;throw new Error("must not fetch");}});
 assert.equal(calls,0);assert.equal(result.events.status,"error");assert.equal(result.cinema.status,"error");
});
test("reviewed venues retain independent provenance, finite city coordinates and unknown commercial claims",async()=>{
 const places=JSON.parse(await readFile(new URL("../data/curated-venues.json",import.meta.url),"utf8"));
 assert.equal(places.length,12);assert.equal(new Set(places.map(p=>p.id)).size,12);
 for(const p of places){assert.ok(p.lat>50.9&&p.lat<51.35&&p.lon>71.15&&p.lon<71.8);assert.ok(!p.sourceUrl.includes("2gis"));assert.equal(p.rating,null);assert.equal(p.estimatedCostKzt,null);assert.ok(p.coordinateSourceUrl.startsWith("https://"));assert.ok(p.sourceName);}
});
