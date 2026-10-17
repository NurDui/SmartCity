import {getRuntimeConfig} from "@/lib/provider-config";
export async function GET(){return Response.json(getRuntimeConfig(),{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
