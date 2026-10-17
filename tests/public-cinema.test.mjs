import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicCinemaPage, fetchPublicCinema } from '../lib/public-cinema.ts';
const sourceUrl='https://kz.kinoafisha.info/astana/movies/1234567/';
const now=Date.parse('2026-10-18T00:00:00+05:00');
const request={date:'2026-10-18',language:'ru',location:{lat:51.1283,lon:71.4306},sourceUrl,now};
function page({date='2026-10-18',blockDate=date,price='от 2 200 ₸',lat=51.12789,lon=71.42548,time='15:30',synopsis='A short fixture synopsis.'}={}){
 return `<script type="application/ld+json">${JSON.stringify([{ '@type':'Movie',name:'Fixture film',description:synopsis,image:{url:'https://static.kinoafisha.info/test.jpg'}},{'@type':'Event',startDate:date,offers:{lowPrice:100},location:[{name:'Fixture Cinema',url:'https://kz.kinoafisha.info/astana/cinema/7654321/',address:'Астана, ТРЦ Fixture Mall, 4 этаж',geo:{latitude:String(lat),longitude:String(lon)}}]}])}</script><article data-schedule-date="${blockDate}"><div class="showtimes_item" data-Schedule-item="Fixture Cinema"><button class="showtimes_session session"><span class="session_time">${time}</span><span class="session_price">${price}</span></button></div></article>`;
}
test('visible exact-date sessions join JSON-LD venue coordinates and retain per-session price',()=>{
 const [item]=parsePublicCinemaPage(page(),request);assert.equal(item.title,'Fixture film');assert.equal(item.startsAt,'2026-10-18T15:30:00+05:00');assert.equal(item.priceKzt,2200);assert.equal(item.priceIsFrom,true);assert.equal(item.mallName,'Fixture Mall');assert.equal(item.lat,51.12789);assert.ok(item.distanceMeters>0);assert.equal(item.sourceUrl,sourceUrl);assert.equal(item.bookingUrl,sourceUrl);
});
test('an exact year and matching visible date are mandatory',()=>{
 assert.deepEqual(parsePublicCinemaPage(page({date:'2025-10-18'}),request),[]);assert.deepEqual(parsePublicCinemaPage(page({blockDate:'2026-10-19'}),request),[]);assert.deepEqual(parsePublicCinemaPage(page(),{...request,date:'2026-10-19'}),[]);
});
test('foreign-city and invalid venue coordinates are excluded',()=>{
 assert.deepEqual(parsePublicCinemaPage(page({lat:43.25,lon:76.95}),request),[]);assert.deepEqual(parsePublicCinemaPage(page({lat:NaN}),request),[]);
});
test('unknown, ambiguous, or foreign-currency prices stay null instead of aggregate price or free',()=>{
 for(const price of ['', 'Цена неизвестна ₸','2000–4000 ₸','от 2000 ₽'])assert.equal(parsePublicCinemaPage(page({price}),request)[0].priceKzt,null);
 assert.equal(parsePublicCinemaPage(page({price:'0 ₸'}),request)[0].priceKzt,0);
 assert.equal(parsePublicCinemaPage(page({price:'2200 ₸'}),request)[0].priceIsFrom,false);
});
test('only verified explicitly named malls fill missing address mall metadata',()=>{
 for(const [name,mall] of [['Chaplin MEGA Silk Way','MEGA Silk Way'],['Chaplin Khan Shatyr','Хан Шатыр'],['Kinopark 6 Keruencity','Keruencity'],['Keruen Cinema',null],['Other Cinema',null]]){
  const html=page().replaceAll('Fixture Cinema',name).replace('Астана, ТРЦ Fixture Mall, 4 этаж','Астана, проспект Кабанбай батыра');
  assert.equal(parsePublicCinemaPage(html,request)[0].mallName,mall);
 }
});
test('past sessions, invalid times, and source paths outside Astana are excluded',()=>{
 assert.deepEqual(parsePublicCinemaPage(page({time:'24:30'}),request),[]);assert.deepEqual(parsePublicCinemaPage(page(),{...request,now:Date.parse('2026-10-18T16:00:00+05:00')}),[]);assert.deepEqual(parsePublicCinemaPage(page(),{...request,sourceUrl:'https://kz.kinoafisha.info/almaty/movies/1234567/'}),[]);
});
test('public retrieval checks robots and discovers film pages without sending location',async()=>{
 const calls=[];const fetcher=async (url,init)=>{assert.equal(init.redirect,'manual');calls.push(String(url));return new Response(String(url).endsWith('/robots.txt')?'User-agent: *\nDisallow: /*?\n':String(url).endsWith('/astana/movies/')?`<a href="${sourceUrl}#submenu">Film</a>`:page());};
 const data=await fetchPublicCinema(request,{now,fetcher});assert.equal(data.status,'live');assert.equal(data.items.length,1);assert.equal(data.sourceUpdatedAt,null);assert.equal(data.retrievedAt,new Date(now).toISOString());assert.match(data.source,/агрегатор/);assert.ok(calls.every(url=>!url.includes('51.1283')&&!url.includes('?')));
});
test('robots restrictions and failed fetches never produce fabricated sessions',async()=>{
 let count=0;const blocked=await fetchPublicCinema(request,{now,fetcher:async()=>{count++;return new Response('User-agent: *\nDisallow: /\n');}});assert.equal(blocked.status,'unconfigured');assert.equal(count,1);assert.deepEqual(blocked.items,[]);
 const failed=await fetchPublicCinema(request,{now,fetcher:async()=>new Response('unavailable',{status:503})});assert.equal(failed.status,'error');assert.deepEqual(failed.items,[]);
});
test('missing movie synopsis retains independently grounded sessions with an honest metadata fallback',()=>{
 const html=page().replace('"description":"A short fixture synopsis.",','');
 for(const language of ['ru','kk','en']){
  const items=parsePublicCinemaPage(html,{...request,language});assert.equal(items.length,1);assert.equal(items[0].priceKzt,2200);assert.equal(items[0].startsAt,'2026-10-18T15:30:00+05:00');assert.ok(items[0].synopsis.length>10);
  assert.ok(!items[0].synopsis.includes('A short fixture synopsis'));
 }
 const withGenres=html.replace('"name":"Fixture film",','"name":"Fixture film","genre":["боевик","драма"],');
 assert.ok(parsePublicCinemaPage(withGenres,request)[0].synopsis.includes('боевик, драма'));
});
test('all fetched films remain eligible when only one publishes a plot description',async()=>{
 const second='https://kz.kinoafisha.info/astana/movies/1234568/';
 const data=await fetchPublicCinema(request,{now,fetcher:async url=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\nDisallow: /*?\n':String(url).endsWith('/astana/movies/')?`<a href="${sourceUrl}">One</a><a href="${second}">Two</a>`:String(url)===sourceUrl?page():page().replace('"description":"A short fixture synopsis.",','').replace('Fixture film','Second film'))});
 assert.equal(data.status,'live');assert.equal(data.items.length,2);assert.deepEqual(new Set(data.items.map(item=>item.title)),new Set(['Fixture film','Second film']));
});
test('future exact-date sections are accepted only inside a bounded published event run',()=>{
 const html=page({blockDate:'2026-10-19'}).replace('"startDate":"2026-10-18",','"startDate":"2026-10-18","endDate":"2026-10-21",');
 assert.equal(parsePublicCinemaPage(html,{...request,date:'2026-10-19'}).length,1);
 assert.deepEqual(parsePublicCinemaPage(html.replace('"endDate":"2026-10-21"','"endDate":"2026-10-18"'),{...request,date:'2026-10-19'}),[]);
 assert.deepEqual(parsePublicCinemaPage(html.replace('"startDate":"2026-10-18"','"startDate":"2025-10-18"'),{...request,date:'2026-10-19'}),[]);
 assert.deepEqual(parsePublicCinemaPage(html.replace('data-schedule-date="2026-10-19"','data-schedule-date="2026-10-20"'),{...request,date:'2026-10-19'}),[]);
});
