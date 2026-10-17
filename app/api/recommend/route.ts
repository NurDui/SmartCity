import { places, collection } from "@/lib/places";
import { parseRequest, buildResponse } from "@/lib/rag";
import { getWeather } from "@/lib/weather";
import { generateSelection } from "@/lib/llm";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const text = await request.text();
    if (text.length > 12000) return Response.json({error:"Слишком большой запрос."},{status:413,headers});
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return Response.json({error:"Нужен корректный JSON."},{status:400,headers}); }
    const input = parseRequest(raw);
    const weather = await getWeather(input);
    const selected = await generateSelection(places,input,weather);
    const result = buildResponse(places,input,weather,`${collection.source}: ${collection.count} автоматически собранных координат + редакционная база Visit Astana`,selected?.recommendations.map((item) => item.id));
    if (selected) {
      for (const recommendation of result.recommendations) {
        const idea = selected.recommendations.find((item) => item.id === recommendation.poi.id);
        if (!idea) continue;
        recommendation.why = `Идея LLM: ${idea.why} ${recommendation.poi.description}`;
        recommendation.actions = [...idea.actions, recommendation.actions[0]];
      }
      result.warnings.push("Помеченные «Идея LLM» объяснения и действия сгенерированы по найденным описаниям. Проверка фактов модели ограничена; часы, координаты и длительность берутся отдельно из базы.");
    }
    if (input.weatherMode === "live" && weather.isDemo) result.warnings.unshift("Сервис погоды не ответил корректно. Температура на экране относится к зимнему демо, а не к текущей погоде.");
    if (!selected) result.warnings.push(process.env.OPENAI_API_KEY ? "LLM недоступна или вернула непроверяемый ответ: использован детерминированный поиск и шаблон по источникам." : "Без API-ключа работает лексический поиск и шаблон по источникам. Генерация LLM не используется.");
    else result.trace.method += " + генерация идеи и плана LLM; факты и длительность из базы";
    return Response.json(result,{headers});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : "Не удалось обработать запрос."},{status:400,headers});
  }
}
