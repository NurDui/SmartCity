import type { Mood, POI, RecommendRequest, Recommendation, RecommendResponse, WeatherContext } from "./types";
import { exteriorCostNote, languageOf, localizePoi, moodText, t, zeroBudgetNotice } from "./recommendation-i18n.ts";

export const winterWeather: WeatherContext = { temperature: -25, feelsLike: -33, windKmh: 32, code: 3, isDemo: true, description: "Зимний сценарий: мороз и сильный ветер" };
export const summerWeather: WeatherContext = { temperature: 24, feelsLike: 25, windKmh: 10, code: 1, isDemo: true, description: "Летний сценарий: комфортная погода" };

export function parseRequest(value: unknown): RecommendRequest {
  if (!value || typeof value !== "object") throw new Error(t("ru","parameters"));
  const body = value as Record<string, unknown>;
  const language=languageOf(body.language);
  const fail=(key:Parameters<typeof t>[1]):never=>{throw new Error(t(language,key));};
  if(body.language!==undefined && !["ru","kk","en"].includes(body.language as string))fail("language");
  const location = body.location as Record<string, unknown> | undefined;
  if (!location || typeof location.lat !== "number" || typeof location.lon !== "number" || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) fail("coordinates");
  const latitude=location!.lat as number,longitude=location!.lon as number;
  if (latitude < 50.9 || latitude > 51.35 || longitude < 71.15 || longitude > 71.8) fail("city");
  if (typeof body.durationMinutes !== "number" || !Number.isFinite(body.durationMinutes) || body.durationMinutes < 15 || body.durationMinutes > 240) fail("duration");
  const moods: Mood[] = ["any", "culture", "nature", "coffee", "family", "photo"];
  if (!moods.includes(body.mood as Mood)) fail("mood");
  if (!["live", "winter", "summer"].includes(body.weatherMode as string)) fail("weatherMode");
  if (typeof body.indoorOnly !== "boolean") fail("indoorFlag");
  if (typeof body.query !== "string" || body.query.length > 1000) fail("query");
  if(body.groupSize!==undefined && (typeof body.groupSize!=="number" || !Number.isInteger(body.groupSize) || body.groupSize<1 || body.groupSize>20))fail("group");
  if(body.spacePreference!==undefined && !["any","indoor","outdoor"].includes(body.spacePreference as string))fail("space");
  if(body.budgetPerPerson!==undefined && body.budgetPerPerson!==null && (typeof body.budgetPerPerson!=="number" || !Number.isFinite(body.budgetPerPerson) || body.budgetPerPerson<0 || body.budgetPerPerson>1000000))fail("budget");
  if(body.wantsFood!==undefined && typeof body.wantsFood!=="boolean")fail("food");
  return { query: (body.query as string).trim(), location: { lat: latitude, lon: longitude, label: typeof location!.label === "string" ? location!.label.slice(0, 100) : t(language,"point") }, durationMinutes: Math.round(body.durationMinutes as number), mood: body.mood as Mood, weatherMode: body.weatherMode as RecommendRequest["weatherMode"], indoorOnly: body.indoorOnly as boolean,language,groupSize:(body.groupSize as number|undefined)??1,spacePreference:(body.spacePreference as RecommendRequest["spacePreference"])??"any",budgetPerPerson:(body.budgetPerPerson as number|null|undefined)??null,wantsFood:(body.wantsFood as boolean|undefined)??false };
}

export function distanceMeters(from: {lat:number;lon:number}, to: {lat:number;lon:number}): number {
  const rad = (n: number) => n * Math.PI / 180;
  const a = Math.sin(rad(to.lat - from.lat) / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(rad(to.lon - from.lon) / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

const topicRules: [RegExp, string[]][] = [
  [/коф|кафе|coffee|coffeehouse|coffee shop|кофей|кофехана/iu, ["coffee", "кофейня", "уют"]],
  [/семь|реб[её]н|дет|family|балалар|отбасы/iu, ["family", "семья"]],
  [/истор|старый|старого|уют|наслед|history|old town|тарих/iu, ["история", "правый берег", "уют"]],
  [/природ|зел[её]н|парк|сад|nature|green|табиғат|саябақ|жасыл/iu, ["nature", "парк", "зелень"]],
  [/искус|музе|выстав|культур|museum|culture|өнер|мәдениет|көрме/iu, ["culture", "музей", "искусство"]],
  [/фото|вид|панорам|photo|view|футур/iu, ["photo", "панорама", "архитектура"]],
  [/тепл|внутри|помещен|холод|warm|indoor|жылы|жабық/iu, ["тепло"]],
  [/набереж|река|рекой|river|жағалау|өзен/iu, ["набережная"]],
  [/театр|балет|опера|theatre|ballet/iu, ["театр", "искусство"]],
  [/тамақ|ашпын|ас\s+іш|food|hungry|eat|еда|поесть|перекус/iu,["food"]],
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
export function indoorRequired(request:RecommendRequest,weather:WeatherContext):boolean { return request.indoorOnly || request.spacePreference==="indoor" || requiresIndoor(weather) || /только\s+(?:в\s+)?(?:помещен|внутри)|без\s+улицы|indoor\s+only|тек\s+жабық/iu.test(request.query); }
export function hasFood(poi:POI):boolean { return poi.tags.includes("food") || poi.category==="Кофейня" || poi.category==="Торговый центр"; }
export function verifiedCost(poi:POI):number|null { return poi.costEstimateBasis==="published" && poi.costSourceUrl && typeof poi.estimatedCostKzt==="number" && Number.isFinite(poi.estimatedCostKzt) && poi.estimatedCostKzt>=0 ? poi.estimatedCostKzt : null; }
export function retrieveWithFilters(places: POI[], request: RecommendRequest, weather: WeatherContext): {candidates:Candidate[];filters:NonNullable<RecommendResponse["trace"]["filters"]>} {
  const indoor = indoorRequired(request,weather);
  const filters={weather:0,space:0,time:0,food:0,budget:0,unknownPrice:0};
  const terms = queryTerms(request.query);
  if (request.mood !== "any") terms.push(request.mood);
  const documents = places.map((poi) => `${poi.name} ${poi.description} ${poi.tags.join(" ")} ${poi.category} ${poi.address}`.toLowerCase().replace(/ё/g,"е"));
  const lengths = documents.map((text) => text.split(/\s+/).length);
  const averageLength = lengths.reduce((a,b) => a+b,0) / Math.max(1, lengths.length);
  const frequencies = terms.map((term) => documents.filter((doc) => doc.includes(term)).length);
  const candidates=places.flatMap((poi,index) => {
    if (indoor && !poi.indoor) {if(requiresIndoor(weather))filters.weather++;else filters.space++;return [];}
    if(!indoor && request.spacePreference==="outdoor" && poi.indoor){filters.space++;return [];}
    // Theatre visits need a programme/ticket and are not reliable spontaneous indoor shelter.
    if (indoor && poi.category === "Театр") {filters.space++;return [];}
    if(request.wantsFood && !hasFood(poi)){filters.food++;return [];}
    const budget=request.budgetPerPerson??null;
    const cost=verifiedCost(poi);
    const exterior=poi.budgetScope==="exterior-only" && poi.costEstimateBasis==="editorial-exterior" && poi.estimatedCostKzt===0 && Boolean(poi.costSourceUrl) && !poi.indoor;
    if(budget===0 && (request.wantsFood || poi.indoor || !(cost===0||exterior))){filters.budget++;if(cost===null&&!exterior)filters.unknownPrice++;return [];}
    if(budget!==null && cost!==null && cost>budget){filters.budget++;return [];}
    if(budget!==null && cost===null&&!exterior)filters.unknownPrice++;
    const distance = distanceMeters(request.location, poi);
    const walkMinutes = Math.max(1, Math.ceil(distance * 1.3 / 75));
    // Every suggestion is an alternative: outbound walk + a useful visit must fit the budget.
    if (walkMinutes + poi.durationMinutes > request.durationMinutes || distance > 8000) {filters.time++;return [];}
    // Extreme-weather guidance does not suggest a long walk to an indoor venue.
    if (requiresIndoor(weather) && walkMinutes > 12) {filters.weather++;return [];}
    let bm25 = 0;
    terms.forEach((term, termIndex) => {
      const tf = documents[index].split(term).length - 1;
      if (!tf) return;
      const idf = Math.log(1 + (places.length - frequencies[termIndex] + 0.5) / (frequencies[termIndex] + 0.5));
      bm25 += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * lengths[index] / averageLength));
    });
    const moodBoost = request.mood !== "any" && poi.tags.includes(request.mood) ? 4 : 0;
    const parkBoost = !indoor && weather.temperature >= 10 && weather.temperature <= 28 && poi.tags.includes("nature") ? 0.7 : 0;
    const groupBoost=(request.groupSize??1)>2 ? (poi.tags.includes("family")?1.5:0) : (request.groupSize??1)===1 && (poi.tags.includes("тихо")||poi.tags.includes("уют"))?1:0;
    const foodBoost=request.wantsFood && hasFood(poi)?2:0;
    const costBoost=budget!==null && (cost!==null||exterior)?1:0;
    const score = bm25 * 2 + moodBoost + parkBoost + groupBoost + foodBoost + costBoost + 3 / (1 + distance / 600);
    return [{ poi, score, distanceMeters: distance, walkMinutes }];
  }).sort((a,b) => b.score - a.score || a.distanceMeters - b.distanceMeters).slice(0,8);
  return {candidates,filters};
}
export function retrieve(places:POI[],request:RecommendRequest,weather:WeatherContext):Candidate[]{return retrieveWithFilters(places,request,weather).candidates;}

function actionsFor(poi: POI,language:ReturnType<typeof languageOf>): string[] {
  let keys: [Parameters<typeof t>[1],Parameters<typeof t>[1]];
  if (poi.category === "Кофейня") keys=["cafe1","cafe2"];
  else if (["Музей","Галерея","Выставочный павильон"].includes(poi.category)) keys=["museum1","museum2"];
  else if (poi.category === "Торговый центр") keys=["mall1","mall2"];
  else if (poi.category === "Театр") keys=["theatre1","theatre2"];
  else if (/мечеть/iu.test(poi.name)) keys=["mosque1","mosque2"];
  else if (!poi.indoor) keys=["outdoor1","outdoor2"];
  else keys=["indoor1","indoor2"];
  return keys.map(key=>t(language,key));
}

export function buildResponse(places: POI[], request: RecommendRequest, weather: WeatherContext, collectionLabel: string, chosenIds?: string[]): RecommendResponse {
  const language=languageOf(request.language);
  const {candidates,filters} = retrieveWithFilters(places, request, weather);
  const ranked = chosenIds ? chosenIds.map((id) => candidates.find((item) => item.poi.id === id)).filter((item): item is Candidate => Boolean(item)) : candidates;
  const selected = ranked.slice(0, 3);
  const indoor = indoorRequired(request,weather);
  const groupSize=request.groupSize??1,budget=request.budgetPerPerson??null;
  const warnings = [t(language,"alternatives"),t(language,"distanceWarning"),t(language,"factsWarning")];
  if (requiresIndoor(weather)) warnings.unshift(t(language,"severe"));
  if(request.spacePreference==="outdoor"&&indoor)warnings.unshift(t(language,requiresIndoor(weather)?"weatherOverrides":"indoorOverrides"));
  if (weather.isDemo) warnings.push(t(language,"demo"));
  if (!selected.length) warnings.unshift(t(language,"noMatch"));
  if (request.mood !== "any" && selected.length && !selected.some((item) => item.poi.tags.includes(request.mood))) warnings.push(t(language,"moodFallback"));
  if(groupSize>1)warnings.push(t(language,"groupWarning",{group:groupSize}));
  if(budget===0)warnings.push(zeroBudgetNotice(language));
  if(budget!==null && budget>0 && selected.some(({poi})=>verifiedCost(poi)===null&&poi.budgetScope!=="exterior-only"))warnings.push(t(language,"unknownBudget"));
  if(request.wantsFood&&!selected.length)warnings.push(t(language,"foodMissing"));
  const recommendations: Recommendation[] = selected.map(({ poi, distanceMeters, walkMinutes }) => {
    const localized=localizePoi(poi,language);
    const cost=verifiedCost(poi);
    const budgetNote=poi.budgetScope==="exterior-only" ? exteriorCostNote(language) : cost===null ? t(language,budget===null?"flexibleCost":"unknownCost",{budget:budget??0}) : t(language,budget===null?"flexibleConfirmed":"confirmedCost",{cost});
    return {
      poi:localized,distanceMeters,walkMinutes,visitMinutes:poi.durationMinutes,budgetNote,
      why:`${poi.tags.includes(request.mood)||request.mood==="any"?t(language,"fits",{mood:moodText(language,request.mood)}):t(language,"alternativeWhy")}; ${t(language,poi.indoor?"indoors":"outdoors")}. ${localized.description} ${t(language,"total",{minutes:walkMinutes+poi.durationMinutes})} ${t(language,groupSize===1?"solo":"groupWhy",{group:groupSize})}${request.wantsFood?` ${t(language,"foodWhy")}`:""}`,
      actions:actionsFor(poi,language),sourceLabel:localized.sourceName,
    };
  });
  const weatherDescription=weather.isDemo ? t(language,/недоступ|unavailable|қолжетімсіз/iu.test(weather.description)?"weatherUnavailable":request.weatherMode==="winter"?"winter":"summer") : t(language,"live");
  return {recommendations,summary:selected.length?t(language,"summary",{count:selected.length,minutes:request.durationMinutes}):t(language,"empty"),warnings,weather:{...weather,description:weatherDescription},mode:chosenIds?"llm":"template",context:{durationMinutes:request.durationMinutes,locationLabel:request.location.label||t(language,"point"),mood:request.mood,indoorRequired:indoor,distanceMethod:t(language,"distanceMethod"),generatedAt:new Date().toISOString(),language,groupSize,spacePreference:request.spacePreference??"any",budgetPerPerson:budget,wantsFood:request.wantsFood??false},trace:{collection:collectionLabel,totalPlaces:places.length,candidates:candidates.length,retrievedIds:candidates.map(item=>item.poi.id),method:t(language,"method"),llmUsed:Boolean(chosenIds),sources:[...new Set(selected.map(item=>item.poi.sourceUrl))],filters}};
}
