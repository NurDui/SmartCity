import type { IntegrationState, RuntimeConfig } from "./live-types.ts";

export type FeedKind="cinema"|"events"|"traffic";
export interface FeedConfig {url:string;token?:string}
const names:Record<FeedKind,string>={cinema:"CINEMA",events:"EVENTS",traffic:"TRAFFIC"};

/** Fixed server environment URLs only. User input can never choose an upstream host. */
export function getFeedConfig(kind:FeedKind, env:Record<string,string|undefined>=process.env):FeedConfig|null {
  const prefix=names[kind]; const raw=env[`${prefix}_FEED_URL`];
  if(!raw) return null;
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.username||url.password||url.hash) throw new Error("Provider URL must be a public HTTPS URL without embedded credentials");
  const host=url.hostname.toLowerCase();
  if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(":")) throw new Error("Provider hostname must be a public DNS name");
  return {url:url.href,token:env[`${prefix}_FEED_TOKEN`]};
}
export function getRuntimeConfig(env:Record<string,string|undefined>=process.env):RuntimeConfig {
  const key=env.TWOGIS_MAPGL_KEY?.trim()||null;
  const configured=(kind:FeedKind)=>{try{return Boolean(getFeedConfig(kind,env));}catch{return false;}};
  return {twoGisKey:key,mapProvider:key?"2gis":"openstreetmap",feeds:{cinema:configured("cinema"),events:configured("events"),traffic:configured("traffic")},requiresMapConsent:true};
}
export function integrationStates(env:Record<string,string|undefined>=process.env):IntegrationState[] {
 const c=getRuntimeConfig(env);
 return [
  {id:"2gis",configured:Boolean(c.twoGisKey),label:"2GIS MapGL JS",kind:"browser-sdk"},
  {id:"cinema",configured:c.feeds.cinema,label:"Сеансы: разрешенный JSON-фид",kind:"approved-feed"},
  {id:"events",configured:c.feeds.events,label:"События: разрешенный JSON-фид",kind:"approved-feed"},
  {id:"traffic",configured:c.feeds.traffic,label:"Пробки: фид провайдера, шкала 10",kind:"approved-feed"},
  {id:"telegram",configured:false,label:"Telegram: публикации подключает владелец канала в фид событий",kind:"publisher-source"},
  {id:"instagram",configured:false,label:"Instagram: медиа подключает владелец профессионального аккаунта",kind:"publisher-source"}
 ];
}
