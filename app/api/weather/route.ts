import { getPublicWeather, weatherDescription } from "@/lib/weather";
import type { Language, RecommendRequest } from "@/lib/types";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const oversized = Symbol("oversized weather request");
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder(); let bytes = 0, result = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4000) { await reader.cancel(); throw oversized; }
      result += decoder.decode(chunk.value, { stream: true });
    }
    return result + decoder.decode();
  } finally { reader.releaseLock(); }
}
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 4000) return Response.json({ error: "Request too large" }, { status: 413, headers });
    const body = await readBody(request);
    const input = JSON.parse(body) as Record<string, unknown>;
    if (!input || typeof input !== "object") throw new Error("Invalid request");
    const location = input.location as { lat?: unknown; lon?: unknown } | undefined;
    const mode = input.weatherMode ?? "live";
    const language: Language = input.language === "en" || input.language === "kk" ? input.language : "ru";
    if (!location || typeof location.lat !== "number" || !Number.isFinite(location.lat) || typeof location.lon !== "number" || !Number.isFinite(location.lon) || location.lat < 50.9 || location.lat > 51.35 || location.lon < 71.15 || location.lon > 71.8 || typeof mode !== "string" || !["live", "summer", "winter"].includes(mode)) throw new Error("Invalid Astana location or weather mode");
    const weather = await getPublicWeather({ location: { lat: location.lat, lon: location.lon }, weatherMode: mode as RecommendRequest["weatherMode"] }, { signal: request.signal });
    const demoLabel = language === "en" ? (mode === "winter" ? "Winter demo scenario" : "Summer demo scenario") : language === "kk" ? (mode === "winter" ? "Қысқы демо-сценарий" : "Жазғы демо-сценарий") : (mode === "winter" ? "Зимний демо-сценарий" : "Летний демо-сценарий");
    return Response.json({ weather: { ...weather, description: weather.status === "demo" ? demoLabel : weatherDescription(weather, language) } }, { headers });
  } catch (error) {
    if (error === oversized) return Response.json({ error: "Request too large" }, { status: 413, headers });
    return Response.json({ error: "Invalid weather request" }, { status: 400, headers });
  }
}
