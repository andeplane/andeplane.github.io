import { describe, expect, it } from 'vitest';
import { PearlDeck, type PearlManifest } from './pearlDeck';
import { CaveWalker } from './caveWalk';
const manifest: PearlManifest = {
  version: 1, cabin: {floor: 4.5, x: [-4.7,4.7], z: [-22,-11.5]},
  floorTriangles: [
    [[-5,10,-22],[5,10,-22],[5,10,-11]], [[-5,10,-22],[5,10,-11],[-5,10,-11]],
    [[-5,4.5,-11.5],[5,4.5,-11.5],[5,4.5,10]], [[-5,4.5,-11.5],[5,4.5,10],[-5,4.5,10]],
  ],
};
describe('purchased ship walking', () => {
  const deck = new PearlDeck(manifest);
  it('keeps the cabin floor distinct from the upper deck', () => {
    expect(deck.floor(0,-16,4.5)).toBe(4.5);
    expect(deck.floor(0,-16,10)).toBe(10);
    expect(deck.walkable(6,-16,4.5)).toBe(false);
    expect(deck.walkable(3,-11.8,4.5)).toBe(false);
    expect(deck.walkable(0,-16,8)).toBe(false);
  });
  it('walks continuously into and out of the cabin', () => {
    let walker: CaveWalker;
    walker = new CaveWalker([], (x,z) => deck.floor(x,z,walker?.feet ?? 4.5) ?? 4.5,
      (x,z) => deck.walkable(x,z,walker.feet));
    walker.x=0; walker.z=-9; walker.feet=4.5; walker.yaw=Math.PI;
    const intent = {forward:1,right:0,jump:false,crouch:false,sprint:false};
    for (let i=0;i<30;i++) walker.step(intent,.1);
    expect(walker.z).toBeLessThan(-18); expect(walker.feet).toBe(4.5);
    walker.yaw=0;
    for (let i=0;i<30;i++) walker.step(intent,.1);
    expect(walker.z).toBeGreaterThan(-10); expect(walker.feet).toBe(4.5);
  });
  it('climbs and descends a staircase across tread seams', () => {
    const deck=new PearlDeck({...manifest, ramps:[{x:[2,4],stations:[[-20,10],[-5,4.5]]}]});
    let w:CaveWalker;
    w=new CaveWalker([], (x,z)=>deck.floor(x,z,w?.feet??4.5)??4.5,(x,z)=>deck.walkable(x,z,w.feet));
    w.x=3;w.z=-5;w.feet=4.5;w.yaw=Math.PI;
    const intent={forward:1,right:0,jump:false,crouch:false,sprint:false};
    for(let i=0;i<40;i++) w.step(intent,.1);
    expect(w.feet).toBeGreaterThan(9);expect(w.z).toBeLessThan(-18);
    w.yaw=0;
    for(let i=0;i<40;i++) w.step(intent,.1);
    expect(w.feet).toBeCloseTo(4.5);expect(w.z).toBeCloseTo(-5);
  });
});
