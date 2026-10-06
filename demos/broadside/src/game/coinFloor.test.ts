import {describe,it,expect,beforeAll} from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import {coinFloor} from './coinFloor';
import {caveFloor} from '../input/caveLayout';
beforeAll(async()=>{await RAPIER.init();});
describe('whole cave coin floor',()=>{
 it('supports spilled gold beyond the former bank box and follows the canal',()=>{
  const area={x:-8,z:6},mesh=coinFloor(area),world=new RAPIER.World({x:0,y:-9.81,z:0});
  try{
   world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices));world.step();
   for(const [x,z] of [[0,13],[8,38],[0,38],[28,43]]){
    const hit=world.castRay(new RAPIER.Ray({x:x!-area.x,y:3,z:z!-area.z},{x:0,y:-1,z:0}),10,true);
    expect(hit).not.toBeNull();expect(3-hit!.timeOfImpact).toBeCloseTo(caveFloor(x!,z!),2);
   }
   // There are no bank-sized vertical walls in this ground geometry.
   expect(Math.max(...mesh.vertices.filter((_,i)=>i%3===1))).toBeLessThan(.34);
  }finally{world.free();}
 });
 it('uses the actual ship hold deck dimensions and elevation',()=>{
  const m=coinFloor({x:0,z:0},.7),xs=m.vertices.filter((_,i)=>i%3===0),zs=m.vertices.filter((_,i)=>i%3===2);
  expect(Math.min(...xs)).toBeCloseTo(-4.7);expect(Math.max(...xs)).toBeCloseTo(4.7);
  expect(Math.max(...zs)).toBeCloseTo(7.5);expect(m.vertices.filter((_,i)=>i%3===1).every(y=>Math.abs(y-.7)<.0001)).toBe(true);
 });
});
