"use client";
import {useEffect,useState} from "react";
import type {POI} from "@/lib/types";
import type {Locale} from "@/lib/ui-i18n";
import PlaceArtwork from "./PlaceArtwork";
export default function PlacePhoto({poi,locale}:{poi:POI;locale:Locale}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[poi.image]);
 const usable=!failed&&Boolean(poi.image&&poi.imageSourceUrl&&poi.imageAuthor&&poi.imageLicense&&poi.imageLicenseUrl);
 if(!usable)return <><PlaceArtwork poi={poi}/><span className="art-note">{locale==="en"?"Illustration":locale==="kk"?"Иллюстрация":"Иллюстрация"}</span></>;
 const label=locale==="en"?"Archive photo":locale==="kk"?"Мұрағаттық фото":"Архивное фото";
 return <figure className="place-photo" style={{position:"relative",width:"100%",height:"100%",margin:0}}>
  <img src={poi.image} alt={poi.name} loading="lazy" decoding="async" onError={()=>setFailed(true)} style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:poi.id==="baiterek"?"50% 15%":"center",display:"block"}}/>
  <figcaption className="place-photo-credit" title={locale==="en"?"Source photograph; displayed as a cropped thumbnail. Current appearance may differ.":locale==="kk"?"Дереккөз фотосы; қиылған шағын нұсқа. Қазіргі көрінісі өзгеше болуы мүмкін.":"Фото из источника; кадрированная миниатюра. Текущий вид может отличаться."} style={{position:"absolute",bottom:0,left:0,right:0,zIndex:3,padding:"7px 10px",background:"rgba(14,35,28,.9)",color:"#fffef7",fontSize:14,lineHeight:1.5,display:"flex",gap:"3px 6px",flexWrap:"wrap"}}>
   <a href={poi.imageSourceUrl} target="_blank" rel="noreferrer" style={{textDecoration:"underline",textUnderlineOffset:3}}>{label}: {poi.imageAuthor}</a><span aria-hidden="true">·</span><a href={poi.imageLicenseUrl} target="_blank" rel="noreferrer" style={{textDecoration:"underline",textUnderlineOffset:3}}>{poi.imageLicense}</a>
  </figcaption>
 </figure>;
}
