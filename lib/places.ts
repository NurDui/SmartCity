import seeds from "@/data/seeds.json";
import collected from "@/data/collected-pois.json";
import collectionReport from "@/data/collection-report.json";
import type { POI } from "./types";

const snapshot = new Map((collected as POI[]).map((poi) => [poi.id, poi]));
/** Editorial descriptions never pretend to be scraped facts; unmatched coordinates are approximate. */
export const places: POI[] = seeds.map((seed) => {
  const fact = snapshot.get(seed.id);
  const publisher = seed.editorialSource.includes("qazexpocongress") ? "QazExpoCongress" : seed.editorialSource.includes("mega.kz") ? "MEGA" : "Visit Astana";
  return {
    ...seed,
    image: "",
    collectedAt: fact?.collectedAt ?? "2026-10-17T20:57:27.700Z",
    openingHours: seed.openingHours ?? null,
    rating: null,
    sourceName: `${publisher} · описание; ${fact ? "Wikimedia · координаты" : "координаты ≈"}`,
    sourceUrl: seed.editorialSource,
    coordinateSourceUrl: fact?.sourceUrl,
    coordinateAccuracy: fact ? "sourced" : "approximate",
    lat: fact?.lat ?? seed.lat,
    lon: fact?.lon ?? seed.lon,
    links: {
      twoGis: `https://2gis.kz/astana/search/${encodeURIComponent(seed.name)}`,
      ticketon: "https://ticketon.kz/astana",
      kino: "https://kino.kz/",
      sxodim: "https://sxodim.com/astana",
    },
  } as POI;
});
// Successful OSM refreshes can discover additional places beyond the initial seed list.
for (const fact of collected as POI[]) {
  if (!places.some((poi) => poi.id === fact.id)) places.push(fact);
}
export const collection = collectionReport;
