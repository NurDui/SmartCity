/** Public OSM data, ODbL. Refresh: node scripts/collect-poi.mjs
 * No scraping of commercial services. Missing hours/ratings stay null.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const dir = new URL('../data/', import.meta.url);
await mkdir(new URL('raw/', dir), { recursive: true });
const collectedAt = new Date().toISOString();
const wikiOnly = process.argv.includes('--wikimedia-only');
const query = `[out:json][timeout:25][bbox:51.02,71.30,51.22,71.58];(nwr["tourism"~"museum|attraction|gallery"][name];nwr["leisure"="park"][name];nwr["shop"="mall"][name];nwr["amenity"~"cafe|theatre|cinema"][name];);out center tags;`;
const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const attempts = [];
let elements = [];
let freshRecords = 0;
for (const endpoint of wikiOnly ? [] : endpoints) {
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AstanaWalkHackathon/1.0 (POI collection; OSM attribution)' }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(35000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.json();
    if (!Array.isArray(raw.elements) || raw.elements.length === 0) throw new Error('No POIs returned');
    elements = raw.elements;
    freshRecords += elements.length;
    await writeFile(new URL('raw/overpass.json', dir), JSON.stringify({ endpoint, collectedAt, query, ...raw }, null, 2));
    attempts.push({ endpoint, status: 'success', count: elements.length });
    break;
  } catch (error) { attempts.push({ endpoint, status: 'failed', error: error.message }); }
}
const seen = new Set();
let places = elements.filter((e) => {
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  const key = `${e.tags?.['name:ru'] ?? e.tags?.name}|${Number(lat).toFixed(3)}|${Number(lon).toFixed(3)}`;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || seen.has(key)) return false;
  seen.add(key); return true;
}).map((e) => {
  const t = e.tags, lat = e.lat ?? e.center.lat, lon = e.lon ?? e.center.lon;
  const category = t.tourism === 'museum' ? 'Музей' : t.tourism === 'gallery' ? 'Галерея' : t.leisure === 'park' ? 'Парк' : t.shop === 'mall' ? 'Торговый центр' : t.amenity === 'cafe' ? 'Кофейня' : t.amenity === 'cinema' ? 'Кинотеатр' : t.amenity === 'theatre' ? 'Театр' : 'Достопримечательность';
  const name = t['name:ru'] ?? t.name;
  const indoor = ['Музей','Галерея','Торговый центр','Кофейня','Кинотеатр','Театр'].includes(category);
  return { id: `osm-${e.type}-${e.id}`, name, lat, lon, description: `${category} в Астане. Название и координаты получены из OpenStreetMap; детали посещения уточните у площадки.`, tags: [category.toLowerCase(), ...(category === 'Парк' ? ['nature','family','photo'] : category === 'Кофейня' ? ['coffee'] : category === 'Торговый центр' ? ['family','coffee'] : ['culture','photo'])], category, indoor, bank: lat < 51.145 ? 'left' : 'right', durationMinutes: category === 'Музей' ? 60 : category === 'Парк' ? 40 : 30, image: '', sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`, sourceName: 'OpenStreetMap · ODbL', collectedAt, openingHours: t.opening_hours ?? null, rating: null, address: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ') || 'Астана · точка на карте OSM', links: { twoGis: `https://2gis.kz/astana/search/${encodeURIComponent(name)}`, ...(category === 'Кинотеатр' ? { kino: 'https://kino.kz/'} : {}), ...(['Театр','Музей'].includes(category) ? { ticketon: 'https://ticketon.kz/astana' } : {}) }, osmTags: t };
});
// Wikidata's CC0 facts offer an independent, documented fallback when Overpass is busy.
if (wikiOnly) {
  try { places = JSON.parse(await readFile(new URL('collected-pois.json',dir),'utf8')); } catch { /* first collection */ }
  attempts.push({endpoint:'retained sourced snapshot',status:'retained',count:places.length});
}
if (!places.length && !wikiOnly) {
  const seeds = JSON.parse(await readFile(new URL('seeds.json', dir), 'utf8'));
  const found = [];
  for (let i = 0; i < seeds.length; i += 6) {
    await Promise.all(seeds.slice(i, i + 6).map(async (seed) => {
      try {
        const searchUrl = new URL('https://www.wikidata.org/w/api.php');
        searchUrl.search = new URLSearchParams({ action: 'wbsearchentities', search: seed.search, language: 'en', format: 'json', limit: '3' }).toString();
        const response = await fetch(searchUrl, { signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        for (const item of result.search ?? []) found.push({ id: item.id, seed });
      } catch (error) { attempts.push({ endpoint: 'Wikidata search', place: seed.name, status: 'failed', error: error.message }); }
    }));
  }
  const ids = [...new Set(found.map((item) => item.id))];
  if (ids.length) {
    try {
      const entityUrl = new URL('https://www.wikidata.org/w/api.php');
      entityUrl.search = new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims|labels|descriptions', languages: 'ru|en', format: 'json' }).toString();
      const response = await fetch(entityUrl, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();
      await writeFile(new URL('raw/wikidata.json', dir), JSON.stringify({ collectedAt, query: entityUrl.toString(), ...raw }, null, 2));
      const used = new Set();
      for (const { id, seed } of found) {
        const entity = raw.entities[id];
        // Search can find unrelated neighbouring businesses. Accept only a described city landmark.
        if (!/astana|nur.sultan|esil district/i.test(entity?.descriptions?.en?.value ?? '')) continue;
        const coordinate = entity?.claims?.P625?.find((claim) => claim.rank !== 'deprecated' && claim.mainsnak?.datavalue?.value)?.mainsnak.datavalue.value;
        if (!coordinate || coordinate.latitude < 51.02 || coordinate.latitude > 51.22 || coordinate.longitude < 71.30 || coordinate.longitude > 71.58 || used.has(seed.id)) continue;
        used.add(seed.id);
        places.push({ ...seed, search: undefined, lat: coordinate.latitude, lon: coordinate.longitude, image: '', sourceUrl: `https://www.wikidata.org/wiki/${id}`, sourceName: 'Wikidata · CC0 (координаты)', collectedAt, openingHours: seed.openingHours ?? null, rating: null, links: { twoGis: `https://2gis.kz/astana/search/${encodeURIComponent(seed.name)}`, ticketon: 'https://ticketon.kz/astana', kino: 'https://kino.kz/', sxodim: 'https://sxodim.com/astana' }, wikidataId: id, editorialSource: seed.editorialSource });
      }
      freshRecords += places.length;
      attempts.push({ endpoint: 'https://www.wikidata.org/w/api.php', status: 'success', count: places.length });
    } catch (error) { attempts.push({ endpoint: 'Wikidata entities', status: 'failed', error: error.message }); }
  }
}
// The public GeoSearch API provides exact page-linked coordinates and resolves ambiguous names.
// Titles are an explicit entity mapping, not fuzzy matches of unrelated nearby businesses.
const wikiTitles = {
  'Baiterek (monument)': 'baiterek', 'Nurzhol Boulevard': 'nurzhol', 'Khan Shatyr Entertainment Center': 'khan-shatyr',
  'MEGA Silk Way': 'mega-silk-way', 'Nur Alem': 'nur-alem', 'Nur Alem Museum': 'nur-alem', 'Nur Alem (museum)': 'nur-alem',
  'National Museum of the Republic of Kazakhstan': 'national-museum', 'Astana Botanical Garden': 'botanical-garden',
  'Astana Opera': 'astana-opera', 'Astana Ballet': 'astana-ballet', 'Palace of Peace and Reconciliation': 'peace-palace',
  'Hazrat Sultan Mosque': 'hazret-sultan', 'Astana Grand Mosque': 'grand-mosque', 'Mäñgılık El Triumphal Arch': 'triumphal-arch',
  'Gorky Russian Drama Theatre': 'gorky-theatre', 'Kenesary Khan Monument': 'kenesary', 'Kazakh Eli': 'kazakh-eli',
};
const discoveredPlaces = {
  'Jetisu Park': {name:'Парк Жетісу',category:'Парк',tags:['nature','family','photo'],durationMinutes:30},
  "Lovers' Park (Astana)": {name:'Парк влюблённых',category:'Парк',tags:['nature','photo','family'],durationMinutes:30},
  'Astana Triathlon Park': {name:'Триатлон-парк',category:'Парк',tags:['nature','photo','прогулка'],durationMinutes:35},
  'Presidential Park': {name:'Президентский парк',category:'Парк',tags:['nature','photo','family'],durationMinutes:35},
  'Demalys Promenade': {name:'Demalys Promenade',category:'Прогулка',tags:['photo','family','правый берег','прогулка'],durationMinutes:25},
  'Otan Qorgaushylar Monument': {name:'Монумент Отан қорғаушылар',category:'Монумент',tags:['culture','photo','история'],durationMinutes:20},
  'Döñgelek Square': {name:'Круглая площадь',category:'Прогулка',tags:['photo','прогулка','архитектура'],durationMinutes:20},
  'National Academic Library of the Republic of Kazakhstan': {name:'Национальная академическая библиотека',category:'Архитектура',tags:['culture','photo','архитектура'],durationMinutes:20},
  'Nur-Astana Mosque': {name:'Мечеть Нур-Астана',category:'Архитектура',tags:['culture','photo','архитектура'],durationMinutes:25},
};
try {
  const endpoint = 'https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=51.13%7C71.43&gsradius=10000&gslimit=50&format=json';
  const response = await fetch(endpoint, {signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const raw = await response.json();
  await writeFile(new URL('raw/wikipedia-geosearch.json',dir),JSON.stringify({endpoint,collectedAt,...raw},null,2));
  const seeds = JSON.parse(await readFile(new URL('seeds.json',dir),'utf8'));
  let added = 0;
  for (const item of raw.query?.geosearch ?? []) {
    const discovered = discoveredPlaces[item.title];
    const seed = seeds.find((seed) => seed.id === wikiTitles[item.title]) ?? (discovered ? {id:`wiki-${item.pageid}`,...discovered, description:discovered.category==='Парк' ? 'Городской парк для неспешной прогулки на свежем воздухе. Уточните доступность входов на карте.' : 'Место для короткого знакомства с архитектурой города с общественной улицы. Доступ внутрь здания не предполагается.',indoor:false,bank:item.lat<51.145?'left':'right',address:'Астана · координаты из Wikimedia',editorialSource:`https://en.wikipedia.org/?curid=${item.pageid}`} : null);
    if (!seed) continue;
    const record = { ...seed, search:undefined, lat:item.lat, lon:item.lon, image:'',sourceUrl:`https://en.wikipedia.org/?curid=${item.pageid}`, sourceName:'Wikimedia GeoSearch · координаты страницы',collectedAt,openingHours:seed.openingHours??null,rating:null,links:{twoGis:`https://2gis.kz/astana/search/${encodeURIComponent(seed.name)}`,ticketon:'https://ticketon.kz/astana',kino:'https://kino.kz/',sxodim:'https://sxodim.com/astana'},editorialSource:seed.editorialSource };
    places = places.filter((poi) => poi.id !== seed.id); places.push(record); added++;
  }
  attempts.push({endpoint:'Wikipedia GeoSearch',status:'success',count:added});
  freshRecords += added;
} catch(error) { attempts.push({endpoint:'Wikipedia GeoSearch',status:'failed',error:error.message}); }
let previousReport = null;
try { previousReport = JSON.parse(await readFile(new URL('collection-report.json',dir),'utf8')); } catch { /* first run */ }
if (!freshRecords) {
  try { places = JSON.parse(await readFile(new URL('collected-pois.json',dir),'utf8')); } catch { /* no snapshot */ }
}
if (places.length && freshRecords) await writeFile(new URL('collected-pois.json', dir), JSON.stringify(places, null, 2));
const report = { collectedAt:freshRecords ? collectedAt : previousReport?.collectedAt ?? null, lastAttemptAt:collectedAt, status:freshRecords ? 'success' : places.length ? 'using-retained-snapshot' : 'network-failed', source: elements.length ? 'OpenStreetMap / Overpass + Wikimedia' : 'Wikidata + Wikimedia GeoSearch', license: elements.length ? 'ODbL 1.0 — https://www.openstreetmap.org/copyright' : 'Wikidata facts CC0; Wikipedia metadata attribution via source links — https://www.wikidata.org/wiki/Wikidata:Licensing', query, count: places.length, freshRecords, attempts, notes: 'Collected coordinates are sourced facts. Descriptions, tags, bank and visit durations are editorial enrichment; bank is approximate. Each record retains its original collectedAt; a failed refresh never changes it. Ratings unavailable. Missing hours remain null. Commercial platform links are outbound searches, not API integrations. Existing successful snapshot is retained on network failure.' };
await writeFile(new URL('collection-report.json', dir), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!places.length) process.exitCode = 1;
