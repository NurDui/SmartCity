"use client";
import {useEffect,useState} from "react";
import {Camera,ExternalLink} from "lucide-react";
import {ARCHIVE_PHOTO,astanaDay,type CityPhotoResponse} from "@/lib/daily-photo";
import type {Locale} from "@/lib/ui-i18n";
export default function CityHeroPhoto({locale,children}:{locale:Locale;children:React.ReactNode}){
 const [data,setData]=useState<CityPhotoResponse>({status:"archive",date:"",photo:ARCHIVE_PHOTO});
 useEffect(()=>{let active=true;const controller=new AbortController();let loading=false;
  const load=async()=>{setData(old=>old.status==="today"&&old.date!==astanaDay()?{status:"archive",date:astanaDay(),photo:ARCHIVE_PHOTO}:old);if(document.hidden||loading)return;loading=true;try{const response=await fetch("/api/city-photo",{signal:controller.signal,cache:"no-store"});if(!response.ok)throw new Error();const body=await response.json() as CityPhotoResponse;if(active&&body.photo&&["today","archive"].includes(body.status))setData(body);}catch{}finally{loading=false;}};
  void load();const timer=setInterval(()=>{setData(old=>old.status==="today"&&old.date!==astanaDay()?{status:"archive",date:astanaDay(),photo:ARCHIVE_PHOTO}:old);void load();},60000);document.addEventListener("visibilitychange",load);return()=>{active=false;controller.abort();clearInterval(timer);document.removeEventListener("visibilitychange",load);};
 },[]);
 const today=data.status==="today"&&data.date===astanaDay(),photo=today?data.photo:ARCHIVE_PHOTO,label=locale==="kk"?(today?"Бүгін түсірілген":"Мұрағаттық фото · күні расталмаған"):locale==="en"?(today?"Photographed today":"Archive photo · capture date unverified"):(today?"Снято сегодня":"Архивное фото · дата съёмки не подтверждена");
 return <div className="hero-visual"><img key={photo.imageUrl} src={photo.imageUrl} alt={photo.title} fetchPriority="high" referrerPolicy="no-referrer" onError={()=>setData({status:"archive",date:astanaDay(),photo:ARCHIVE_PHOTO})}/><div className="hero-photo-shade"/><div className="hero-photo-source"><span className={today?"photo-fresh":""}><Camera size={15}/>{label}</span><div><a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.author}<ExternalLink size={14}/></a><span> · </span><a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a></div></div>{children}</div>;
}
