import type { CityEvent, CinemaSession, DiscoverResponse, LiveLanguage, LiveSection, TrafficState } from "./live-types.ts";
import { getFeedConfig, integrationStates, type FeedKind } from "./provider-config.ts";
import { fetchPublicCinema } from "./public-cinema.ts";
import {fetchVisitAstanaEvents} from "./visit-events.ts";
import {cachedPublicDiscovery,type PublicSection} from "./discovery-cache.ts";
import type {MapDatabase} from "./open-map.ts";

export const CITY_TIMEZONE="Asia/Qyzylorda" as const;
export const FRESHNESS_MS={cinema:30*60_000,events:6*60*60_000,traffic:5*60_000} as const;
const CACHE_MS={cinema:60_000,events:5*60_000,traffic:30_000} as const;
const MAX_BYTES=2_000_000;
type AnyRecord=Record<string,unknown>;
class StaleFeedError extends Error {}
const cache=new Map<string,{body:unknown;expires:number}>();
const publicCache=new Map<string,{result:LiveSection<CinemaSession>|LiveSection<CityEvent>;expires:number}>();
export function parseDiscoveryInput(value:unknown):{lat:number;lon:number;language:LiveLanguage}{
 const p=record(value);const {lat,lon}=p,language=p.language??"ru";
 if(typeof lat!=="number"||typeof lon!=="number"||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<50.9||lat>51.35||lon<71.15||lon>71.8)throw new Error("Выберите корректную точку в Астане.");
 if(language!=="ru"&&language!=="kk"&&language!=="en")throw new Error("Supported languages: ru, kk, en.");return {lat,lon,language};
}
export function cityDate(timestamp:number|string|Date=Date.now()):string {
  const date=new Date(timestamp);
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:CITY_TIMEZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  return [p.find(x=>x.type==="year")?.value,p.find(x=>x.type==="month")?.value,p.find(x=>x.type==="day")?.value].join("-");
}
function record(value:unknown):AnyRecord {if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid feed object");return value as AnyRecord;}
function text(value:unknown,max:number):string {if(typeof value!=="string"||!value.trim()||value.length>max)throw new Error("Invalid feed text");return value.trim();}
function timestamp(value:unknown):string {
 const s=text(value,40);if(!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(s)||!Number.isFinite(Date.parse(s)))throw new Error("Timestamp requires an explicit timezone");return new Date(s).toISOString();
}
export function safeExternalUrl(value:unknown):string {
 const s=text(value,2048);const u=new URL(s);const host=u.hostname.toLowerCase();
 if(u.protocol!=="https:"||u.username||u.password||host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(":"))throw new Error("Only public HTTPS media and links are allowed");
 return u.href;
}
function optionalImage(value:unknown):string|null{return value===null||value===undefined||value===""?null:safeExternalUrl(value);}
function coords(item:AnyRecord):{lat:number;lon:number} {
 const {lat,lon}=item;if(typeof lat!=="number"||typeof lon!=="number"||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<50.9||lat>51.35||lon<71.15||lon>71.8)throw new Error("Feed venue is outside Astana");return {lat,lon};
}
function price(value:unknown):number|null {if(value===null||value===undefined)return null;if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>10_000_000)throw new Error("Invalid KZT price");return value;}
export function directDistance(a:{lat:number;lon:number},b:{lat:number;lon:number}):number {
 const rad=(n:number)=>n*Math.PI/180;const dlat=rad(b.lat-a.lat),dlon=rad(b.lon-a.lon);
 const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2;
 return Math.round(6_371_000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)));
}
function fresh(value:unknown,kind:FeedKind,now:number):string {
 const updated=timestamp(value);const age=now-Date.parse(updated);
 if(age>FRESHNESS_MS[kind]||age< -5*60_000)throw new StaleFeedError("Source timestamp outside freshness window");return updated;
}
function envelope(raw:unknown,kind:FeedKind,now:number):AnyRecord {
 const body=record(raw);text(body.source,120);
 if(body.timezone!==CITY_TIMEZONE||body.date!==cityDate(now))throw new StaleFeedError("Feed is not for today's Kazakhstan date");
 fresh(body.updatedAt,kind,now);return body;
}
function startsAndEnds(item:AnyRecord):{startsAt:string;endsAt?:string} {
 const startsAt=timestamp(item.startsAt);const endsAt=item.endsAt?timestamp(item.endsAt):undefined;
 if(endsAt&&Date.parse(endsAt)<=Date.parse(startsAt))throw new Error("Event ends before its start");return {startsAt,...endsAt?{endsAt}:{}};
}
export function normalizeCinema(raw:unknown,origin:{lat:number;lon:number},now=Date.now()):LiveSection<CinemaSession> {
 const body=envelope(raw,"cinema",now);if(!Array.isArray(body.items)||body.items.length>500)throw new Error("Invalid cinema list");
 const ids=new Set<string>();const items:CinemaSession[]=body.items.map((value:unknown)=>{
  const p=record(value);const id=text(p.id,160);if(ids.has(id))throw new Error("Duplicate session ID");ids.add(id);
  const place=coords(p),times=startsAndEnds(p);if(p.currency!=="KZT")throw new Error("Cinema prices must be KZT");
  return {id,title:text(p.title,180),synopsis:text(p.synopsis,2200),posterUrl:optionalImage(p.posterUrl),...times,priceKzt:price(p.priceKzt),currency:"KZT" as const,cinemaName:text(p.cinemaName,180),mallName:p.mallName?text(p.mallName,180):null,...place,distanceMeters:directDistance(origin,place),bookingUrl:safeExternalUrl(p.bookingUrl),sourceUrl:safeExternalUrl(p.sourceUrl),updatedAt:fresh(p.updatedAt,"cinema",now),...p.priceIsFrom===true?{priceIsFrom:true}:{}};
 }).filter((p:CinemaSession)=>cityDate(p.startsAt)===cityDate(now)&&Date.parse(p.startsAt)>=now).sort((a:CinemaSession,b:CinemaSession)=>a.distanceMeters-b.distanceMeters||Date.parse(a.startsAt)-Date.parse(b.startsAt)).slice(0,30);
 return {status:"live",source:text(body.source,120),updatedAt:timestamp(body.updatedAt),items,message:items.length?"Проверенные фидом сеансы на сегодня. Цена и наличие могут измениться при покупке.":"Свежий фид не содержит предстоящих сеансов на сегодня."};
}
export function normalizeEvents(raw:unknown,origin:{lat:number;lon:number},now=Date.now()):LiveSection<CityEvent> {
 const body=envelope(raw,"events",now);if(!Array.isArray(body.items)||body.items.length>500)throw new Error("Invalid event list");
 const ids=new Set<string>();const items:CityEvent[]=body.items.map((value:unknown)=>{
  const p=record(value);const id=text(p.id,160);if(ids.has(id))throw new Error("Duplicate event ID");ids.add(id);
  const place=coords(p),times=startsAndEnds(p);
  return {id,title:text(p.title,180),description:text(p.description,2200),imageUrl:optionalImage(p.imageUrl),...times,venue:text(p.venue,180),address:text(p.address,240),...place,distanceMeters:directDistance(origin,place),priceKzt:price(p.priceKzt),sourceUrl:safeExternalUrl(p.sourceUrl),...p.bookingUrl?{bookingUrl:safeExternalUrl(p.bookingUrl)}:{},category:text(p.category,80),updatedAt:fresh(p.updatedAt,"events",now),...p.priceIsFrom===true?{priceIsFrom:true}:{},...p.coordinateSourceUrl?{coordinateSourceUrl:safeExternalUrl(p.coordinateSourceUrl)}:{}};
 }).filter((p:CityEvent)=>cityDate(p.startsAt)===cityDate(now)&&(Date.parse(p.startsAt)>=now||Boolean(p.endsAt&&Date.parse(p.endsAt)>now))).sort((a:CityEvent,b:CityEvent)=>(a.distanceMeters??Infinity)-(b.distanceMeters??Infinity)||Date.parse(a.startsAt)-Date.parse(b.startsAt)).slice(0,30);
 return {status:"live",source:text(body.source,120),updatedAt:timestamp(body.updatedAt),items,message:items.length?"События из разрешенного фида. Доступ и программу уточняйте у организатора.":"Свежий фид не содержит актуальных событий на сегодня."};
}
export function normalizeTraffic(raw:unknown,now=Date.now()):TrafficState {
 const body=envelope(raw,"traffic",now);const score=body.score;
 if(body.scale!==10||typeof score!=="number"||!Number.isInteger(score)||score<1||score>10)throw new Error("Traffic must be a provider-issued integer on a 1–10 scale");
 return {status:"live",score,source:text(body.source,120),updatedAt:timestamp(body.updatedAt),message:"Балл провайдера для Астаны, шкала 1–10. Не оценка пешего маршрута."};
}
async function fetchFeed(kind:FeedKind,env:Record<string,string|undefined>,fetcher:typeof fetch,now:number):Promise<unknown|null> {
 const config=getFeedConfig(kind,env);if(!config)return null;
 // Cache and upstream request do not include the user's location, query, or language.
 const key=`${kind}:${config.url}:${config.token||""}`;const hit=cache.get(key);if(hit&&hit.expires>now)return hit.body;
 const request=(async()=>{
  const response=await fetcher(config.url,{headers:{Accept:"application/json",...config.token?{Authorization:`Bearer ${config.token}`}:{ }},signal:AbortSignal.timeout(6000),redirect:"manual",cache:"no-store"});
  if(!response.ok||Number(response.headers.get("content-length"))>MAX_BYTES)throw new Error("Provider unavailable or oversized");
  const reader=response.body?.getReader();if(!reader)throw new Error("Empty provider response");
  let size=0;const chunks:Uint8Array[]=[];
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX_BYTES){await reader.cancel();throw new Error("Provider response too large");}chunks.push(part.value);}
  const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
  const body=JSON.parse(new TextDecoder().decode(buffer));
  cache.set(key,{body,expires:now+CACHE_MS[kind]});return body;
 })();
 return request;
}
function unavailable<T>(kind:FeedKind,status:"unconfigured"|"error"|"stale"):LiveSection<T> {
 return {status,source:kind==="cinema"?"Сеансы кино":kind==="events"?"Городские события":"Дорожная ситуация",updatedAt:null,items:[],message:status==="unconfigured"?"Разрешенный источник не подключен. Текущие данные не подставляются из примеров.":status==="stale"?"Источник вернул устаревшую дату или время обновления. Данные скрыты.":"Источник временно недоступен или не прошел проверку формата. Данные скрыты."};
}
export function freshPublicItems(result:PublicSection,kind:"cinema"|"events",origin:{lat:number;lon:number},now:number):PublicSection{
 const today=cityDate(now);
 const items=result.items.filter(p=>{
  if("datePrecision" in p&&p.datePrecision==="day")return cityDate(p.startsAt)<=today&&Boolean(p.endsAt&&cityDate(p.endsAt)>=today);
  return cityDate(p.startsAt)===today&&(Date.parse(p.startsAt)>=now||Boolean(kind==="events"&&p.endsAt&&Date.parse(p.endsAt)>now));
 }).map(p=>({...p,distanceMeters:p.lat===null||p.lon===null?null:directDistance(origin,{lat:p.lat,lon:p.lon})})).sort((a,b)=>(a.distanceMeters??Infinity)-(b.distanceMeters??Infinity));
 return {...result,items} as PublicSection;
}
export async function discover(origin:{lat:number;lon:number},options?:{now?:number;language?:LiveLanguage;env?:Record<string,string|undefined>;fetcher?:typeof fetch;publicFallback?:boolean;db?:MapDatabase;requireSharedCache?:boolean}):Promise<DiscoverResponse> {
 const now=options?.now??Date.now(),env=options?.env??process.env,fetcher=options?.fetcher??fetch;
 const section=async(kind:"cinema"|"events")=>{try{const raw=await fetchFeed(kind,env,fetcher,now);
  if(raw===null){
   if(options?.publicFallback===false)return unavailable(kind,"unconfigured");
   const key=`discovery-v2:${kind}:${cityDate(now)}:${options?.language||"ru"}`,hit=publicCache.get(key);
   const collect=():Promise<PublicSection>=>kind==="cinema"?fetchPublicCinema({date:cityDate(now),language:options?.language,location:{lat:51.1282,lon:71.4307}},{fetcher,now}):fetchCombinedPublicEvents({date:cityDate(now),language:options?.language,location:{lat:51.1282,lon:71.4307}},{fetcher,now});
   let result:PublicSection;
   if(options?.db)result=await cachedPublicDiscovery(options.db,key,now,collect);
   else if(options?.requireSharedCache)throw new Error("Shared discovery cache unavailable");
   else if(hit&&hit.expires>now)result=hit.result;
   else{result=await collect();publicCache.set(key,{result,expires:now+(result.status==="live"?15*60_000:60_000)});for(const [k,v]of publicCache)if(v.expires<now)publicCache.delete(k);}
   // Recompute distance per request. Cache never stores device coordinates.
   return freshPublicItems(result,kind,origin,now);
  }
  return kind==="cinema"?normalizeCinema(raw,origin,now):normalizeEvents(raw,origin,now);}catch(e){return unavailable(kind,e instanceof StaleFeedError?"stale":"error");}};
 const traffic=async():Promise<TrafficState>=>{try{const raw=await fetchFeed("traffic",env,fetcher,now);if(raw!==null)return normalizeTraffic(raw,now);return {status:"unconfigured",score:null,source:"Дорожная ситуация",updatedAt:null,message:"Источник баллов пробок не подключен. Карта и пешие маршруты не вычисляют текущие пробки."};}catch(e){return {status:e instanceof StaleFeedError?"stale":"error",score:null,source:"Дорожная ситуация",updatedAt:null,message:"Свежий балл провайдера недоступен. Он не рассчитывается из цвета дорог."};}};
 const [cinema,events,trafficState]=await Promise.all([section("cinema"),section("events"),traffic()]);
 const integrations=integrationStates(env).map(p=>p.id==="events"&&events.status==="live"&&!env.EVENTS_FEED_URL?{...p,configured:true,label:"Astana.kz + Visit Astana · публичные афиши",kind:"publisher-source" as const}:p.id==="cinema"&&cinema.status==="live"&&!env.CINEMA_FEED_URL?{...p,configured:true,label:"Киноафиша · публичная афиша",kind:"publisher-source" as const}:p);
 return localizeDiscovery({date:cityDate(now),timezone:CITY_TIMEZONE,generatedAt:new Date(now).toISOString(),cinema:cinema as LiveSection<CinemaSession>,events:events as LiveSection<CityEvent>,traffic:trafficState,integrations},options?.language??"ru",{cinema:!env.CINEMA_FEED_URL,events:!env.EVENTS_FEED_URL});
}
export function resetLiveCache():void{cache.clear();publicCache.clear();}

export function localizeDiscovery(value:DiscoverResponse,language:LiveLanguage,publicSources:{cinema:boolean;events:boolean}):DiscoverResponse{
 if(language==="ru")return value;
 const labels=language==="kk"?{cinema:"Кино сеанстары",events:"Қала оқиғалары",traffic:"Жол қозғалысы",pubCinema:"Киноафиша · ашық афиша (агрегатор)",pubEvents:"Astana.kz + Visit Astana · қалалық афиша"}:{cinema:"Movie showtimes",events:"City events",traffic:"Road traffic",pubCinema:"Kinoafisha · public listings (aggregator)",pubEvents:"Astana.kz + Visit Astana · public city listings"};
 const unavailableMessage=(status:string)=>language==="kk"?(status==="stale"?"Дереккөз күні немесе жаңарту уақыты ескірген. Деректер жасырылды.":status==="unconfigured"?"Расталған дереккөз немесе бүгінгі деректер жоқ. Мысалдармен алмастырылмайды.":"Дереккөз уақытша қолжетімсіз немесе пішімі тексеруден өтпеді. Ойдан дерек қосылмайды."):(status==="stale"?"The source date or update time is stale. Its data is hidden.":status==="unconfigured"?"No approved source or confirmed listings for today are available. Examples are never substituted.":"The source is temporarily unavailable or failed validation. No data is invented.");
 const cinemaMessage=value.cinema.status!=="live"?unavailableMessage(value.cinema.status):publicSources.cinema?(language==="kk"?"Сеанстар Киноафишаның ашық беттерінен алынды, бұл кинотеатр API-ы емес. Баға «бастап» көрсетілген, билетті өту кезінде тексеріңіз. Жариялаушының жаңарту уақыты белгісіз, біздің тексеру уақыты берілген. Таңдау алты фильммен шектелген.":"Showtimes come from public Kinoafisha pages, an aggregator rather than a cinema API. Prices are minimums; check availability when booking. The publisher's update time is unknown, so our retrieval time is shown. Coverage is limited to six films."):(language==="kk"?"Бүгінгі сеанстар рұқсат етілген фидтен алынды. Баға мен билеттер сатып алу кезінде өзгеруі мүмкін.":"Today's showtimes come from the approved feed. Prices and availability may change at checkout.");
 const eventsMessage=value.events.status!=="live"?unavailableMessage(value.events.status):publicSources.events?value.events.message:(language==="kk"?"Оқиғалар рұқсат етілген фидтен алынды. Кіру мен бағдарламаны ұйымдастырушыдан нақтылаңыз.":"Events come from the approved feed. Confirm admission and the programme with the organizer.");
 const trafficMessage=value.traffic.status==="live"?(language==="kk"?"Астана бойынша провайдер балы, шкала 1–10. Бұл жаяу бағыттың бағасы емес.":"Provider-issued traffic score for Astana on a 1–10 scale. It does not rate a walking route."):value.traffic.status==="unconfigured"?(language==="kk"?"Кептеліс балының дереккөзі қосылмаған. MapLibre кептеліс балын есептемейді.":"No traffic-score feed is connected. MapLibre does not calculate traffic scores."):(language==="kk"?"Провайдердің жаңа балы қолжетімсіз. Ол жолдардың түсінен есептелмейді.":"A fresh provider score is unavailable. It is never inferred from road colours.");
 const source=(s:string,kind:"cinema"|"events"|"traffic")=>s.startsWith("Киноафиша")?labels.pubCinema:(s.startsWith("Astana.kz")||s.startsWith("Visit Astana"))?labels.pubEvents:s==="Сеансы кино"||s==="Городские события"||s==="Дорожная ситуация"?labels[kind]:s;
 const integrationLabels=language==="kk"?{maplibre:"MapLibre · OpenStreetMap",yandex:"Yandex Maps · JavaScript API","2gis":"2GIS MapGL JS",cinema:publicSources.cinema&&value.cinema.status==="live"?labels.pubCinema:"Кино: рұқсат етілген JSON-фид",events:publicSources.events&&value.events.status==="live"?labels.pubEvents:"Оқиғалар: рұқсат етілген JSON-фид",traffic:"Кептеліс: провайдер фиді, шкала 10",telegram:"Telegram: арна иесі жарияланымдарды оқиғалар фидіне қосады",instagram:"Instagram: кәсіби аккаунт иесі медианы қосады"}:{maplibre:"MapLibre · OpenStreetMap",yandex:"Yandex Maps · JavaScript API","2gis":"2GIS MapGL JS",cinema:publicSources.cinema&&value.cinema.status==="live"?labels.pubCinema:"Cinema: approved JSON feed",events:publicSources.events&&value.events.status==="live"?labels.pubEvents:"Events: approved JSON feed",traffic:"Traffic: provider feed, scale of 10",telegram:"Telegram: the channel owner supplies approved posts to the event feed",instagram:"Instagram: the professional account owner supplies approved media"};
 return {...value,cinema:{...value.cinema,source:source(value.cinema.source,"cinema"),message:cinemaMessage},events:{...value.events,source:source(value.events.source,"events"),message:eventsMessage},traffic:{...value.traffic,source:source(value.traffic.source,"traffic"),message:trafficMessage},integrations:value.integrations.map(p=>({...p,label:integrationLabels[p.id]}))};
}

/** Parse only JSON strings serialized into public SSR. Never execute a page script. */
export function publicRscRecords(html:string):unknown[] {
 const chunks:string[]=[];const expression=/self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g;
 for(const m of html.matchAll(expression)){try{chunks.push(JSON.parse(m[1]));}catch{}}
 const found:unknown[]=[];
 for(const line of chunks.join("").split("\n")){
  const at=line.indexOf(":");if(at<0)continue;const json=line.slice(at+1);if(!json.startsWith("[")&&!json.startsWith("{"))continue;
  try{found.push(JSON.parse(json));}catch{}
 }return found;
}
function findEventFrames(records:unknown[]):{event:AnyRecord;shows:AnyRecord[]}[]{
 const output:{event:AnyRecord;shows:AnyRecord[]}[]=[];
 const walk=(value:unknown)=>{if(!value||typeof value!=="object")return;if(Array.isArray(value)){value.forEach(walk);return;}const p=value as AnyRecord;if(p.event&&typeof p.event==="object"&&Array.isArray(p.shows))output.push({event:p.event as AnyRecord,shows:p.shows as AnyRecord[]});Object.values(p).forEach(walk);};records.forEach(walk);return output;
}
function stripHtml(value:string):string{return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();}
function localized(value:unknown,lang:LiveLanguage):string{if(!value||typeof value!=="object")return "";const p=value as AnyRecord;return typeof p[lang]==="string"?p[lang] as string:typeof p.ru==="string"?p.ru as string:typeof p.en==="string"?p.en as string:"";}
export function todayPublicEventLinks(html:string,date:string):string[]{
 const urls=new Set<string>();for(const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)){
  if(!/^\/ru\/events\/[a-f0-9-]{36}$/.test(m[1]))continue;const dateTime=m[2].match(/<time\b[^>]*dateTime="([^"]+)"/i)?.[1];
  if(dateTime&&Number.isFinite(Date.parse(dateTime))&&cityDate(dateTime)===date)urls.add(`https://astana.kz${m[1]}`);
 }return [...urls].slice(0,4);
}
async function publicText(url:string,fetcher:typeof fetch):Promise<string>{
 const r=await fetcher(url,{signal:AbortSignal.timeout(7000),redirect:"manual",headers:{Accept:"text/html,application/json","User-Agent":"SeruenCityGuide/1.0 (public event references; https://seruen-astana.connect550439.chatgpt.site)"},cache:"no-store"});if(!r.ok||Number(r.headers.get("content-length"))>MAX_BYTES)throw new Error("Public source unavailable");
 const reader=r.body?.getReader();if(!reader)throw new Error("Empty source");let size=0;const chunks:Uint8Array[]=[];
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX_BYTES){await reader.cancel();throw new Error("Public source oversized");}chunks.push(part.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return new TextDecoder().decode(bytes);
}
/** Exact known venues only. Coordinates identify a building, not a verified entrance. */
const EVENT_VENUES=[
 {names:/^(?:Астана Арена|Astana Arena)$/i,lat:51.1082,lon:71.4026,source:"https://www.wikidata.org/wiki/Q746559"},
 {names:/^(?:Барыс Арена|Барыс аренасы|Barys Arena)$/i,lat:51.10921388888889,lon:71.39482222222222,source:"https://www.wikidata.org/wiki/Q16632800"},
 {names:/^(?:Астана Опера|Астана опера|Astana Opera)(?:\s*[\-–·,].*)?$/i,lat:51.135555555555555,lon:71.41091666666667,source:"https://en.wikipedia.org/?curid=48438400"},
 {names:/^(?:Астана Балет|Astana Ballet)$/i,lat:51.09825,lon:71.41939,source:"https://www.wikidata.org/wiki/Q122526919"},
 {names:/^(?:Национальный музей РК|Национальный музей Республики Казахстан|Қазақстан Республикасының Ұлттық музейі|National Museum of the Republic of Kazakhstan)$/i,lat:51.1178,lon:71.4701,source:"https://www.wikidata.org/wiki/Q18405670"},
 {names:/^(?:Дворец мира и согласия|Бейбітшілік және келісім сарайы|Palace of Peace and Reconciliation)$/i,lat:51.123055555556,lon:71.463611111111,source:"https://www.wikidata.org/wiki/Q2119741"}
];
export async function fetchPublicEvents(request:{date:string;language?:LiveLanguage;location:{lat:number;lon:number}},options?:{fetcher?:typeof fetch;now?:number}):Promise<LiveSection<CityEvent>> {
 const now=options?.now??Date.now(),fetcher=options?.fetcher??fetch,lang=request.language??"ru",retrievedAt=new Date(now).toISOString();
 const source="Astana.kz · публичная городская афиша";
 try{
  if(request.date!==cityDate(now))throw new StaleFeedError("Requested date is not today");
  const robots=await publicText("https://astana.kz/robots.txt",fetcher);
  if(/disallow:\s*\/ru\/events|disallow:\s*\/events|disallow:\s*\/\s*(?:\r?\n|$)/i.test(robots))throw new Error("Public source disallows collection");
  const html=await publicText("https://astana.kz/ru/events",fetcher),links=todayPublicEventLinks(html,request.date),items:CityEvent[]=[];
  for(const url of links){
   const page=await publicText(url,fetcher);const frames=findEventFrames(publicRscRecords(page));
   for(const {event,shows} of frames){
    if(event.isActive===false)continue;
    for(const show of shows){
     const startsAt=timestamp(show.startDate);if(show.isCanceled||cityDate(startsAt)!==request.date)continue;
     const duration=typeof event.duration==="number"&&event.duration>0&&event.duration<=720?event.duration:undefined;
     const endsAt=duration?new Date(Date.parse(startsAt)+duration*60_000).toISOString():undefined;
     if(Date.parse(startsAt)<now&&(!endsAt||Date.parse(endsAt)<=now))continue;
     const firstPlace=Array.isArray(show.places)?record(show.places[0]):null;
     const venue=firstPlace?localized(firstPlace.name,lang):"";
     // Exact aliases from independently sourced venue records; no per-visitor geocoding.
     const point=EVENT_VENUES.find(p=>p.names.test(venue));if(!point)continue;
     const position={lat:point.lat,lon:point.lon};
     const title=localized(event.name,lang)||localized(show.eventName,lang);if(!title)continue;
     const descriptionText=stripHtml(localized(event.description,lang));const description=descriptionText.match(/^.{1,400}?[.!?](?:\s|$)/)?.[0]?.trim()||descriptionText.slice(0,220)||title;
     const cover=typeof event.coverHorizontalFileId==="string"&&/^[a-f0-9-]{36}$/.test(event.coverHorizontalFileId)?`https://astana.kz/_media/event/Files/Download/${event.coverHorizontalFileId}`:null;
     const rawPrice=typeof show.priceFrom==="number"?show.priceFrom:event.priceFrom;
     items.push({id:`astana:${text(show.id,160)}`,title:title.slice(0,180),description,imageUrl:cover,startsAt,...endsAt?{endsAt}:{},venue,address:`${venue}, ${lang==="en"?"Astana":"Астана"}`,...position,distanceMeters:directDistance(request.location,position),priceKzt:price(rawPrice),priceIsFrom:true,sourceUrl:url,bookingUrl:url,category:localized(event.genre,lang)||(lang==="en"?"Event":lang==="kk"?"Оқиға":"Событие"),updatedAt:retrievedAt,coordinateSourceUrl:point.source});
    }
   }
  }
  return {status:"live",source,updatedAt:retrievedAt,retrievedAt,sourceUpdatedAt:null,items:[...new Map(items.map(p=>[p.id,p])).values()].slice(0,20),message:"Публичные страницы получены сейчас. Время обновления издателем неизвестно. Цена указана от минимальной, наличие уточняйте у организатора. Координаты площадки из Википедии, не точка входа."};
 }catch(e){return {status:e instanceof StaleFeedError?"stale":"error",source,updatedAt:null,retrievedAt:null,sourceUpdatedAt:null,items:[],message:"Публичная афиша не подтвердила события на сегодня. Данные не выдуманы и не заменены прошлой датой."};}
}
export async function fetchCombinedPublicEvents(request:{date:string;language?:LiveLanguage;location:{lat:number;lon:number}},options?:{fetcher?:typeof fetch;now?:number}):Promise<LiveSection<CityEvent>>{
 const now=options?.now??Date.now();
 if(request.date!==cityDate(now))return {status:"stale",source:"Astana.kz + Visit Astana",updatedAt:null,items:[],message:"Requested date is not today."};
 const [municipal,tourism]=await Promise.all([fetchPublicEvents(request,options),fetchVisitAstanaEvents(request,options)]);
 const live=[municipal,tourism].filter(s=>s.status==="live");
 if(!live.length)return municipal;
 const language=request.language??"ru",message=language==="kk"?"Ашық қалалық афишалар тексерілді. Нақты сеанс уақыты мен жарияланған күндер аралығы бөлек көрсетіледі. Уақыт пен мекенжай болмаған кезде олар ойдан қосылмайды; ұйымдастырушыдан тексеріңіз. Қамту шектеулі.":language==="en"?"Public municipal listings were checked. Exact sessions and published date intervals are shown separately. Missing hours, venues and prices are not inferred; confirm with the organiser. Coverage is limited.":"Проверены публичные городские афиши. Точные сеансы и опубликованные периоды показаны отдельно. Неизвестные часы, площадки и цены не додумываются — уточните у организатора. Охват ограничен.";
 return {status:"live",source:live.map(s=>s.source.split(" · ")[0]).join(" + "),updatedAt:new Date(now).toISOString(),retrievedAt:new Date(now).toISOString(),sourceUpdatedAt:null,items:[...new Map(live.flatMap(s=>s.items).map(p=>[p.id,p])).values()].slice(0,20),message};
}
