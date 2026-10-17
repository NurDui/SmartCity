"use client";

import {useEffect,useId,useRef,useState} from "react";
import type {Map as LeafletMap,LayerGroup} from "leaflet";
import type {POI} from "@/lib/types";
import type {LiveLanguage,RuntimeConfig,TrafficState} from "@/lib/live-types";
import "leaflet/dist/leaflet.css";
import styles from "./LiveCityMap.module.css";

type SDKMap={destroy:()=>void;on:(event:string,callback:(event:{score?:number})=>void)=>void;fitBounds:(bounds:{southWest:number[];northEast:number[]},options:object)=>void;setCenter:(point:number[])=>void;setZoom:(zoom:number)=>void};
type SDK={Map:new(id:string,options:object)=>SDKMap;HtmlMarker:new(map:SDKMap,options:object)=>{destroy:()=>void}};
type MapHandle={kind:"leaflet";map:LeafletMap;layer:LayerGroup;L:typeof import("leaflet")}|{kind:"2gis";map:SDKMap;sdk:SDK;markers:{destroy:()=>void}[]};
const words={
 ru:{title:"Карта Астаны",consent:"Загрузить интерактивную карту",privacy:"Карта загрузится после вашего выбора. 2GIS или OpenStreetMap получит IP-адрес и область просмотра, включая точку старта. Согласие действует до закрытия этой страницы.",loading:"Загружаем карту…",failed:"Карта временно недоступна. Можно открыть место в 2GIS.",origin:"Точка старта",route:"Маршрут в 2GIS",source:"Источник координат",approx:"Координаты ориентировочные",fit:"Показать все точки",hide:"Закрыть карту",traffic:"Пробки",noTraffic:"Балл пробок недоступен",note:"Карта показывает географическое положение. Точность маркеров зависит от источника, путь не рассчитывается.",fallback:"2GIS недоступен, открыта OpenStreetMap",selected:"Выбранное место"},
 kk:{title:"Астана картасы",consent:"Интерактивті картаны жүктеу",privacy:"Карта таңдауыңыздан кейін жүктеледі. 2GIS немесе OpenStreetMap IP мекенжайыңызды және бастапқы нүкте бар аумақты алады. Келісім осы бет жабылғанға дейін жарамды.",loading:"Карта жүктелуде…",failed:"Карта уақытша қолжетімсіз. Орынды 2GIS арқылы ашуға болады.",origin:"Бастапқы нүкте",route:"2GIS бағыты",source:"Координаттар көзі",approx:"Координаттар шамамен берілген",fit:"Барлық нүктені көрсету",hide:"Картаны жабу",traffic:"Кептеліс",noTraffic:"Кептеліс балы қолжетімсіз",note:"Карта географиялық орынды көрсетеді. Маркерлер дәлдігі дереккөзге байланысты, бағыт есептелмейді.",fallback:"2GIS қолжетімсіз, OpenStreetMap ашылды",selected:"Таңдалған орын"},
 en:{title:"Map of Astana",consent:"Load interactive map",privacy:"The map loads after your choice. 2GIS or OpenStreetMap receives your IP address and viewing area, including the starting point. Consent lasts until this page closes.",loading:"Loading map…",failed:"The map is temporarily unavailable. Open a place in 2GIS.",origin:"Starting point",route:"Directions in 2GIS",source:"Coordinate source",approx:"Approximate coordinates",fit:"Show all places",hide:"Close map",traffic:"Traffic",noTraffic:"Traffic score unavailable",note:"This is a geographic map. Marker accuracy depends on its source. It does not calculate a route.",fallback:"2GIS unavailable, showing OpenStreetMap",selected:"Selected place"}
};
let sdkPromise:Promise<SDK>|null=null;
function loadSDK():Promise<SDK>{
 const available=(window as Window&{mapgl?:SDK}).mapgl;if(available)return Promise.resolve(available);
 if(sdkPromise)return sdkPromise;
 sdkPromise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://mapgl.2gis.com/api/js/v1";script.async=true;script.referrerPolicy="strict-origin-when-cross-origin";
  const timer=window.setTimeout(()=>{script.remove();sdkPromise=null;reject(new Error("Map SDK timeout"));},12000);
  script.onload=()=>{window.clearTimeout(timer);const sdk=(window as Window&{mapgl?:SDK}).mapgl;if(sdk)resolve(sdk);else{sdkPromise=null;reject(new Error("Map SDK unavailable"));}};
  script.onerror=()=>{window.clearTimeout(timer);sdkPromise=null;reject(new Error("Map SDK unavailable"));};document.head.appendChild(script);
 });return sdkPromise;
}
export interface LiveCityMapProps {places:POI[];origin:{lat:number;lon:number;label?:string};selectedId?:string;onSelect:(id:string)=>void;language:LiveLanguage;theme:"light"|"dark";traffic?:TrafficState;onTrafficScore?:(score:number|null)=>void}
export default function LiveCityMap({places,origin,selectedId,onSelect,language,theme,traffic,onTrafficScore}:LiveCityMapProps){
 const t=words[language],id=`city-map-${useId().replace(/[^a-zA-Z0-9]/g,"")}`;
 const host=useRef<HTMLDivElement>(null),handle=useRef<MapHandle|null>(null),callback=useRef(onSelect);
 callback.current=onSelect;
 const trafficCallback=useRef(onTrafficScore);trafficCallback.current=onTrafficScore;
 const [config,setConfig]=useState<RuntimeConfig|null>(null),[consent,setConsent]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(false),[forceOSM,setForceOSM]=useState(false);
 const [sdkTraffic,setSdkTraffic]=useState<{score:number;at:number}|null>(null),[clock,setClock]=useState(Date.now());
 const latest=useRef({places,origin,selectedId});latest.current={places,origin,selectedId};
 useEffect(()=>{let active=true;fetch("/api/runtime-config",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(c=>{if(active)setConfig(c as RuntimeConfig||{twoGisKey:null,mapProvider:"openstreetmap",feeds:{cinema:false,events:false,traffic:false},requiresMapConsent:true});}).catch(()=>{if(active)setConfig({twoGisKey:null,mapProvider:"openstreetmap",feeds:{cinema:false,events:false,traffic:false},requiresMapConsent:true});});return()=>{active=false;};},[]);
 useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),30000);return()=>window.clearInterval(timer);},[]);
 useEffect(()=>{trafficCallback.current?.(consent&&ready&&sdkTraffic&&clock-sdkTraffic.at<5*60_000?sdkTraffic.score:null);},[consent,ready,sdkTraffic,clock]);
 function fit(){const h=handle.current;if(!h)return;const points=[latest.current.origin,...latest.current.places];
  if(h.kind==="leaflet"){h.map.fitBounds(h.L.latLngBounds(points.map(p=>[p.lat,p.lon])),{padding:[38,38],maxZoom:15});}
  else{h.map.fitBounds({southWest:[Math.min(...points.map(p=>p.lon))-.001,Math.min(...points.map(p=>p.lat))-.001],northEast:[Math.max(...points.map(p=>p.lon))+.001,Math.max(...points.map(p=>p.lat))+.001]},{padding:{top:50,right:50,bottom:50,left:50},maxZoom:15});}
 }
 useEffect(()=>{
  if(!consent||!config||!host.current)return;
  let cancelled=false;setReady(false);setError(false);setSdkTraffic(null);
  const init=async()=>{try{
   if(config.twoGisKey&&!forceOSM){const sdk=await loadSDK();if(cancelled)return;
    const map=new sdk.Map(id,{key:config.twoGisKey,center:[latest.current.origin.lon,latest.current.origin.lat],zoom:13,lang:language,trafficControl:"topRight",trafficOn:true,zoomControl:"topLeft",scaleControl:"bottomLeft",enableTrackResize:true});
    handle.current={kind:"2gis",map,sdk,markers:[]};
    map.on("trafficscore",event=>{if(!cancelled){const score=event.score;setSdkTraffic(typeof score==="number"&&Number.isInteger(score)&&score>=1&&score<=10?{score,at:Date.now()}:null);}});
    map.on("movestart",()=>{if(!cancelled)setSdkTraffic(null);});
    map.on("styleloaderror",()=>{if(!cancelled)setForceOSM(true);});
   }else{const L=await import("leaflet");if(cancelled||!host.current)return;
    const map=L.map(host.current,{center:[latest.current.origin.lat,latest.current.origin.lon],zoom:13,scrollWheelZoom:false});
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}).addTo(map);
    L.control.scale({imperial:false}).addTo(map);handle.current={kind:"leaflet",map,layer:L.layerGroup().addTo(map),L};
   }
   if(!cancelled){setReady(true);requestAnimationFrame(()=>{if(!cancelled){if(handle.current?.kind==="leaflet")handle.current.map.invalidateSize();fit();}});}
  }catch{if(!cancelled){if(config.twoGisKey&&!forceOSM)setForceOSM(true);else setError(true);}}};
  void init();return()=>{cancelled=true;const h=handle.current;if(h){if(h.kind==="leaflet")h.map.remove();else{h.markers.forEach(m=>m.destroy());h.map.destroy();}handle.current=null;}setReady(false);};
 // Location changes update layers below, preserving zoom and consent.
 },[consent,config,forceOSM,id,language]);
 useEffect(()=>{const h=handle.current;if(!ready||!h)return;
  const makePopup=(p:POI)=>{const box=document.createElement("div"),name=document.createElement("strong"),note=document.createElement("p"),link=document.createElement("a");name.textContent=p.name;note.textContent=p.coordinateAccuracy==="approximate"?t.approx:p.address;link.textContent=t.route;link.href=`https://2gis.kz/astana/directions/points/${origin.lon},${origin.lat};${p.lon},${p.lat}?m=${p.lon},${p.lat}/14`;link.target="_blank";link.rel="noopener noreferrer";box.appendChild(name);box.appendChild(note);box.appendChild(link);return box;};
  if(h.kind==="leaflet"){
   const startPopup=document.createElement("span");startPopup.textContent=origin.label||t.origin;
   h.layer.clearLayers();h.L.circleMarker([origin.lat,origin.lon],{radius:9,color:"#ffffff",weight:3,fillColor:"#2563eb",fillOpacity:1}).bindPopup(startPopup).addTo(h.layer);
   places.forEach(p=>{const selected=p.id===selectedId;const marker=h.L.circleMarker([p.lat,p.lon],{radius:selected?12:8,color:selected?"#e9b35b":"#ffffff",weight:3,fillColor:"#234d3e",fillOpacity:1}).bindPopup(makePopup(p)).addTo(h.layer);marker.on("click",()=>callback.current(p.id));
    const element=marker.getElement();if(element){element.setAttribute("role","button");element.setAttribute("tabindex","0");element.setAttribute("aria-label",p.name);element.setAttribute("aria-pressed",String(selected));
     const activate=(event:Event)=>{const key=(event as KeyboardEvent).key;if(key==="Enter"||key===" "){event.preventDefault();event.stopPropagation();marker.openPopup();callback.current(p.id);}};
     element.addEventListener("keydown",activate);marker.on("remove",()=>element.removeEventListener("keydown",activate));
    }
    if(selected)marker.openPopup();});
  }else{h.markers.forEach(m=>m.destroy());h.markers=[];const start=document.createElement("div");start.className=styles.origin;start.title=origin.label||t.origin;h.markers.push(new h.sdk.HtmlMarker(h.map,{coordinates:[origin.lon,origin.lat],html:start,anchor:[10,10]}));
   places.forEach(p=>{const button=document.createElement("button");button.type="button";button.className=`${styles.pin} ${p.id===selectedId?styles.selected:""}`;button.title=p.name;button.setAttribute("aria-label",p.name);button.addEventListener("click",()=>callback.current(p.id));h.markers.push(new h.sdk.HtmlMarker(h.map,{coordinates:[p.lon,p.lat],html:button,anchor:[13,13],interactive:true}));});
  }
 },[ready,places,origin,selectedId,t]);
 useEffect(()=>{if(ready)fit();},[ready,places,origin.lat,origin.lon]);
 const selected=places.find(p=>p.id===selectedId);
 const mapScore=sdkTraffic&&clock-sdkTraffic.at<5*60_000?sdkTraffic.score:null;
 const feedScore=traffic?.status==="live"&&traffic.updatedAt&&clock-Date.parse(traffic.updatedAt)<5*60_000?traffic.score:null;
 const score=mapScore??feedScore;
 return <section className={`${styles.wrapper} ${theme==="dark"?styles.dark:""}`} aria-label={t.title}>
  {!consent?<div className={styles.consent}><span className={styles.eyebrow}>OPENSTREETMAP / 2GIS</span><h3>{t.title}</h3><p>{t.privacy}</p><button onClick={()=>setConsent(true)}>{t.consent}</button></div>:<>
   <div className={styles.toolbar}><button onClick={fit} disabled={!ready}>{t.fit}</button><span>{ready?(handle.current?.kind==="2gis"?"2GIS MapGL":"OpenStreetMap"):t.loading}</span><button onClick={()=>setConsent(false)}>{t.hide}</button></div>
   <div ref={host} id={id} className={styles.canvas} aria-label={t.title}/>
   {!ready&&<div className={styles.loading} role="status">{error?t.failed:t.loading}</div>}
   <div className={styles.traffic} aria-live="polite"><strong>{score!==null&&score!==undefined?`${t.traffic}: ${score}/10`:t.noTraffic}</strong>{score!==null&&score!==undefined&&<small>{mapScore!==null?"2GIS MapGL":""+traffic?.source} · {new Date(mapScore!==null?sdkTraffic!.at:traffic!.updatedAt!).toLocaleTimeString(language==="kk"?"kk-KZ":language==="en"?"en-GB":"ru-KZ",{timeZone:"Asia/Qyzylorda",hour:"2-digit",minute:"2-digit"})}</small>}</div>
   {forceOSM&&config?.twoGisKey&&<div className={styles.fallback}>{t.fallback}</div>}
  </>}
  {selected&&<div className={styles.detail}><strong>{selected.name}</strong><span>{selected.coordinateAccuracy==="approximate"?t.approx:selected.address}</span><a href={`https://2gis.kz/astana/directions/points/${origin.lon},${origin.lat};${selected.lon},${selected.lat}`} target="_blank" rel="noopener noreferrer">{t.route} ↗</a></div>}
  <p className={styles.note}>{t.note}</p>
 </section>;
}
