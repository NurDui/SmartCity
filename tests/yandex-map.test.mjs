import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

// Compile the actual browser controller in memory. No test build or real SDK/key/network is used.
const source=await readFile(new URL('../components/YandexCityMap.tsx',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
let sequence=0;
const controllerModule=()=>import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}#${++sequence}`);
class Events{
 listeners=new Map();
 add(name,callback){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(callback);}
 remove(name,callback){this.listeners.get(name)?.delete(callback);}
 emit(name){for(const callback of this.listeners.get(name)??[])callback();}
}
function environment(){
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 const scripts=[],maps=[],controls=[];let failing=false;
 const provider={state:{values:{isInited:true,level:0,timestamp:Date.now()/1000},events:new Events(),get(name){return this.values[name];}}};
 class MapClass{
  constructor(host,state,options){this.host=host;this.state=state;this.options=options;this.markers=[];this.bounds=[];this.destroyed=0;this.geoObjects={add:marker=>this.markers.push(marker),removeAll:()=>{this.markers=[];}};this.controls={add:(control)=>controls.push(control)};this.container={fitToViewport(){}};maps.push(this);}
  getCenter(){return this.state.center;}getZoom(){return this.state.zoom;}setZoom(zoom){this.state.zoom=zoom;}setBounds(bounds,options){this.bounds.push({bounds,options});}destroy(){this.destroyed++;}
 }
 class Placemark{constructor(coordinates,properties,options){this.coordinates=coordinates;this.properties=properties;this.options=options;this.events=new Events();}}
 class TrafficControl{
  constructor(parameters){this.parameters=parameters;this.events=new Events();this.collapses=0;this.state={values:{...parameters.state},get(name){return this.values[name];},set:(name,value)=>{this.state.values[name]=value;this.events.emit('providerkeychange');}};}
  getProvider(key){assert.equal(key,'traffic#actual');return provider;}collapse(){this.collapses++;}
 }
 const sdk={Map:MapClass,Placemark,control:{TrafficControl},ready(fn){fn();}};
 globalThis.window={setTimeout,clearTimeout,setInterval,clearInterval};
 globalThis.document={createElement(name){assert.equal(name,'script');return {remove(){this.removed=true;}};},head:{appendChild(script){scripts.push(script);queueMicrotask(()=>{const url=new URL(script.src);if(failing){window[url.searchParams.get('onerror')]();}else{window[url.searchParams.get('ns')]=sdk;window[url.searchParams.get('onload')](sdk);}});}}};
 return {scripts,maps,controls,provider,sdk,setFailure(value){failing=value;},restore(){globalThis.window=previousWindow;globalThis.document=previousDocument;}};
}

test('actual traffic requires initialization and fresh provider time; zero is valid',async()=>{
 const {yandexTrafficFromState}=await controllerModule();const now=Date.now();const values={isInited:true,level:0,timestamp:now/1000};const state={get:name=>values[name]};
 assert.equal(yandexTrafficFromState(state,now).score,0);
 for(const changes of [{isInited:false},{level:11},{level:-1},{level:'0'},{timestamp:undefined},{timestamp:(now-300001)/1000},{timestamp:(now+120000)/1000}]){
  const invalid={...values,...changes};assert.equal(yandexTrafficFromState({get:name=>invalid[name]},now),null);
 }
});
test('SDK loads only on explicit invocation, uses allowlisted modules and separate real locale namespaces',async()=>{
 const env=environment();try{
  const {loadYandexMapSDK,YANDEX_MAP_MODULES}=await controllerModule();assert.equal(env.scripts.length,0);
  await loadYandexMapSDK('fixture-key','ru_RU');await loadYandexMapSDK('fixture-key','ru_RU');await loadYandexMapSDK('fixture-key','en_RU');assert.equal(env.scripts.length,2);
  const [ru,en]=env.scripts.map(script=>new URL(script.src));assert.equal(ru.origin,'https://api-maps.yandex.ru');assert.equal(ru.searchParams.get('coordorder'),'latlong');assert.equal(ru.searchParams.get('lang'),'ru_RU');assert.equal(en.searchParams.get('lang'),'en_RU');assert.notEqual(ru.searchParams.get('ns'),en.searchParams.get('ns'));
  assert.deepEqual(ru.searchParams.get('load').split(','),[...YANDEX_MAP_MODULES]);assert.ok(!/geocode|suggest|route|panorama|search|package\.full/i.test(ru.searchParams.get('load')));
 }finally{env.restore();}
});
test('own-marker updates preserve viewport, lat-lon order and native attribution controls',async()=>{
 const env=environment();let controller;try{
  const {createYandexCityMap}=await controllerModule();const traffic=[];
  controller=await createYandexCityMap({}, {key:'fixture-key',locale:'ru_RU',origin:{lat:51.1,lon:71.4},viewport:{lat:51.12,lon:71.45,zoom:15},onTraffic:value=>traffic.push(value)});
  const map=env.maps[0];assert.deepEqual(map.state.center,[51.12,71.45]);assert.deepEqual(map.state.controls,['zoomControl','fullscreenControl']);assert.equal(map.options.suppressMapOpenBlock,false);assert.equal(map.options.yandexMapDisablePoiInteractivity,true);assert.equal(env.controls[0].parameters.state.providerKey,'traffic#actual');assert.equal(traffic.at(-1).score,0);
  let selected;const poi={id:'own-poi',name:'<unsafe>',lat:51.15,lon:71.46};controller.update([poi],{lat:51.1,lon:71.4},undefined,id=>{selected=id;},'Origin');assert.deepEqual(map.markers[0].coordinates,[51.1,71.4]);assert.deepEqual(map.markers[1].coordinates,[51.15,71.46]);assert.equal(map.markers[1].properties.hintContent,'&lt;unsafe&gt;');map.markers[1].events.emit('click');assert.equal(selected,'own-poi');
  controller.update([poi],{lat:51.1,lon:71.4},'own-poi',()=>{},'Origin');assert.equal(map.bounds.length,0);assert.equal(map.getZoom(),15);
  controller.fit([{lat:51.1,lon:71.4},{lat:51.2,lon:71.5}]);assert.deepEqual(map.bounds[0].bounds,[[51.099000000000004,71.399],[51.201,71.501]]);assert.equal(map.bounds[0].options.checkZoomRange,false);
  env.controls[0].state.set('providerKey','traffic#archive');assert.equal(env.controls[0].state.get('providerKey'),'traffic#actual');
  env.provider.state.values.isInited=false;env.provider.state.events.emit('change');assert.equal(traffic.at(-1),null);
  controller.destroy();controller=undefined;assert.equal(map.destroyed,1);const count=traffic.length;env.provider.state.events.emit('change');assert.equal(traffic.length,count);
 }finally{controller?.destroy();env.restore();}
});
test('failed SDK loads can retry and never expose a raw key in the error message',async()=>{
 const env=environment();try{
  const {loadYandexMapSDK}=await controllerModule();env.setFailure(true);await assert.rejects(loadYandexMapSDK('fixture-not-real-key','ru_RU'),error=>!error.message.includes('fixture-not-real-key'));
  env.setFailure(false);await loadYandexMapSDK('fixture-not-real-key','ru_RU');assert.equal(env.scripts.length,2);assert.equal(env.scripts[0].removed,true);
 }finally{env.restore();}
});
test('closing the map while SDK is loading prevents map construction',async()=>{
 const env=environment();try{
  const {createYandexCityMap}=await controllerModule();await assert.rejects(createYandexCityMap({}, {key:'fixture-key',locale:'ru_RU',origin:{lat:51.1,lon:71.4},isCancelled:()=>true,onTraffic(){}}));assert.equal(env.maps.length,0);
 }finally{env.restore();}
});
