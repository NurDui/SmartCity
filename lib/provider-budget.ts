import type {MapDatabase} from "./open-map.ts";

export interface ProviderBudget {
  scope:string;
  /** Reserve a conservative upper bound before dispatch, never refund failures. */
  units:number;
  limits:{windowMs:number;limit:number}[];
  minIntervalMs?:number;
  dispatchWithinMs?:number;
}
export class BudgetError extends Error {
  status:number;code:string;
  constructor(status:number,code:string){super(code);this.status=status;this.code=code;}
}
/** One atomic D1 statement checks every rolling window before spending credits/tokens.
 * All browser sessions and worker instances share the same ledger. Only an opaque ID,
 * fixed provider scope, cost and timestamp are stored; no request or user identifiers.
 */
export async function reserveProviderBudget(db:MapDatabase|undefined,budget:ProviderBudget):Promise<void>{
  if(!db)throw new BudgetError(503,"shared_quota_unavailable");
  const {scope,units,limits}=budget,minInterval=budget.minIntervalMs??2000,dispatch=budget.dispatchWithinMs??500;
  if(!/^[a-z0-9-]{3,100}$/.test(scope)||!Number.isSafeInteger(units)||units<=0||units>1e9||
     !Array.isArray(limits)||limits.length<1||limits.length>4||limits.some(w=>!Number.isSafeInteger(w.windowMs)||w.windowMs<1000||w.windowMs>86400000||!Number.isSafeInteger(w.limit)||w.limit<units||w.limit>1e9)||
     !Number.isSafeInteger(minInterval)||minInterval<0||minInterval>86400000||!Number.isSafeInteger(dispatch)||dispatch<1||dispatch>5000)
    throw new BudgetError(503,"invalid_budget_configuration");
  const id=crypto.randomUUID(),deadline=performance.now()+dispatch;
  const values:(string|number)[]=[id,scope,units,minInterval];
  const windows=limits.map((w,i)=>{
    values.push(w.windowMs,w.limit);
    return `(SELECT COALESCE(SUM(units),0) FROM provider_budget_reservations WHERE scope=?2 AND at>=clock.now_ms-?${5+i*2})<=?${6+i*2}-?3`;
  });
  const sql=`WITH clock(now_ms) AS (SELECT CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))
INSERT INTO provider_budget_reservations(id,scope,units,at)
SELECT ?1,?2,?3,clock.now_ms FROM clock
WHERE NOT EXISTS(SELECT 1 FROM provider_budget_reservations WHERE scope=?2 AND at>clock.now_ms-?4)
AND ${windows.join("\nAND ")}
RETURNING id`;
  try{
    const row=await db.prepare(sql).bind(...values).first<{id:string}>();
    if(!row||row.id!==id)throw new BudgetError(429,"rate_limited");
  }catch(error){
    if(error instanceof BudgetError)throw error;
    throw new BudgetError(503,"shared_quota_unavailable");
  }
  // A slow DB must not bunch delayed reservations into an upstream burst.
  if(performance.now()>deadline)throw new BudgetError(429,"rate_limited");
}

export async function cleanupProviderBudget(db:MapDatabase):Promise<void>{
  try{
    await db.prepare("DELETE FROM provider_budget_reservations WHERE at<CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)-172800000").bind().run();
  }catch{/* Expired reservations never count, even if best-effort cleanup fails. */}
}
