import {getFeedConfig} from "./provider-config.ts";
/** Fixed server configuration only; clients can never select an upstream URL. */
export interface MapPoint {lat:number;lon:number}
export interface SearchPlace extends MapPoint {id:string;label:string}
export interface WalkStep {type:string;modifier:string;name:string;distance:number}
export interface WalkRoute {distance:number;duration:number;geometry:{type:"LineString";coordinates:number[][]};steps:WalkStep[];snappedMeters:number;source:string}
export interface MapDatabase {prepare(sql:string):{bind(...values:(string|number)[]):{first<T=Record<string,unknown>>():Promise<T|null>;run():Promise<unknown>}}}
export const SERVICE_SQL=`WITH clock(now_ms) AS (SELECT CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))
INSERT INTO service_reservations(id,scope,at)
SELECT ?1,?2,clock.now_ms FROM clock
WHERE NOT EXISTS(SELECT 1 FROM service_reservations WHERE scope=?2 AND at>clock.now_ms-2000)
AND (SELECT COUNT(*) FROM service_reservations WHERE scope=?2 AND at>=clock.now_ms-86400000)<?3
RETURNING id`;
export class MapServiceError extends Error {status:number;code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code;}}
export function cityPoint(value:unknown):MapPoint {
 if(!value||typeof value!=="object")throw new MapServiceError(400,"invalid_point");
 const {lat,lon}=value as MapPoint;
 if(typeof lat!=="number"||typeof lon!=="number"||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<50.9||lat>51.35||lon<71.15||lon>71.8)throw new MapServiceError(400,"outside_astana");
 return {lat,lon};
}
/** Atomic reservations on the primary, all visitors/isolates share the same budget.
 * Dispatch deadline starts BEFORE D1. 2s spacing minus 500ms deadline > 1s.
 * Missing/unhealthy D1 fails closed. Failed provider calls also spend the grant.
 */
export async function reserveService(db:MapDatabase|undefined,scope:string,limit=1000){
 if(!db)throw new MapServiceError(503,"shared_quota_unavailable");
 const deadline=performance.now()+500,id=crypto.randomUUID();
 try {const row=await db.prepare(SERVICE_SQL).bind(id,scope,limit).first<{id:string}>();if(!row||row.id!==id)throw new MapServiceError(429,"rate_limited");}
 catch(e){if(e instanceof MapServiceError)throw e;throw new MapServiceError(503,"shared_quota_unavailable");}
 if(performance.now()>deadline)throw new MapServiceError(429,"rate_limited");
}
async function cleanup(db:MapDatabase){try{await db.prepare("DELETE FROM service_reservations WHERE at<CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)-172800000").bind().run();await db.prepare("DELETE FROM geocode_cache WHERE expires<CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)").bind().run();}catch{/* no payload logging */}}
async function json(response:Response,max:number):Promise<unknown>{
 if(!response.ok)throw new MapServiceError(response.status===429?429:502,"provider_unavailable");
 if(!response.headers.get("content-type")?.includes("json")||Number(response.headers.get("content-length"))>max)throw new MapServiceError(502,"invalid_provider_response");
 const reader=response.body?.getReader();if(!reader)throw new MapServiceError(502,"invalid_provider_response");
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new MapServiceError(502,"invalid_provider_response");}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
const headers={"User-Agent":"SeruenAstana/2.0 (+https://seruen-astana.connect550439.chatgpt.site/)","Referer":"https://seruen-astana.connect550439.chatgpt.site/","Accept":"application/json"};
export async function searchCity(query:unknown,language:unknown,db?:MapDatabase,fetcher:typeof fetch=fetch):Promise<SearchPlace[]>{
 if(typeof query!=="string"||query.trim().length<3||query.length>160||/[<>@\r\n]/.test(query))throw new MapServiceError(400,"invalid_query");
 if(process.env.NOMINATIM_ENABLED==="false")throw new MapServiceError(503,"provider_disabled");
 if(!db)throw new MapServiceError(503,"shared_quota_unavailable");
 const lang=language==="kk"?"kk":language==="en"?"en":"ru",normalized=query.trim().toLowerCase().replace(/\s+/g," ");
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(lang+"|"+normalized)))).map(x=>x.toString(16).padStart(2,"0")).join("");
 try{const cached=await db.prepare("SELECT value FROM geocode_cache WHERE key=?1 AND expires>?2").bind(hash,Date.now()).first<{value:string}>();if(cached)return parseSearch(JSON.parse(cached.value));}catch{/* continue to guarded provider */}
 const endpoint=getFeedConfig("events",{EVENTS_FEED_URL:process.env.NOMINATIM_SEARCH_URL??"https://nominatim.openstreetmap.org/search"})!;
 const url=new URL(endpoint.url);url.search=new URLSearchParams({q:query.trim(),format:"jsonv2",countrycodes:"kz",viewbox:"71.15,51.35,71.8,50.9",bounded:"1",limit:"5","accept-language":lang}).toString();
 await reserveService(db,"nominatim-v1");
 try {
  const raw=await json(await fetcher(url,{headers,redirect:"manual",signal:AbortSignal.timeout(6500)}),64000),items=parseSearch(raw);
  // Persist public result fields only, query is hashed. TTL 24h incl. negative results.
  const cacheRaw=items.map(p=>({place_id:p.id,display_name:p.label,lat:String(p.lat),lon:String(p.lon)}));
  await db.prepare("INSERT INTO geocode_cache(key,value,expires) VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires").bind(hash,JSON.stringify(cacheRaw),Date.now()+86400000).run();return items;
 }finally{await cleanup(db);}
}
export function parseSearch(raw:unknown):SearchPlace[]{
 if(!Array.isArray(raw))throw new MapServiceError(502,"invalid_provider_response");
 return raw.slice(0,5).flatMap(p=>{try{const point=cityPoint({lat:Number(p.lat),lon:Number(p.lon)});return typeof p.display_name==="string"&&p.display_name.length<=1500&&/(?:Астана|Astana)/i.test(p.display_name)?[{...point,id:String(p.place_id).slice(0,80),label:p.display_name.slice(0,350)}]:[];}catch{return [];}});
}
export function parseRoute(raw:unknown):WalkRoute {
 const r=raw as {code?:string;routes?:any[];waypoints?:any[]},route=r?.routes?.[0];
 if(r?.code!=="Ok"||!route||!Number.isFinite(route.distance)||route.distance<1||route.distance>50000||!Number.isFinite(route.duration)||route.duration<=0||route.duration>86400||route.geometry?.type!=="LineString"||!Array.isArray(route.geometry.coordinates)||route.geometry.coordinates.length<2||route.geometry.coordinates.length>20000)throw new MapServiceError(502,"no_route");
 for(const p of route.geometry.coordinates){if(!Array.isArray(p)||p.length!==2)throw new MapServiceError(502,"invalid_provider_response");cityPoint({lat:p[1],lon:p[0]});}
 const snap=r.waypoints?.map(p=>p.distance);if(!snap||snap.length!==2||snap.some(n=>!Number.isFinite(n)||n<0||n>500))throw new MapServiceError(502,"entrance_too_far");
 const steps=(route.legs??[]).flatMap((l:any)=>l.steps??[]).slice(0,150).map((s:any)=>({type:String(s.maneuver?.type??"continue").slice(0,40),modifier:String(s.maneuver?.modifier??"").slice(0,30),name:typeof s.name==="string"?s.name.slice(0,180):"",distance:Math.max(0,Number(s.distance)||0)}));
 return {distance:Math.round(route.distance),duration:Math.round(route.duration),geometry:route.geometry,steps,snappedMeters:Math.round(Math.max(...snap)),source:"OSRM · FOSSGIS / OpenStreetMap"};
}
export async function walkingRoute(from:unknown,to:unknown,db?:MapDatabase,fetcher:typeof fetch=fetch):Promise<WalkRoute>{
 const a=cityPoint(from),b=cityPoint(to);
 if(process.env.OSRM_ENABLED==="false")throw new MapServiceError(503,"provider_disabled");
 // The dedicated routed-foot server uses a pedestrian graph. OSRM's URL profile is 'driving'.
 const url=`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=true&alternatives=false`;
 await reserveService(db,"fossgis-foot-v1");
 try{return parseRoute(await json(await fetcher(url,{headers,redirect:"manual",signal:AbortSignal.timeout(9000)}),1500000));}finally{if(db)await cleanup(db);}
}
