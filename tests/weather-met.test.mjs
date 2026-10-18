import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeatherService,parseMetForecast,metCondition,weatherDescription,getWeather} from '../lib/weather.ts';
import {requiresIndoor} from '../lib/rag.ts';

const base=Date.parse('2026-10-18T12:00:00Z');
const request={location:{lat:51.128239,lon:71.430519},weatherMode:'live'};
function payload({updated=base-30*60_000,hours=[0,1,2,3],symbol='partlycloudy_night',temperature=9.1,wind=2.8}={}){
 return {type:'Feature',properties:{meta:{updated_at:new Date(updated).toISOString(),units:{air_temperature:'celsius',wind_speed:'m/s'}},timeseries:hours.map(hour=>({time:new Date(base+hour*3_600_000).toISOString(),data:{instant:{details:{air_temperature:temperature-hour,wind_speed:wind}},next_1_hours:{summary:{symbol_code:symbol},details:{precipitation_amount:0}}}}))}};
}
test('verified MET forecast fallback preserves provenance, current valid hour, null apparent temperature and rounded provider coordinates',async()=>{
 let at=base+10*60_000;const calls=[],diagnostics=[];
 const service=createWeatherService({now:()=>at,onDiagnostic:value=>diagnostics.push(value),fetcher:async(url,options)=>{
  calls.push({url:new URL(url),options});
  if(new URL(url).hostname==='api.open-meteo.com')return new Response('blocked',{status:403});
  return Response.json(payload(),{headers:{Expires:new Date(base+40*60_000).toUTCString(),'Last-Modified':'Sun, 18 Oct 2026 11:26:46 GMT'}});
 }});
 const weather=await service.get(request);
 assert.equal(weather.status,'live');assert.equal(weather.dataKind,'forecast');assert.equal(weather.isDemo,false);assert.equal(weather.source,'MET Norway');assert.equal(weather.feelsLike,null);assert.equal(weather.temperature,9);assert.equal(weather.windKmh,10);assert.equal(weather.isDay,false);assert.equal(weather.code,2);assert.equal(weather.modelUpdatedAt,'2026-10-18T11:30:00.000Z');assert.equal(weather.observedAt,'2026-10-18T12:00:00.000Z');assert.match(weather.licenseUrl,/creativecommons.org/);
 assert.equal(calls.length,2);assert.equal(calls[1].url.hostname,'api.met.no');assert.equal(calls[1].url.searchParams.get('lat'),'51.13');assert.equal(calls[1].url.searchParams.get('lon'),'71.43');assert.ok(!String(calls[1].url).includes('51.128239'));assert.ok(calls[1].options.headers['User-Agent'].includes('seruen-astana.connect550439.chatgpt.site'));assert.equal(calls[1].options.redirect,'manual');
 assert.deepEqual(diagnostics,[{event:'weather_provider_failure',provider:'open-meteo',reason:'http',httpStatus:403}]);
});
test('MET respects Expires, advances the current hour from cached forecast and sends exact Last-Modified on 304 revalidation',async()=>{
 let at=base+10*60_000,metCalls=0,conditional;
 const modified='Sun, 18 Oct 2026 11:26:46 GMT';
 const service=createWeatherService({now:()=>at,fetcher:async(url,options)=>{
  if(new URL(url).hostname==='api.open-meteo.com')return new Response('blocked',{status:403});
  metCalls++;conditional=options.headers['If-Modified-Since'];
  if(metCalls===1)return Response.json(payload(),{headers:{Expires:new Date(base+80*60_000).toUTCString(),'Last-Modified':modified}});
  return new Response(null,{status:304,headers:{Expires:new Date(base+120*60_000).toUTCString()}});
 }});
 const first=await service.get(request);assert.equal(metCalls,1);assert.equal(conditional,undefined);
 at=base+21*60_000;await service.get(request);assert.equal(metCalls,1);
 at=base+61*60_000;const nextHour=await service.get(request);assert.equal(metCalls,1);assert.equal(nextHour.observedAt,'2026-10-18T13:00:00.000Z');assert.equal(nextHour.temperature,8);assert.equal(nextHour.retrievedAt,first.retrievedAt);
 at=base+81*60_000;const validated=await service.get(request);assert.equal(metCalls,2);assert.equal(conditional,modified);assert.equal(validated.status,'live');assert.equal(validated.retrievedAt,new Date(at).toISOString());assert.equal(validated.observedAt,'2026-10-18T13:00:00.000Z');assert.equal(validated.modelUpdatedAt,first.modelUpdatedAt);
});
test('304 never relabels an expired forecast point or stale model as current',async()=>{
 let at=base+10*60_000,metCalls=0;
 const service=createWeatherService({now:()=>at,fetcher:async(url)=>{
  if(new URL(url).hostname==='api.open-meteo.com')return new Response('blocked',{status:403});
  metCalls++;
  return metCalls===1 ? Response.json(payload({hours:[0]}),{headers:{Expires:new Date(base+20*60_000).toUTCString(),'Last-Modified':'Sun, 18 Oct 2026 11:26:46 GMT'}}) : new Response(null,{status:304});
 }});
 assert.equal((await service.get(request)).status,'live');at=base+70*60_000;
 const stale=await service.get(request);assert.equal(metCalls,2);assert.equal(stale.status,'unavailable');assert.equal(stale.temperature,null);
 assert.equal(parseMetForecast(payload({updated:base-13*3_600_000}),base),null);
});
test('MET rejects wrong units, malformed readings, unknown symbols, future-only points and stale updates',()=>{
 const wrongUnit=payload();wrongUnit.properties.meta.units.wind_speed='km/h';
 for(const invalid of [null,{},wrongUnit,payload({wind:100}),payload({temperature:Infinity}),payload({symbol:'notreal_day'}),payload({hours:[2]}),payload({updated:base+20*60_000}),payload({updated:base-13*3_600_000})])assert.equal(parseMetForecast(invalid,base+10*60_000),null);
 for(const [symbol,code] of [['clearsky_day',0],['fair_night',1],['cloudy',3],['fog',45],['rain',61],['lightrainshowers_day',80],['snow',71],['lightsnowshowers_night',85],['lightssnowshowersandthunder_day',95]])assert.equal(metCondition(symbol)?.code,code);
 const sleet=parseMetForecast(payload({symbol:'sleet'}),base);assert.equal(weatherDescription(sleet,'en'),'Sleet');assert.equal(weatherDescription(sleet,'ru'),'Мокрый снег');
});
test('RAG retains absent apparent temperature and uses a conservative cold-plus-wind policy',async()=>{
 const live=payload({updated:Date.now()-1000,hours:[0],temperature:-11,wind:7});live.properties.timeseries[0].time=new Date(Math.floor(Date.now()/3_600_000)*3_600_000).toISOString();
 const weather=await getWeather(request,async(url)=>new URL(url).hostname==='api.open-meteo.com'?new Response('down',{status:503}):Response.json(live));
 assert.equal(weather.status,'live');assert.equal(weather.source,'MET Norway');assert.equal(weather.feelsLike,null);assert.equal(weather.temperature,-11);assert.equal(weather.windKmh,25);assert.equal(requiresIndoor(weather),true);assert.equal(weather.safetyFallback,false);
});
test('provider diagnostics are bounded enums and HTTP codes, never URL, raw provider body or user coordinates',async()=>{
 const diagnostics=[];
 const service=createWeatherService({now:()=>base, onDiagnostic:value=>diagnostics.push(value),fetcher:async()=>new Response('sensitive raw body address',{status:429})});
 await service.get(request);await service.get({...request,location:{lat:51.15,lon:71.45}});
 assert.equal(diagnostics.length,2);for(const entry of diagnostics){assert.deepEqual(Object.keys(entry).sort(),['event','httpStatus','provider','reason']);assert.equal(entry.httpStatus,429);assert.ok(!JSON.stringify(entry).includes('51.128239'));assert.ok(!JSON.stringify(entry).includes('sensitive'));}
});
