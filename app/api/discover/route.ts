import {discover,parseDiscoveryInput} from "@/lib/live-data";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
async function respond(value:unknown){
 let input:ReturnType<typeof parseDiscoveryInput>;
 try{input=parseDiscoveryInput(value);}catch(error){return Response.json({error:error instanceof Error?error.message:"Некорректный запрос."},{status:400,headers});}
 try{return Response.json(await discover({lat:input.lat,lon:input.lon},{language:input.language}),{headers});}
 catch{return Response.json({error:"Не удалось получить актуальные городские данные."},{status:503,headers});}
}
/** The application uses POST so exact location is not embedded in an access-log URL. */
export async function POST(request:Request){
 const text=await request.text();if(text.length>2048)return Response.json({error:"Слишком большой запрос."},{status:413,headers});
 try{return respond(JSON.parse(text));}catch{return Response.json({error:"Нужен корректный JSON."},{status:400,headers});}
}
/** Backward-compatible diagnostic endpoint. Do not use from the location-aware UI. */
export async function GET(request:Request){
 const url=new URL(request.url),lat=url.searchParams.get("lat"),lon=url.searchParams.get("lon");
 return respond({lat:lat?Number(lat):NaN,lon:lon?Number(lon):NaN,language:url.searchParams.get("language")||"ru"});
}
