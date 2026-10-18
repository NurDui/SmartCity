/** Curated landmark identities; automatically retrieve Wikidata CC0 coordinates.
 * Run: node scripts/collect-landmarks.mjs. Descriptions and durations are editorial.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const write=async(path,data)=>writeFile(new URL(path,root),JSON.stringify(data,null,2)+'\n');
const definitions=await read('data/landmark-additions.json');
const seeds=await read('data/seeds.json'),facts=await read('data/collected-pois.json');
const retrievedAt=new Date().toISOString();
const api=new URL('https://www.wikidata.org/w/api.php');api.search=new URLSearchParams({action:'wbgetentities',ids:definitions.map(x=>x.qid).join('|'),props:'claims|labels',languages:'ru|kk|en',format:'json'});
const response=await fetch(api,{headers:{'User-Agent':'SeruenAstana/1.0 (public CC0 landmark collection)'},signal:AbortSignal.timeout(25000)});
if(!response.ok)throw new Error(`Wikidata HTTP ${response.status}`);
const raw=await response.json();if(!raw.entities)throw new Error('Wikidata response lacks entities');
await mkdir(new URL('data/raw/',root),{recursive:true});await write('data/raw/landmark-additions-entities.json',{retrievedAt,...raw});
let added=0;
for(const d of definitions){
 const claims=raw.entities[d.qid]?.claims?.P625??[];
 const claim=claims.find(x=>x.rank==='preferred')??claims.find(x=>x.rank!=='deprecated');
 const coord=claim?.mainsnak?.datavalue?.value;
 if(!coord||coord.latitude<51||coord.latitude>51.25||coord.longitude<71.3||coord.longitude>71.65)throw new Error(`Invalid Astana coordinates: ${d.id}`);
 const seed={id:d.id,search:d.search,name:d.name,lat:coord.latitude,lon:coord.longitude,description:d.description,tags:['culture','photo',...(d.category==='Мост'||d.category==='Прогулка'?['nature']:[]),'архитектура'],category:d.category,indoor:false,bank:coord.latitude<51.145?'left':'right',durationMinutes:d.minutes,address:'Астана · координаты объекта из Wikidata',openingHours:null,editorialSource:`https://www.wikidata.org/wiki/${d.qid}`,estimatedCostKzt:0,budgetScope:'exterior-only',costEstimateBasis:'editorial-exterior',costSourceUrl:`https://www.wikidata.org/wiki/${d.qid}`};
 const index=seeds.findIndex(x=>x.id===d.id);if(index<0){seeds.push(seed);added++;}else seeds[index]=seed;
 const fact={...seed,image:'',sourceUrl:seed.editorialSource,sourceName:'Wikidata · CC0 (координаты); редакционное описание',coordinateSourceUrl:seed.editorialSource,coordinateAccuracy:coord.precision<=0.001?'sourced':'approximate',collectedAt:retrievedAt,rating:null,links:{twoGis:`https://2gis.kz/astana/search/${encodeURIComponent(d.name)}`}};
 const f=facts.findIndex(x=>x.id===d.id);if(f<0)facts.push(fact);else facts[f]=fact;
}
// The older GeoSearch page point for Nur-Astana is imprecise; use the entity's coordinate.
const mosque=facts.find(x=>x.id==='wiki-24284325');if(mosque){mosque.lat=51.126561;mosque.lon=71.415737;mosque.coordinateSourceUrl='https://www.wikidata.org/wiki/Q1813417';mosque.sourceUrl=mosque.coordinateSourceUrl;mosque.coordinateAccuracy='sourced';}
await write('data/seeds.json',seeds);await write('data/collected-pois.json',facts);
const report=await read('data/collection-report.json');await write('data/collection-report.json',{...report,lastAttemptAt:retrievedAt,count:facts.length,landmarkEnrichment:{retrievedAt,source:'Wikidata CC0 coordinates; original editorial descriptions',count:definitions.length},attempts:[...report.attempts,{endpoint:'Wikidata landmark identities',status:'success',count:definitions.length}]});
console.log(JSON.stringify({added,seedCount:seeds.length,collectedFacts:facts.length,total:new Set([...seeds,...facts].map(x=>x.id)).size}));
