import type {CityEvent,LiveLanguage,LiveSection} from "./live-types.ts";
const ORIGIN="https://visitastana.kz";
const MAX_BYTES=1_500_000;
const copy={
 ru:{venue:"Площадка — по ссылке организатора",address:"Адрес не подтверждён",category:"Городская афиша",description:"В городской афише указан этот период проведения. Точное время, площадку и возможность посещения сегодня уточните по ссылке организатора.",message:"Visit Astana: опубликованные периоды событий, включающие сегодня. Даты не означают, что площадка открыта весь день; часы, место и билеты уточните у организатора."},
 kk:{venue:"Өтетін орын — ұйымдастырушының сілтемесінде",address:"Мекенжай расталмаған",category:"Қалалық афиша",description:"Қалалық афишада осы мерзім көрсетілген. Нақты уақытты, орынды және бүгін бару мүмкіндігін ұйымдастырушының сілтемесінен тексеріңіз.",message:"Visit Astana: бүгінді қамтитын жарияланған іс-шара мерзімдері. Бұл тәулік бойы ашық дегенді білдірмейді; уақыт, орын және билеттерді ұйымдастырушыдан нақтылаңыз."},
 en:{venue:"Venue — see the organiser's link",address:"Address unconfirmed",category:"City listings",description:"The municipal listing publishes this date interval. Confirm the exact hours, venue and availability today using the organiser's link.",message:"Visit Astana: published event periods that include today. Dates do not imply all-day opening; check hours, venue and tickets with the organiser."}
};
function plain(value:string){return value.replace(/<[^>]*>/g," ").replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();}
function isoDate(value:string):string|null{
 const m=value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);if(!m)return null;
 const iso=`${m[3]}-${m[2]}-${m[1]}`;const date=new Date(`${iso}T00:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:null;
}
function external(value:string):string|null{try{const u=new URL(value,ORIGIN);if(u.protocol!=="https:"||u.username||u.password||!["visitastana.kz","www.visitastana.kz","ticketon.kz","www.instagram.com","instagram.com"].includes(u.hostname))return null;u.search="";return u.href;}catch{return null;}}
/** Only visible listing cards are parsed; protected detail pages are never requested. */
export function parseVisitAstanaEvents(html:string,{date,language="ru",now=Date.now()}:{date:string;language?:LiveLanguage;now?:number}):CityEvent[]{
 const c=copy[language],items:CityEvent[]=[],seen=new Set<string>();
 const blocks=html.split(/<div\b[^>]*class="upcoming"\s*>/i).slice(1,25);
 for(const block of blocks){
  const title=plain(block.match(/<h5\b[^>]*class="upcoming__title"[^>]*>([\s\S]*?)<\/h5>/i)?.[1]??"").slice(0,180);
  const dates=plain(block.match(/<div\b[^>]*class="upcoming__date"[^>]*>([\s\S]*?)<\/div>/i)?.[1]??"").match(/(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/);
  const start=dates&&isoDate(dates[1]),end=dates&&isoDate(dates[2]);
  if(!title||!start||!end||start>end||date<start||date>end||Date.parse(end)-Date.parse(start)>366*86400000)continue;
  const bookingRaw=block.match(/<a\b[^>]*href="([^"]+)"[^>]*class="upcoming__buy"/i)?.[1];
  const bookingUrl=bookingRaw?external(bookingRaw):null;if(!bookingUrl)continue;
  const imageRaw=block.match(/<img\b[^>]*src="([^"]+)"[^>]*alt=/i)?.[1];
  const imageUrl=imageRaw?.startsWith("/upload/")?new URL(imageRaw,ORIGIN).href:null;
  const id=`visitastana:${start}:${bookingUrl}`;if(seen.has(id))continue;seen.add(id);
  const path=language==="kk"?"kz":language;
  items.push({id,title,description:c.description,imageUrl,startsAt:`${start}T00:00:00+05:00`,endsAt:`${end}T23:59:59+05:00`,venue:c.venue,address:c.address,lat:null,lon:null,distanceMeters:null,priceKzt:null,sourceUrl:`${ORIGIN}/${path}/about-city/where-to-go/?start=${date}`,bookingUrl,category:c.category,updatedAt:new Date(now).toISOString(),datePrecision:"day",sourceDateRange:`${dates![1]} – ${dates![2]}`});
 }
 return items.slice(0,8);
}
async function html(url:string,fetcher:typeof fetch){
 const response=await fetcher(url,{headers:{Accept:"text/html,text/plain","User-Agent":"SeruenAstana/1.0 (public cultural listings; https://seruen-astana.connect550439.chatgpt.site)"},signal:AbortSignal.timeout(7000),redirect:"manual"});
 if(!response.ok||Number(response.headers.get("content-length"))>MAX_BYTES)throw new Error("Listing unavailable");
 const reader=response.body?.getReader();if(!reader)throw new Error("Empty listing");let size=0;const chunks:Uint8Array[]=[];
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX_BYTES){await reader.cancel();throw new Error("Listing oversized");}chunks.push(part.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return new TextDecoder().decode(bytes);
}
export async function fetchVisitAstanaEvents(request:{date:string;language?:LiveLanguage},options?:{fetcher?:typeof fetch;now?:number}):Promise<LiveSection<CityEvent>>{
 const language=request.language??"ru",now=options?.now??Date.now(),fetcher=options?.fetcher??fetch;
 try{
  const robots=await html(`${ORIGIN}/robots.txt`,fetcher);
  if(/disallow:\s*\/(?:ru\/|kz\/|en\/)?about-city\/where-to-go|disallow:\s*\/\s*(?:\r?\n|$)/i.test(robots))throw new Error("Source disallows collection");
  const path=language==="kk"?"kz":language;
  const listing=await html(`${ORIGIN}/${path}/about-city/where-to-go/?start=${request.date}`,fetcher);
  if(!listing.includes('class="upcoming"'))throw new Error("Listing format unavailable");
  return {status:"live",source:"Visit Astana · публичная афиша",updatedAt:new Date(now).toISOString(),retrievedAt:new Date(now).toISOString(),sourceUpdatedAt:null,items:parseVisitAstanaEvents(listing,{...request,now}),message:copy[language].message};
 }catch{return {status:"error",source:"Visit Astana · публичная афиша",updatedAt:null,retrievedAt:null,sourceUpdatedAt:null,items:[],message:"The current listing could not be verified."};}
}
