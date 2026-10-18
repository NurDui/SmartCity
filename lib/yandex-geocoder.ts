import {cleanupYandexQuota,reserveYandexQuota} from "./yandex-quota.ts";
import type {QuotaDatabase,YandexQuotaDecision} from "./yandex-quota.ts";
import type {YandexQuotaEnv} from "./yandex-policy.ts";
import {signYandexGeocoderUrl} from "./yandex-signature.ts";

export type YandexGeocodeResult =
 | {ok:true;data:unknown;displayOnlyOn:"yandex-map"}
 | {ok:false;reason:"invalid_input"|"map_consent_required"|"provider_unavailable"|"invalid_provider_response"|"dispatch_window_expired";retryAfterSeconds:number}
 | {ok:false;reason:"request_denied";quota:Extract<YandexQuotaDecision,{allowed:false}>;retryAfterSeconds:number};

/** Prepared server transport, deliberately not exposed as a public route.
 * The future Yandex renderer must supply its consent context. Never call from RAG,
 * POI collection, autocomplete, background polling or a different map provider.
 * Quota is reserved for every attempt; there are no automatic retries or caches.
 */
export async function requestYandexGeocode(input:{
 address:unknown; language?:"ru"|"kk"|"en";
 context:{provider:string;consented:boolean};
 env:YandexQuotaEnv;db?:QuotaDatabase|null;clientIp:unknown;
 fetcher?:typeof fetch;
}):Promise<YandexGeocodeResult>{
 if(!input.context||input.context.provider!=="yandex-map"||input.context.consented!==true)
  return {ok:false,reason:"map_consent_required",retryAfterSeconds:0};
 if(typeof input.address!=="string"||input.address.trim().length<3||input.address.length>200||/[\u0000-\u001f]/.test(input.address)||input.language!==undefined&&!["ru","kk","en"].includes(input.language))
  return {ok:false,reason:"invalid_input",retryAfterSeconds:0};
 const quota=await reserveYandexQuota({service:"geocoder",env:input.env,db:input.db,clientIp:input.clientIp});
 if(!quota.allowed)return {ok:false,reason:"request_denied",quota,retryAfterSeconds:quota.retryAfterSeconds};
 const url=new URL("https://geocode-maps.yandex.ru/v1");
 url.searchParams.set("apikey",input.env.YANDEX_GEOCODER_API_KEY!.trim());
 url.searchParams.set("format","json");url.searchParams.set("geocode",input.address.trim());
 // No third-party tracking parameters, alternate upstreams or client-chosen URLs.
 // ru_RU is intentional for kk until the selected product confirms kk_KZ support.
 url.searchParams.set("lang",input.language==="en"?"en_US":"ru_RU");
 url.searchParams.set("results","1");
 url.searchParams.set("bbox","71.15,50.9~71.8,51.35");url.searchParams.set("rspn","1");
 try {
  const signed=await signYandexGeocoderUrl(url,input.env.YANDEX_GEOCODER_SIGNING_SECRET!);
  // Expired grants remain spent. Never let delayed Workers bunch old reservations.
  if(performance.now()>quota.dispatchBeforeMonotonicMs)return {ok:false,reason:"dispatch_window_expired",retryAfterSeconds:2};
  const response=await (input.fetcher??fetch)(signed,{method:"GET",redirect:"manual",cache:"no-store",headers:{Accept:"application/json"},signal:AbortSignal.timeout(6000)});
  if(!response.ok)return {ok:false,reason:"provider_unavailable",retryAfterSeconds:60};
  const declared=Number(response.headers.get("content-length")??0);
  if(!Number.isFinite(declared)||declared>256_000)return {ok:false,reason:"invalid_provider_response",retryAfterSeconds:60};
  const reader=response.body?.getReader();if(!reader)return {ok:false,reason:"invalid_provider_response",retryAfterSeconds:60};
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>256_000){await reader.cancel();return {ok:false,reason:"invalid_provider_response",retryAfterSeconds:60};}chunks.push(chunk.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const text=new TextDecoder().decode(bytes);
  // Reject credential reflection instead of returning secrets or modifying provider facts.
  if(text.includes(input.env.YANDEX_GEOCODER_API_KEY!.trim()))return {ok:false,reason:"invalid_provider_response",retryAfterSeconds:60};
  const data=JSON.parse(text) as {response?:{GeoObjectCollection?:{featureMember?:unknown[]}}};
  if(!Array.isArray(data?.response?.GeoObjectCollection?.featureMember))return {ok:false,reason:"invalid_provider_response",retryAfterSeconds:60};
  const decoded=JSON.stringify(data);
  if([input.env.YANDEX_GEOCODER_API_KEY!,input.env.YANDEX_GEOCODER_SIGNING_SECRET!].some(secret=>decoded.includes(secret.trim())))return {ok:false,reason:"invalid_provider_response",retryAfterSeconds:60};
  return {ok:true,data,displayOnlyOn:"yandex-map"};
 }catch{return {ok:false,reason:"provider_unavailable",retryAfterSeconds:60};}
 finally{await cleanupYandexQuota(input.db!);}
}
