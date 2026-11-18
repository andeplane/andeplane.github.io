import {describe,expect,it,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer.js';
vi.mock('../shared/pirate-world/render/coin',async(importOriginal)=>({...await importOriginal<typeof import('../shared/pirate-world/render/coin')>(),doubloonMaterial:(scene:Scene)=>new StandardMaterial('test gold',scene)}));
vi.mock('../shared/pirate-world/render/timber',()=>({timberTexture:(scene:Scene)=>new Texture(null,scene)}));
vi.mock('../shared/pirate-world/game/chestCoins',()=>({chestCoinPoses:()=>Promise.resolve(new Float32Array(7000)),CHEST_COIN_SCALE:1}));
import {RewardChest} from '../shared/pirate-world/render/chest';
describe('reward chest geometry',()=>{
  it('keeps the gold cap and lid straps clear of the timber surfaces as the lid opens',()=>{
    const engine=new NullEngine(),scene=new Scene(engine),chest=new RewardChest(scene);
    try {
      const walls=chest.root.getChildMeshes().filter(m=>/^(solid oak wall|end wall)$/.test(m.name));
      const topRims=chest.root.getChildMeshes().filter(m=>/^(gold rim|gold end rim)$/.test(m.name)&&m.position.y>1);
      expect(topRims).toHaveLength(4);
      for(const rim of topRims) {
        const rimTop=rim.position.y+rim.getBoundingInfo().boundingBox.maximum.y;
        for(const wall of walls) {
          const woodTop=wall.position.y+wall.getBoundingInfo().boundingBox.maximum.y;
          expect(rimTop-woodTop).toBeGreaterThan(.02);
        }
      }
      const endRim=topRims.find(m=>m.name==='gold end rim')!;
      expect(endRim.getBoundingInfo().boundingBox.maximum.z).toBeCloseTo(.96);
      const lidBands=chest.root.getChildMeshes().filter(m=>m.name==='curved lid gold band');
      expect(lidBands).toHaveLength(4);
      for(const band of lidBands) {
        const p=band.getVerticesData(VertexBuffer.PositionKind)!;
        for(let i=0;i<p.length;i+=3) {
          // In the lid's own coordinates, every metal vertex lies outside
          // the wood's elliptical barrel surface, including shared plank seams.
          const radius=Math.hypot(p[i+1]!/.78,(p[i+2]!+.88)/.97);
          expect(radius).toBeGreaterThan(1.013);
        }
      }
      for(const opening of [0,.25,.5,1]) {
        chest.open(opening);
        expect(lidBands.every(m=>m.parent?.name==='rear hinge')).toBe(true);
      }
    } finally {scene.dispose();engine.dispose();}
  });
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
