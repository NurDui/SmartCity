import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeatherService} from '../lib/weather.ts';
test('Workers subscribers wait for a JSON cache without sharing request I/O or cancellation',async()=>{
 let calls=0,release;const gate=new Promise(r=>release=r);
 const service=createWeatherService({shareInflight:false,fetcher:async()=>{calls++;await gate;return new Response(JSON.stringify({current:{temperature_2m:10,apparent_temperature:8,wind_speed_10m:10,weather_code:0,time:Date.now()/1000,is_day:1},current_units:{temperature_2m:'°C',apparent_temperature:'°C',wind_speed_10m:'km/h',time:'unixtime'}}));}});
 const request={location:{lat:51.12,lon:71.43},weatherMode:'live'},first=service.get(request),controller=new AbortController(),second=service.get(request,controller.signal);controller.abort();release();const [a,b]=await Promise.all([first,second]);assert.equal(a.status,'live');assert.equal(b.status,'unavailable');assert.equal((await service.get(request)).status,'live');assert.equal(calls,1);
});
