// Full real-WASM pour benchmark, without timer pacing, rendering or sound.
// node --experimental-strip-types tools/hoard/benchmark-pour.mjs [old|new] [resting coins]
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const mode=process.argv[2]??'new',count=Number(process.argv[3]??8000),cache=new Map();
async function compile(url) {
 if(cache.has(url.href))return cache.get(url.href);
 let source=await readFile(url,'utf8');
 if(mode==='old'&&url.pathname.endsWith('/goldPhysics.worker.ts'))source=source.replace('settledGoldPatches(previous)','[settledGoldCollision(previous)]').replace('import { settledGoldPatches }','import { settledGoldCollision }');
 for(const match of [...source.matchAll(/from\s+["']([^"']+)["']/g)]) {
  const name=match[1],resolved=name.startsWith('.')?await compile(new URL(name+'.ts',url)):import.meta.resolve(name);
  source=source.replace(match[0],'from '+JSON.stringify(resolved));
 }
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const compiled='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(url.href,compiled);return compiled;
}
const load=async name=>{const b=await readFile(new URL('../../public/assets/hoard/'+name,import.meta.url));return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const chest=await load('chest.bin'),previous=count?await load(`world-0/${count}.bin`):new Float32Array();
const peak=Math.max(.1,...previous.filter((_,i)=>i%7===1));
let final,steps=0,resolveDone,resolveReady;const done=new Promise(r=>resolveDone=r),ready=new Promise(r=>resolveReady=r);
globalThis.self=Object.assign(Object.create(globalThis),{postMessage:data=>{
 if(data.ready)resolveReady();
 if(data.error)throw new Error(data.error);
 if(data.poses)final=data;
 if(data.done)resolveDone();
 if(++steps%150===0&&final)console.log('progress',JSON.stringify({time:final.time,resting:final.resting,meanMs:final.physicsMeanMs,maxMs:final.physicsMaxMs}));
}});
await import(await compile(new URL('../../src/game/goldPhysics.worker.ts',import.meta.url)));
await self.onmessage({data:{world:0,previous,chest,chestY:peak+3.8}});await ready;
// Preserve simulation dt. Only remove artificial real-time sleeping from this benchmark.
globalThis.setTimeout=fn=>{queueMicrotask(fn);return 0;};
const start=performance.now();await self.onmessage({data:{start:true,duration:2.2}});await done;
console.log(JSON.stringify({mode,previous:count,wallMs:performance.now()-start,simSeconds:final.time,meanTickMs:final.physicsMeanMs,maxTickMs:final.physicsMaxMs,staticTriangles:final.staticTriangles,resting:final.resting}));
