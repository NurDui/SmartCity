import { places, collection } from "@/lib/places";
import {llmConfig} from "@/lib/llm-config";

export async function GET() {
  const config=llmConfig();
  return Response.json({ status:"ok", task:1, name:"Seruen Astana", mode:config ? "llm-available-with-template-fallback" : "template", llm:config?{provider:config.provider,model:config.model,requestsPerMinute:20,requestsPerDay:800,reservedTokensPerMinute:6000,reservedTokensPerDay:160000}:null,places:places.length, collection:{source:collection.source,status:collection.status,count:collection.count,collectedAt:collection.collectedAt}, privacy:"Coordinates are used transiently; no application location logs or storage. Weather receives coordinates rounded to 2 decimals. LLM receives candidate context without user coordinates or free-text query.", integrations:{map:"MapLibre / OpenStreetMap; optional CARTO",geocoding:process.env.GEOAPIFY_API_KEY?"Geoapify; 2500 credits per rolling day":"Nominatim", routing:process.env.GRAPHHOPPER_API_KEY?"GraphHopper pedestrian routing; 400 credits per rolling day":"FOSSGIS pedestrian OSRM; shared D1 quota", weather:"Open-Meteo / MET Norway", poi:"Wikidata / OSM and verified publisher catalogue", commercial:"Outbound references: 2GIS, Ticketon, kino.kz, sxodim"} },{headers:{"Cache-Control":"no-store"}});
}
