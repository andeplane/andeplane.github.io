import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { PEARL_BOARDING, PearlDeck } from './pearlDeck';
import { CaveWalker } from './caveWalk';

const path='.private/black-pearl.json';
// Runs locally after importing. CI has no purchased files and skips this check.
it.skipIf(!existsSync(path))('walks the imported cabin doorway and quarterdeck staircase', () => {
  const deck=new PearlDeck(JSON.parse(readFileSync(path,'utf8')));
  let w:CaveWalker;
  w=new CaveWalker([], (x,z)=>deck.floor(x,z,w?.feet??4.5)??w?.feet??4.5,
    (x,z)=>deck.walkable(x,z,w.feet));
  const intent={forward:1,right:0,jump:false,sprint:false,crouch:false};
  w.x=0;w.z=-8;w.feet=deck.floor(0,-8,5)!;w.yaw=Math.PI;
  for(let i=0;i<32;i++) w.step(intent,.1);
  expect(w.z).toBeLessThan(-18);expect(w.feet).toBeCloseTo(4.5);
  w.yaw=0;
  for(let i=0;i<32;i++) w.step(intent,.1);
  expect(w.z).toBeGreaterThan(-9);
  w.x=3.3;w.z=-4;w.feet=deck.floor(w.x,w.z,6)!;w.yaw=Math.PI;
  for(let i=0;i<42;i++) w.step(intent,.1);
  expect(w.feet).toBeGreaterThan(9);expect(w.z).toBeLessThan(-18);
  w.yaw=0;
  for(let i=0;i<42;i++) w.step(intent,.1);
  expect(w.z).toBeGreaterThan(-5);expect(w.feet).toBeLessThan(6);
});

it.skipIf(!existsSync(path))('walks from the boarding pose through the doorway without hitting the mast', () => {
  const deck=new PearlDeck(JSON.parse(readFileSync(path,'utf8')));
  let w:CaveWalker;
  w=new CaveWalker([-5,10].map(z=>({x:0,z,rx:.5,rz:.5,top:40})),
    (x,z)=>deck.floor(x,z,w?.feet??4.5)??w?.feet??4.5,
    (x,z)=>deck.walkable(x,z,w.feet),true);
  Object.assign(w,PEARL_BOARDING);
  w.feet=deck.floor(w.x,w.z,5)!;
  const intent={forward:1,right:0,jump:false,sprint:false,crouch:false};
  for(let i=0;i<32;i++) w.step(intent,.1);
  expect(deck.inCabin(w.x,w.z)).toBe(true);
  expect(w.z).toBeLessThan(-14);
  expect(w.feet).toBeCloseTo(4.5);
  // Back out along the same continuous route, without a scene change or jump.
  for(let i=0;i<32;i++) w.step({...intent,forward:-1},.1);
  expect(w.x).toBeCloseTo(PEARL_BOARDING.x);
  expect(w.z).toBeCloseTo(PEARL_BOARDING.z);
});
