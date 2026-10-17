import type { POI } from "@/lib/types";
export default function PlaceArtwork({ poi }: { poi: POI }) {
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

