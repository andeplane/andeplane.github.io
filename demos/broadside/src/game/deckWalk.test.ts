import { describe, expect, it } from 'vitest';
import { createShip, updateShip, SHIP_SPECS, IDLE_INTENT } from '../sim/ships';
import { DeckWalk } from './deckWalk';
const idle={forward:0,right:0,sprint:false,crouch:false,jump:false};
const geometry={length:32,beam:9,helm:{x:0,y:3,z:-12.23},floor:()=>3};
describe('walking aboard a moving ship',()=>{
  it('starts at the wheel, walks away and requires physically returning before taking control',()=>{
    const d=new DeckWalk(geometry);expect(d.active).toBe(false);d.step({...idle,forward:1},1);expect(d.walker.z).toBe(geometry.helm.z);
    d.leave(.2,.1);expect(d.nearHelm).toBe(true);expect(d.walker.yaw).toBe(.2);
    for(let i=0;i<80;i++)d.step({...idle,forward:1},.05);
    expect(d.nearHelm).toBe(false);expect(d.takeHelm()).toBe(false);expect(d.active).toBe(true);
    for(let i=0;i<80;i++)d.step({...idle,forward:-1},.05);
    expect(d.nearHelm).toBe(true);expect(d.takeHelm()).toBe(true);expect(d.takeHelm()).toBe(false);
  });
  it('lets the ship keep sailing but blocks keys and gamepad steering until the helm is reclaimed',()=>{
    const d=new DeckWalk(geometry), ship=createShip(1,SHIP_SPECS.galleon,'player',{x:0,z:0},0);
    const command={...IDLE_INTENT,turn:1,sailUp:true,firePort:true};
    d.leave();const filtered=d.helmIntent(command);
    expect(filtered).toMatchObject({turn:0,sailUp:false,sailDown:false,firePort:true});
    for(let i=0;i<120;i++)updateShip(ship,filtered,{direction:0,strength:1},1/60);
    expect(ship.pos.z).toBeGreaterThan(1);expect(ship.heading).toBe(0);expect(ship.sail).toBe(1);
    expect(command.turn).toBe(1);d.takeHelm();expect(d.helmIntent(command)).toBe(command);
    updateShip(ship,d.helmIntent(command),{direction:0,strength:1},.1);expect(ship.heading).toBeGreaterThan(0);
  });
  it('keeps the player inside tapered rails and stops at mast collisions',()=>{
    const d=new DeckWalk(geometry);d.leave();
    for(let i=0;i<100;i++)d.step({...idle,right:1,sprint:true},.1);
    expect(d.atRail).toBe(true);expect(d.walker.x).toBeLessThan(geometry.beam*.46);
    d.walker.x=0;d.walker.z=-7;
    for(let i=0;i<25;i++)d.step({...idle,forward:1},.05);
    expect(d.walker.z).toBeLessThan(-32*.17-.38);
    d.walker.x=2;d.walker.z=12;
    for(let i=0;i<100;i++)d.step({...idle,forward:1},.1);
    expect(d.walker.z).toBeLessThanOrEqual(32*.43);
  });
  it('keeps local coordinates while jumping, crouching and looking',()=>{
    const d=new DeckWalk(geometry);d.look(100,100);expect(d.walker.yaw).toBe(0);
    d.leave();d.look(100,100);expect(d.walker.yaw).toBeCloseTo(.3);
    d.step({...idle,jump:true},.05);expect(d.walker.feet).toBeGreaterThan(3);expect(d.nearHelm).toBe(true);
    for(let i=0;i<80;i++)d.step(idle,.05);
    expect(d.walker.feet).toBe(3);const eye=d.eye.y;
    for(let i=0;i<20;i++)d.step({...idle,crouch:true},.05);
    expect(d.eye.y).toBeLessThan(eye);d.reset();expect(d.active).toBe(false);expect(d.walker.verticalSpeed).toBe(0);
  });
});
