import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { DeckFishing } from './deckFishing';
import { DeckWalk } from '../game/deckWalk';
import { Fishing } from '../game/fishing';
import type { ShipView } from './shipView';
// Chest construction is already shared with rewards. Exercise tackle attachment and water coordinates here.
vi.mock('./chest',()=>({RewardChest:class {
  root:TransformNode;
  constructor(scene:Scene){this.root=new TransformNode('caught treasure test',scene);}
  hide(){this.root.setEnabled(false);}
  animate(){this.root.setEnabled(true);}
}}));
let engine:NullEngine,scene:Scene;
afterEach(()=>{scene?.dispose();engine?.dispose();});
describe('fishing tackle on a sailing deck',()=>{
  it.each(['fish','chest'] as const)('keeps the float in the sea and brings the %s onto the moving ship',kind=>{
    engine=new NullEngine();scene=new Scene(engine);
    const root=new TransformNode('moving ship',scene);root.position.set(50,0,25);root.computeWorldMatrix(true);
    const view={root} as ShipView;
    const deck=new DeckWalk({length:32,beam:9,helm:{x:2.5,y:3,z:-12},floor:()=>3});
    deck.leave();deck.walker.x=3;
    const tackle=new DeckFishing(scene),fishing=new Fishing(()=>kind==='chest'?.05:.8);
    tackle.begin(view,deck);fishing.cast(true);fishing.step(.9);tackle.update(fishing,view,1,false);
    const float=scene.getMeshByName('red cork float')!,x=float.position.x,z=float.position.z;
    expect(float.isEnabled()).toBe(true);
    root.position.x+=5;root.rotation.y=.1;root.computeWorldMatrix(true);tackle.update(fishing,view,2,false);
    expect(float.position.x).toBe(x);expect(float.position.z).toBe(z);
    expect(scene.getMeshByName('fine fishing line')!.getVerticesData('position')!.every(Number.isFinite)).toBe(true);
    fishing.step(6);fishing.reel();fishing.step(1.8);tackle.update(fishing,view,4,true);
    const caught=kind==='chest'?scene.getTransformNodeByName('caught treasure test')!:scene.getTransformNodeByName('freshly caught silver mackerel')!;
    caught.computeWorldMatrix(true);
    const landing=Vector3.TransformCoordinates(new Vector3(2.35,3.15,-10.75),root.getWorldMatrix());
    expect(Vector3.Distance(caught.getAbsolutePosition(),landing)).toBeLessThan(.01);
    expect(float.isEnabled()).toBe(false);fishing.cancel();tackle.update(fishing,view,5,false);
    expect(caught.isEnabled()).toBe(false);tackle.dispose();expect(float.isDisposed()).toBe(true);
  });
});
