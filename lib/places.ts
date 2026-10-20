import seeds from "@/data/seeds.json";
import collected from "@/data/collected-pois.json";
import collectionReport from "@/data/collection-report.json";
import photoManifest from "@/data/poi-photos.json";
import curatedVenues from "@/data/curated-venues.json";
import type { POI } from "./types";

const snapshot = new Map((collected as POI[]).map((poi) => [poi.id, poi]));
// Media metadata also contains a photo description; it must never replace POI facts.
const photos:Record<string,Partial<POI>>=Object.fromEntries(Object.entries(photoManifest).map(([id,p])=>[id,{image:p.image,imageSourceUrl:p.imageSourceUrl,imageAuthor:p.imageAuthor,imageLicense:p.imageLicense,imageLicenseUrl:p.imageLicenseUrl}]));
/** Editorial descriptions never pretend to be scraped facts; unmatched coordinates are approximate. */
export const places: POI[] = seeds.map((seed) => {
  const fact = snapshot.get(seed.id);
  const publisher = seed.editorialSource.includes("qazexpocongress") ? "QazExpoCongress" : seed.editorialSource.includes("alem.ai") ? "alem.ai" : seed.editorialSource.includes("mega.kz") ? "MEGA" : seed.editorialSource.includes("wikidata.org") ? "Wikidata + редакционное" : "Visit Astana";
  return {
    ...seed,
    image: "",
    ...photos[seed.id],
    collectedAt: fact?.collectedAt ?? "2026-10-17T20:57:27.700Z",
    openingHours: seed.openingHours ?? null,
    rating: null,
    estimatedCostKzt: seed.estimatedCostKzt ?? null,
    sourceName: `${publisher} · описание; ${fact ? `${fact.sourceUrl.includes("alem.ai") ? "alem.ai" : "Wikimedia"} · координаты` : "координаты ≈"}`,
    sourceUrl: seed.editorialSource,
    coordinateSourceUrl: fact?.coordinateSourceUrl ?? fact?.sourceUrl,
    coordinateAccuracy: fact?.coordinateAccuracy ?? (fact ? "sourced" : "approximate"),
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
  if (!places.some((poi) => poi.id === fact.id)) {
    const exterior = ["wiki-31388841","wiki-62815244","wiki-63707654","wiki-68030640"].includes(fact.id);
    places.push({...fact,...photos[fact.id],estimatedCostKzt:exterior?0:null,...(exterior?{budgetScope:"exterior-only" as const,costEstimateBasis:"editorial-exterior" as const,costSourceUrl:fact.sourceUrl}:{})});
  }
}
// Small, independently reviewed venue collection. 2GIS remains an outbound reference.
for (const venue of curatedVenues as POI[]) {
  if (!places.some(poi => poi.id === venue.id)) places.push({...venue,...photos[venue.id]});
}
export const collection = collectionReport;
