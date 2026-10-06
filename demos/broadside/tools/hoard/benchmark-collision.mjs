// Isolated collision benchmark. No browser, audio, save writes or GPU involved.
// node --experimental-strip-types tools/hoard/benchmark-collision.mjs
import RAPIER from '@dimforge/rapier3d-compat';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../../src/game/goldCollision.ts',import.meta.url),'utf8'))
  .replace('"./goldAreas"',JSON.stringify(new URL('../../src/game/goldAreas.ts',import.meta.url).href));
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {settledGoldCollision,settledGoldPatches}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
await RAPIER.init();
for(const count of [1000,8000]) {
 const bytes=await readFile(new URL(`../../public/assets/hoard/world-0/${count}.bin`,import.meta.url));
 const poses=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const peak=Math.max(...poses.filter((_,i)=>i%7===1));
 for(const [name,build] of [['individual buried coin faces',p=>[settledGoldCollision(p)]],['exposed surface patches',settledGoldPatches]]) {
  const buildStart=performance.now(),patches=build(poses),buildMs=performance.now()-buildStart;
  const world=new RAPIER.World({x:0,y:0,z:0});world.timestep=1/60;world.numSolverIterations=4;
  for(const p of patches)world.createCollider(RAPIER.ColliderDesc.trimesh(p.vertices,p.indices));
  // Suspended above the pile, moving laterally: measures broad/narrow-phase cost
  // before contact, as reported by the player. Identical for both geometries.
  for(let i=0;i<1000;i++) {
   const b=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation((i%40-20)*.32,peak+1+Math.floor(i/40)*.3,0).setLinvel(.02,0,0).setCcdEnabled(true));
   world.createCollider(RAPIER.ColliderDesc.roundCylinder(.0215,.134,.006),b);
  }
  for(let i=0;i<5;i++)world.step();
  const start=performance.now();for(let i=0;i<120;i++)world.step();const ms=(performance.now()-start)/120;
  console.log(JSON.stringify({coins:count,geometry:name,triangles:patches.reduce((n,p)=>n+p.indices.length/3,0),patches:patches.length,buildMs:+buildMs.toFixed(2),stepMs:+ms.toFixed(3)}));
  world.free();
 }
}
