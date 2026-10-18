/** Download only explicit Commons photo identities with verified open-license metadata.
 * Refresh: node scripts/collect-photos.mjs. No commercial photo scraping or generic replacements.
 * Original files are not edited; Wikimedia thumbnails are displayed with a CSS cover crop.
 */
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),retrievedAt=new Date().toISOString();
const read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const write=async(path,data)=>writeFile(new URL(path,root),JSON.stringify(data,null,2)+'\n');
const targets=await read('data/photo-targets.json'),excluded=await read('data/photo-exclusions.json');
for(const item of excluded)delete targets[item.id];
let previous={};try{previous=await read('data/poi-photos.json');}catch{}
await mkdir(new URL('public/images/places/',root),{recursive:true});
const clean=s=>String(s??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/g,' ').trim();
const records={},failures=[],rawPages=[];
const filenames=[...new Set(Object.values(targets))];
for(let offset=0;offset<filenames.length;offset+=35){
 const api=new URL('https://commons.wikimedia.org/w/api.php');api.search=new URLSearchParams({action:'query',prop:'imageinfo',titles:filenames.slice(offset,offset+35).map(x=>`File:${x}`).join('|'),iiprop:'url|mime|extmetadata',iiurlwidth:'1000',format:'json'});
 const response=await fetch(api,{headers:{'User-Agent':'SeruenAstana/1.0 (open-license photo attribution)'},signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error(`Commons HTTP ${response.status}`);
 const data=await response.json();rawPages.push(...Object.values(data.query?.pages??{}));
}
await write('data/raw/commons-photo-metadata.json',{retrievedAt,pages:rawPages});
const byName=new Map(rawPages.map(p=>[p.title?.slice(5).replaceAll('_',' '),p]));
const entries=Object.entries(targets);let cursor=0;
async function worker(){while(cursor<entries.length){const [id,name]=entries[cursor++];try{
 const p=byName.get(name.replaceAll('_',' ')),info=p?.imageinfo?.[0],meta=info?.extmetadata;
 if(!info||!meta)throw new Error('Commons file not found');
 if(/NoFoP|Deletion requests|Disputed copyright|Copyvio/i.test(meta.Categories?.value??''))throw new Error('Commons rights warning: photo excluded');
 const license=clean(meta.LicenseShortName?.value),author=clean(meta.Artist?.value),licenseUrl=clean(meta.LicenseUrl?.value).replace(/^http:/,'https:');
 const allowed=/^(CC0|CC BY(?:-SA)? [1-4]\.0|Public domain)$/i.test(license)&&/^https:\/\/creativecommons\.org\/(licenses\/(by|by-sa)\/[1-4]\.0|publicdomain\/(zero|mark)\/1\.0)/i.test(licenseUrl);
 if(!allowed||!author||author.length>300)throw new Error(`Unaccepted/ambiguous license or author: ${license}`);
 if(!/^image\/(jpeg|png|webp)$/.test(info.mime))throw new Error(`Not a raster photo: ${info.mime}`);
 const source=new URL(info.descriptionurl);if(source.hostname!=='commons.wikimedia.org')throw new Error('Unexpected metadata source');
 const download=new URL(info.thumburl??info.url);if(!['upload.wikimedia.org','thumb.wikimedia.org'].includes(download.hostname))throw new Error('Unexpected image host');download.search='';
 const ext=info.mime==='image/png'?'png':info.mime==='image/webp'?'webp':'jpg',image=`/images/places/${id}.${ext}`,path=new URL(`public${image}`,root);
 let bytes;try{const old=previous[id];if(old?.imageSourceUrl===info.descriptionurl&&old?.imageLicense===license){await stat(path);bytes=await readFile(path);}}catch{}
 if(!bytes){const file=await fetch(download,{headers:{'User-Agent':'SeruenAstana/1.0'},signal:AbortSignal.timeout(20000)});if(!file.ok)throw new Error(`Image HTTP ${file.status}`);if(!file.headers.get('content-type')?.startsWith('image/'))throw new Error('Unexpected image content');bytes=Buffer.from(await file.arrayBuffer());if(bytes.length>8_000_000||bytes.length<1000)throw new Error('Unexpected image size');await writeFile(path,bytes);}
 records[id]={image,imageSourceUrl:info.descriptionurl,imageAuthor:author,imageLicense:license,imageLicenseUrl:licenseUrl,commonsFile:p.title,retrievedAt,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),changes:'Wikimedia-generated thumbnail; displayed with CSS cover crop; original unchanged',description:clean(meta.ImageDescription?.value)};
 console.log(`OK ${id} · ${license} · ${author}`);
 }catch(error){failures.push({id,file:name,error:error.message});if(previous[id]&&/HTTP|timeout|fetch failed/i.test(error.message)){try{await stat(new URL(`public${previous[id].image}`,root));records[id]=previous[id];}catch{}}console.error(`SKIP ${id}: ${error.message}`);}}}
await Promise.all([worker(),worker(),worker(),worker()]);
await write('data/poi-photos.json',records);
let credits=[];try{credits=await read('public/images/credits.json');}catch{}
credits=credits.filter(x=>!String(x.file).startsWith('places/'));
credits.push(...Object.entries(records).map(([poi,p])=>({poi,file:p.image.replace('/images/',''),author:p.imageAuthor,license:p.imageLicense,licenseUrl:p.imageLicenseUrl,source:p.imageSourceUrl,description:p.description,changes:p.changes,retrievedAt:p.retrievedAt,sha256:p.sha256})));
await write('public/images/credits.json',credits);
const all=new Set([...(await read('data/seeds.json')),...(await read('data/collected-pois.json'))].map(x=>x.id));
await write('data/photo-collection-report.json',{retrievedAt,source:'Wikimedia Commons imageinfo + extmetadata',status:failures.length?'partial':'success',targeted:entries.length,licensedPhotos:Object.keys(records).length,totalPlaces:all.size,missing:[...all].filter(id=>!records[id]),failures,excluded,notes:'Only explicitly selected matching files with CC0/CC BY/CC BY-SA metadata and an author field are retained. An unknown author is kept explicitly unknown, never invented. Sources/license links displayed in UI. Explicit Commons rights warnings are rejected; a photographer license alone does not guarantee all architectural or personality rights. No photo date asserted. Photos are archival views, not proof of current opening or appearance.'});
console.log(JSON.stringify({photos:Object.keys(records).length,total:all.size,failures}));
