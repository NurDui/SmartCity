import { places, collection } from "@/lib/places";
import { parseRequest, buildResponse } from "@/lib/rag";
import { getWeather } from "@/lib/weather";
import { generateSelection } from "@/lib/llm";
import { languageOf, t } from "@/lib/recommendation-i18n";
import type { Language } from "@/lib/types";
import {env} from "cloudflare:workers";
import {reserveService} from "@/lib/open-map";
import {llmConfig} from "@/lib/llm-config";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  let language:Language="ru";
  let validated=false;
  try {
    const text = await request.text();
    if (text.length > 12000) return Response.json({error:"Слишком большой запрос."},{status:413,headers});
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return Response.json({error:"Нужен корректный JSON."},{status:400,headers}); }
    language=languageOf((raw as {language?:unknown})?.language);
    const input = parseRequest(raw);
    validated=true;
    const weather = await getWeather(input);
    let selected=null;
    // Shared hard ceiling: at most 100 attempted generations per rolling day.
    // A quota/database/provider failure keeps the grounded template available.
    if(llmConfig())try{await reserveService(env.DB,"llm-generation-v1",100);selected=await generateSelection(places,input,weather);}catch{/* no sensitive request logging */}
    const result = buildResponse(places,input,weather,t(language,"collection",{source:collection.source,count:collection.count}),selected?.recommendations.map((item) => item.id));
    if (selected) {
      for (const recommendation of result.recommendations) {
        const idea = selected.recommendations.find((item) => item.id === recommendation.poi.id);
        if (!idea) continue;
        recommendation.why = `${t(language,"llmIdea")}: ${idea.why} ${recommendation.why}`;
        recommendation.actions = [...idea.actions, recommendation.actions[0]];
      }
      result.warnings.push(t(language,"llmWarning"));
    }
    if (input.weatherMode === "live" && weather.isDemo) result.warnings.unshift(t(language,"weatherFailure"));
    if (!selected) result.warnings.push(t(language,llmConfig()?"llmFailed":"noKey"));
    else result.trace.method += t(language,"llmMethod");
    return Response.json(result,{headers});
  } catch (error) {
    return Response.json({error:!validated&&error instanceof Error ? error.message : t(language,"failure")},{status:validated?503:400,headers});
  }
}
