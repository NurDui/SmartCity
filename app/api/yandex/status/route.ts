import {env} from "cloudflare:workers";
import {resolveYandexPolicy,YANDEX_QUOTA_POLICY} from "@/lib/yandex-policy";
import {getRuntimeConfig} from "@/lib/provider-config";

/** Public readiness information only: no keys, counters, IP hashes or upstream calls. */
export async function GET(){
 const policy=resolveYandexPolicy("geocoder",process.env,Boolean(env.DB));
 const browserSdkEnabled=false;
 return Response.json({
  integration:browserSdkEnabled?"browser-map-configured":"prepared-not-connected",
  browserSdkEnabled,
  publicGeocoderEndpoint:false,
  serverTransportConfigured:policy.enabled,
  blockingReason:policy.enabled?"public_geocoder_not_connected":policy.reason,
  limits:{
   countedRequestsPerRolling24Hours:YANDEX_QUOTA_POLICY.globalReservations,
   requestsPerIpPerRolling24Hours:YANDEX_QUOTA_POLICY.identityReservations,
   minimumSpacingMs:YANDEX_QUOTA_POLICY.minimumSpacingMs,
   dispatchWindowMs:YANDEX_QUOTA_POLICY.dispatchWindowMs,
   countedProducts:["geocoder"],
   otherProductsEnabled:false,
  },
  mapProvider:browserSdkEnabled?"yandex":getRuntimeConfig().mapProvider,
 },{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex"}});
}
