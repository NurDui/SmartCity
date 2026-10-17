import type { CinemaSession, LiveLanguage, LiveSection } from "./live-types.ts";

const HOST="https://kz.kinoafisha.info";
const INDEX=`${HOST}/astana/movies/`;
const SOURCE="Киноафиша · публичная афиша (агрегатор)";
const MAX_BYTES=1_500_000;
export interface PublicCinemaRequest {date:string;language?:LiveLanguage;location:{lat:number;lon:number};}
export interface PublicCinemaResult extends LiveSection<CinemaSession> {retrievedAt:string|null;sourceUpdatedAt:null;}
type RecordValue=Record<string,unknown>;
function record(v:unknown):RecordValue|null{return v&&typeof v==="object"&&!Array.isArray(v)?v as RecordValue:null;}
function clean(value:unknown):string {
 if(typeof value!=="string")return "";
 return value.replace(/<[^>]*>/g," ").replace(/&#(x[0-9a-f]+|\d+);/gi,(_,code:string)=>{const n=code.startsWith("x")?parseInt(code.slice(1),16):Number(code);return Number.isFinite(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):"";}).replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
}
function jsonNodes(html:string):RecordValue[]{
 const out:RecordValue[]=[];
 const walk=(v:unknown,depth=0)=>{if(depth>8||out.length>1000)return;if(Array.isArray(v)){v.forEach(x=>walk(x,depth+1));return;}const p=record(v);if(!p)return;out.push(p);if(p["@graph"])walk(p["@graph"],depth+1);};
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(match[1]));}catch{/* Invalid structured data is not repaired or executed. */}}
 return out;
}
function distance(a:{lat:number;lon:number},b:{lat:number;lon:number}):number{const rad=(v:number)=>v*Math.PI/180;const h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;return Math.round(6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)));}
function publicUrl(v:unknown):string|null{try{const u=new URL(String(v)),host=u.hostname.toLowerCase();return u.protocol==="https:"&&!u.username&&!u.password&&host!=="localhost"&&!host.endsWith(".localhost")&&!host.endsWith(".local")&&!host.endsWith(".internal")&&!/^\d+\.\d+\.\d+\.\d+$/.test(host)&&!host.includes(":")?u.href:null;}catch{return null;}}
function hasType(value:unknown,type:string):boolean{return value===type||Array.isArray(value)&&value.includes(type);}
function sourceImage(value:unknown):string|null{if(typeof value==="string")return publicUrl(value);return publicUrl(record(value)?.url);}
function shortSynopsis(value:unknown):string{const text=clean(value);const words=text.split(/\s+/);return words.length>22?`${words.slice(0,22).join(" ")}…`:text;}
function sourceSynopsis(movie:RecordValue,language:LiveLanguage="ru"):string{
 const synopsis=shortSynopsis(movie.description);if(synopsis)return synopsis;
 const genres=(Array.isArray(movie.genre)?movie.genre:[movie.genre]).filter((v):v is string=>typeof v==="string").map(clean).filter(Boolean).slice(0,3).map(v=>v.slice(0,60));
 const unavailable={ru:"Сюжет не опубликован на странице сеансов.",kk:"Сеанс бетінде сюжет сипаттамасы жарияланбаған.",en:"The showtimes page does not publish a plot description."}[language];
 const prefix={ru:"Жанры по источнику",kk:"Дереккөздегі жанрлар",en:"Genres as listed by the source"}[language];
 return genres.length?`${prefix}: ${genres.join(", ")}. ${unavailable}`:unavailable;
}
function eventCoversDate(event:RecordValue,date:string):boolean{
 if(typeof event.startDate!=="string")return false;
 const start=event.startDate.slice(0,10);if(start===date)return true;
 if(typeof event.endDate!=="string")return false;
 const end=event.endDate.slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))return false;
 const duration=Date.parse(end)-Date.parse(start);
 // A bounded published run plus a matching visible dated section confirms future sessions.
 // Missing years, backwards ranges and stale year-long events never become current listings.
 return Number.isFinite(duration)&&duration>=0&&duration<=31*86400000&&start<=date&&date<=end;
}
// Only explicit, individually identified mall/venue names are recognised here.
// Chaplin at MEGA Silk Way: https://mega.kz/Tenant/MEGA-Silk-Way
// Other names are present verbatim in the public cinema listings and their addresses.
function namedMall(cinemaName:string):string|null {
 if(/^Chaplin\s+MEGA\s+Silk\s+Way$/i.test(cinemaName))return "MEGA Silk Way";
 if(/^Chaplin\s+(?:Khan\s+Shatyr|Хан\s+Шатыр)$/i.test(cinemaName))return "Хан Шатыр";
 if(/^Kinopark\s+6\s+Keruencity$/i.test(cinemaName))return "Keruencity";
 return null;
}
/** Reads only visible public showtimes and their matching JSON-LD venue coordinates.
 * It never promotes movie release dates or aggregate minimum prices to session facts.
 */
export function parsePublicCinemaPage(html:string,request:PublicCinemaRequest&{sourceUrl:string;now?:number}):CinemaSession[]{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(request.date)||!/^https:\/\/kz\.kinoafisha\.info\/astana\/movies\/\d+\/$/.test(request.sourceUrl))return [];
 const nodes=jsonNodes(html);const movie=nodes.find(p=>hasType(p["@type"],"Movie"));
 const event=nodes.find(p=>hasType(p["@type"],"Event")&&eventCoversDate(p,request.date));
 // Plot metadata is optional and must not suppress independently sourced dated sessions.
 if(!movie||!event||!clean(movie.name))return [];
 const venues=(Array.isArray(event.location)?event.location:[event.location]).map(record).filter((p):p is RecordValue=>Boolean(p));
 const sections=[...html.matchAll(/<article\b[^>]*data-schedule-date=["'](\d{4}-\d{2}-\d{2})["'][^>]*>([\s\S]*?)<\/article>/gi)].filter(m=>m[1]===request.date).map(m=>m[2]);
 if(!sections.length)return [];
 const now=request.now??Date.now(),updatedAt=new Date(now).toISOString(),items:CinemaSession[]=[];const seen=new Set<string>();
 for(const section of sections){const matches=[...section.matchAll(/<div\b[^>]*data-Schedule-item=["']([^"']+)["'][^>]*>/gi)];
  for(let i=0;i<matches.length;i++){
   const name=clean(matches[i][1]);const venue=venues.find(v=>clean(v.name).toLowerCase()===name.toLowerCase());if(!venue)continue;
   const geo=record(venue.geo),lat=Number(geo?.latitude),lon=Number(geo?.longitude);
   if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<50.9||lat>51.35||lon<71.15||lon>71.8)continue;
   const venueUrl=publicUrl(venue.url);if(!venueUrl?.startsWith(`${HOST}/astana/cinema/`))continue;
   const body=section.slice(matches[i].index!+matches[i][0].length,matches[i+1]?.index??section.length);
   const address=clean(typeof venue.address==="string"?venue.address:record(venue.address)?.streetAddress);
   const mall=address.match(/(?:ТРЦ|ТРК|ТЦ)\s+([^,;]+)/i)?.[1]?.trim()??namedMall(name);
   for(const session of body.matchAll(/<(?:button|a)\b[^>]*class=["'][^"']*\bshowtimes_session\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:button|a)>/gi)){
    const time=clean(session[1].match(/<span\b[^>]*class=["'][^"']*\bsession_time\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))continue;
    const startsAt=`${request.date}T${time}:00+05:00`;if(Date.parse(startsAt)<now)continue;
    const rawPrice=clean(session[1].match(/<span\b[^>]*class=["'][^"']*\bsession_price\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const priceMatch=rawPrice.match(/^(?:от\s*)?(\d[\d\s\u00a0\u202f]*)\s*(?:₸|KZT|тенге)$/i);
    const amount=priceMatch?Number(priceMatch[1].replace(/\s/g,"")):NaN;
    const priceKzt=rawPrice&&Number.isFinite(amount)&&amount>=0&&amount<10_000_000?amount:null;
    const id=`kinoafisha-${request.sourceUrl.match(/\/(\d+)\/$/)?.[1]}-${venueUrl.match(/\/(\d+)\/$/)?.[1]??name}-${request.date}-${time.replace(":","")}`;
    if(seen.has(id))continue;seen.add(id);
    items.push({id,title:clean(movie.name).slice(0,180),synopsis:sourceSynopsis(movie,request.language),posterUrl:sourceImage(movie.image),startsAt,priceKzt,priceIsFrom:priceKzt!==null&&/^от\s/i.test(rawPrice),currency:"KZT",cinemaName:name,mallName:mall,lat,lon,distanceMeters:distance(request.location,{lat,lon}),bookingUrl:request.sourceUrl,sourceUrl:request.sourceUrl,updatedAt});
   }
  }
 }
 return items;
}
async function readHtml(url:string,fetcher:typeof fetch):Promise<string>{
 const response=await fetcher(url,{headers:{Accept:"text/html,text/plain;q=0.9","User-Agent":"Seruen/1.0 (public Astana cinema guide)"},signal:AbortSignal.timeout(5500),redirect:"manual",cache:"no-store"});
 if(!response.ok||Number(response.headers.get("content-length"))>MAX_BYTES)throw new Error("Public cinema source unavailable");
 const reader=response.body?.getReader();if(!reader)throw new Error("Empty source response");let size=0;const chunks:Uint8Array[]=[];
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX_BYTES){await reader.cancel();throw new Error("Source exceeds size limit");}chunks.push(part.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(bytes);
}
function robotsAllows(path:string,rules:string):boolean {
 const matches=[...rules.matchAll(/^(Allow|Disallow):\s*([^\r\n#]*)/gim)].map(m=>({allow:m[1].toLowerCase()==="allow",pattern:m[2].trim()})).filter(r=>r.pattern);
 let winning:{allow:boolean;length:number}|null=null;
 for(const rule of matches){const end=rule.pattern.endsWith("$");const pattern=end?rule.pattern.slice(0,-1):rule.pattern;
  const escaped=pattern.split("*").map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join(".*");
  if(new RegExp(`^${escaped}${end?"$":""}`).test(path)&&(!winning||pattern.length>winning.length||pattern.length===winning.length&&rule.allow))winning={allow:rule.allow,length:pattern.length};
 }
 return winning?.allow??true;
}
export async function fetchPublicCinema(request:PublicCinemaRequest,options?:{fetcher?:typeof fetch;now?:number}):Promise<PublicCinemaResult>{
 const fetcher=options?.fetcher??fetch,now=options?.now??Date.now();
 const base={source:SOURCE,updatedAt:null,retrievedAt:null,sourceUpdatedAt:null,items:[]} satisfies Omit<PublicCinemaResult,"status"|"message">;
 try{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(request.date))return {...base,status:"error",message:"Некорректная дата афиши."};
  const robots=await readHtml(`${HOST}/robots.txt`,fetcher);
  // Generic robots rules are respected; no query, search, profile, or hidden API paths are used.
  const generic=robots.split(/User-agent:\s*\*/i)[1]?.split(/User-agent:/i)[0];
  if(!generic||!robotsAllows("/astana/movies/",generic))return {...base,status:"unconfigured",message:"Публичный источник ограничивает автоматическое чтение афиши."};
  const listing=await readHtml(INDEX,fetcher);
  const links=[...new Set([...listing.matchAll(/href=["']https:\/\/kz\.kinoafisha\.info\/astana\/movies\/(\d+)\/(?:#[^"']*)?["']/gi)].map(m=>`${HOST}/astana/movies/${m[1]}/`))].filter(url=>robotsAllows(new URL(url).pathname,generic)).slice(0,6);
  if(!links.length)return {...base,status:"unconfigured",message:"В публичной афише не найдены доступные страницы сеансов. Откройте kino.kz или кинотеатр напрямую."};
  const pages=await Promise.allSettled(links.map(async sourceUrl=>parsePublicCinemaPage(await readHtml(sourceUrl,fetcher),{...request,sourceUrl,now})));
  const items=pages.flatMap(p=>p.status==="fulfilled"?p.value:[]).sort((a,b)=>a.distanceMeters-b.distanceMeters||Date.parse(a.startsAt)-Date.parse(b.startsAt)).slice(0,40);
  if(!items.length)return {...base,status:pages.every(p=>p.status==="rejected")?"error":"unconfigured",message:"Публичный источник не подтвердил предстоящие сеансы именно на запрошенную дату. Примеры не подставляются."};
  const retrievedAt=new Date(now).toISOString();
  return {...base,status:"live",items,updatedAt:retrievedAt,retrievedAt,message:"Сеансы прочитаны из публичной афиши Киноафиши (агрегатор), а не API кинотеатра. Указаны цены «от»; наличие проверяйте при переходе. Время обновления издателем не опубликовано — показано время нашей проверки. Подборка охватывает до 6 фильмов, не всю афишу."};
 }catch{return {...base,status:"error",message:"Публичная афиша временно недоступна. Сеансы и цены не подставляются из примеров."};}
}

