export type Mood = "any" | "culture" | "nature" | "coffee" | "family" | "photo";
export type Language = "ru" | "kk" | "en";
export type SpacePreference = "any" | "indoor" | "outdoor";
export interface POI {
  id: string;
  name: string;
  lat: number;
  lon: number;
  description: string;
  tags: string[];
  category: string;
  indoor: boolean;
  bank: "left" | "right";
  durationMinutes: number;
  image: string;
  imageSourceUrl?: string;
  imageAuthor?: string;
  imageLicense?: string;
  imageLicenseUrl?: string;
  sourceUrl: string;
  sourceName: string;
  coordinateSourceUrl?: string;
  coordinateAccuracy?: "sourced" | "approximate";
  collectedAt: string;
  openingHours: string | null;
  rating: number | null;
  estimatedCostKzt?: number | null;
  costSourceUrl?: string;
  budgetScope?: "exterior-only";
  costEstimateBasis?: "published" | "editorial-exterior";
  address: string;
  links: { twoGis: string; ticketon?: string; kino?: string; sxodim?: string };
}
export interface RecommendRequest {
  query: string;
  location: { lat: number; lon: number; label?: string };
  durationMinutes: number;
  mood: Mood;
  weatherMode: "live" | "winter" | "summer";
  indoorOnly: boolean;
  language?: Language;
  groupSize?: number;
  spacePreference?: SpacePreference;
  budgetPerPerson?: number | null;
  wantsFood?: boolean;
}
export interface WeatherContext {
  temperature: number;
  feelsLike: number;
  windKmh: number;
  code: number;
  isDemo: boolean;
  description: string;
  status?: "live" | "demo" | "unavailable";
  observedAt?: string | null;
  retrievedAt?: string;
  source?: string;
  sourceUrl?: string | null;
  isDay?: boolean | null;
  units?: { temperature: "°C"; wind: "km/h" };
  safetyFallback?: boolean;
}
export interface PublicWeatherContext {
  temperature: number | null;
  feelsLike: number | null;
  windKmh: number | null;
  code: number | null;
  isDay: boolean | null;
  isDemo: boolean;
  status: "live" | "demo" | "unavailable";
  description: string;
  observedAt: string | null;
  retrievedAt: string;
  source: string;
  sourceUrl: string | null;
  units: { temperature: "°C"; wind: "km/h" };
  safetyFallback: boolean;
}
export interface Recommendation {
  poi: POI;
  distanceMeters: number;
  walkMinutes: number;
  visitMinutes: number;
  why: string;
  actions: string[];
  sourceLabel: string;
  budgetNote?: string;
}
export interface RecommendResponse {
  recommendations: Recommendation[];
  summary: string;
  warnings: string[];
  weather: WeatherContext;
  mode: "llm" | "template";
  context: { durationMinutes: number; locationLabel: string; mood: Mood; indoorRequired: boolean; distanceMethod: string; generatedAt: string; language: Language; groupSize: number; spacePreference: SpacePreference; budgetPerPerson: number|null; wantsFood: boolean };
  trace: { collection: string; totalPlaces: number; candidates: number; retrievedIds: string[]; method: string; llmUsed: boolean; sources: string[]; filters?: { weather:number; space:number; time:number; food:number; budget:number; unknownPrice:number } };
}
