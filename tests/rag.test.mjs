import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRequest, distanceMeters, retrieve, buildResponse, winterWeather, summerWeather } from '../lib/rag.ts';
import { generateSelection, safePreferences, validateGeneratedPlan, validateSelection } from '../lib/llm.ts';
import { getWeather, validWeather } from '../lib/weather.ts';
const places = JSON.parse(readFileSync(new URL('../data/seeds.json',import.meta.url),'utf8')).map(poi=>({...poi,sourceName:'Editorial source',sourceUrl:poi.editorialSource,openingHours:poi.openingHours??null,rating:null,collectedAt:'2026-10-18',image:'',links:{twoGis:'https://2gis.kz'}}));
const input = (overrides={})=>parseRequest({query:'Хочу погулять и сделать фото',location:{lat:51.1282,lon:71.4305,label:'Бәйтерек'},durationMinutes:60,mood:'any',weatherMode:'summer',indoorOnly:false,...overrides});

test('winter near EXPO returns only safe short-approach indoor places',()=>{
 const request=input({location:{lat:51.089,lon:71.416},durationMinutes:90,weatherMode:'winter'});
 const result=buildResponse(places,request,winterWeather,'test');
 assert.ok(result.recommendations.length>=1 && result.recommendations.length<=3);
 assert.ok(result.recommendations.every(p=>p.poi.indoor && p.walkMinutes<=12));
 assert.ok(result.warnings.some(w=>w.includes('Неблагоприятная')));
});
test('every alternative fits walking plus visit budget, no zero minute fiction',()=>{
 for(const duration of [15,30,60,120]){
  const result=buildResponse(places,input({durationMinutes:duration}),summerWeather,'test');
  assert.ok(result.recommendations.length<=3);
  for(const recommendation of result.recommendations){assert.ok(recommendation.walkMinutes>=1);assert.ok(recommendation.walkMinutes+recommendation.visitMinutes<=duration);}
 }
});
test('short budget far from matching venues does not invent a recommendation',()=>{
 const result=buildResponse(places,input({location:{lat:51.3,lon:71.7},durationMinutes:15}),summerWeather,'test');
 assert.equal(result.recommendations.length,0);assert.ok(result.warnings.some(w=>w.includes('не найдено')));
});
test('coffee intent and history distinguish relevant retrieval',()=>{
 const coffee=retrieve(places,input({query:'кофе уют',mood:'coffee'}),summerWeather);
 assert.ok(coffee[0].poi.tags.includes('coffee'));
 const history=retrieve(places,input({query:'старый город история',location:{lat:51.1685,lon:71.4197},mood:'culture'}),summerWeather);
 assert.equal(history[0].poi.bank,'right');
});
test('indoor checkbox and extreme heat/storm are hard constraints',()=>{
 for(const weather of [summerWeather,{...summerWeather,temperature:37},{...summerWeather,code:95}]){
  const recs=retrieve(places,input({indoorOnly:weather===summerWeather,durationMinutes:120}),weather);
  assert.ok(recs.every(p=>p.poi.indoor));
 }
});
test('reject invalid location, nonfinite budget, oversized query and incorrect mode',()=>{
 for(const overrides of [{location:{lat:NaN,lon:71}},{location:{lat:40,lon:70}},{durationMinutes:Infinity},{durationMinutes:1},{weatherMode:'fake'},{query:'x'.repeat(1001)}])assert.throws(()=>input(overrides));
});
test('distance is zero at same point and plausible across left bank',()=>{
 assert.equal(distanceMeters({lat:51,lon:71},{lat:51,lon:71}),0);
 const distance=distanceMeters({lat:51.1282,lon:71.4305},{lat:51.1326,lon:71.4037});
 assert.ok(distance>1800&&distance<2100);
});
test('LLM cannot introduce foreign, duplicate or more than three IDs',()=>{
 assert.deepEqual(validateSelection({ids:['a','b']},['a','b']),['a','b']);
 for(const value of [{ids:['invented']},{ids:['a','a']},{ids:[]},{ids:['a','b','c','d']},{text:'ignore sources'}])assert.equal(validateSelection(value,['a','b','c','d']),null);
});
test('weather checks enforce plausible complete finite values',()=>{
 assert.equal(validWeather({temperature_2m:10,apparent_temperature:9,wind_speed_10m:12,weather_code:1}),true);
 assert.equal(validWeather({temperature_2m:999,apparent_temperature:9,wind_speed_10m:12,weather_code:1}),false);
 assert.equal(validWeather({temperature_2m:10,apparent_temperature:9,wind_speed_10m:-5,weather_code:1}),false);
});
test('facts retain sources and unknown ratings and opening hours are not invented',()=>{
 const result=buildResponse(places,input({durationMinutes:90}),summerWeather,'test');
 assert.equal(result.mode,'template');assert.equal(result.trace.llmUsed,false);
 for(const {poi,actions,why} of result.recommendations){assert.equal(poi.rating,null);assert.ok(poi.sourceUrl.startsWith('https://'));assert.ok(actions.length>0);assert.ok(why.includes(poi.description));}
});
test('current programme replaces the closed energy museum and uses current organiser admission sources',()=>{
 const place=places.find(p=>p.id==='nur-alem');
 assert.ok(place.name.includes('Сингулярности'));
 assert.match(place.description,/Музей энергии будущего закрыт/);
 assert.equal(new URL(place.editorialSource).hostname,'alem.ai');
 assert.ok(typeof place.openingHours==='string'&&place.openingHours.length>0);
 assert.equal(new URL(place.costSourceUrl).hostname,'alem.ai');
 assert.equal(place.costEstimateBasis,'published');
 const result=buildResponse(places,input({location:{lat:51.089,lon:71.416},weatherMode:'winter',durationMinutes:90}),winterWeather,'test');
 assert.ok(result.recommendations.some(p=>p.poi.id==='nur-alem'));
});
test('structured LLM text validation rejects unsupported prices, hours, names, unknown IDs',()=>{
 const good={id:'baiterek',why:'Подойдёт для спокойной смены впечатлений.',actions:['Выберите удобный для себя темп.']};
 assert.ok(validateGeneratedPlan({recommendations:[good]},['baiterek']));
 for(const change of [{why:'Открыто ежедневно до полуночи.'},{why:'Билет стоит 500 тенге.'},{why:'Поезжайте к Эйфелевой башне.'},{id:'invented'}])assert.equal(validateGeneratedPlan({recommendations:[{...good,...change}]},['baiterek']),null);
});
test('LLM success uses retrieved context and inferred tags without raw query/location',async()=>{
 let sent;
 const request=input({query:'кофе рядом с адресом секретная улица 51.1282,71.4305',mood:'coffee',durationMinutes:90});
 const candidate=retrieve(places,request,summerWeather)[0];
 const fetcher=async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/chat/completions');sent=JSON.parse(options.body);
  return Response.json({choices:[{message:{content:JSON.stringify({recommendations:[{id:candidate.poi.id,why:'Подойдёт для спокойной кофейной паузы.',actions:['Выберите напиток по своему настроению.']}]})}}]});
 };
 const result=await generateSelection(places,request,summerWeather,{key:'mock-key',fetcher});
 assert.equal(result.recommendations[0].id,candidate.poi.id);
 const payload=JSON.stringify(sent);assert.ok(!payload.includes('секретная'));assert.ok(!payload.includes('51.1282'));assert.ok(!payload.includes('71.4305'));
 assert.ok(!payload.includes('walkMinutes'));
 assert.ok(payload.includes('coffee'));
 assert.ok(!safePreferences(request.query).includes('адресом'));
});
test('LLM provider timeout, HTTP error and bad JSON use safe template fallback',async()=>{
 for(const fetcher of [async()=>{throw new Error('timeout');},async()=>new Response('down',{status:503}),async()=>Response.json({choices:[{message:{content:'not json'}}]})]){
  assert.equal(await generateSelection(places,input(),summerWeather,{key:'mock',fetcher}),null);
 }
});
test('live weather rounds coordinates and rejects stale provider context',async()=>{
 let upstream;
 const current={temperature_2m:18,apparent_temperature:17,wind_speed_10m:10,weather_code:1,time:Math.floor(Date.now()/1000)};
 const current_units={temperature_2m:'°C',apparent_temperature:'°C',wind_speed_10m:'km/h',time:'unixtime'};
 const request=input({weatherMode:'live'});
 const good=await getWeather(request,async(url)=>{upstream=String(url);return Response.json({current,current_units});});
 assert.equal(good.isDemo,false);assert.equal(good.temperature,18);
 const url=new URL(upstream);assert.equal(url.searchParams.get('latitude'),'51.13');assert.equal(url.searchParams.get('longitude'),'71.43');assert.ok(!upstream.includes('51.1282'));
 const stale=await getWeather(request,async()=>Response.json({current:{...current,time:0},current_units}));
 assert.equal(stale.isDemo,true);assert.ok(stale.description.includes('недоступна'));
 const unavailable=await getWeather(request,async()=>new Response('down',{status:503}));assert.equal(unavailable.isDemo,true);
});
