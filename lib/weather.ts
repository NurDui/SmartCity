import type { Language, PublicWeatherContext, RecommendRequest, WeatherContext } from "./types.ts";

type WeatherRequest = Pick<RecommendRequest, "location" | "weatherMode">;
type WeatherOptions = { fetcher?: typeof fetch; now?: () => number; signal?: AbortSignal };
type WeatherReadings = { temperature_2m: number; apparent_temperature: number; wind_speed_10m: number; weather_code: number; time?: number; is_day?: number };
export const WEATHER_MAX_AGE_MS = 60 * 60_000;
export const WEATHER_REFRESH_MS = 10 * 60_000;
const codes = new Set([0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,97,99]);
const units = { temperature: "°C", wind: "km/h" } as const;

export function validWeather(value: unknown): value is WeatherReadings {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.temperature_2m === "number" && Number.isFinite(v.temperature_2m) && v.temperature_2m >= -70 && v.temperature_2m <= 60
    && typeof v.apparent_temperature === "number" && Number.isFinite(v.apparent_temperature) && v.apparent_temperature >= -90 && v.apparent_temperature <= 80
    && typeof v.wind_speed_10m === "number" && Number.isFinite(v.wind_speed_10m) && v.wind_speed_10m >= 0 && v.wind_speed_10m <= 200
    && typeof v.weather_code === "number" && codes.has(v.weather_code);
}

export function weatherIconName(code: number | null, isDay: boolean | null = true) {
  if (code === null || !codes.has(code)) return "unknown";
  if (code <= 1) return isDay === false ? "moon" : "sun";
  if (code === 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if ([51,53,55,56,57].includes(code)) return "drizzle";
  if ([61,63,65,66,67,80,81,82].includes(code)) return "rain";
  if ([71,73,75,77,85,86].includes(code)) return "snow";
  return "storm";
}

const descriptions = {
  ru: ["Ясно", "Преимущественно ясно", "Переменная облачность", "Пасмурно", "Туман", "Морось", "Ледяная морось", "Дождь", "Ледяной дождь", "Снег", "Снежная крупа", "Ливневый дождь", "Снежные заряды", "Гроза", "Гроза с градом", "Погода недоступна"],
  kk: ["Ашық", "Көбіне ашық", "Ала бұлтты", "Бұлтты", "Тұман", "Сіркіреме жаңбыр", "Мұзды сіркіреме", "Жаңбыр", "Мұзды жаңбыр", "Қар", "Қар түйіршіктері", "Нөсер жаңбыр", "Қарлы жауын", "Найзағай", "Бұршақты найзағай", "Ауа райы қолжетімсіз"],
  en: ["Clear sky", "Mainly clear", "Partly cloudy", "Overcast", "Fog", "Drizzle", "Freezing drizzle", "Rain", "Freezing rain", "Snow", "Snow grains", "Rain showers", "Snow showers", "Thunderstorm", "Thunderstorm with hail", "Weather unavailable"],
};
export function weatherLabel(code: number | null, language: Language = "ru") {
  let i = 15;
  if (code !== null && codes.has(code)) {
    if (code <= 3) i = code;
    else if (code === 45 || code === 48) i = 4;
    else if ([51,53,55].includes(code)) i = 5;
    else if ([56,57].includes(code)) i = 6;
    else if ([61,63,65].includes(code)) i = 7;
    else if ([66,67].includes(code)) i = 8;
    else if ([71,73,75].includes(code)) i = 9;
    else if (code === 77) i = 10;
    else if ([80,81,82].includes(code)) i = 11;
    else if ([85,86].includes(code)) i = 12;
    else if (code === 95 || code === 97) i = 13;
    else i = 14;
  }
  return descriptions[language][i];
}

function unavailable(now: number): PublicWeatherContext {
  return { temperature: null, feelsLike: null, windKmh: null, code: null, isDay: null, isDemo: false, status: "unavailable", description: "Погода недоступна", observedAt: null, retrievedAt: new Date(now).toISOString(), source: "Open-Meteo", sourceUrl: "https://open-meteo.com/", units, safetyFallback: false };
}
function demo(mode: "summer" | "winter", now: number): PublicWeatherContext {
  const winter = mode === "winter";
  return { temperature: winter ? -25 : 24, feelsLike: winter ? -33 : 25, windKmh: winter ? 32 : 10, code: winter ? 3 : 1, isDay: true, isDemo: true, status: "demo", description: winter ? "Зимний демо-сценарий" : "Летний демо-сценарий", observedAt: null, retrievedAt: new Date(now).toISOString(), source: "Seruen demo", sourceUrl: null, units, safetyFallback: false };
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty weather response");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 32_768) throw new Error("Weather response too large");
      chunks.push(part.value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

/** In-memory protections apply to one worker isolate. They are not a distributed quota guarantee. */
export function createWeatherService(options: Omit<WeatherOptions, "signal"> = {}) {
  const fetcher = options.fetcher ?? fetch, now = options.now ?? Date.now;
  const cache = new Map<string, { until: number; weather: PublicWeatherContext }>();
  type Job = { controller: AbortController; consumers: number; promise: Promise<PublicWeatherContext> };
  const inflight = new Map<string, Job>();
  const attempts: number[] = [];
  const clone = (weather: PublicWeatherContext) => ({ ...weather, units: { ...weather.units } });
  function reserve(at: number) {
    while (attempts.length && attempts[0] <= at - 86_400_000) attempts.shift();
    if (attempts.length >= 8000 || attempts.filter(t => t > at - 3_600_000).length >= 4000 || attempts.filter(t => t > at - 60_000).length >= 500) return false;
    attempts.push(at); return true;
  }
  async function download(request: WeatherRequest, signal: AbortSignal): Promise<PublicWeatherContext> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) controller.abort();
    const timeout = setTimeout(abort, 6000);
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      // About a kilometre precision. Raw device coordinates are never forwarded.
      url.search = new URLSearchParams({ latitude: request.location.lat.toFixed(2), longitude: request.location.lon.toFixed(2), current: "temperature_2m,apparent_temperature,wind_speed_10m,weather_code,is_day", temperature_unit: "celsius", wind_speed_unit: "kmh", timezone: "Asia/Qyzylorda", timeformat: "unixtime" }).toString();
      // Workerd supports follow/manual. Rejecting every non-2xx also rejects redirects.
      const response = await fetcher(url, { signal: controller.signal, headers: { Accept: "application/json" }, cache: "no-store", redirect: "manual" });
      if (!response.ok) throw new Error("Weather unavailable");
      const result = await boundedJson(response), current = result.current;
      const providerUnits = result.current_units as Record<string, unknown> | undefined;
      if (!validWeather(current) || providerUnits?.temperature_2m !== "°C" || providerUnits?.apparent_temperature !== "°C" || providerUnits?.wind_speed_10m !== "km/h" || providerUnits?.time !== "unixtime") throw new Error("Invalid weather readings or units");
      const at = now(), timestamp = current.time;
      if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp * 1000 > at + 120_000 || at - timestamp * 1000 > WEATHER_MAX_AGE_MS) throw new Error("Stale weather");
      return { temperature: Math.round(current.temperature_2m), feelsLike: Math.round(current.apparent_temperature), windKmh: Math.round(current.wind_speed_10m), code: current.weather_code, isDay: current.is_day === 1 ? true : current.is_day === 0 ? false : null, isDemo: false, status: "live", description: weatherLabel(current.weather_code), observedAt: new Date(timestamp * 1000).toISOString(), retrievedAt: new Date(at).toISOString(), source: "Open-Meteo", sourceUrl: "https://open-meteo.com/", units, safetyFallback: false };
    } catch { return unavailable(now()); }
    finally { clearTimeout(timeout); signal.removeEventListener("abort", abort); }
  }
  return {
    async get(request: WeatherRequest, signal?: AbortSignal): Promise<PublicWeatherContext> {
      const at = now();
      if (request.weatherMode === "summer" || request.weatherMode === "winter") return demo(request.weatherMode, at);
      const { lat, lon } = request.location;
      if (signal?.aborted || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < 50.9 || lat > 51.35 || lon < 71.15 || lon > 71.8) return unavailable(at);
      const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
      for (const [k, item] of cache) if (item.until <= at) cache.delete(k);
      const saved = cache.get(key);
      if (saved && (saved.weather.status !== "live" || (saved.weather.observedAt && at - Date.parse(saved.weather.observedAt) <= WEATHER_MAX_AGE_MS))) return clone(saved.weather);
      let job = inflight.get(key);
      if (!job || job.controller.signal.aborted) {
        if (inflight.size >= 4 || !reserve(at)) return unavailable(at);
        const controller = new AbortController();
        job = { controller, consumers: 0, promise: Promise.resolve(unavailable(at)) };
        const currentJob = job;
        job.promise = download(request, controller.signal).then(weather => {
          if (!controller.signal.aborted) {
            if (cache.size >= 64) cache.delete(cache.keys().next().value!);
            cache.set(key, { weather, until: now() + (weather.status === "live" ? WEATHER_REFRESH_MS : 30_000) });
          }
          return weather;
        }).finally(() => { if (inflight.get(key) === currentJob) inflight.delete(key); });
        inflight.set(key, job);
      }
      const subscribed = job;
      subscribed.consumers++;
      return new Promise(resolve => {
        let done = false;
        const finish = (weather: PublicWeatherContext) => {
          if (done) return; done = true; signal?.removeEventListener("abort", abort);
          subscribed.consumers--;
          if (!subscribed.consumers) subscribed.controller.abort();
          resolve(clone(weather));
        };
        const abort = () => finish(unavailable(now()));
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
        subscribed.promise.then(finish, () => finish(unavailable(now())));
      });
    },
  };
}

const sharedWeather = /* @__PURE__ */ createWeatherService();
export async function getPublicWeather(request: WeatherRequest, options: WeatherOptions = {}) {
  const service = options.fetcher || options.now ? createWeatherService(options) : sharedWeather;
  return service.get(request, options.signal);
}

/** Safety readings are internal ranking constraints, never current weather for display. */
export async function getWeather(request: RecommendRequest, fetcher?: typeof fetch): Promise<WeatherContext> {
  const result = await getPublicWeather(request, fetcher ? { fetcher } : {});
  if (result.status !== "unavailable") return { ...result, temperature: result.temperature!, feelsLike: result.feelsLike!, windKmh: result.windKmh!, code: result.code! };
  return { ...result, temperature: -25, feelsLike: -33, windKmh: 45, code: 3, isDemo: true, safetyFallback: true, description: "Погода недоступна: консервативные ограничения для подбора, не фактические градусы" };
}
