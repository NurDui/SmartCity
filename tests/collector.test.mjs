import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, copyFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

test('failed collector refresh retains source dates and actual snapshot count',async()=>{
 const fixture=await mkdtemp(path.join(tmpdir(),'astana-collection-test-'));
 try {
  await mkdir(path.join(fixture,'scripts'));await mkdir(path.join(fixture,'data'));
  const source=fileURLToPath(new URL('..',import.meta.url));
  for(const file of ['scripts/collect-poi.mjs','data/seeds.json','data/collected-pois.json','data/collection-report.json'])await copyFile(path.join(source,file),path.join(fixture,file));
  const before=JSON.parse(await readFile(path.join(fixture,'data/collected-pois.json'),'utf8'));
  const oldReport=JSON.parse(await readFile(path.join(fixture,'data/collection-report.json'),'utf8'));
  const script=`globalThis.fetch=async()=>{throw new Error('mock network failure')};process.argv.push('--wikimedia-only');await import(${JSON.stringify(pathToFileURL(path.join(fixture,'scripts/collect-poi.mjs')).href)});`;
  execFileSync(process.execPath,['--input-type=module','-e',script],{stdio:'pipe'});
  const after=JSON.parse(await readFile(path.join(fixture,'data/collected-pois.json'),'utf8'));
  const report=JSON.parse(await readFile(path.join(fixture,'data/collection-report.json'),'utf8'));
  assert.deepEqual(after,before);assert.equal(report.count,before.length);assert.equal(report.collectedAt,oldReport.collectedAt);assert.equal(report.status,'using-retained-snapshot');assert.equal(report.freshRecords,0);
 } finally {await rm(fixture,{recursive:true,force:true});}
});
