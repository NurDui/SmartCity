/** Only a publisher-approved feed may supply the hero; Instagram is never scraped. */
export interface CityPhoto {
  imageUrl: string; sourceUrl: string; author: string; title: string;
  license: string; licenseUrl: string; capturedAt: string|null;
}
export interface CityPhotoResponse { status:"today"|"archive"; date:string; photo:CityPhoto }
export const ARCHIVE_PHOTO:CityPhoto={imageUrl:"/images/astana-esil.jpg",sourceUrl:"https://commons.wikimedia.org/wiki/File:Astana_Esil_view.jpg",author:"Dauren Nabijan",title:"Astana · Esil",license:"CC0",licenseUrl:"https://creativecommons.org/publicdomain/zero/1.0/",capturedAt:null};
export function astanaDay(now:number|string=Date.now()):string {
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Qyzylorda",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(now));
 return ["year","month","day"].map(k=>parts.find(p=>p.type===k)?.value).join("-");
}
function httpsUrl(value:unknown):URL {
 if(typeof value!=="string"||value.length>2048)throw new Error("Invalid URL");
 const url=new URL(value),host=url.hostname.toLowerCase();
 if(url.protocol!=="https:"||url.username||url.password||url.hash||host==="localhost"||host.endsWith(".local")||host.endsWith(".internal")||host.endsWith(".localhost")||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(":"))throw new Error("Public HTTPS required");
 return url;
}
function label(value:unknown,max:number):string{if(typeof value!=="string"||!value.trim()||value.length>max)throw new Error("Invalid attribution");return value.trim();}
export function validateDailyPhoto(raw:unknown,hosts:string[],now=Date.now()):CityPhoto {
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Invalid photo");
 const p=raw as Record<string,unknown>;
 if(p.city!=="Astana"||p.captureDateVerified!==true||p.rightsVerified!==true)throw new Error("Capture date and permission must be verified by the publisher");
 const capturedAt=label(p.capturedAt,40);
 if(!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(capturedAt)||!Number.isFinite(Date.parse(capturedAt))||Date.parse(capturedAt)>now||astanaDay(capturedAt)!==astanaDay(now))throw new Error("Not photographed today in Astana");
 const reviewedAt=label(p.reviewedAt,40),reviewTime=Date.parse(reviewedAt);
 if(!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(reviewedAt)||!Number.isFinite(reviewTime)||reviewTime<Date.parse(capturedAt)||reviewTime>now)throw new Error("Invalid publisher review");
 const image=httpsUrl(p.imageUrl);
 if(!hosts.includes(image.hostname.toLowerCase()))throw new Error("Media host is not approved");
 const license=label(p.license,80);
 if(!["CC0","CC BY 4.0","CC BY-SA 4.0","Permission granted"].includes(license))throw new Error("Unsupported rights declaration");
 return {imageUrl:image.href,sourceUrl:httpsUrl(p.sourceUrl).href,author:label(p.author,160),title:label(p.title,240),license,licenseUrl:httpsUrl(p.licenseUrl).href,capturedAt:new Date(capturedAt).toISOString()};
}
let cached:{key:string;raw:unknown;expires:number}|undefined;
let pending:{key:string;promise:Promise<unknown>}|undefined;
export function resetPhotoCache(){cached=undefined;pending=undefined;}
export async function getCityPhoto(options:{env?:Record<string,string|undefined>;fetcher?:typeof fetch;now?:number}={}):Promise<CityPhotoResponse>{
 const env=options.env??process.env,now=options.now??Date.now(),date=astanaDay(now),fallback:CityPhotoResponse={status:"archive",date,photo:ARCHIVE_PHOTO};
 if(!env.CITY_PHOTO_FEED_URL||!env.CITY_PHOTO_MEDIA_HOSTS)return fallback;
 try{
  const url=httpsUrl(env.CITY_PHOTO_FEED_URL),hosts=env.CITY_PHOTO_MEDIA_HOSTS.split(",").map(h=>h.trim().toLowerCase()).filter(Boolean);
  const key=url.href+"|"+(env.CITY_PHOTO_FEED_TOKEN??"");
  let raw:unknown;
  if(cached?.key===key&&cached.expires>now)raw=cached.raw;
  else{
   if(!pending||pending.key!==key){
    const promise=(async()=>{
     const response=await (options.fetcher??fetch)(url.href,{headers:{Accept:"application/json",...env.CITY_PHOTO_FEED_TOKEN?{Authorization:`Bearer ${env.CITY_PHOTO_FEED_TOKEN}`}:{ }},redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(5000)});
     if(!response.ok||Number(response.headers.get("content-length"))>32768)throw new Error("Photo feed unavailable");
     const reader=response.body?.getReader();if(!reader)throw new Error("Empty photo feed");
     const chunks:Uint8Array[]=[];let length=0;
     while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>32768){await reader.cancel();throw new Error("Photo feed too large");}chunks.push(part.value);}
     const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
     return JSON.parse(new TextDecoder().decode(bytes));
    })();pending={key,promise};
   }
   try{raw=await pending.promise;cached={key,raw,expires:now+60000};}finally{if(pending?.key===key)pending=undefined;}
  }
  // Revalidate the date even on cache hits, including at local midnight.
  return {status:"today",date,photo:validateDailyPhoto(raw,hosts,now)};
 }catch{return fallback;}
}
