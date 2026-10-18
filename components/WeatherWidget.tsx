"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudOff, CloudRain, CloudSnow, CloudSun, LoaderCircle, Moon, RefreshCw, Sun, Wind } from "lucide-react";
import type { Language, PublicWeatherContext, RecommendRequest } from "@/lib/types";
import { WEATHER_MAX_AGE_MS, WEATHER_REFRESH_MS, weatherIconName } from "@/lib/weather";
import styles from "./WeatherWidget.module.css";

export interface WeatherWidgetProps {
  origin: { lat: number; lon: number; label?: string };
  locale: Language;
  weatherMode: RecommendRequest["weatherMode"];
  className?: string;
}
const words = {
  ru: { title: "Погода в Астане", loading: "Получаем погоду…", unavailable: "Погода временно недоступна", stale: "Свежих данных пока нет", feels: "ощущается", wind: "Ветер", kmh: "км/ч", live: "Модель погоды", demo: "Демо", summer: "Лето", winter: "Зима", model: "Модель на", checked: "проверено", retry: "Обновить погоду", caution: "Без актуальной погоды подбор ограничен тёплыми местами." },
  kk: { title: "Астанадағы ауа райы", loading: "Ауа райы жүктелуде…", unavailable: "Ауа райы уақытша қолжетімсіз", stale: "Жаңа деректер әзірге жоқ", feels: "сезіледі", wind: "Жел", kmh: "км/сағ", live: "Ауа райы моделі", demo: "Демо", summer: "Жаз", winter: "Қыс", model: "Модель уақыты", checked: "тексерілді", retry: "Ауа райын жаңарту", caution: "Жаңа ауа райы деректерінсіз тек жылы орындар ұсынылады." },
  en: { title: "Weather in Astana", loading: "Loading weather…", unavailable: "Weather temporarily unavailable", stale: "No fresh weather data yet", feels: "feels like", wind: "Wind", kmh: "km/h", live: "Weather model", demo: "Demo", summer: "Summer", winter: "Winter", model: "Model at", checked: "checked", retry: "Refresh weather", caution: "Without current weather, suggestions are limited to warm places." },
};
function timeLabel(value: string | null, locale: Language) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : locale === "ru" ? "ru-KZ" : "en-GB", { timeZone: "Asia/Qyzylorda", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
function publicShape(value: unknown): value is PublicWeatherContext {
  if (!value || typeof value !== "object") return false;
  const w = value as PublicWeatherContext;
  if (!["live", "demo", "unavailable"].includes(w.status) || typeof w.description !== "string" || typeof w.retrievedAt !== "string" || !Number.isFinite(Date.parse(w.retrievedAt))) return false;
  if (w.status === "unavailable") return w.temperature === null && w.feelsLike === null && w.windKmh === null && w.code === null;
  return [w.temperature, w.feelsLike, w.windKmh, w.code].every(v => typeof v === "number" && Number.isFinite(v));
}
function absent(): PublicWeatherContext {
  return { temperature: null, feelsLike: null, windKmh: null, code: null, isDay: null, status: "unavailable", isDemo: false, description: "", retrievedAt: new Date().toISOString(), observedAt: null, source: "Open-Meteo", sourceUrl: "https://open-meteo.com/", units: { temperature: "°C", wind: "km/h" }, safetyFallback: false };
}

export default function WeatherWidget({ origin, locale, weatherMode, className = "" }: WeatherWidgetProps) {
  const t = words[locale];
  const key = `${origin.lat},${origin.lon}/${weatherMode}/${locale}`;
  const [data, setData] = useState<{ key: string; weather: PublicWeatherContext } | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true, current: AbortController | null = null, lastAttempt = 0, received = false, pending = false;
    async function load() {
      if (document.visibilityState === "hidden") return;
      current?.abort();
      const controller = new AbortController(); current = controller;
      lastAttempt = Date.now(); pending = true; setLoading(true);
      try {
        const response = await fetch("/api/weather", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: { lat: origin.lat, lon: origin.lon }, weatherMode, language: locale }), signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Weather unavailable");
        const result = await response.json() as { weather?: unknown };
        if (!publicShape(result.weather)) throw new Error("Invalid weather response");
        if (active && !controller.signal.aborted) { received = true; setData({ key, weather: result.weather }); setClock(Date.now()); }
      } catch {
        if (active && !controller.signal.aborted) { received = true; setData({ key, weather: absent() }); setClock(Date.now()); }
      } finally { if (active && current === controller) { pending = false; setLoading(false); } }
    }
    const visibility = () => {
      if (document.visibilityState === "hidden") { if (pending) received = false; current?.abort(); setLoading(false); }
      else if (!received || Date.now() - lastAttempt >= WEATHER_REFRESH_MS) void load();
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, WEATHER_REFRESH_MS);
    document.addEventListener("visibilitychange", visibility);
    return () => { active = false; current?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [origin.lat, origin.lon, weatherMode, locale, key, retry]);

  const weather = data?.key === key ? data.weather : null;
  const stale = weather?.status === "live" && (!weather.observedAt || !Number.isFinite(Date.parse(weather.observedAt)) || clock - Date.parse(weather.observedAt) > WEATHER_MAX_AGE_MS || Date.parse(weather.observedAt) > clock + 120_000);
  const available = !!weather && weather.status !== "unavailable" && !stale;
  const iconName = available ? weatherIconName(weather.code, weather.isDay) : "unknown";
  const Icon = iconName === "sun" ? Sun : iconName === "moon" ? Moon : iconName === "partly" ? (weather?.isDay === false ? CloudMoon : CloudSun) : iconName === "cloud" ? Cloud : iconName === "fog" ? CloudFog : iconName === "drizzle" ? CloudDrizzle : iconName === "rain" ? CloudRain : iconName === "snow" ? CloudSnow : iconName === "storm" ? CloudLightning : CloudOff;
  return <section className={`${styles.widget} ${className}`} aria-label={t.title} data-weather-status={available ? weather.status : "unavailable"} aria-busy={loading}>
    <div className={styles.top}><span>{t.title}</span><span className={styles.badge}>{weatherMode === "live" ? t.live : `${t.demo} · ${weatherMode === "winter" ? t.winter : t.summer}`}</span><button className={styles.refresh} type="button" aria-label={t.retry} title={t.retry} onClick={() => setRetry(value => value + 1)} disabled={loading}>{loading ? <LoaderCircle size={18} className={styles.spin} /> : <RefreshCw size={18} />}</button></div>
    <div className={styles.readings} aria-live="polite"><Icon className={styles.icon} size={38} aria-hidden="true" />{available ? <><strong>{weather.temperature}°C</strong><div className={styles.details}><span>{weather.description}</span><span>{t.feels} {weather.feelsLike}°C · <Wind size={14} aria-hidden="true" /> {weather.windKmh} {t.kmh}</span></div></> : <div className={styles.details}><strong className={styles.unavailable}>{!weather && loading ? t.loading : stale ? t.stale : t.unavailable}</strong><span>{t.caution}</span></div>}</div>
    <div className={styles.source}>{weatherMode === "live" ? <><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a><a href="https://open-meteo.com/en/licence" target="_blank" rel="noreferrer" title={locale==="en"?"Model values rounded for display":locale==="kk"?"Модель мәндері көрсету үшін дөңгелектелген":"Значения модели округлены для отображения"}>CC BY 4.0</a></> : <span>Seruen demo</span>}{available && weather.status === "live" && <span>{t.model} {timeLabel(weather.observedAt, locale)}</span>}{weather && <span>{t.checked} {timeLabel(weather.retrievedAt, locale)}</span>}</div>
  </section>;
}
