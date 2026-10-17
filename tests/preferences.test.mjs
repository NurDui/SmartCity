import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildResponse,parseRequest,retrieve,summerWeather,winterWeather} from '../lib/rag.ts';
import {generateSelection} from '../lib/llm.ts';
import {localizePoi} from '../lib/recommendation-i18n.ts';

const base={query:'',location:{lat:51.1282,lon:71.4305},durationMinutes:90,mood:'any',weatherMode:'summer',indoorOnly:false};
const input=(changes={})=>parseRequest({...base,...changes});
const make=(id,changes={})=>({id,name:id,lat:51.1282,lon:71.4305,description:'Описание места по источнику.',tags:[],category:'Парк',indoor:false,bank:'left',durationMinutes:20,image:'',sourceUrl:'https://example.test/place',sourceName:'Source',collectedAt:'2026-10-18',openingHours:null,rating:null,address:'Astana',links:{twoGis:'https://2gis.kz/'},estimatedCostKzt:null,...changes});
const fixtures=[
 make('exterior',{tags:['photo'],estimatedCostKzt:0,budgetScope:'exterior-only',costEstimateBasis:'editorial-exterior',costSourceUrl:'https://example.test/public-street'}),
 make('unknown-cafe',{tags:['coffee','food','уют'],category:'Кофейня',indoor:true}),
 make('museum',{tags:['culture'],category:'Музей',indoor:true,estimatedCostKzt:3000,costEstimateBasis:'published',costSourceUrl:'https://example.test/admission'}),
 make('food-park',{tags:['nature','family','food'],estimatedCostKzt:1000,costEstimateBasis:'published',costSourceUrl:'https://example.test/admission'}),
 make('expensive-cafe',{tags:['food','coffee'],category:'Кофейня',indoor:true,estimatedCostKzt:4500,costEstimateBasis:'published',costSourceUrl:'https://example.test/menu'}),
 make('unproven-free',{estimatedCostKzt:0}),
];

test('legacy requests resolve safe optional preference defaults',()=>{
 const request=input();assert.equal(request.language,'ru');assert.equal(request.groupSize,1);assert.equal(request.spacePreference,'any');assert.equal(request.budgetPerPerson,null);assert.equal(request.wantsFood,false);
});
test('quiz fields reject invalid types, impossible group sizes and nonfinite budgets',()=>{
 for(const changes of [{language:'de'},{language:['en']},{weatherMode:['summer']},{groupSize:0},{groupSize:21},{groupSize:1.5},{groupSize:'2'},{spacePreference:'roof'},{spacePreference:['outdoor']},{budgetPerPerson:-1},{budgetPerPerson:Infinity},{budgetPerPerson:'1000'},{wantsFood:'yes'}])assert.throws(()=>input(changes));
 assert.doesNotThrow(()=>input({groupSize:20,budgetPerPerson:0,language:'kk',spacePreference:'outdoor',wantsFood:true}));
});
test('space selection is a hard filter and bad weather explicitly overrides outdoors',()=>{
 assert.ok(retrieve(fixtures,input({spacePreference:'outdoor'}),summerWeather).every(item=>!item.poi.indoor));
 assert.ok(retrieve(fixtures,input({spacePreference:'indoor'}),summerWeather).every(item=>item.poi.indoor));
 for(const language of ['ru','kk','en']){
  const result=buildResponse(fixtures,input({spacePreference:'outdoor',language}),winterWeather,'source');
  assert.ok(result.recommendations.length);assert.ok(result.recommendations.every(item=>item.poi.indoor));assert.equal(result.context.indoorRequired,true);
  assert.ok(result.warnings.some(w=>/заменено|overrides|ауыстырылды/.test(w)));
 }
 const conflict=buildResponse(fixtures,input({spacePreference:'outdoor',indoorOnly:true,language:'en'}),summerWeather,'source');assert.ok(conflict.warnings.some(w=>w.includes('Indoor-only')));
});
test('zero budget is exterior-only and never treats an unsourced zero as a verified price',()=>{
 const result=buildResponse(fixtures,input({budgetPerPerson:0,language:'en'}),summerWeather,'source');
 assert.deepEqual(result.recommendations.map(item=>item.poi.id),['exterior']);assert.ok(result.recommendations[0].budgetNote.includes('editorial estimate'));assert.ok(result.recommendations[0].budgetNote.includes('not a verified admission'));
 assert.ok(result.trace.filters.budget>0);assert.ok(result.trace.filters.unknownPrice>0);
 const severe=buildResponse(fixtures,input({budgetPerPerson:0}),winterWeather,'source');assert.equal(severe.recommendations.length,0);
 const freeMeal=buildResponse(fixtures,input({budgetPerPerson:0,wantsFood:true}),summerWeather,'source');assert.equal(freeMeal.recommendations.length,0);
});
test('positive budgets reject sourced prices above cap and clearly flag unknown cafe prices',()=>{
 const result=buildResponse(fixtures,input({budgetPerPerson:1500,wantsFood:true,language:'en'}),summerWeather,'source');
 assert.ok(result.recommendations.some(item=>item.poi.id==='unknown-cafe'));assert.ok(result.recommendations.some(item=>item.poi.id==='food-park'));assert.ok(!result.recommendations.some(item=>item.poi.id==='expensive-cafe'));
 assert.ok(result.recommendations.find(item=>item.poi.id==='unknown-cafe').budgetNote.includes('not guaranteed'));
 assert.ok(result.recommendations.find(item=>item.poi.id==='food-park').budgetNote.includes('1000'));
 assert.ok(result.warnings.some(w=>w.includes('Affordability')));assert.ok(result.trace.filters.budget>0);
});
test('food preference excludes monuments and museums, retains supported cafes and food-tagged parks',()=>{
 const result=retrieve(fixtures,input({wantsFood:true}),summerWeather);assert.ok(result.length);assert.ok(result.every(item=>['unknown-cafe','food-park','expensive-cafe'].includes(item.poi.id)));
 const empty=buildResponse(fixtures.filter(item=>item.id==='museum'),input({wantsFood:true,language:'kk'}),summerWeather,'source');assert.equal(empty.recommendations.length,0);assert.ok(empty.warnings.some(w=>w.includes('Тамақтану')));
});
test('group quiz changes ranking and rationale without inventing capacity or reservations',()=>{
 const two=[make('quiet',{tags:['тихо']}),make('family',{tags:['family']})];
 assert.equal(retrieve(two,input({groupSize:1}),summerWeather)[0].poi.id,'quiet');assert.equal(retrieve(two,input({groupSize:5}),summerWeather)[0].poi.id,'family');
 const result=buildResponse(two,input({groupSize:5,language:'en'}),summerWeather,'source');assert.ok(result.recommendations[0].why.includes('group of 5'));assert.ok(result.warnings.some(w=>w.includes('capacity have not been checked')));
});
test('all three response languages localize summaries, explanations, plans, warnings and weather',()=>{
 const seeds=JSON.parse(readFileSync(new URL('../data/seeds.json',import.meta.url),'utf8')).map(seed=>({...make(seed.id),...seed,sourceUrl:seed.editorialSource}));
 for(const language of ['ru','kk','en']){
  const result=buildResponse(seeds,input({language,groupSize:3,budgetPerPerson:2000,wantsFood:true}),summerWeather,'source');
  assert.ok(result.recommendations.length);assert.equal(result.context.language,language);assert.equal(result.context.groupSize,3);
  const text=[result.summary,...result.warnings,result.weather.description,result.context.distanceMethod,...result.recommendations.flatMap(item=>[item.why,item.budgetNote,...item.actions])].join(' ');
  if(language==='en')assert.ok(!/\p{Script=Cyrillic}/u.test(text),text);
  if(language==='kk'){assert.match(text,/[әіңғүұқөһ]/iu);assert.ok(!/Подходит|Пройдитесь|Неблагоприятная|Путь и визит|Рядом нет/.test(text));}
  if(language==='ru')assert.ok(text.includes('Подходит'));
 }
});
test('Kazakh interests retrieve grounded nature, culture and food tags',()=>{
 assert.ok(retrieve(fixtures,input({query:'отбасыммен саябақта тамақ ішкім келеді',wantsFood:true,mood:'nature',language:'kk'}),summerWeather)[0].poi.tags.includes('nature'));
});
test('LLM receives safe quiz intent and generates the requested language without location leakage',async()=>{
 for(const language of ['en','kk']){
  let payload;
  const request=input({language,groupSize:4,spacePreference:'indoor',budgetPerPerson:2000,wantsFood:true,query:'secret address 51.1282 71.4305'});
  const answer=language==='en'?{why:'Take a moment to enjoy a relaxed break.',actions:['Choose a pace that suits your group.']}:{why:'Компанияңызбен тыныш демалуға уақыт бөліңіз.',actions:['Өзіңізге ыңғайлы қарқынды таңдаңыз.']};
  const result=await generateSelection(fixtures,request,summerWeather,{key:'mock',fetcher:async(url,options)=>{payload=JSON.parse(options.body);return Response.json({choices:[{message:{content:JSON.stringify({recommendations:[{id:'unknown-cafe',...answer}]})}}]});}});
  assert.ok(result);const sent=JSON.stringify(payload);assert.ok(!sent.includes('secret'));assert.ok(!sent.includes('51.1282'));assert.ok(!sent.includes('71.4305'));assert.ok(!sent.includes('walkMinutes'));assert.ok(sent.includes('groupSize'));assert.ok(sent.includes(language==='en'?'English':'Kazakh'));
 }
});
test('localization preserves unfamiliar source schedules and never invents generic hours',()=>{
 const poi=make('new-cafe',{category:'Кофейня',indoor:true,openingHours:'Mo 07:00-08:00'});
 for(const language of ['en','kk']){
  const localized=localizePoi(poi,language);assert.ok(localized.openingHours.includes('07:00-08:00'));assert.ok(!localized.openingHours.includes('10:00'));assert.ok(!localized.description.includes('public street'));
 }
});
