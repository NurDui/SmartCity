import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import {requestYandexGeocode} from '../lib/yandex-geocoder.ts';
import {signYandexGeocoderUrl} from '../lib/yandex-signature.ts';

const credentials={YANDEX_GEOCODER_ENABLED:'true',YANDEX_FREE_ELIGIBILITY_CONFIRMED:'true',YANDEX_QUOTA_DEDICATED_BUDGET_CONFIRMED:'true',YANDEX_GEOCODER_API_KEY:'test-provider-key-never-real',YANDEX_GEOCODER_SIGNING_SECRET:'MDEyMzQ1Njc4OWFiY2RlZg==',YANDEX_QUOTA_HMAC_SECRET:'a'.repeat(40)};
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE yandex_quota_reservations(id TEXT PRIMARY KEY,scope TEXT NOT NULL,service TEXT NOT NULL,identity_hash TEXT NOT NULL,reserved_at_ms INTEGER NOT NULL)');
 const db={prepare(sql){return {bind(...values){return {async first(){return sqlite.prepare(sql).get(...values)??null},async run(){return sqlite.prepare(sql).run(...values)}}}}}};
 return {db,sqlite,input:{address:'Астана, Кунаева 12',language:'ru',context:{provider:'yandex-map',consented:true},env:credentials,db,clientIp:'203.0.113.10'}};
}
const original={response:{GeoObjectCollection:{featureMember:[{GeoObject:{name:'Кунаева, 12',Point:{pos:'71.43 51.13'}}}]}}};

test('no Yandex request without policy, map consent, valid input and a working shared database',async()=>{
 const f=fixture();let calls=0;const fetcher=async()=>{calls++;throw Error('must never run');};
 for(const change of [{env:{}},{db:null},{context:{provider:'openstreetmap',consented:true}},{context:{provider:'yandex-map',consented:false}},{address:'x'},{address:'x'.repeat(201)},{clientIp:'spoofed-identity'}])assert.equal((await requestYandexGeocode({...f.input,...change,fetcher})).ok,false);
 assert.equal(calls,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM yandex_quota_reservations').get().n,0);f.sqlite.close();
});

test('one reserved fixed-host attempt preserves original geocoder result and never exposes the key',async()=>{
 const f=fixture();let calls=0;
 const result=await requestYandexGeocode({...f.input,fetcher:async(url,options)=>{
  calls++;assert.equal(new URL(url).origin,'https://geocode-maps.yandex.ru');assert.equal(new URL(url).pathname,'/v1');assert.equal(new URL(url).searchParams.get('results'),'1');assert.equal(new URL(url).searchParams.get('rspn'),'1');assert.ok(new URL(url).searchParams.get('signature'));assert.equal([...new URL(url).searchParams.keys()].at(-1),'signature');assert.equal(options.redirect,'manual');assert.equal(options.cache,'no-store');assert.ok(options.signal);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM yandex_quota_reservations').get().n,1,'reservation must commit before network');return Response.json(original);
 }});
 assert.equal(result.ok,true);assert.deepEqual(result.data,original);assert.equal(result.displayOnlyOn,'yandex-map');assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes(credentials.YANDEX_GEOCODER_API_KEY));f.sqlite.close();
});

test('WithTTL signature matches independent Node crypto for an exact encoded URL and UTC hour',async()=>{
 const url=new URL('https://geocode-maps.yandex.ru/v1?apikey=test&geocode=%D0%90%D1%81%D1%82%D0%B0%D0%BD%D0%B0&format=json');
 const now=new Date('2026-10-18T09:59:59.123Z');
 const temporal=createHmac('sha256',Buffer.from(credentials.YANDEX_GEOCODER_SIGNING_SECRET,'base64url')).update('2026-10-18T09:00:00Z').digest();
 const expected=createHmac('sha256',temporal).update(url.pathname+url.search).digest('base64').replace(/\+/g,'-').replace(/\//g,'_');
 const signed=await signYandexGeocoderUrl(url,credentials.YANDEX_GEOCODER_SIGNING_SECRET,now);
 assert.equal(signed.searchParams.get('signature'),expected);assert.equal(url.searchParams.has('signature'),false);
 const next=await signYandexGeocoderUrl(url,credentials.YANDEX_GEOCODER_SIGNING_SECRET,new Date('2026-10-18T10:00:00Z'));
 assert.notEqual(signed.searchParams.get('signature'),next.searchParams.get('signature'));
 await assert.rejects(()=>signYandexGeocoderUrl(new URL('https://example.com/v1'),credentials.YANDEX_GEOCODER_SIGNING_SECRET,now));
 await assert.rejects(()=>signYandexGeocoderUrl(url,'too-short',now));
});

test('upstream failure spends the reservation, never retries and a repeated request is blocked before network',async()=>{
 const f=fixture();let calls=0;const fetcher=async()=>{calls++;return new Response('rate limited',{status:429});};
 assert.equal((await requestYandexGeocode({...f.input,fetcher})).reason,'provider_unavailable');
 assert.equal((await requestYandexGeocode({...f.input,fetcher})).reason,'request_denied');
 assert.equal(calls,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM yandex_quota_reservations').get().n,1);f.sqlite.close();
});

test('redirect, malformed payload, oversized stream and credential reflection cannot escape through transport',async()=>{
 const escaped=JSON.stringify({...original,leaked:credentials.YANDEX_GEOCODER_API_KEY}).replace(credentials.YANDEX_GEOCODER_API_KEY,'\\u0074'+credentials.YANDEX_GEOCODER_API_KEY.slice(1));
 assert.equal(escaped.includes(credentials.YANDEX_GEOCODER_API_KEY),false);
 for(const response of [new Response(null,{status:302,headers:{Location:'https://example.com'}}),new Response('{bad json'),Response.json({notAGeocoderResponse:true}),new Response('x'.repeat(256001)),Response.json({...original,leaked:credentials.YANDEX_GEOCODER_API_KEY}),new Response(escaped),Response.json({...original,leaked:credentials.YANDEX_GEOCODER_SIGNING_SECRET})]){
  const f=fixture();let calls=0;const result=await requestYandexGeocode({...f.input,fetcher:async()=>{calls++;return response;}});
  assert.equal(result.ok,false);assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes(credentials.YANDEX_GEOCODER_API_KEY));f.sqlite.close();
 }
});

test('a delayed grant expires without upstream dispatch and stays spent',async()=>{
 const f=fixture();let calls=0;
 const db={prepare(sql){return {bind(...values){const statement=f.db.prepare(sql).bind(...values);return {async first(){const row=await statement.first();await new Promise(resolve=>setTimeout(resolve,450));return row;},run:statement.run};}};}};
 const result=await requestYandexGeocode({...f.input,db,fetcher:async()=>{calls++;return Response.json(original);}});
 assert.equal(result.reason,'dispatch_window_expired');assert.equal(calls,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM yandex_quota_reservations').get().n,1);f.sqlite.close();
});

test('cleanup runs only after dispatch, never queues an already granted request',async()=>{
 const f=fixture();const sequence=[];
 const db={prepare(sql){return {bind(...values){const statement=f.db.prepare(sql).bind(...values);return {first:statement.first,async run(){sequence.push('cleanup');return statement.run();}};}};}};
 const result=await requestYandexGeocode({...f.input,db,fetcher:async()=>{sequence.push('dispatch');return Response.json(original);}});
 assert.equal(result.ok,true);assert.deepEqual(sequence,['dispatch','cleanup']);f.sqlite.close();
});
