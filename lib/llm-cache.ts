import type {MapDatabase} from "./open-map.ts";
import type {GeneratedPlan} from "./llm.ts";

const TTL_MS=30*60*1000;
const MAX_BYTES=16000;
const validKey=(key:string)=>/^[a-f0-9]{64}$/.test(key);

/** The caller hashes its complete sanitized prompt, model and schema version.
 * It must revalidate returned ideas against today's allowed IDs and language.
 * This cache stores generated visitor ideas only, never prompts or coordinates.
 */
export async function readLlmCache(db:MapDatabase|undefined,key:string):Promise<unknown|null>{
 if(!db||!validKey(key))return null;
 try{
  const row=await db.prepare("SELECT value FROM llm_idea_cache WHERE key=?1 AND expires>?2").bind(key,Date.now()).first<{value:string}>();
  if(!row||typeof row.value!=="string"||new TextEncoder().encode(row.value).length>MAX_BYTES)return null;
  return JSON.parse(row.value) as unknown;
 }catch{return null;}
}

/** Call only after validateGeneratedPlan succeeds. Failures are never cached. */
export async function writeLlmCache(db:MapDatabase|undefined,key:string,plan:GeneratedPlan):Promise<void>{
 if(!db||!validKey(key)||!plan||!Array.isArray(plan.recommendations)||plan.recommendations.length<1||plan.recommendations.length>3)return;
 try{
  // Pick exact approved fields so future server metadata cannot accidentally persist.
  const recommendations=plan.recommendations.map(entry=>({id:entry.id,why:entry.why,actions:entry.actions}));
  if(recommendations.some(entry=>typeof entry.id!=="string"||entry.id.length>160||typeof entry.why!=="string"||entry.why.length>260||!Array.isArray(entry.actions)||entry.actions.length<1||entry.actions.length>3||entry.actions.some(action=>typeof action!=="string"||action.length>130)))return;
  const value=JSON.stringify({recommendations});
  if(new TextEncoder().encode(value).length>MAX_BYTES)return;
  await db.prepare("INSERT INTO llm_idea_cache(key,value,expires) VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires").bind(key,value,Date.now()+TTL_MS).run();
  await db.prepare("DELETE FROM llm_idea_cache WHERE expires<=?1").bind(Date.now()).run();
 }catch{/* A cache outage must not invalidate an already validated recommendation. */}
}
