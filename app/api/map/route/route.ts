import {env} from "cloudflare:workers";
import {walkingRoute,MapServiceError} from "@/lib/open-map";
export async function POST(request:Request){
 const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
 try{const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"origin"},{status:403,headers});const text=await request.text();if(text.length>1500)return Response.json({error:"too_large"},{status:413,headers});const body=JSON.parse(text);return Response.json(await walkingRoute(body.from,body.to,env.DB),{headers});}
 catch(e){return Response.json({error:e instanceof MapServiceError?e.code:"provider_unavailable"},{status:e instanceof MapServiceError?e.status:502,headers:{...headers,"Retry-After":"3"}});}
}
