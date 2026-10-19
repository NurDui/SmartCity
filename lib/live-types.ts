export type LiveStatus = "live" | "unconfigured" | "error" | "stale";
export type LiveLanguage = "ru" | "kk" | "en";
export interface CinemaSession {
  id:string; title:string; synopsis:string; posterUrl:string|null;
  startsAt:string; endsAt?:string; priceKzt:number|null; currency:"KZT";
  cinemaName:string; mallName:string|null; lat:number; lon:number; priceIsFrom?:boolean;
  distanceMeters:number; bookingUrl:string; sourceUrl:string; updatedAt:string;
}
export interface CityEvent {
  id:string; title:string; description:string; imageUrl:string|null;
  startsAt:string; endsAt?:string; venue:string; address:string; lat:number; lon:number;
  distanceMeters:number; priceKzt:number|null; sourceUrl:string; bookingUrl?:string;
  category:string; updatedAt:string; priceIsFrom?:boolean;
  coordinateSourceUrl?:string;
}
export interface LiveSection<T> {
  status:LiveStatus; source:string; updatedAt:string|null; items:T[]; message:string;
  retrievedAt?:string|null; sourceUpdatedAt?:string|null;
}
export interface TrafficState {
  status:LiveStatus; score:number|null; source:string; updatedAt:string|null; message:string;
}
export interface IntegrationState {
  id:"maplibre"|"yandex"|"2gis"|"cinema"|"events"|"traffic"|"telegram"|"instagram";
  configured:boolean; label:string; kind:"browser-sdk"|"approved-feed"|"publisher-source";
}
export interface DiscoverResponse {
  date:string; timezone:"Asia/Qyzylorda"; generatedAt:string;
  cinema:LiveSection<CinemaSession>; events:LiveSection<CityEvent>;
  traffic:TrafficState; integrations:IntegrationState[];
}
export interface RuntimeConfig {
  cartoKey:string|null;
  mapProvider:"maplibre";
  feeds:{cinema:boolean;events:boolean;traffic:boolean};
  requiresMapConsent:true;
}
export interface NormalizedFeed<T=unknown> {
  date:string; timezone:"Asia/Qyzylorda"; source:string; updatedAt:string; items:T[];
}
export interface NormalizedTrafficFeed {
  date:string; timezone:"Asia/Qyzylorda"; source:string; updatedAt:string;
  score:number; scale:10;
}
