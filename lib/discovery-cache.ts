import type {MapDatabase} from "./open-map.ts";
import type {CityEvent,CinemaSession,LiveSection} from "./live-types.ts";
export type PublicSection=LiveSection<CityEvent>|LiveSection<CinemaSession>;
const TTL=15*60_000;
const LOCK_TTL=90_000;
/** One refresh per source/date/language across workers. Contains public listings only. */
export async function cachedPublicDiscovery(db:MapDatabase,key:string,now:number,collect:()=>Promise<PublicSection>):Promise<PublicSection>{
 const decode=(value:string):PublicSection|null=>{
  try{const parsed=JSON.parse(value) as PublicSection;if(!parsed||!Array.isArray(parsed.items)||typeof parsed.status!=="string")return null;
   // A cache lock extends expires but must not make an older payload fresh.
   const stamp=parsed.retrievedAt??parsed.updatedAt;
   if(parsed.status==="live"&&(!stamp||!Number.isFinite(Date.parse(stamp))||Date.parse(stamp)<now-TTL||Date.parse(stamp)>now+60_000))return null;
   return parsed;
  }catch{return null;}
 };
 const row=await db.prepare("SELECT value,expires FROM public_discovery_cache WHERE key=?1").bind(key).first<{value:string;expires:number}>();
 if(row&&row.expires>now){const result=decode(row.value);if(result)return result;}
 const claim=await db.prepare("INSERT INTO public_discovery_cache(key,value,expires) VALUES (?1,'',?2) ON CONFLICT(key) DO UPDATE SET expires=excluded.expires WHERE public_discovery_cache.expires<=?3 RETURNING key").bind(key,now+LOCK_TTL,now).first<{key:string}>();
 if(!claim)throw new Error("Public source refresh in progress");
 try{
  const result=await collect();
  await db.prepare("UPDATE public_discovery_cache SET value=?1,expires=?2 WHERE key=?3 AND expires=?4").bind(JSON.stringify(result),now+(result.status==="live"?TTL:60_000),key,now+LOCK_TTL).run();
  await db.prepare("DELETE FROM public_discovery_cache WHERE expires<?1").bind(now-86400000).run();
  return result;
 }catch{
  // Keep a short failed lock to prevent outage-driven collection loops.
  await db.prepare("UPDATE public_discovery_cache SET expires=?1 WHERE key=?2 AND expires=?3").bind(now+60_000,key,now+LOCK_TTL).run().catch(()=>{});
  throw new Error("Public source unavailable");
 }
}
