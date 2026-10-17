import type { RecommendRequest, WeatherContext } from "./types";
import { summerWeather, winterWeather } from "./rag.ts";

export function validWeather(value: unknown): value is { temperature_2m:number; apparent_temperature:number; wind_speed_10m:number; weather_code:number } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string,unknown>;
  return typeof v.temperature_2m === "number" && Number.isFinite(v.temperature_2m) && v.temperature_2m >= -70 && v.temperature_2m <= 60 && typeof v.apparent_temperature === "number" && Number.isFinite(v.apparent_temperature) && v.apparent_temperature >= -90 && v.apparent_temperature <= 80 && typeof v.wind_speed_10m === "number" && Number.isFinite(v.wind_speed_10m) && v.wind_speed_10m >= 0 && v.wind_speed_10m <= 200 && typeof v.weather_code === "number" && Number.isInteger(v.weather_code) && v.weather_code >= 0 && v.weather_code <= 99;
}

export async function getWeather(request: RecommendRequest, fetcher: typeof fetch = fetch): Promise<WeatherContext> {
  if (request.weatherMode === "winter") return {...winterWeather};
  if (request.weatherMode === "summer") return {...summerWeather};
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    // About a kilometre precision. Raw device coordinates never go to the weather provider.
    url.search = new URLSearchParams({ latitude: request.location.lat.toFixed(2), longitude: request.location.lon.toFixed(2), current: "temperature_2m,apparent_temperature,wind_speed_10m,weather_code", wind_speed_unit: "kmh", timezone: "Asia/Almaty", timeformat:"unixtime" }).toString();
    const response = await fetcher(url, { signal: AbortSignal.timeout(6000), headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error("Weather provider unavailable");
    const result = await response.json() as {current?:unknown};
    if (!validWeather(result.current)) throw new Error("Weather provider returned invalid data");
    const timestamp = (result.current as {time?:unknown}).time;
    if (typeof timestamp !== "number" || Math.abs(Date.now()/1000 - timestamp) > 7200) throw new Error("Weather provider returned stale data");
    const current = result.current;
    return { temperature: Math.round(current.temperature_2m), feelsLike: Math.round(current.apparent_temperature), windKmh: Math.round(current.wind_speed_10m), code: current.weather_code, isDemo: false, description: "Текущая модельная погода · Open-Meteo" };
  } catch {
    return { ...winterWeather, description: "Погода недоступна: включён консервативный зимний демо-сценарий" };
  }
}
