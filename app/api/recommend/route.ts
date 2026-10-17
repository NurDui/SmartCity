import { places, collection } from "@/lib/places";
import { parseRequest, buildResponse } from "@/lib/rag";
import { getWeather } from "@/lib/weather";
import { generateSelection } from "@/lib/llm";
import { languageOf, t } from "@/lib/recommendation-i18n";
import type { Language } from "@/lib/types";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  let language:Language="ru";
  try {
    const text = await request.text();
    if (text.length > 12000) return Response.json({error:"Слишком большой запрос."},{status:413,headers});
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return Response.json({error:"Нужен корректный JSON."},{status:400,headers}); }
    language=languageOf((raw as {language?:unknown})?.language);
    const input = parseRequest(raw);
    const weather = await getWeather(input);
    const selected = await generateSelection(places,input,weather);
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
    if (!selected) result.warnings.push(t(language,process.env.OPENAI_API_KEY?"llmFailed":"noKey"));
    else result.trace.method += t(language,"llmMethod");
    return Response.json(result,{headers});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : t(language,"failure")},{status:400,headers});
  }
}
