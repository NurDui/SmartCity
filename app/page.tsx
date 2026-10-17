"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Bookmark, Check, ChevronDown, CloudSun, Compass, ExternalLink, Footprints, Heart, Info, Leaf, LoaderCircle, LocateFixed, MapPin, Navigation, ShieldCheck, SlidersHorizontal, Snowflake, Sparkles, Sun, Wind, X } from "lucide-react";
import type { Mood, POI, RecommendRequest, RecommendResponse } from "@/lib/types";

const STARTS = [
  { id: "expo", label: "EXPO · у сферы Нұр Әлем", lat: 51.089, lon: 71.416 },
  { id: "baiterek", label: "Бәйтерек · бульвар Нуржол", lat: 51.1283, lon: 71.4306 },
  { id: "river", label: "Набережная · у Кенесары", lat: 51.1666, lon: 71.4297 },
  { id: "botanical", label: "Ботанический сад", lat: 51.106, lon: 71.416 },
  { id: "mega", label: "MEGA Silk Way", lat: 51.08909, lon: 71.40733 },
];
const MOODS: { id: Mood; label: string; icon: string }[] = [
  { id: "any", label: "Удивите меня", icon: "✦" }, { id: "nature", label: "На природу", icon: "♧" },
  { id: "culture", label: "Культура", icon: "◈" }, { id: "coffee", label: "За кофе", icon: "☕" },
  { id: "family", label: "С детьми", icon: "☺" }, { id: "photo", label: "Красивые виды", icon: "◎" },
];
const PARTNERS = [
  { name: "2ГИС", detail: "Маршруты и часы работы", href: "https://2gis.kz/astana", mark: "2", color: "#7dad40" },
  { name: "Ticketon", detail: "Билеты на события", href: "https://ticketon.kz/astana", mark: "t", color: "#e56253" },
  { name: "kino.kz", detail: "Афиша кинотеатров", href: "https://kino.kz/", mark: "k", color: "#eeaa3b" },
  { name: "Давай Сходим", detail: "Идеи и события Астаны", href: "https://sxodim.com/astana", mark: "с", color: "#8474aa" },
];

function Illustration({ poi }: { poi: POI }) {
  const park = poi.tags.includes("nature") || poi.category === "Парк";
  const sphere = poi.id === "nur-alem";
  const tower = poi.id === "baiterek";
  const cafe = poi.category === "Кофейня";
  return <svg className="place-illustration" viewBox="0 0 400 180" aria-hidden="true">
    <defs><linearGradient id={`sky-${poi.id}`} x2="0" y2="1"><stop stopColor={park ? "#e0e7d6" : "#e9e6d9"}/><stop offset="1" stopColor="#f4f1e8"/></linearGradient></defs>
    <rect width="400" height="180" fill={`url(#sky-${poi.id})`}/><circle cx="319" cy="40" r="23" fill="#e2b66d" opacity=".65"/>
    <path d="M0 157Q80 131 160 153T400 146V180H0" fill={park ? "#a2b493" : "#cccfbc"}/>
    {sphere ? <><circle cx="200" cy="99" r="63" fill="#779c9c"/><path d="M139 81h122M139 117h122M200 36v126M160 51q-35 48 0 98M240 51q35 48 0 98M169 41q-17 58 0 117M231 41q17 58 0 117" fill="none" stroke="#d7e2d9" opacity=".75"/><rect x="155" y="157" width="90" height="8" fill="#385d57"/></> : tower ? <><path d="m174 153 13-69h26l13 69M181 118h38M184 102h32" fill="none" stroke="#f8faf3" strokeWidth="6"/><path d="m188 87-14-19m38 19 14-19M200 86V64" stroke="#f8faf3" strokeWidth="5"/><circle cx="200" cy="49" r="28" fill="#c9a557"/><path d="M174 49h52M200 22v55" stroke="#b78e3c" fill="none"/><rect x="168" y="153" width="64" height="8" fill="#64826d"/></> : park ? <>{[85,135,210,270,320].map((x,i)=><g key={x}><path d={`M${x} 153V${86+i%2*18}`} stroke="#68816c" strokeWidth="5"/><ellipse cx={x} cy={84+i%2*18} rx={26+i%3*4} ry="38" fill={["#6b8f70","#8ea578","#b2bc8f"][i%3]}/></g>)}<path d="M153 180q29-47 76-43" stroke="#ece9da" strokeWidth="18" fill="none"/></> : cafe ? <><path d="M155 72h81v57q0 30-40 30t-41-30Z" fill="#fbf6e7"/><path d="M236 82q40 0 29 34-7 19-31 18" stroke="#fbf6e7" strokeWidth="10" fill="none"/><path d="M173 55q-10-11 0-23m22 23q-10-11 0-23m22 23q-10-11 0-23" stroke="#a5b2a1" strokeWidth="3" fill="none"/><ellipse cx="195" cy="73" rx="40" ry="8" fill="#826b53"/></> : <><path d="M117 150V81l83-43 83 43v69" fill="#b7c5b8"/><path d="m111 81 89-45 89 45Z" fill="#648576"/><path d="M135 87v62m32-62v62m33-62v62m33-62v62m32-62v62" stroke="#e8eadb" strokeWidth="10"/><rect x="107" y="150" width="186" height="10" fill="#8d9f8c"/></>}
    <path d="M30 167h70m205 0h65" stroke="#7c957c" strokeWidth="2" opacity=".4"/>
  </svg>;
}

function CityMap({ places, location, selected, onSelect, result }: { places: POI[]; location: {lat:number;lon:number;label?:string}; selected: string | null; onSelect: (id:string)=>void; result: RecommendResponse | null }) {
  const [zoom, setZoom] = useState(1);
  const featured = result ? result.recommendations.map(r=>r.poi) : places.filter(p=>["baiterek","nur-alem","mega-silk-way","botanical-garden","khan-shatyr","embankment","national-museum"].includes(p.id));
  const points = [...featured, location];
  const minLat = Math.min(...points.map(p=>p.lat))-.008, maxLat = Math.max(...points.map(p=>p.lat))+.008;
  const minLon = Math.min(...points.map(p=>p.lon))-.018, maxLon = Math.max(...points.map(p=>p.lon))+.018;
  const project = (p:{lat:number;lon:number})=>({x:70+(p.lon-minLon)/(maxLon-minLon)*690, y:55+(maxLat-p.lat)/(maxLat-minLat)*330});
  const origin = project(location);
  return <div className="map-panel">
    <div className="map-top"><div className="map-label"><span className="live-dot"/> АСТАНА <span>/</span> ДВА БЕРЕГА, МНОГО ИСТОРИЙ</div><Compass size={23}/></div>
    <svg viewBox="0 0 830 460" className="map-svg" role="img" aria-label="Схема расположения мест в Астане. Не является навигационной картой.">
      <defs><pattern id="blocks" width="82" height="65" patternUnits="userSpaceOnUse" patternTransform="rotate(-22)"><rect x="8" y="8" width="64" height="47" rx="7" fill="#d9dfd0" opacity=".5"/><path d="M0 0H82V65" fill="none" stroke="#fcfaf1" strokeWidth="8"/></pattern></defs>
      <rect width="830" height="460" fill="#e9eddf"/><rect width="830" height="460" fill="url(#blocks)"/>
      <g transform={`translate(${415*(1-zoom)} ${230*(1-zoom)}) scale(${zoom})`}>
        <path d="M-35 123C125 75 173 212 329 164S536 101 595 165 735 223 865 174" fill="none" stroke="#b6d6d1" strokeWidth="36"/>
        <path d="M-35 123C125 75 173 212 329 164S536 101 595 165 735 223 865 174" fill="none" stroke="#d3e6dd" strokeWidth="2"/>
        <path d="M100 450 380 25M440 460 630 0M-30 335 850 72M0 416 830 298" stroke="#fcfaf1" strokeWidth="13" fill="none"/>
        <path d="M100 450 380 25M440 460 630 0M-30 335 850 72M0 416 830 298" stroke="#d2d6c5" strokeWidth="1" fill="none"/>
        <ellipse cx="520" cy="320" rx="72" ry="42" fill="#c3d2ad" transform="rotate(-23 520 320)"/>
        <ellipse cx="104" cy="79" rx="65" ry="30" fill="#c7d6b3"/>
        <text x="433" y="137" fill="#6e9e97" fontSize="12" letterSpacing="4" transform="rotate(-10 433 137)">ЕСИЛЬ</text>
        {result && featured.map((p,i)=>{const xy=project(p);return <path key={p.id} d={`M${origin.x} ${origin.y}Q${(origin.x+xy.x)/2+18} ${(origin.y+xy.y)/2-20} ${xy.x} ${xy.y}`} stroke="#527764" strokeWidth="2" strokeDasharray="5 6" opacity=".6" fill="none"/>;})}
        {featured.map((p,i)=>{const xy=project(p);const active=selected===p.id;return <g key={p.id} transform={`translate(${xy.x} ${xy.y})`} role="button" tabIndex={0} aria-label={`Показать ${p.name}`} onClick={()=>onSelect(p.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(p.id);}}} style={{cursor:"pointer"}}>
          <circle r={active?25:21} fill={active?"#daa55a":"#244d3f"} stroke="#faf9f0" strokeWidth="5"/><text textAnchor="middle" dy="5" fontSize="14" fontWeight="600" fill="white">{result?i+1:"✦"}</text>
          <rect x="-76" y="29" width="152" height="26" rx="6" fill="#fffdf5" opacity=".94"/><text textAnchor="middle" y="46" fontSize="11" fill="#355342">{p.name.length>23?p.name.slice(0,22)+"…":p.name}</text>
        </g>;})}
        <g transform={`translate(${origin.x} ${origin.y})`}><circle r="23" fill="#d3a75f" opacity=".2"/><circle r="10" fill="#cf9a48" stroke="white" strokeWidth="4"/><rect x="-39" y="-42" width="78" height="24" rx="6" fill="#fffdf5"/><text textAnchor="middle" y="-26" fill="#765c32" fontSize="11">Вы здесь</text></g>
      </g>
      {!featured.length&&<text x="415" y="250" textAnchor="middle" fill="#355342">Подходящих мест в этих условиях нет</text>}
    </svg>
    <div className="map-footer"><span className="map-legend"><i/> Места <i/> Точка старта <small>Схема · расстояния ориентировочные</small></span><div className="map-zoom"><button aria-label="Уменьшить схему" onClick={()=>setZoom(v=>Math.max(1,v-.2))}>−</button><button aria-label="Увеличить схему" onClick={()=>setZoom(v=>Math.min(1.6,v+.2))}>+</button></div></div>
  </div>;
}

export default function Home() {
  const [places, setPlaces] = useState<POI[]>([]);
  const [catalogueError,setCatalogueError]=useState("");
  const [start,setStart]=useState("expo");
  const [deviceLocation,setDeviceLocation]=useState<{lat:number;lon:number;label:string}|null>(null);
  const [duration,setDuration]=useState(90);
  const [mood,setMood]=useState<Mood>("any");
  const [query,setQuery]=useState("");
  const [weatherMode,setWeatherMode]=useState<RecommendRequest["weatherMode"]>("summer");
  const [indoorOnly,setIndoorOnly]=useState(false);
  const [result,setResult]=useState<RecommendResponse|null>(null);
  const [busy,setBusy]=useState(false);
  const [locating,setLocating]=useState(false);
  const [error,setError]=useState("");
  const [selected,setSelected]=useState<string|null>(null);
  const [browseAll,setBrowseAll]=useState(false);
  const [saved,setSaved]=useState<string[]>([]);
  const [storageReady,setStorageReady]=useState(false);
  const [modal,setModal]=useState<"how"|"saved"|"settings"|null>(null);
  const [toast,setToast]=useState("");
  const resultsRef=useRef<HTMLElement>(null);
  const modalRef=useRef<HTMLDivElement>(null);
  const lastFocus=useRef<HTMLElement|null>(null);
  const location=deviceLocation&&start==="device"?deviceLocation:STARTS.find(s=>s.id===start)??STARTS[0];

  useEffect(()=>{const controller=new AbortController();fetch("/api/places",{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error();return r.json() as Promise<{places:POI[]}>;}).then(data=>{if(!Array.isArray(data.places))throw new Error();setPlaces(data.places);}).catch(e=>{if(e.name!=="AbortError")setCatalogueError("Не удалось загрузить каталог. Обновите страницу.");});return()=>controller.abort();},[]);
  useEffect(()=>{try{const value=JSON.parse(localStorage.getItem("qadam-saved")??"[]");if(Array.isArray(value))setSaved(value.filter((v:unknown)=>typeof v==="string").slice(0,100));}catch{}setStorageReady(true);},[]);
  useEffect(()=>{if(storageReady)try{localStorage.setItem("qadam-saved",JSON.stringify(saved));}catch{}},[saved,storageReady]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),2800);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{
    if(!modal)return;
    lastFocus.current=document.activeElement as HTMLElement;
    const before=document.body.style.overflow;document.body.style.overflow="hidden";
    const focusable=()=>Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex="0"]')??[]).filter(e=>!e.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const handler=(e:KeyboardEvent)=>{if(e.key==="Escape")setModal(null);if(e.key==="Tab"){const items=focusable();if(!items.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
    document.addEventListener("keydown",handler);return()=>{document.removeEventListener("keydown",handler);document.body.style.overflow=before;lastFocus.current?.focus();};
  },[modal]);

  function toggleSave(id:string){setSaved(current=>current.includes(id)?current.filter(v=>v!==id):[...current,id]);setToast(saved.includes(id)?"Место удалено из избранного":"Сохранено для будущей прогулки");}
  function locate(){
    setError("");if(!navigator.geolocation){setError("Браузер не поддерживает геолокацию. Выберите точку из списка.");return;}
    setLocating(true);navigator.geolocation.getCurrentPosition(position=>{
      const {latitude:lat,longitude:lon}=position.coords;setLocating(false);
      if(lat<50.9||lat>51.35||lon<71.15||lon>71.8){setError("Демо работает в Астане. Выберите одну из стартовых точек.");return;}
      setDeviceLocation({lat,lon,label:"Моя геолокация"});setStart("device");setResult(null);
    },()=>{setLocating(false);setError("Геолокация недоступна. Выберите стартовую точку вручную.");},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
  }
  async function recommend(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError("");setSelected(null);
    try{const response=await fetch("/api/recommend",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query,location:{lat:location.lat,lon:location.lon,label:location.label},durationMinutes:duration,mood,weatherMode,indoorOnly}),signal:AbortSignal.timeout(25000)});const data=await response.json() as RecommendResponse & {error?:string};if(!response.ok)throw new Error(data.error||"Не удалось подобрать прогулку.");if(!Array.isArray(data.recommendations))throw new Error("Сервис вернул некорректный ответ.");setResult(data);setSelected(data.recommendations[0]?.poi.id??null);setTimeout(()=>resultsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),80);}catch(e){setError(e instanceof Error&&e.name!=="TimeoutError"?e.message:"Сервис не ответил вовремя. Попробуйте ещё раз.");}finally{setBusy(false);}
  }
  const reset=()=>setResult(null);
  const shown=result?result.recommendations.map(r=>r.poi):browseAll?places:["nur-alem","botanical-garden","baiterek"].map(id=>places.find(p=>p.id===id)).filter((p):p is POI=>Boolean(p));
  const visibleWeather=result?.weather??(weatherMode==="winter"?{temperature:-25,feelsLike:-33,windKmh:32,isDemo:true,description:"Зимний сценарий"}:weatherMode==="summer"?{temperature:24,feelsLike:25,windKmh:10,isDemo:true,description:"Летний сценарий"}:null);
  function selectMapPlace(id:string){setSelected(id);document.getElementById(`place-${id}`)?.scrollIntoView({behavior:"smooth",block:"center"});}

  return <div className="qadam-app">
    <a className="skip-link" href="#planner">Перейти к подбору прогулки</a>
    <header className="site-header">
      <a href="#" className="brand" aria-label="Qadam — в начало"><span className="brand-mark"><Footprints size={24}/></span><span><span className="brand-name">qadam<span>·</span></span><span className="brand-sub">ВАШ ГОРОД. ВАШ ШАГ.</span></span></a>
      <nav className="nav-links" aria-label="Основная навигация"><a href="#planner" className="nav-active">Найти прогулку</a><a href="#places" onClick={()=>setResult(null)}>Места Астаны</a><button onClick={()=>setModal("how")}>Как это работает <ArrowRight size={13}/></button></nav>
      <div className="header-actions"><button className="icon-button" aria-label="Настройки и приватность" onClick={()=>setModal("settings")}><SlidersHorizontal size={19}/></button><button className="saved-button" onClick={()=>setModal("saved")}><Bookmark size={16}/> Избранное <span>{saved.length}</span></button></div>
    </header>
    <main className="main-shell">
      <section className="hero"><div className="eyebrow"><span/> АСТАНА, КАЗАХСТАН <span className="eyebrow-line"/> МАЛЕНЬКИЕ ОТКРЫТИЯ КАЖДЫЙ ДЕНЬ</div><h1 className="hero-title">Астана. <em>В вашем ритме.</em><span className="hero-flower" aria-hidden="true">✳</span></h1><div className="hero-bottom"><p className="hero-copy">Свободный час — уже маленькое путешествие.<br/>Найдите своё место, а о погоде и расстояниях подумаем мы.</p><div className="hero-note"><ShieldCheck size={20}/><span>Сначала реальные места.<br/><b>Потом — немного вдохновения.</b></span></div></div></section>
      <div className="workspace">
        <form id="planner" className="planner" onSubmit={recommend}>
          <div className="section-top"><span className="section-number">01 / ВАША ПРОГУЛКА</span><Footprints size={19}/></div>
          <h2>Куда сегодня?</h2><p className="planner-intro">Несколько деталей — и город станет ближе.</p>
          <label className="field-label" htmlFor="location">Откуда начнём?</label><div className="location-row"><div className="location-select"><MapPin size={17}/><select id="location" value={start} onChange={e=>{setStart(e.target.value);reset();}}>{STARTS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}{deviceLocation&&<option value="device">Моя геолокация</option>}</select><ChevronDown size={14}/></div><button type="button" className="locate-button" aria-label="Использовать мою геолокацию" onClick={locate} disabled={locating}>{locating?<LoaderCircle className="loading-spinner" size={19}/>:<LocateFixed size={19}/>}</button></div>
          <p className="privacy-hint"><ShieldCheck size={12}/> Геолокация по желанию. Историю не храним.</p>
          <label className="field-label">Сколько у вас времени? <span>с учётом дороги</span></label><div className="duration-pills" role="group" aria-label="Время прогулки">{[30,60,90,120].map(v=><button key={v} type="button" className={`pill ${duration===v?"selected":""}`} aria-pressed={duration===v} onClick={()=>{setDuration(v);reset();}}>{v===120?"2 часа":`${v} мин`}</button>)}</div>
          <label className="field-label">Какое настроение?</label><div className="mood-grid" role="group" aria-label="Интересы">{MOODS.map(item=><button type="button" key={item.id} className={`mood-chip ${mood===item.id?"selected":""}`} aria-pressed={mood===item.id} onClick={()=>{setMood(item.id);reset();}}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</div>
          <label className="field-label" htmlFor="request">Или расскажите своими словами</label><textarea className="request-input" id="request" placeholder="Например: тихое место для кофе или что-то интересное с ребёнком…" value={query} maxLength={1000} onChange={e=>{setQuery(e.target.value);reset();}} rows={3}/>
          <label className="indoor-row"><span><span>Только в помещении</span><small>Когда хочется тепла и уюта</small></span><input type="checkbox" checked={indoorOnly} onChange={e=>{setIndoorOnly(e.target.checked);reset();}}/><span className={`switch ${indoorOnly?"switch-on":""}`} aria-hidden="true"/></label>
          <div className="weather-card"><div className="weather-main"><span className="weather-icon">{weatherMode==="winter"?<Snowflake size={25}/>:<CloudSun size={27}/>}</span><div><b>{visibleWeather?`${visibleWeather.temperature>0?"+":""}${visibleWeather.temperature}°` : "Погода сейчас"}</b><span>{visibleWeather?`Ощущается ${visibleWeather.feelsLike}° · ветер ${visibleWeather.windKmh} км/ч`:"Загрузим при подборе"}</span></div><small>{visibleWeather?.isDemo?"ДЕМО":visibleWeather?"LIVE":""}</small></div><div className="weather-tabs" role="group" aria-label="Погодный сценарий">{([{id:"live",text:"Сейчас"},{id:"summer",text:"Лето · демо"},{id:"winter",text:"Зима · демо"}] as const).map(w=><button key={w.id} type="button" className={`weather-tab ${weatherMode===w.id?"active":""}`} aria-pressed={weatherMode===w.id} onClick={()=>{setWeatherMode(w.id);reset();}}>{w.text}</button>)}</div></div>
          {(error||catalogueError)&&<div className="error-message" role="alert">{error||catalogueError}</div>}
          <button type="submit" className="primary-button" disabled={busy||!places.length}>{busy?<><LoaderCircle className="loading-spinner" size={19}/> Ищем ваш ритм…</>:<><Sparkles size={18}/> Найти мою прогулку <ArrowRight size={19}/></>}</button><p className="form-footnote">Без регистрации. С уважением к вашему времени.</p>
        </form>
        <div className="canvas-column"><CityMap places={places} location={location} selected={selected} onSelect={selectMapPlace} result={result}/><div className="explore-strip"><img src="/images/astana-esil.jpg" className="strip-photo" alt="Вид на Левый берег Астаны с набережной Есиля"/><div className="strip-content"><span className="strip-kicker">ГОРОД БОЛЬШЕ, ЧЕМ КАЖЕТСЯ</span><h3 className="strip-title">Два берега.<br/><em>Тысяча поводов выйти.</em></h3><a className="strip-link" href="#places">Открыть места Астаны <ArrowRight size={16}/></a></div><span className="strip-index">51° N<br/>71° E</span></div></div>
      </div>
      <section className="results-section" id="places" ref={resultsRef} aria-live="polite" aria-busy={busy}>
        <div className="results-heading"><div><div className="section-number">02 / {result?"ВАШИ МАЛЕНЬКИЕ ОТКРЫТИЯ":"ЗНАКОМСТВО С ГОРОДОМ"}</div><h2>{result?"Есть повод выйти.":"У каждого места — свой ритм."}</h2><p>{result?result.summary:"Несколько идей из каталога. Подберите прогулку, чтобы учесть свои условия."}</p></div><span className="result-meta">{result?<span className="mode-badge"><span/> {result.mode==="llm"?"RAG + LLM":"Поиск + шаблон"}</span>:<><Compass size={18}/> {places.length||"…"} места в каталоге</>}</span></div>
        {result&&<div className="warnings">{result.context.indoorRequired&&<p className="warning-item"><ShieldCheck size={16}/><span>{result.warnings.find(w=>w.startsWith("Неблагоприятная"))??"Показаны только варианты в помещении."}</span></p>}<p className="warning-item"><Info size={15}/><span>Выберите одно место: рекомендации — альтернативы. Путь и время посещения приблизительные.</span></p><details className="recommendation-notes"><summary>Условия подбора и ограничения</summary>{result.warnings.map((w,i)=><p key={i}>{w}</p>)}</details></div>}
        {result&&!shown.length&&<div className="empty-state"><Compass size={40}/><h3>В этих условиях подходящего места нет</h3><p>Попробуйте другую точку старта или больше времени. В мороз выбирайте транспорт до помещения.</p><a href="#planner" className="card-link">Изменить условия <ArrowRight size={16}/></a></div>}
        <div className="places-grid">{shown.map((poi,index)=>{const rec=result?.recommendations.find(r=>r.poi.id===poi.id);const coordinateSource=(poi as POI&{coordinateSourceUrl?:string}).coordinateSourceUrl;return <article id={`place-${poi.id}`} className={`place-card ${selected===poi.id?"place-selected":""}`} key={poi.id}>
          <div className="place-art"><Illustration poi={poi}/><span className="category-chip">{rec?`${index+1} · `:""}{poi.category}</span><button className={`card-save ${saved.includes(poi.id)?"is-saved":""}`} aria-label={`${saved.includes(poi.id)?"Удалить из избранного":"Сохранить"} ${poi.name}`} aria-pressed={saved.includes(poi.id)} onClick={()=>toggleSave(poi.id)}><Bookmark size={18} fill={saved.includes(poi.id)?"currentColor":"none"}/></button><span className="art-caption">ИЛЛЮСТРАЦИЯ</span></div>
          <div className="card-body"><div className="card-eyebrow">{poi.bank==="right"?"ПРАВЫЙ БЕРЕГ":"ЛЕВЫЙ БЕРЕГ"} <span>·</span> {poi.indoor?"В ПОМЕЩЕНИИ":"НА ВОЗДУХЕ"}</div><h3 className="card-title">{poi.name}</h3><p className="place-description">{poi.description}</p><div className="place-meta"><span><Footprints size={14}/>{rec?`~${rec.walkMinutes} мин пешком`:poi.bank==="right"?"Старый город":"Современный город"}</span><span>◷ {rec?.visitMinutes??poi.durationMinutes} мин на визит</span></div>
          {rec&&<><div className="why-box"><b>Почему вам подойдёт</b><p>{rec.why}</p></div><div className="actions-label">ЧТО ДЕЛАТЬ</div><ol className="actions-list">{rec.actions.map((a,i)=><li key={i}>{a}</li>)}</ol></>}
          <details className="card-details"><summary>Часы, адрес и достоверность <ChevronDown size={13}/></summary><p><b>Адрес:</b> {poi.address}</p><p><b>Часы:</b> {poi.openingHours??"Нет подтверждённых данных — уточните перед визитом"}</p><p><b>Рейтинг:</b> {poi.rating===null?"Нет данных":poi.rating}</p><p><b>Источник:</b> {rec?.sourceLabel??poi.sourceName}</p><p><b>Дата записи:</b> {new Date(poi.collectedAt).toLocaleDateString("ru-RU",{timeZone:"Asia/Almaty"})}</p><div className="source-links"><a href={poi.sourceUrl} target="_blank" rel="noreferrer">Описание <ExternalLink size={12}/></a>{coordinateSource&&<a href={coordinateSource} target="_blank" rel="noreferrer">Координаты <ExternalLink size={12}/></a>}</div></details>
          <div className="card-footer"><a className="card-link" href={poi.links.twoGis} target="_blank" rel="noreferrer">Открыть в 2ГИС <ArrowRight size={15}/></a><span>{poi.tags.includes("nature")?<Leaf size={16}/>:<Navigation size={16}/>}</span></div></div>
        </article>;})}</div>
        {!result&&places.length>0&&<p className="catalogue-note">{browseAll?`Все ${places.length} места из каталога. `:"Показаны 3 редакционные идеи. "}Персональные рекомендации появятся после подбора. <button className="card-link" onClick={()=>setBrowseAll(v=>!v)}>{browseAll?"Показать подборку":"Посмотреть весь каталог"} <ArrowRight size={14}/></button></p>}
      </section>
      <section className="partners-section"><div className="partners-header"><span className="section-number">ЗНАКОМЫЕ СЕРВИСЫ, СЛЕДУЮЩИЙ ШАГ</span><p>Маршруты, билеты и события — у тех, кто знает детали.</p></div><div className="partner-grid">{PARTNERS.map(p=><a key={p.name} className="partner-link" href={p.href} target="_blank" rel="noreferrer"><span className="partner-mark" style={{background:p.color}}>{p.mark}</span><span><b>{p.name}</b><small>{p.detail}</small></span><ExternalLink size={15}/></a>)}</div><p className="partners-note">Внешние ссылки. Актуальная афиша, билеты и режим работы проверяются на стороне сервиса.</p></section>
    </main>
    <footer className="site-footer"><a href="#" className="brand-name">qadam<span>·</span></a><span>Шаг за шагом — ближе к городу.</span><div><button onClick={()=>setModal("settings")}>Приватность</button><button onClick={()=>setModal("how")}>О проекте</button><span>СДЕЛАНО ДЛЯ АСТАНЫ ↗</span></div></footer>
    {toast&&<div className="toast" role="status"><Check size={17}/>{toast}</div>}
    {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><span className="section-number">QADAM / ГОРОДСКОЙ ПОМОЩНИК</span><button className="modal-close icon-button" aria-label="Закрыть окно" onClick={()=>setModal(null)}><X size={21}/></button></div><div className="modal-body"><h2 id="modal-title">{modal==="saved"?"На следующую прогулку.":modal==="settings"?"Ваша локация — ваш выбор.":"Реальные места. Понятные советы."}</h2>
      {modal==="saved"?<><p>Сохранённые места хранятся в этом браузере. Только идентификаторы, без истории локаций.</p><div className="saved-list">{saved.length===0?<div className="empty-state"><Bookmark size={30}/><h3>Пока здесь тихо</h3><p>Нажмите закладку на карточке понравившегося места.</p></div>:saved.map(id=>{const poi=places.find(p=>p.id===id);return <div className="saved-item" key={id}><div><b>{poi?.name??"Место из предыдущей версии каталога"}</b><small>{poi?.category??id}</small></div>{poi&&<a href={poi.links.twoGis} target="_blank" rel="noreferrer" aria-label={`Открыть ${poi.name} в 2ГИС`}><ExternalLink size={17}/></a>}<button className="icon-button" aria-label={`Удалить ${poi?.name??id}`} onClick={()=>toggleSave(id)}><X size={17}/></button></div>;})}</div></>:modal==="settings"?<><div className="modal-section"><ShieldCheck size={24}/><h3>Без геолокации всё работает</h3><p>Выберите знакомую стартовую точку. Браузер запросит доступ к местоположению только по кнопке с прицелом.</p></div><div className="modal-section"><h3>Что получает сервер</h3><p>Текст запроса, выбранную точку, время и фильтры. Точные координаты не записываются приложением в базу, историю или localStorage. Избранное хранит только ID мест.</p><p>Open-Meteo получает координаты, округлённые до сотых градуса. LLM получает найденные публичные места и разрешённые предпочтения; исходный запрос и точная локация ей не передаются. Список мест может косвенно указывать район.</p></div><div className="modal-section"><h3>Что нужно помнить</h3><p>Хостинг и внешние сервисы могут обрабатывать технические журналы. Схема не учитывает входы, переходы и доступность. Перед выходом проверьте часы и фактический путь.</p></div><button className="card-link" onClick={()=>{setDeviceLocation(null);if(start==="device")setStart("expo");setResult(null);setToast("Геолокация удалена из текущей сессии");setModal(null);}}>Сбросить мою геолокацию <ArrowRight size={16}/></button></>:<><p>qadam помогает выбрать 1–3 места рядом с собой и провести свободное время в своём темпе. Это прототип первой задачи хакатона Build with AI.</p><div className="architecture-flow"><span>Открытые данные</span><ArrowRight size={17}/><span>Поиск + ограничения</span><ArrowRight size={17}/><span>Проверенный ответ</span></div><div className="modal-section"><h3>Сначала поиск, затем генерация</h3><p>Каталог объединяет автоматический сбор геоданных и редакционные описания. BM25-подобный поиск учитывает запрос и интересы. Фильтры исключают неподходящие по времени и погоде варианты до составления ответа.</p><p>Без серверного API-ключа работают поиск и шаблоны. С ключом LLM формулирует идеи по найденным записям; идентификаторы и текст проходят проверку. Идеи LLM явно подписаны, а факты и время берутся из каталога.</p></div><div className="modal-section"><h3>Источник важнее уверенного тона</h3><p>Неизвестные часы и рейтинги остаются неизвестными. Старый музей энергии Нұр Әлем закрыт; в каталоге указан нынешний Музей Сингулярности alem.ai со ссылкой на оператора. Доступ нужно уточнить.</p><div className="source-links"><a href="https://www.wikidata.org/wiki/Wikidata:Licensing" target="_blank" rel="noreferrer">Wikidata</a><a href="https://visitastana.kz/ru/" target="_blank" rel="noreferrer">Visit Astana</a><a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">Open-Meteo</a><a href="https://qazexpocongress.kz/ru/nur-alem/" target="_blank" rel="noreferrer">QazExpoCongress</a></div></div></>}
    </div></div></div>}
  </div>;
}

