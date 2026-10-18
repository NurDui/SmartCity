import {getCityPhoto} from "@/lib/daily-photo";
export async function GET(){return Response.json(await getCityPhoto(),{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
