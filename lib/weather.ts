import type { Language, PublicWeatherContext, RecommendRequest, WeatherContext } from "./types.ts";

type WeatherRequest = Pick<RecommendRequest, "location" | "weatherMode">;
export type WeatherDiagnostic = { event: "weather_provider_failure"; provider: "open-meteo" | "met-norway"; reason: "http" | "network" | "timeout" | "invalid_payload" | "stale_model" | "quota" | "deprecated"; httpStatus?: number };
type WeatherOptions = { fetcher?: typeof fetch; now?: () => number; signal?: AbortSignal; onDiagnostic?: (value: WeatherDiagnostic) => void; shareInflight?:boolean };
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

export function weatherDescription(weather: PublicWeatherContext, language: Language = "ru") {
  if (weather.conditionSymbol?.includes("sleet")) return language === "en" ? "Sleet" : language === "kk" ? "Жаңбырлы қар" : "Мокрый снег";
  return weatherLabel(weather.code, language);
}
export function metCondition(symbol: unknown): {code: number; isDay: boolean | null; symbol: string} | null {
  if (typeof symbol !== "string" || !/^[a-z_]{3,60}$/.test(symbol)) return null;
  const base = symbol.replace(/_(day|night|polartwilight)$/, "");
  const simple: Record<string, number> = {clearsky:0,fair:1,partlycloudy:2,cloudy:3,fog:45};
  let code = simple[base];
  if (code === undefined) {
    if (!/^(light|lights|heavy)?(rain|sleet|snow)(showers)?(andthunder)?$/.test(base)) return null;
    code = base.includes("thunder") ? 95 : base.includes("snow") || base.includes("sleet") ? (base.includes("showers") ? 85 : 71) : base.includes("showers") ? 80 : 61;
  }
  return {code,isDay:symbol.endsWith("_day") ? true : symbol.endsWith("_night") ? false : null,symbol};
}

type MetPayload = {properties?:{meta?:{updated_at?:unknown;units?:Record<string,unknown>};timeseries?:unknown}};
/** Symbols describe the next hour; instant readings are the forecast valid at the selected hour. */
export function parseMetForecast(payload: unknown, now: number): PublicWeatherContext | null {
  const props = (payload as MetPayload | null)?.properties, meta = props?.meta;
  if (meta?.units?.air_temperature !== "celsius" || meta?.units?.wind_speed !== "m/s" || typeof meta.updated_at !== "string") return null;
  const updated = Date.parse(meta.updated_at);
  if (!Number.isFinite(updated) || updated > now + 120_000 || now - updated > 12*3_600_000 || !Array.isArray(props?.timeseries)) return null;
  const points = props.timeseries.filter((value): value is {time:string;data?:{instant?:{details?:Record<string,unknown>};next_1_hours?:{summary?:{symbol_code?:unknown}}}} => !!value && typeof value === "object" && typeof value.time === "string");
  const point = points.filter(p => Date.parse(p.time) <= now + 120_000 && now - Date.parse(p.time) <= WEATHER_MAX_AGE_MS).sort((a,b) => Date.parse(b.time)-Date.parse(a.time))[0];
  const details = point?.data?.instant?.details, condition = metCondition(point?.data?.next_1_hours?.summary?.symbol_code);
  const temperature = details?.air_temperature, wind = details?.wind_speed;
  if (!point || !condition || typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < -70 || temperature > 60 || typeof wind !== "number" || !Number.isFinite(wind) || wind < 0 || wind*3.6 > 200) return null;
  const result: PublicWeatherContext = {temperature:Math.round(temperature),feelsLike:null,windKmh:Math.round(wind*3.6),code:condition.code,isDay:condition.isDay,isDemo:false,status:"live",description:weatherLabel(condition.code),observedAt:new Date(point.time).toISOString(),retrievedAt:new Date(now).toISOString(),source:"MET Norway",sourceUrl:"https://api.met.no/weatherapi/locationforecast/2.0/documentation",units,safetyFallback:false,dataKind:"forecast",modelUpdatedAt:new Date(updated).toISOString(),licenseUrl:"https://creativecommons.org/licenses/by/4.0/",conditionSymbol:condition.symbol};
  result.description = weatherDescription(result);
  return result;
}

function unavailable(now: number): PublicWeatherContext {
  return { temperature: null, feelsLike: null, windKmh: null, code: null, isDay: null, isDemo: false, status: "unavailable", description: "Погода недоступна", observedAt: null, retrievedAt: new Date(now).toISOString(), source: "Open-Meteo", sourceUrl: "https://open-meteo.com/", units, safetyFallback: false };
}
function demo(mode: "summer" | "winter", now: number): PublicWeatherContext {
  const winter = mode === "winter";
  return { temperature: winter ? -25 : 24, feelsLike: winter ? -33 : 25, windKmh: winter ? 32 : 10, code: winter ? 3 : 1, isDay: true, isDemo: true, status: "demo", description: winter ? "Зимний демо-сценарий" : "Летний демо-сценарий", observedAt: null, retrievedAt: new Date(now).toISOString(), source: "Seruen demo", sourceUrl: null, units, safetyFallback: false };
}

async function boundedJson(response: Response, maxBytes = 32_768): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty weather response");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new Error("Weather response too large");
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
  const diagnostics = new Map<string, number>();
  const cooldown = { "open-meteo": 0, "met-norway": 0 };
  type MetSnapshot = { body: Record<string, unknown>; expiresAt: number; modified: string | null; checkedAt: string };
  const metCache = new Map<string, MetSnapshot>();
  let lastMetAttempt = 0;
  function report(provider: WeatherDiagnostic["provider"], reason: WeatherDiagnostic["reason"], httpStatus?: number) {
    const key = `${provider}:${reason}:${httpStatus ?? ""}`, at = now();
    if (diagnostics.has(key) && at - diagnostics.get(key)! < 60_000) return;
    diagnostics.set(key, at);
    options.onDiagnostic?.({event:"weather_provider_failure",provider,reason,...(httpStatus === undefined ? {} : {httpStatus})});
  }
  const clone = (weather: PublicWeatherContext) => ({ ...weather, units: { ...weather.units } });
  function reserve(at: number) {
    while (attempts.length && attempts[0] <= at - 86_400_000) attempts.shift();
    if (attempts.length >= 8000 || attempts.filter(t => t > at - 3_600_000).length >= 4000 || attempts.filter(t => t > at - 60_000).length >= 500) return false;
    attempts.push(at); return true;
  }
  class ProviderFailure extends Error {
    readonly reason: WeatherDiagnostic["reason"];
    readonly httpStatus?: number;
    constructor(reason: WeatherDiagnostic["reason"], httpStatus?: number) { super(reason); this.reason = reason; this.httpStatus = httpStatus; }
  }
  async function attempt(provider: WeatherDiagnostic["provider"], signal: AbortSignal, task: (signal: AbortSignal) => Promise<PublicWeatherContext>): Promise<PublicWeatherContext | null> {
    if (signal.aborted || cooldown[provider] > now()) return null;
    if (provider === "met-norway" && now() - lastMetAttempt < 100) { report(provider,"quota"); return null; }
    if (!reserve(now())) { report(provider,"quota"); return null; }
    if (provider === "met-norway") lastMetAttempt = now();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) controller.abort();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; abort(); }, 4500);
    try {
      return await task(controller.signal);
    } catch (error) {
      if (!signal.aborted) report(provider,timedOut ? "timeout" : error instanceof ProviderFailure ? error.reason : "network",error instanceof ProviderFailure ? error.httpStatus : undefined);
      return null;
    } finally { clearTimeout(timeout); signal.removeEventListener("abort", abort); }
  }
  function requireSuccess(response: Response, provider: WeatherDiagnostic["provider"]) {
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) cooldown[provider] = now() + WEATHER_REFRESH_MS;
      throw new ProviderFailure("http",response.status);
    }
    if (response.status === 203) report(provider,"deprecated",203);
  }
  async function downloadOpen(request: WeatherRequest, signal: AbortSignal) {
    return attempt("open-meteo",signal,async upstreamSignal => {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      // About a kilometre precision. Raw device coordinates are never forwarded.
      url.search = new URLSearchParams({ latitude: request.location.lat.toFixed(2), longitude: request.location.lon.toFixed(2), current: "temperature_2m,apparent_temperature,wind_speed_10m,weather_code,is_day", temperature_unit: "celsius", wind_speed_unit: "kmh", timezone: "Asia/Qyzylorda", timeformat: "unixtime" }).toString();
      // Workerd supports follow/manual. Rejecting every non-2xx also rejects redirects.
      const response = await fetcher(url, { signal: upstreamSignal, headers: { Accept: "application/json" }, cache: "no-store", redirect: "manual" });
      requireSuccess(response,"open-meteo");
      const result = await boundedJson(response).catch(() => { throw new ProviderFailure("invalid_payload"); }), current = result.current;
      const providerUnits = result.current_units as Record<string, unknown> | undefined;
      if (!validWeather(current) || providerUnits?.temperature_2m !== "°C" || providerUnits?.apparent_temperature !== "°C" || providerUnits?.wind_speed_10m !== "km/h" || providerUnits?.time !== "unixtime") throw new ProviderFailure("invalid_payload");
      const at = now(), timestamp = current.time;
      if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp * 1000 > at + 120_000 || at - timestamp * 1000 > WEATHER_MAX_AGE_MS) throw new ProviderFailure("stale_model");
      return { temperature: Math.round(current.temperature_2m), feelsLike: Math.round(current.apparent_temperature), windKmh: Math.round(current.wind_speed_10m), code: current.weather_code, isDay: current.is_day === 1 ? true : current.is_day === 0 ? false : null, isDemo: false, status: "live", description: weatherLabel(current.weather_code), observedAt: new Date(timestamp * 1000).toISOString(), retrievedAt: new Date(at).toISOString(), source: "Open-Meteo", sourceUrl: "https://open-meteo.com/", units, safetyFallback: false, dataKind:"model-current", licenseUrl:"https://creativecommons.org/licenses/by/4.0/" };
    });
  }
  async function downloadMet(request: WeatherRequest, signal: AbortSignal) {
    const key = `${request.location.lat.toFixed(2)},${request.location.lon.toFixed(2)}`;
    const existing = metCache.get(key), at = now();
    if (existing && existing.expiresAt > at) {
      const weather = parseMetForecast(existing.body,at);
      return weather ? {...weather,retrievedAt:existing.checkedAt} : null;
    }
    if (!existing && metCache.size >= 64) {
      for (const [cell,item] of metCache) if (item.expiresAt <= at) metCache.delete(cell);
      if (metCache.size >= 64) { report("met-norway","quota"); return null; }
    }
    return attempt("met-norway",signal,async upstreamSignal => {
      const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
      url.search = new URLSearchParams({lat:request.location.lat.toFixed(2),lon:request.location.lon.toFixed(2)}).toString();
      const headers: Record<string,string> = {Accept:"application/json","User-Agent":"Seruen/1.0 https://seruen-astana.connect550439.chatgpt.site"};
      if (existing?.modified) headers["If-Modified-Since"] = existing.modified;
      const response = await fetcher(url,{signal:upstreamSignal,headers,cache:"no-store",redirect:"manual"});
      if (response.status !== 304) requireSuccess(response,"met-norway");
      if (response.status === 304 && !existing) throw new ProviderFailure("invalid_payload");
      const body = response.status === 304 ? existing!.body : await boundedJson(response,262_144).catch(() => {throw new ProviderFailure("invalid_payload");});
      const checked = now(), expiry = Date.parse(response.headers.get("expires") ?? "");
      const snapshot: MetSnapshot = {body,expiresAt:Math.max(checked+WEATHER_REFRESH_MS,Number.isFinite(expiry) ? expiry : 0),modified:response.headers.get("last-modified") ?? existing?.modified ?? null,checkedAt:new Date(checked).toISOString()};
      // Retain the complete forecast until Expires, so the selected current hour can advance without another provider request.
      metCache.set(key,snapshot);
      const weather = parseMetForecast(body,checked);
      if (!weather) throw new ProviderFailure("stale_model");
      return {...weather,retrievedAt:snapshot.checkedAt};
    });
  }
  async function download(request: WeatherRequest, signal: AbortSignal): Promise<PublicWeatherContext> {
    const primary = await downloadOpen(request,signal);
    if (primary) return primary;
    if (signal.aborted) return unavailable(now());
    return await downloadMet(request,signal) ?? unavailable(now());
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
      // Workers forbid using another HTTP request's I/O/AbortController.
      // Production subscribers wait on their own timers and read a completed JSON cache.
      if(job&&options.shareInflight===false){
        const deadline=performance.now()+9500;
        while(inflight.has(key)&&performance.now()<deadline&&!signal?.aborted)await new Promise(resolve=>setTimeout(resolve,80));
        const completed=cache.get(key);
        return !signal?.aborted&&completed&&completed.until>now()?clone(completed.weather):unavailable(now());
      }
      if (!job || job.controller.signal.aborted) {
        if (inflight.size >= 4) return unavailable(at);
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

const sharedWeather = /* @__PURE__ */ createWeatherService({shareInflight:false,onDiagnostic:value => console.warn(JSON.stringify(value))});
export async function getPublicWeather(request: WeatherRequest, options: WeatherOptions = {}) {
  const service = options.fetcher || options.now ? createWeatherService(options) : sharedWeather;
  try{return await service.get(request, options.signal);}catch{return unavailable((options.now??Date.now)());}
}

/** Safety readings are internal ranking constraints, never current weather for display. */
export async function getWeather(request: RecommendRequest, fetcher?: typeof fetch): Promise<WeatherContext> {
  const result = await getPublicWeather(request, fetcher ? { fetcher } : {});
  if (result.status !== "unavailable") return { ...result, temperature: result.temperature!, windKmh: result.windKmh!, code: result.code! };
  return { ...result, temperature: -25, feelsLike: -33, windKmh: 45, code: 3, isDemo: true, safetyFallback: true, description: "Погода недоступна: консервативные ограничения для подбора, не фактические градусы" };
}
