import {describe,expect,it,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
vi.mock('./coin',async(importOriginal)=>({...await importOriginal<typeof import('./coin')>(),doubloonMaterial:(scene:Scene)=>new StandardMaterial('test gold',scene)}));
vi.mock('../game/chestCoins',()=>({chestCoinPoses:()=>Promise.resolve(new Float32Array(7000)),CHEST_COIN_SCALE:1}));
import {RewardChest} from './chest';
describe('reward chest geometry',()=>{
  it('contains no carrying arms or gloves while retaining the chest, handles and coins',()=>{
    const engine=new NullEngine(),scene=new Scene(engine),chest=new RewardChest(scene);
    expect(scene.meshes.some(m=>/sleeve|glov|finger|thumb|cuff|palm/.test(m.name))).toBe(false);
    expect(scene.transformNodes.some(n=>n.name==='captain carrying the chest')).toBe(false);
    expect(scene.getMeshByName('carrying ring')).not.toBeNull();
    expect(scene.getMeshByName('one thousand doubloons inside the chest')).not.toBeNull();
    chest.animate(1,0,false);expect(chest.root.isEnabled()).toBe(true);
    chest.hide();expect(chest.root.isEnabled()).toBe(false);
    scene.dispose();engine.dispose();
  });
});
