"use client";

import type {POI} from "@/lib/types";

type Events={add:(name:string,callback:()=>void)=>void;remove:(name:string,callback:()=>void)=>void};
type State={get:(name:string)=>unknown;set?:(name:string,value:unknown)=>void;events:Events};
type Placemark={events:Events};
type YandexMap={destroy:()=>void;getCenter:()=>number[];getZoom:()=>number;setZoom:(zoom:number)=>unknown;setBounds:(bounds:number[][],options:object)=>unknown;geoObjects:{add:(marker:Placemark)=>void;removeAll:()=>void};controls:{add:(control:unknown,options?:object)=>void};container:{fitToViewport:()=>void}};
type TrafficControl={state:State;events:Events;getProvider:(key:string)=>{state:State};collapse:()=>void};
export interface YandexSDK {
  Map:new(host:HTMLElement,state:object,options:object)=>YandexMap;
  Placemark:new(coordinates:number[],properties:object,options:object)=>Placemark;
  control:{TrafficControl:new(parameters:object)=>TrafficControl};
  ready:(ready:()=>void,error?:(error?:unknown)=>void)=>void;
}
export interface YandexTraffic {score:number;at:number;source:"Yandex Maps"}
export interface YandexMapController {
  destroy:()=>void;
  fit:(points:{lat:number;lon:number}[])=>void;
  update:(places:POI[],origin:{lat:number;lon:number;label?:string},selectedId:string|undefined,onSelect:(id:string)=>void,originLabel:string)=>void;
  viewport:()=>{lat:number;lon:number;zoom:number};
}
export const YANDEX_MAP_MODULES=["Map","Placemark","control.ZoomControl","control.FullscreenControl","control.TrafficControl","traffic.provider.Actual"] as const;
const pendingSDKs=new Map<string,Promise<YandexSDK>>();
let namespaceNumber=0;

export function yandexTrafficFromState(state:Pick<State,"get">,now=Date.now()):YandexTraffic|null {
  if(state.get("isInited")!==true)return null;
  const score=state.get("level"),seconds=state.get("timestamp");
  if(typeof score!=="number"||!Number.isInteger(score)||score<0||score>10||typeof seconds!=="number"||!Number.isFinite(seconds))return null;
  const at=seconds*1000;
  if(at<=0||at>now+60_000||now-at>=5*60_000)return null;
  return {score,at,source:"Yandex Maps"};
}

/** Loaded only after the map consent button. The browser key is runtime configuration. */
export function loadYandexMapSDK(key:string,locale:"ru_RU"|"en_RU"):Promise<YandexSDK>{
  const identity=`${locale}\0${key}`;
  const previous=pendingSDKs.get(identity);if(previous)return previous;
  const promise=new Promise<YandexSDK>((resolve,reject)=>{
    const namespace=`seruenYmaps_${locale}_${++namespaceNumber}`;
    const loadedName=`${namespace}_loaded`,errorName=`${namespace}_error`;
    const globals=window as unknown as Record<string,unknown>;
    const script=document.createElement("script");let finished=false;
    const cleanup=()=>{window.clearTimeout(timer);delete globals[loadedName];delete globals[errorName];};
    const fail=()=>{if(finished)return;finished=true;cleanup();script.remove();pendingSDKs.delete(identity);reject(new Error("Yandex Maps could not load"));};
    const ready=(value?:unknown)=>{
      if(finished)return;
      const sdk=(value??globals[namespace]) as YandexSDK|undefined;
      if(!sdk||typeof sdk.Map!=="function"||typeof sdk.Placemark!=="function"||typeof sdk.control?.TrafficControl!=="function"){fail();return;}
      finished=true;cleanup();resolve(sdk);
    };
    const timer=window.setTimeout(fail,15_000);
    globals[loadedName]=ready;globals[errorName]=fail;
    const url=new URL("https://api-maps.yandex.ru/2.1/");
    url.search=new URLSearchParams({apikey:key,lang:locale,coordorder:"latlong",load:YANDEX_MAP_MODULES.join(","),ns:namespace,onload:loadedName,onerror:errorName,mode:"release"}).toString();
    script.src=url.href;script.async=true;script.referrerPolicy="strict-origin-when-cross-origin";
    script.onerror=fail;
    script.onload=()=>{const sdk=globals[namespace] as YandexSDK|undefined;if(sdk?.ready)sdk.ready(()=>ready(sdk),fail);};
    document.head.appendChild(script);
  });
  pendingSDKs.set(identity,promise);return promise;
}

const escaped=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));

/** Own POIs and the native map/traffic display only. No finite-product API calls. */
export async function createYandexCityMap(host:HTMLElement,options:{key:string;locale:"ru_RU"|"en_RU";origin:{lat:number;lon:number};viewport?:{lat:number;lon:number;zoom:number}|null;isCancelled?:()=>boolean;onTraffic:(traffic:YandexTraffic|null)=>void}):Promise<YandexMapController>{
  const sdk=await loadYandexMapSDK(options.key,options.locale);
  if(options.isCancelled?.())throw new Error("Map opening cancelled");
  const center=options.viewport??{...options.origin,zoom:13};
  const map=new sdk.Map(host,{center:[center.lat,center.lon],zoom:center.zoom,type:"yandex#map",controls:["zoomControl","fullscreenControl"],behaviors:["drag","dblClickZoom","multiTouch"]},{suppressMapOpenBlock:false,yandexMapDisablePoiInteractivity:true,yandexMapAutoSwitch:false,maxZoom:18});
  let dead=false;
  try {
    const trafficControl=new sdk.control.TrafficControl({state:{providerKey:"traffic#actual",trafficShown:true},options:{size:"small"}});
    map.controls.add(trafficControl,{float:"right"});
    const provider=trafficControl.getProvider("traffic#actual");
    const read=()=>{if(!dead)options.onTraffic(trafficControl.state.get("trafficShown")===true&&trafficControl.state.get("providerKey")==="traffic#actual"?yandexTrafficFromState(provider.state):null);};
    const actualOnly=()=>{if(trafficControl.state.get("providerKey")!=="traffic#actual")trafficControl.state.set?.("providerKey","traffic#actual");read();};
    const collapse=()=>trafficControl.collapse();
    // The app reports current traffic only; the history/forecast selection panel stays collapsed.
    trafficControl.events.add("expand",collapse);
    trafficControl.events.add("providerkeychange",actualOnly);
    trafficControl.events.add("hidetraffic",read);trafficControl.events.add("showtraffic",read);
    provider.state.events.add("change",read);
    const timer=window.setInterval(read,30_000);read();
    return {
      destroy(){if(dead)return;dead=true;window.clearInterval(timer);provider.state.events.remove("change",read);trafficControl.events.remove("expand",collapse);trafficControl.events.remove("providerkeychange",actualOnly);trafficControl.events.remove("hidetraffic",read);trafficControl.events.remove("showtraffic",read);map.destroy();options.onTraffic(null);},
      viewport(){const point=map.getCenter();return {lat:point[0],lon:point[1],zoom:map.getZoom()};},
      fit(points){if(dead||!points.length)return;const latitudes=points.map(p=>p.lat),longitudes=points.map(p=>p.lon);const bounds=[[Math.min(...latitudes)-.001,Math.min(...longitudes)-.001],[Math.max(...latitudes)+.001,Math.max(...longitudes)+.001]];map.container.fitToViewport();map.setBounds(bounds,{checkZoomRange:false,zoomMargin:[45,40,45,40],duration:0});},
      update(places,origin,selectedId,onSelect,originLabel){
        if(dead)return;map.geoObjects.removeAll();
        map.geoObjects.add(new sdk.Placemark([origin.lat,origin.lon],{hintContent:escaped(origin.label||originLabel)},{preset:"islands#blueCircleDotIcon",hasBalloon:false}));
        for(const place of places){const selected=place.id===selectedId;const marker=new sdk.Placemark([place.lat,place.lon],{hintContent:escaped(place.name),iconCaption:escaped(place.name)},{preset:selected?"islands#orangeDotIcon":"islands#darkGreenDotIcon",hasBalloon:false});marker.events.add("click",()=>onSelect(place.id));map.geoObjects.add(marker);}
      },
    };
  } catch(error){dead=true;map.destroy();throw error;}
}
