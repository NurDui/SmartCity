import {resolveYandexPolicy,YANDEX_QUOTA_POLICY} from "./yandex-policy.ts";
import type {YandexPolicyDenial,YandexQuotaEnv,YandexService} from "./yandex-policy.ts";

export interface QuotaDatabase {
  prepare(sql:string):{bind(...values:(string|number)[]):{first<T=Record<string,unknown>>():Promise<T|null>;run?():Promise<unknown>}};
}
export type YandexQuotaDecision =
  | {allowed:true;reservationId:string;service:YandexService;reservedAtMs:number;dispatchBeforeMonotonicMs:number}
  | {allowed:false;reason:YandexPolicyDenial|"invalid_client_ip"|"quota_or_rate_limit"|"quota_storage_unavailable";retryAfterSeconds:number};

/** One write statement: count/check/reserve are serialized on the D1 primary.
 * No separate read, worker-local counter, client-supplied clock or refunds.
 * All approved services and rotated API keys share one immutable scope.
 */
export const RESERVE_YANDEX_QUOTA_SQL = `
WITH clock(now_ms) AS (
  SELECT CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
)
INSERT INTO yandex_quota_reservations (id, scope, service, identity_hash, reserved_at_ms)
SELECT ?1, ?2, ?3, ?4, clock.now_ms
FROM clock
WHERE (
  SELECT COUNT(*) FROM yandex_quota_reservations
  WHERE scope = ?2 AND reserved_at_ms >= clock.now_ms - ?5
) < ?6
AND NOT EXISTS (
  SELECT 1 FROM yandex_quota_reservations
  WHERE scope = ?2 AND reserved_at_ms > clock.now_ms - ?7
)
AND (
  SELECT COUNT(*) FROM yandex_quota_reservations
  WHERE scope = ?2 AND identity_hash = ?4 AND reserved_at_ms >= clock.now_ms - ?5
) < ?8
RETURNING id, reserved_at_ms
`;
/** HMAC IPs remain pseudonymous. Keep at most 48h of history; this is twice the quota window.
 * Cleanup can only remove safely expired grants and never frees current quota.
 * The transport runs it after dispatch/body handling; schedule it if traffic stops.
 */
export const CLEANUP_YANDEX_QUOTA_SQL = `DELETE FROM yandex_quota_reservations
WHERE reserved_at_ms < CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) - 172800000`;
export async function cleanupYandexQuota(db:QuotaDatabase):Promise<boolean>{
  try {const statement=db.prepare(CLEANUP_YANDEX_QUOTA_SQL).bind();if(!statement.run)return false;await statement.run();return true;} catch {return false;}
}

function canonicalIp(value:unknown):string|null {
  if(typeof value!=="string")return null;
  const ip=value.trim().toLowerCase();
  if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)){
    const bytes=ip.split(".").map(Number);return bytes.every(n=>n>=0&&n<=255)?bytes.join("."):null;
  }
  if(ip.includes(":")&&/^[0-9a-f:.]+$/.test(ip)){
    try {return new URL(`http://[${ip}]/`).hostname.slice(1,-1);} catch {return null;}
  }
  return null;
}

async function identityHash(ip:string,secret:string):Promise<string>{
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,encoder.encode(`${YANDEX_QUOTA_POLICY.scope}\n${ip}`));
  return [...new Uint8Array(signature)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

/** Call only server-side, immediately before EACH actual outbound attempt.
 * clientIp must come from the trusted edge (CF-Connecting-IP), never body or X-Forwarded-For.
 * A grant is spent even when the provider fails, the request times out, or the caller crashes.
 * This is preparation only: it does not make provider requests or authorize a browser SDK.
 */
export async function reserveYandexQuota(input:{service:unknown;env:YandexQuotaEnv;db?:QuotaDatabase|null;clientIp:unknown}):Promise<YandexQuotaDecision>{
  const dispatchBeforeMonotonicMs=performance.now()+YANDEX_QUOTA_POLICY.dispatchWindowMs;
  const policy=resolveYandexPolicy(input.service,input.env,Boolean(input.db&&typeof input.db.prepare==="function"));
  if(!policy.enabled)return {allowed:false,reason:policy.reason,retryAfterSeconds:60};
  const ip=canonicalIp(input.clientIp);
  if(!ip)return {allowed:false,reason:"invalid_client_ip",retryAfterSeconds:60};
  try {
    const hashed=await identityHash(ip,input.env.YANDEX_QUOTA_HMAC_SECRET!);
    const id=crypto.randomUUID();
    const row=await input.db!.prepare(RESERVE_YANDEX_QUOTA_SQL).bind(id,YANDEX_QUOTA_POLICY.scope,policy.service,hashed,YANDEX_QUOTA_POLICY.windowMs,YANDEX_QUOTA_POLICY.globalReservations,YANDEX_QUOTA_POLICY.minimumSpacingMs,YANDEX_QUOTA_POLICY.identityReservations).first<{id:string;reserved_at_ms:number}>();
    if(!row)return {allowed:false,reason:"quota_or_rate_limit",retryAfterSeconds:2};
    if(row.id!==id||typeof row.reserved_at_ms!=="number"||!Number.isFinite(row.reserved_at_ms)||row.reserved_at_ms<=0)return {allowed:false,reason:"quota_storage_unavailable",retryAfterSeconds:60};
    return {allowed:true,reservationId:id,service:policy.service,reservedAtMs:row.reserved_at_ms,dispatchBeforeMonotonicMs};
  } catch {return {allowed:false,reason:"quota_storage_unavailable",retryAfterSeconds:60};}
}
