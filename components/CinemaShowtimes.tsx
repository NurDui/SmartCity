"use client";
import { useId, useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, Clock3, ExternalLink, Film, MapPin } from "lucide-react";
import type { CinemaSession } from "../lib/live-types";
import { t, type Locale } from "../lib/ui-i18n";
import styles from "./CinemaShowtimes.module.css";

type Props = { sessions:CinemaSession[]; locale:Locale };
type Group = {key:string;film:CinemaSession;sessions:CinemaSession[]};
const labels = {
 ru:{less:"Показать меньше",sourceNote:"Описание на языке источника",from:"от"},
 kk:{less:"Азырақ көрсету",sourceNote:"Сипаттама дереккөз тілінде",from:"бастап"},
 en:{less:"Show fewer",sourceNote:"Synopsis in the source language",from:"from"},
};
function groupSessions(sessions:CinemaSession[]):Group[]{
 const map=new Map<string,Group>();
 for(const session of sessions){const key=JSON.stringify([session.title,session.cinemaName]);const existing=map.get(key);if(existing){if(!existing.sessions.some(s=>s.id===session.id))existing.sessions.push(session);}else map.set(key,{key,film:session,sessions:[session]});}
 for(const group of map.values())group.sessions.sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
 return [...map.values()];
}
function sourceLanguage(text:string):Locale|null {
 if(/[әғқңөұүһі]/i.test(text))return "kk";
 if(/[а-яё]/i.test(text))return "ru";
 return /[a-z]/i.test(text)?"en":null;
}
function Poster({url,title}:{url:string|null;title:string}){
 const [failed,setFailed]=useState(false);
 return <div className={styles.poster}><Film size={35} aria-hidden="true"/>{url&&!failed&&<img src={url} alt={title} loading="lazy" onError={()=>setFailed(true)}/>}</div>;
}
export default function CinemaShowtimes({sessions,locale}:Props){
 const c=t(locale),l=labels[locale],id=useId();
 const [selectedCinema,setSelectedCinema]=useState("");const [expanded,setExpanded]=useState(false);
 const allGroups=useMemo(()=>groupSessions(sessions),[sessions]);
 const cinemas=[...new Set(allGroups.map(g=>g.film.cinemaName))].sort((a,b)=>a.localeCompare(b));
 const currentCinema=cinemas.includes(selectedCinema)?selectedCinema:"";
 const groups=allGroups.filter(g=>!currentCinema||g.film.cinemaName===currentCinema);
 const shown=expanded?groups:groups.slice(0,6);
 const count=groups.length;
 const countLabel=locale==="ru"?`${count} ${count%10===1&&count%100!==11?"вариант":count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?"варианта":"вариантов"}`:locale==="kk"?`${count} нұсқа`:`${count} ${count===1?"cinema listing":"cinema listings"}`;
 const code=locale==="kk"?"kk-KZ":locale==="en"?"en-GB":"ru-KZ";
 const time=(value:string)=>new Date(value).toLocaleTimeString(code,{timeZone:"Asia/Qyzylorda",hour:"2-digit",minute:"2-digit",hour12:false});
 const distance=(value:number)=>value>=1000?`${(value/1000).toLocaleString(code,{maximumFractionDigits:1})} ${c.km}`:`${Math.round(value)} ${c.meters}`;
 const price=(session:CinemaSession)=>{
  if(session.priceKzt===null)return c.priceUnknown;
  const amount=`${session.priceKzt.toLocaleString(code)} ₸`;
  return session.priceIsFrom?(locale==="kk"?`${amount} ${l.from}`:`${l.from} ${amount}`):amount;
 };
 return <div className={styles.root}>
  <div className={styles.toolbar}><span className={styles.count}>{countLabel}</span>{cinemas.length>1&&<div className={styles.filter}><label htmlFor={`${id}-cinema`}>{c.cinema}</label><div className={styles.select}><select id={`${id}-cinema`} value={currentCinema} onChange={e=>{setSelectedCinema(e.target.value);setExpanded(false);}}><option value="">{c.all}</option>{cinemas.map(name=><option key={name} value={name}>{name}</option>)}</select><ChevronDown size={13} aria-hidden="true"/></div></div>}</div>
  <div className={styles.grid} id={`${id}-groups`}>{shown.map(group=>{
   const film=group.film;const language=sourceLanguage(film.synopsis);
   return <article className={styles.card} key={group.key}>
    <Poster key={film.posterUrl??group.key} url={film.posterUrl} title={film.title}/>
    <div className={styles.body}><span className={styles.cinema}>{film.cinemaName}</span><h3 className={styles.title}>{film.title}</h3><p className={styles.synopsis}>{film.synopsis}</p>{language&&language!==locale&&<p className={styles.sourceNote}>{l.sourceNote}</p>}
     <div className={styles.venue}><MapPin size={13} aria-hidden="true"/><span>{film.mallName??film.cinemaName}</span><span className={styles.distance} title={c.approximate}>~{distance(film.distanceMeters)}</span></div>
     <div className={styles.showtimesLabel}><Clock3 size={12} aria-hidden="true"/>{c.showtimes}</div>
     <ul className={styles.times} aria-label={`${c.showtimes}: ${film.title}, ${film.cinemaName}`}>{group.sessions.map(session=><li key={session.id}><a className={styles.time} href={session.bookingUrl} target="_blank" rel="noreferrer" aria-label={`${c.book}: ${film.title}, ${film.cinemaName}, ${time(session.startsAt)}, ${price(session)}`}><time dateTime={session.startsAt}>{time(session.startsAt)}</time><span className={session.priceKzt===null?styles.unknownPrice:undefined}>{price(session)}</span></a></li>)}</ul>
     <div className={styles.footer}><a href={film.bookingUrl} target="_blank" rel="noreferrer" className={styles.book}>{c.book}<ArrowUpRight size={14} aria-hidden="true"/></a><a href={film.sourceUrl} target="_blank" rel="noreferrer" className={styles.source}>{c.source}<ExternalLink size={11} aria-hidden="true"/></a></div>
    </div>
   </article>;
  })}</div>
  {groups.length>6&&<button type="button" className={styles.more} aria-expanded={expanded} aria-controls={`${id}-groups`} onClick={()=>setExpanded(v=>!v)}>{expanded?l.less:`${c.viewAll} (${groups.length})`}<ChevronDown size={15} className={expanded?styles.chevronUp:undefined} aria-hidden="true"/></button>}
 </div>;
}
