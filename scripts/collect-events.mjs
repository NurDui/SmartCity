/** Fetch public municipal event pages and retain explicit date/provenance; no hidden APIs. */
import fs from "node:fs/promises";
import {fetchCombinedPublicEvents,cityDate} from "../lib/live-data.ts";
const now=Date.now();
const result=await fetchCombinedPublicEvents({date:cityDate(now),language:"ru",location:{lat:51.1282,lon:71.4307}},{now});
await fs.mkdir("data",{recursive:true});
await fs.writeFile("data/events-collection-report.json",JSON.stringify({date:cityDate(now),timezone:"Asia/Qyzylorda",...result},null,2));
console.log(`Event collection: ${result.status}, ${result.items.length} current event(s). See data/events-collection-report.json.`);
if(result.status!=="live")process.exitCode=1;
