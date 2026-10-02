import {describe,it,expect} from 'vitest';
import {createGame} from './simulation';
import {absorb,branchRoot,createWorld,growRoot} from './rootWorld';
describe('playable root exploration',()=>{
 it('extends the active tip and spends carbohydrate on construction',()=>{const w=createWorld('tomato'),g=createGame();const r=growRoot(w,g,{x:0,y:-1},.1);expect(r.world.totalLength).toBeCloseTo(.3);expect(r.game.carbon).toBeLessThan(g.carbon);expect(r.world.paths[0].at(-1)!.y).toBeCloseTo(-.36);});
 it('blocks rock penetration without charging for the failed movement',()=>{const w=createWorld('tomato'),g=createGame();w.paths[0]=[{x:0,y:-.06},{x:-.35,y:-.52}];const r=growRoot(w,g,{x:-1,y:0},.1);expect(r.blocked).toBe(true);expect(r.game.carbon).toBe(g.carbon);});
 it('connects patches through root growth, then absorbs finite water gradually',()=>{const w=createWorld('tomato'),g={...createGame(),moisture:.3};const d=w.deposits[0];w.paths[0]=[{x:0,y:-.06},{x:d.x+.45,y:d.y}];const r=growRoot(w,g,{x:-1,y:0},.1);expect(r.world.deposits[0].connected).toBe(true);const a=absorb(r.world,r.game,6);expect(a.game.moisture).toBeGreaterThan(g.moisture);expect(a.world.deposits[0].amount).toBeLessThan(d.amount);expect(a.game.water).toBe(g.water);});
 it('branches from existing roots, limits growing tips, and never grows above soil',()=>{let w=createWorld('tomato');for(let i=0;i<12;i++)w=branchRoot(w);expect(w.paths).toHaveLength(8);const r=growRoot(w,createGame(),{x:0,y:1},2);expect(r.world.paths[r.world.active].at(-1)!.y).toBeLessThanOrEqual(-.08);});
 it('halts growth when carbon is exhausted or the mission has ended',()=>{const w=createWorld('tomato'),g=createGame();expect(growRoot(w,{...g,carbon:0},{x:0,y:-1},.1).world).toBe(w);expect(growRoot(w,{...g,status:'failed'},{x:0,y:-1},.1).world).toBe(w);});
});
import {act,advance,buyEquipment,conditions,missions} from './simulation';
import type {Species} from './simulation';
it.each(missions.map(m=>[m.id]))('can complete %s with root exploration and a finite grant',(id)=>{
 const species=id as Species;let w=createWorld(species),g=createGame(species);
 const waypoints=[{x:-.18,y:-.92},{x:-1.35,y:-.85},{x:-.5,y:-1.35},{x:.8,y:-1.3}];
 for(const target of waypoints){w={...w,target};for(let i=0;i<80&&w.target;i++){const r=growRoot(w,g,null,.055);w=r.world;g=r.game;}}
 expect(w.connections).toBeGreaterThanOrEqual(2);
 if(species!=='flytrap')g=buyEquipment(g,'drainage');
 for(let i=0;i<450&&g.status==='active';i++){
  const c=conditions(g);if(g.moisture<(species==='cactus'?.17:species==='flytrap'?.5:.32))g=act(g,'water100');if(g.nitrogen<(species==='flytrap'?8:20))g=act(g,species==='flytrap'?'prey':'feed');
  g={...g,ventilation:c.heatwave?.35:0,shade:c.heatwave&&species==='tomato'?.15:0};const a=absorb(w,g,3);w=a.world;g=advance(a.game,3);
 }
 console.log('root strategy',species,{status:g.status,biomass:g.biomass,health:g.health,water:g.water,budget:g.budget,connections:w.connections});expect(g.status).toBe('success');
});
