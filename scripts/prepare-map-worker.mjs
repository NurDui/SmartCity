import {build} from 'esbuild';
import {readFile,mkdir} from 'node:fs/promises';
const {version}=JSON.parse(await readFile(new URL('../node_modules/maplibre-gl/package.json',import.meta.url),'utf8'));
await mkdir(new URL('../public/vendor',import.meta.url),{recursive:true});
// A self-contained same-origin worker avoids SSR/dev overlay transforms in worker scope.
await build({entryPoints:[new URL('../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')],outfile:new URL(`../public/vendor/maplibre-${version}-worker.js`,import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),bundle:true,format:'esm',minify:true,legalComments:'inline',platform:'browser'});
