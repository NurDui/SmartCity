/** Server-only preparation. No provider calls or browser SDK are enabled by this module. */
export interface YandexQuotaEnv {
  [name:string]:unknown;
  YANDEX_GEOCODER_ENABLED?: string;
  YANDEX_FREE_ELIGIBILITY_CONFIRMED?: string;
  YANDEX_QUOTA_DEDICATED_BUDGET_CONFIRMED?: string;
  YANDEX_GEOCODER_API_KEY?: string;
  YANDEX_GEOCODER_SIGNING_SECRET?: string;
  YANDEX_QUOTA_HMAC_SECRET?: string;
}
export const YANDEX_QUOTA_POLICY = Object.freeze({
  scope: "seruen-yandex-global-v1",
  windowMs: 24 * 60 * 60 * 1000,
  globalReservations: 900,
  identityReservations: 60,
  // Reservation spacing minus the dispatch window leaves over one second between sends.
  minimumSpacingMs: 1500,
  dispatchWindowMs: 400,
});
export type YandexService = "geocoder";
export type YandexPolicyDenial = "unsupported_service" | "feature_disabled" | "eligibility_unconfirmed" | "dedicated_budget_unconfirmed" | "missing_key" | "missing_signing_secret" | "missing_hmac_secret" | "missing_database";
export type YandexPolicyDecision = {enabled:true;service:YandexService} | {enabled:false;reason:YandexPolicyDenial};

export function resolveYandexPolicy(service:unknown,env:YandexQuotaEnv={},hasDatabase=false):YandexPolicyDecision {
  // A new product requires an intentional code/policy review, never just an environment flag.
  if(service!=="geocoder")return {enabled:false,reason:"unsupported_service"};
  if(env.YANDEX_GEOCODER_ENABLED!=="true")return {enabled:false,reason:"feature_disabled"};
  if(env.YANDEX_FREE_ELIGIBILITY_CONFIRMED!=="true")return {enabled:false,reason:"eligibility_unconfirmed"};
  if(env.YANDEX_QUOTA_DEDICATED_BUDGET_CONFIRMED!=="true")return {enabled:false,reason:"dedicated_budget_unconfirmed"};
  if(typeof env.YANDEX_GEOCODER_API_KEY!=="string"||!env.YANDEX_GEOCODER_API_KEY.trim())return {enabled:false,reason:"missing_key"};
  const signing=env.YANDEX_GEOCODER_SIGNING_SECRET;
  let validSigning=false;
  if(typeof signing==="string"&&signing.length>=22&&signing.length<=4096&&/^[A-Za-z0-9_-]+={0,2}$/.test(signing)){
    try {validSigning=atob(signing.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(signing.length/4)*4,"=")).length>=16;} catch {/* fail closed */}
  }
  if(!validSigning)return {enabled:false,reason:"missing_signing_secret"};
  if(typeof env.YANDEX_QUOTA_HMAC_SECRET!=="string"||new TextEncoder().encode(env.YANDEX_QUOTA_HMAC_SECRET).length<32)return {enabled:false,reason:"missing_hmac_secret"};
  if(!hasDatabase)return {enabled:false,reason:"missing_database"};
  return {enabled:true,service:"geocoder"};
}
