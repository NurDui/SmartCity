import { places, collection } from "@/lib/places";

export async function GET() {
  return Response.json({ status:"ok", task:1, name:"Astana Walk", mode:process.env.OPENAI_API_KEY ? "llm-available-with-template-fallback" : "template", places:places.length, collection:{source:collection.source,status:collection.status,count:collection.count,collectedAt:collection.collectedAt}, privacy:"Coordinates are used transiently; no application location logs or storage. Weather receives coordinates rounded to 2 decimals. LLM receives candidate context without user coordinates or free-text query.", integrations:{weather:"Open-Meteo API", poi:"Wikidata / OSM automated collector", commercial:"Outbound links only: 2GIS, Ticketon, kino.kz, sxodim"} },{headers:{"Cache-Control":"no-store"}});
}
