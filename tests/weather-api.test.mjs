import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

let providerCalls=0,providerFailure=false;
const realFetch=globalThis.fetch;
globalThis.fetch=async()=>{
 providerCalls++;
 if(providerFailure)return new Response('down',{status:503});
 return Response.json({current:{temperature_2m:11,apparent_temperature:9,wind_speed_10m:12,weather_code:61,is_day:1,time:Math.floor(Date.now()/1000)},current_units:{temperature_2m:'°C',apparent_temperature:'°C',wind_speed_10m:'km/h',time:'unixtime'}});
};
const source=(await readFile(new URL('../app/api/weather/route.ts',import.meta.url),'utf8')).replace('"@/lib/weather"',JSON.stringify(`${new URL('../lib/weather.ts',import.meta.url).href}?endpoint-test`));
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {POST}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
globalThis.fetch=realFetch;
const request=(body)=>new Request('https://seruen.example/api/weather',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const base={location:{lat:51.1282,lon:71.4305},weatherMode:'live'};

test('weather endpoint works independently of recommend, localizes live conditions and prevents HTTP caching',async()=>{
 const response=await POST(request({...base,language:'en'})),{weather}=await response.json();
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(weather.status,'live');assert.equal(weather.description,'Rain');assert.equal(weather.temperature,11);assert.ok(weather.observedAt);assert.equal(providerCalls,1);
 const kk=await (await POST(request({...base,language:'kk'}))).json();assert.equal(kk.weather.description,'Жаңбыр');assert.equal(providerCalls,1);
});
test('weather endpoint seasonal demos are explicitly labelled in every language without provider calls',async()=>{
 const before=providerCalls;
 for(const language of ['ru','kk','en']){
  const {weather}=await (await POST(request({...base,weatherMode:'summer',language}))).json();
  assert.equal(weather.status,'demo');assert.equal(weather.temperature,24);assert.equal(weather.isDemo,true);assert.equal(weather.observedAt,null);assert.match(weather.description,/демо|demo/i);
 }
 assert.equal(providerCalls,before);
});
test('weather endpoint provider failure publishes unavailable/null rather than synthetic winter weather',async()=>{
 providerFailure=true;
 const response=await POST(request({...base,location:{lat:51.18,lon:71.48},language:'en'}));
 assert.equal(response.status,200);const {weather}=await response.json();assert.equal(weather.status,'unavailable');assert.equal(weather.description,'Weather unavailable');assert.equal(weather.temperature,null);assert.equal(weather.feelsLike,null);assert.equal(weather.windKmh,null);assert.equal(weather.isDemo,false);assert.equal(weather.safetyFallback,false);
});
test('weather endpoint rejects malformed body, invalid location, array mode and oversized input without upstream calls',async()=>{
 const before=providerCalls;
 for(const body of [null,{}, {...base,location:{lat:0,lon:0}},{...base,location:{lat:'51.13',lon:71.43}},{...base,weatherMode:['live']},{...base,weatherMode:'wrong'}])assert.equal((await POST(request(body))).status,400);
 assert.equal((await POST(new Request('https://seruen.example/api/weather',{method:'POST',body:'{bad json'}))).status,400);
 assert.equal((await POST(request({...base,extra:'x'.repeat(5000)}))).status,413);assert.equal(providerCalls,before);
});
