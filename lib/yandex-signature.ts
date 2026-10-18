/** Server-only signing, matching Yandex's WithTTL algorithm.
 * https://yandex.ru/maps-api/docs/common/security/signature_usage.html
 */
export async function signYandexGeocoderUrl(url:URL,secret:string,now=new Date()):Promise<URL>{
 if(url.origin!=="https://geocode-maps.yandex.ru"||url.pathname!=="/v1"||url.searchParams.has("signature")||!Number.isFinite(now.getTime()))throw new Error("Invalid signing context");
 if(!/^[A-Za-z0-9_-]+={0,2}$/.test(secret))throw new Error("Invalid signing secret");
 const raw=secret.replace(/-/g,"+").replace(/_/g,"/").replace(/=+$/g,"");
 const decoded=atob(raw+"=".repeat((4-raw.length%4)%4));
 const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));if(bytes.length<16)throw new Error("Invalid signing secret");
 const encoder=new TextEncoder();
 const hmac=async(key:Uint8Array<ArrayBuffer>,value:string)=>{
  const imported=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",imported,encoder.encode(value)));
 };
 const hour=now.toISOString().slice(0,13)+":00:00Z";
 const temporalKey=await hmac(bytes,hour);
 const digest=await hmac(temporalKey,url.pathname+url.search);
 const signature=btoa(String.fromCharCode(...digest)).replace(/\+/g,"-").replace(/\//g,"_");
 const signed=new URL(url);signed.searchParams.append("signature",signature);return signed;
}
