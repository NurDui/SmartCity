import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherService, getWeather, weatherIconName, weatherLabel, WEATHER_MAX_AGE_MS, WEATHER_REFRESH_MS } from '../lib/weather.ts';

const now0 = Date.parse('2026-10-18T12:00:00Z');
const input = (changes={}) => ({ location:{lat:51.128239,lon:71.430519},weatherMode:'live',...changes });
function payload(at=now0,changes={}) {
 return {current:{temperature_2m:9.8,apparent_temperature:7,wind_speed_10m:8.6,weather_code:3,time:Math.floor(at/1000)-300,is_day:1,...changes},current_units:{temperature_2m:'°C',apparent_temperature:'°C',wind_speed_10m:'km/h',time:'unixtime'}};
}
test('live weather is standalone, explicitly unit-bound, rounded upstream and timestamped as model data',async()=>{
 let upstream,options;
 const service=createWeatherService({now:()=>now0,fetcher:async(url,init)=>{upstream=new URL(url);options=init;return Response.json(payload());}});
 const weather=await service.get(input());
 assert.equal(weather.status,'live');assert.equal(weather.temperature,10);assert.equal(weather.feelsLike,7);assert.equal(weather.windKmh,9);
 assert.equal(weather.source,'Open-Meteo');assert.equal(weather.isDemo,false);assert.equal(weather.safetyFallback,false);
 assert.equal(weather.observedAt,'2026-10-18T11:55:00.000Z');assert.equal(weather.retrievedAt,'2026-10-18T12:00:00.000Z');assert.deepEqual(weather.units,{temperature:'°C',wind:'km/h'});
 assert.equal(upstream.hostname,'api.open-meteo.com');assert.equal(upstream.searchParams.get('latitude'),'51.13');assert.equal(upstream.searchParams.get('longitude'),'71.43');assert.ok(!String(upstream).includes('51.128239'));
 assert.equal(upstream.searchParams.get('temperature_unit'),'celsius');assert.equal(upstream.searchParams.get('wind_speed_unit'),'kmh');assert.equal(upstream.searchParams.get('timeformat'),'unixtime');assert.equal(upstream.searchParams.get('timezone'),'Asia/Qyzylorda');assert.ok(upstream.searchParams.get('current').includes('is_day'));assert.equal(options.redirect,'manual');assert.equal(options.cache,'no-store');
});
test('unavailable, stale, future, wrong units, malformed and oversized responses never publish fallback degrees',async()=>{
 const responses=[
  ()=>new Response('down',{status:503}),
  ()=>Response.json(payload(now0-WEATHER_MAX_AGE_MS)),
  ()=>Response.json(payload(now0,{time:now0/1000+121})),
  ()=>Response.json({...payload(),current_units:{...payload().current_units,temperature_2m:'°F'}}),
  ()=>Response.json(payload(now0,{temperature_2m:999})),
  ()=>Response.json(payload(now0,{weather_code:42})),
  ()=>new Response('{bad json'),
  ()=>new Response(' '.repeat(33000)),
  ()=>{throw new Error('network');},
 ];
 for (const response of responses) {
  const result=await createWeatherService({now:()=>now0,fetcher:async()=>response()}).get(input());
  assert.equal(result.status,'unavailable');assert.equal(result.isDemo,false);assert.equal(result.safetyFallback,false);
  for(const field of ['temperature','feelsLike','windKmh','code','observedAt'])assert.equal(result[field],null,field);
 }
});
test('RAG conservative fallback is explicitly separate from public live weather',async()=>{
 const result=await getWeather(input(),async()=>new Response('down',{status:503}));
 assert.equal(result.status,'unavailable');assert.equal(result.safetyFallback,true);assert.equal(result.isDemo,true);assert.ok(result.windKmh>=30);assert.ok(result.feelsLike<-20);assert.ok(result.description.includes('не фактические'));
});
test('explicit seasonal demos require no provider calls and do not claim a model observation time',async()=>{
 let calls=0;const service=createWeatherService({now:()=>now0,fetcher:async()=>{calls++;throw new Error('Unexpected network');}});
 const summer=await service.get(input({weatherMode:'summer'})),winter=await service.get(input({weatherMode:'winter'}));
 assert.equal(calls,0);assert.equal(summer.temperature,24);assert.equal(winter.temperature,-25);
 for(const result of [summer,winter]){assert.equal(result.status,'demo');assert.equal(result.isDemo,true);assert.equal(result.source,'Seruen demo');assert.equal(result.observedAt,null);assert.equal(result.sourceUrl,null);}
});
test('shared rounded cell coalesces simultaneous requests and caches live results for ten minutes',async()=>{
 let at=now0,calls=0,release;
 const service=createWeatherService({now:()=>at,fetcher:async()=>{calls++;await new Promise(resolve=>{release=resolve;});return Response.json(payload(at));}});
 const first=service.get(input()),second=service.get(input({location:{lat:51.129,lon:71.431}}));
 assert.equal(calls,1);release();const [a,b]=await Promise.all([first,second]);assert.deepEqual(a,b);
 a.temperature=999;assert.equal((await service.get(input())).temperature,10);assert.equal(calls,1);
 at+=WEATHER_REFRESH_MS-1;await service.get(input());assert.equal(calls,1);
 at+=2;const refresh=service.get(input());assert.equal(calls,2);release();await refresh;
});
test('cached models expire by observation age even when cache TTL has not expired',async()=>{
 let at=now0,calls=0;
 const service=createWeatherService({now:()=>at,fetcher:async()=>{calls++;return Response.json(payload(now0,{time:(now0-WEATHER_MAX_AGE_MS+60_000)/1000}));}});
 assert.equal((await service.get(input())).status,'live');at+=60_001;
 assert.equal((await service.get(input())).status,'unavailable');assert.equal(calls,2);
});
test('cancelling one subscriber preserves another, cancelling the last aborts upstream and avoids caching',async()=>{
 let upstreamSignal,release,calls=0;
 const service=createWeatherService({now:()=>now0,fetcher:async(url,options)=>{calls++;upstreamSignal=options.signal;await new Promise(resolve=>{release=resolve;});return Response.json(payload());}});
 const abortA=new AbortController(),abortB=new AbortController();
 const a=service.get(input(),abortA.signal),b=service.get(input(),abortB.signal);
 abortA.abort();assert.equal((await a).status,'unavailable');assert.equal(upstreamSignal.aborted,false);
 release();assert.equal((await b).status,'live');
 const other=input({location:{lat:51.14,lon:71.44}}),abortC=new AbortController();const c=service.get(other,abortC.signal);
 abortC.abort();assert.equal((await c).status,'unavailable');assert.equal(upstreamSignal.aborted,true);release();await new Promise(resolve=>setImmediate(resolve));
 const again=service.get(other);assert.equal(calls,3);release();await again;
});
test('at most four distinct cells fetch concurrently; invalid locations and cancelled requests do not call provider',async()=>{
 let calls=0;const releases=[];
 const service=createWeatherService({now:()=>now0,fetcher:async()=>{calls++;await new Promise(resolve=>releases.push(resolve));return Response.json(payload());}});
 const work=[0,1,2,3].map(i=>service.get(input({location:{lat:51.1+i*.02,lon:71.4}})));
 assert.equal((await service.get(input({location:{lat:51.25,lon:71.6}}))).status,'unavailable');assert.equal(calls,4);
 const cancelled=new AbortController();cancelled.abort();assert.equal((await service.get(input(),cancelled.signal)).status,'unavailable');assert.equal((await service.get(input({location:{lat:0,lon:0}}))).status,'unavailable');assert.equal(calls,4);
 for(const release of releases)release();await Promise.all(work);
});
test('failed cells receive a short negative cache and per-isolate rolling minute cap is fail closed',async()=>{
 let at=now0,calls=0;
 const service=createWeatherService({now:()=>at,fetcher:async()=>{calls++;return new Response('down',{status:503});}});
 await service.get(input());await service.get(input());assert.equal(calls,1);at+=30_001;await service.get(input());assert.equal(calls,2);
 // More than 64 distinct cells exercises both cache eviction and the shared upstream cap.
 const limited=createWeatherService({now:()=>at,fetcher:async()=>{calls++;return Response.json(payload(at));}});calls=0;
 for(let i=0;i<501;i++)await limited.get(input({location:{lat:51+Math.floor(i/50)*.01,lon:71.2+(i%50)*.01}}));
 assert.equal(calls,500);at+=60_001;await limited.get(input({location:{lat:51.2,lon:71.7}}));assert.equal(calls,501);
});
test('condition icons follow WMO codes rather than warm temperature; all languages distinguish clouds, precipitation and unavailable',()=>{
 for(const [code,icon] of [[0,'sun'],[1,'sun'],[2,'partly'],[3,'cloud'],[45,'fog'],[51,'drizzle'],[61,'rain'],[66,'rain'],[80,'rain'],[71,'snow'],[85,'snow'],[95,'storm'],[97,'storm'],[99,'storm'],[null,'unknown'],[42,'unknown']])assert.equal(weatherIconName(code),icon);
 assert.equal(weatherIconName(0,false),'moon');
 for(const language of ['ru','kk','en']){assert.notEqual(weatherLabel(3,language),weatherLabel(0,language));assert.notEqual(weatherLabel(61,language),weatherLabel(71,language));assert.ok(weatherLabel(null,language).length>5);}
 assert.equal(weatherLabel(3,'en'),'Overcast');assert.equal(weatherLabel(61,'ru'),'Дождь');assert.equal(weatherLabel(3,'kk'),'Бұлтты');
});
