import {env} from "cloudflare:workers";
import {resolveYandexPolicy,YANDEX_QUOTA_POLICY} from "@/lib/yandex-policy";

/** Public readiness information only: no keys, counters, IP hashes or upstream calls. */
export async function GET(){
 const policy=resolveYandexPolicy("geocoder",process.env,Boolean(env.DB));
 return Response.json({
  integration:"prepared-not-connected",
  browserSdkEnabled:false,
  publicGeocoderEndpoint:false,
  serverTransportConfigured:policy.enabled,
  blockingReason:policy.enabled?"yandex_renderer_not_connected":policy.reason,
  limits:{
   countedRequestsPerRolling24Hours:YANDEX_QUOTA_POLICY.globalReservations,
   requestsPerIpPerRolling24Hours:YANDEX_QUOTA_POLICY.identityReservations,
   minimumSpacingMs:YANDEX_QUOTA_POLICY.minimumSpacingMs,
   dispatchWindowMs:YANDEX_QUOTA_POLICY.dispatchWindowMs,
   countedProducts:["geocoder"],
   otherProductsEnabled:false,
  },
  mapProviderUnchanged:true,
 },{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex"}});
}
