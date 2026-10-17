import type { Mood, POI, RecommendRequest, Recommendation, RecommendResponse, WeatherContext } from "./types";

export const winterWeather: WeatherContext = { temperature: -25, feelsLike: -33, windKmh: 32, code: 3, isDemo: true, description: "Зимний сценарий: мороз и сильный ветер" };
export const summerWeather: WeatherContext = { temperature: 24, feelsLike: 25, windKmh: 10, code: 1, isDemo: true, description: "Летний сценарий: комфортная погода" };

export function parseRequest(value: unknown): RecommendRequest {
  if (!value || typeof value !== "object") throw new Error("Передайте параметры прогулки.");
  const body = value as Record<string, unknown>;
  const location = body.location as Record<string, unknown> | undefined;
  if (!location || typeof location.lat !== "number" || typeof location.lon !== "number" || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) throw new Error("Нужны корректные координаты точки старта.");
  if (location.lat < 50.9 || location.lat > 51.35 || location.lon < 71.15 || location.lon > 71.8) throw new Error("Демо поддерживает только Астану. Выберите точку старта в городе.");
  if (typeof body.durationMinutes !== "number" || !Number.isFinite(body.durationMinutes) || body.durationMinutes < 15 || body.durationMinutes > 240) throw new Error("Выберите время от 15 до 240 минут.");
  const moods: Mood[] = ["any", "culture", "nature", "coffee", "family", "photo"];
  if (!moods.includes(body.mood as Mood)) throw new Error("Неизвестное настроение прогулки.");
  if (!["live", "winter", "summer"].includes(String(body.weatherMode))) throw new Error("Выберите текущую погоду или демо-сценарий.");
  if (typeof body.indoorOnly !== "boolean") throw new Error("Параметр indoorOnly должен быть boolean.");
  if (typeof body.query !== "string" || body.query.length > 1000) throw new Error("Запрос должен быть текстом длиной до 1000 символов.");
  return { query: body.query.trim(), location: { lat: location.lat, lon: location.lon, label: typeof location.label === "string" ? location.label.slice(0, 100) : "Точка на карте" }, durationMinutes: Math.round(body.durationMinutes), mood: body.mood as Mood, weatherMode: body.weatherMode as RecommendRequest["weatherMode"], indoorOnly: body.indoorOnly };
}

export function distanceMeters(from: {lat:number;lon:number}, to: {lat:number;lon:number}): number {
  const rad = (n: number) => n * Math.PI / 180;
  const a = Math.sin(rad(to.lat - from.lat) / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(rad(to.lon - from.lon) / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

const topicRules: [RegExp, string[]][] = [
  [/коф|кафе|coffee|coffeehouse|coffee shop|кофей/iu, ["coffee", "кофейня", "уют"]],
  [/семь|реб[её]н|дет|family|балалар/iu, ["family", "семья"]],
  [/истор|старый|старого|уют|наслед|history|old town/iu, ["история", "правый берег", "уют"]],
  [/природ|зел[её]н|парк|сад|nature|green/iu, ["nature", "парк", "зелень"]],
  [/искус|музе|выстав|культур|museum|culture/iu, ["culture", "музей", "искусство"]],
  [/фото|вид|панорам|photo|view|футур/iu, ["photo", "панорама", "архитектура"]],
  [/тепл|внутри|помещен|холод|warm|indoor/iu, ["тепло"]],
  [/набереж|река|рекой|river/iu, ["набережная"]],
  [/театр|балет|опера|theatre|ballet/iu, ["театр", "искусство"]],
];
const stop = new Set(["хочу","где","меня","есть","рядом","около","давай","прогулка","погулять","мне","для","with","near","хотел","сегодня","место","места"]);
export function queryTerms(query: string): string[] {
  const tokens = query.toLowerCase().replace(/ё/g,"е").match(/[\p{L}\p{N}]+/gu) ?? [];
  const terms = tokens.filter((t) => t.length > 2 && !stop.has(t)).map((t) => t.length > 5 ? t.slice(0, -1) : t);
  for (const [pattern, synonyms] of topicRules) if (pattern.test(query)) terms.push(...synonyms);
  return [...new Set(terms)].slice(0, 35);
}

export function requiresIndoor(weather: WeatherContext): boolean {
  return weather.feelsLike <= -15 || weather.temperature <= -20 || weather.windKmh >= 45 || weather.temperature >= 35 || weather.code >= 95;
}

type Candidate = {poi: POI; score:number; distanceMeters:number; walkMinutes:number};
export function retrieve(places: POI[], request: RecommendRequest, weather: WeatherContext): Candidate[] {
  const indoor = request.indoorOnly || requiresIndoor(weather) || /только\s+(?:в\s+)?(?:помещен|внутри)|без\s+улицы/iu.test(request.query);
  const terms = queryTerms(request.query);
  if (request.mood !== "any") terms.push(request.mood);
  const documents = places.map((poi) => `${poi.name} ${poi.description} ${poi.tags.join(" ")} ${poi.category} ${poi.address}`.toLowerCase().replace(/ё/g,"е"));
  const lengths = documents.map((text) => text.split(/\s+/).length);
  const averageLength = lengths.reduce((a,b) => a+b,0) / Math.max(1, lengths.length);
  const frequencies = terms.map((term) => documents.filter((doc) => doc.includes(term)).length);
  return places.flatMap((poi,index) => {
    if (indoor && !poi.indoor) return [];
    // Theatre visits need a programme/ticket and are not reliable spontaneous indoor shelter.
    if (indoor && poi.category === "Театр") return [];
    const distance = distanceMeters(request.location, poi);
    const walkMinutes = Math.max(1, Math.ceil(distance * 1.3 / 75));
    // Every suggestion is an alternative: outbound walk + a useful visit must fit the budget.
    if (walkMinutes + poi.durationMinutes > request.durationMinutes || distance > 8000) return [];
    // Extreme-weather guidance does not suggest a long walk to an indoor venue.
    if (requiresIndoor(weather) && walkMinutes > 12) return [];
    let bm25 = 0;
    terms.forEach((term, termIndex) => {
      const tf = documents[index].split(term).length - 1;
      if (!tf) return;
      const idf = Math.log(1 + (places.length - frequencies[termIndex] + 0.5) / (frequencies[termIndex] + 0.5));
      bm25 += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * lengths[index] / averageLength));
    });
    const moodBoost = request.mood !== "any" && poi.tags.includes(request.mood) ? 4 : 0;
    const parkBoost = !indoor && weather.temperature >= 10 && weather.temperature <= 28 && poi.tags.includes("nature") ? 0.7 : 0;
    const score = bm25 * 2 + moodBoost + parkBoost + 3 / (1 + distance / 600);
    return [{ poi, score, distanceMeters: distance, walkMinutes }];
  }).sort((a,b) => b.score - a.score || a.distanceMeters - b.distanceMeters).slice(0,8);
}

const moodLabels: Record<Mood,string> = { any: "короткой прогулки", culture: "знакомства с культурой", nature: "отдыха среди зелени", coffee: "кофейной паузы", family: "семейного отдыха", photo: "фотопрогулки" };
function actionsFor(poi: POI): string[] {
  if (poi.category === "Кофейня") return ["Уточните часы работы и меню в карточке площадки", "Выберите напиток и сделайте спокойную паузу"];
  if (poi.category === "Музей" || poi.category === "Галерея" || poi.category === "Выставочный павильон") return ["Проверьте доступ, актуальную программу и билеты", "Выберите одну экспозицию для неспешного осмотра"];
  if (poi.category === "Торговый центр") return ["Проверьте часы работы и удобный вход", "Пройдитесь внутри и выберите кафе для остановки"];
  if (poi.category === "Театр") return ["Откройте афишу и выберите спектакль на подходящее время", "Проверьте билеты; длительность спектакля рассчитывается отдельно"];
  if (poi.name.includes("мечеть") || poi.name.includes("Мечеть")) return ["Уточните часы для гостей и правила одежды", "Осмотрите архитектуру, соблюдая правила площадки"];
  if (!poi.indoor) return ["Постройте пешеходный путь в 2ГИС и проверьте переходы", "Пройдитесь в своём темпе и выберите ракурс для фото"];
  return ["Уточните доступ и часы работы перед визитом", "Осмотрите архитектуру и познакомьтесь с историей места"];
}

export function buildResponse(places: POI[], request: RecommendRequest, weather: WeatherContext, collectionLabel: string, chosenIds?: string[]): RecommendResponse {
  const candidates = retrieve(places, request, weather);
  const ranked = chosenIds ? chosenIds.map((id) => candidates.find((item) => item.poi.id === id)).filter((item): item is Candidate => Boolean(item)) : candidates;
  const selected = ranked.slice(0, 3);
  const indoorRequired = request.indoorOnly || requiresIndoor(weather) || /только\s+(?:в\s+)?(?:помещен|внутри)|без\s+улицы/iu.test(request.query);
  const warnings = ["1–3 места — альтернативы для выбора, а не общий маршрут. Время включает путь в одну сторону и посещение.", "Пешком: приблизительная оценка по прямой × 1,3, без учёта переходов и доступности. Проверьте маршрут в 2ГИС.", "Часы, билеты и доступ могут меняться. Рейтинги не придуманы: при отсутствии источника указано «нет данных»."];
  if (requiresIndoor(weather)) warnings.unshift("Неблагоприятная погода: показаны только помещения с подходом до 12 минут. Для более дальних поездок выберите транспорт; не рассчитывайте на самокаты в мороз.");
  if (weather.isDemo) warnings.push("Погода — явно смоделированный сценарий, не текущие наблюдения.");
  if (!selected.length) warnings.unshift("В заданное время безопасных вариантов не найдено. Увеличьте время или выберите точку старта ближе к помещению; при плохой погоде используйте транспорт.");
  if (request.mood !== "any" && selected.length && !selected.some((item) => item.poi.tags.includes(request.mood))) warnings.push("Рядом нет точного совпадения по настроению. Показаны доступные альтернативы с учётом безопасности.");
  const recommendations: Recommendation[] = selected.map(({ poi, distanceMeters, walkMinutes }) => ({
    poi, distanceMeters, walkMinutes, visitMinutes: poi.durationMinutes,
    why: `${poi.tags.includes(request.mood) || request.mood === "any" ? `Подходит для ${moodLabels[request.mood]}` : "Ближайшая подходящая альтернатива"}${indoorRequired ? "; посещение в помещении" : ""}. ${poi.description} Путь и визит займут примерно ${walkMinutes + poi.durationMinutes} мин.`,
    actions: actionsFor(poi), sourceLabel: poi.sourceName,
  }));
  return { recommendations, summary: selected.length ? `Нашлось ${selected.length} ${selected.length === 1 ? "место" : "места"} под ваш ритм. Выберите одно: каждый вариант укладывается в ${request.durationMinutes} минут.` : "Подходящих мест в текущих условиях не найдено.", warnings, weather, mode: chosenIds ? "llm" : "template", context: {durationMinutes: request.durationMinutes, locationLabel: request.location.label || "Точка на карте", mood: request.mood, indoorRequired, distanceMethod: "Haversine × 1,3; 75 м/мин; в одну сторону; ориентировочно", generatedAt: new Date().toISOString()}, trace: {collection: collectionLabel, totalPlaces: places.length, candidates: candidates.length, retrievedIds: candidates.map((item) => item.poi.id), method: "Лексический BM25 + синонимы RU/EN + настроение + геофильтр + погодные ограничения", llmUsed: Boolean(chosenIds), sources: [...new Set(selected.map((item) => item.poi.sourceUrl))]}};
}
