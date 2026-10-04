import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { UnderwaterView, seabedHeight } from './underwater';

describe('the reef beneath a wreck',()=>{
  it.each([false,true])('builds a stable detailed reef, batches its scenery and disposes it (phone=%s)',phone=>{
    const engine=new NullEngine(),scene=new Scene(engine),defaultMaterial=scene.defaultMaterial;
    const reef=new UnderwaterView(scene,81723,22,100,-40,.6,phone);
    expect(reef.root.position.asArray()).toEqual([100,0,-40]);expect(reef.root.rotation.y).toBe(.6);
    const floor=scene.getMeshByName('rippled sandy seabed')!;
    expect(floor.getTotalVertices()).toBeGreaterThan(4000);
    const positions=floor.getVerticesData('position')!;
    for(let i=0;i<positions.length;i+=3){
      expect(positions[i+1]).toBeCloseTo(seabedHeight(positions[i]!,positions[i+2]!,reef.depth),4);
      expect(positions[i+1]).toBeLessThan(-28);
    }
    expect(floor.getBoundingInfo().boundingBox.maximum.y).toBeLessThan(-28);
    expect(scene.getMeshByName('coral gardens')!.getTotalVertices()).toBeGreaterThan(2000);
    expect(scene.getMeshByName('swaying kelp beds')!.getTotalVertices()).toBeGreaterThan(2000);
    // Only seven merged/instanced meshes remain, rather than hundreds of reef props.
    expect(scene.meshes).toHaveLength(8);
    const schools=scene.meshes.filter(m=>m.name==='school of reef fish') as Mesh[];
    expect(schools).toHaveLength(3);expect(schools.reduce((n,m)=>n+m.thinInstanceCount,0)).toBe(phone?42:66);
    const before=schools[0]!.thinInstanceGetWorldMatrices().map(m=>m.getTranslation().asArray());
    expect(new Set(before.map(v=>v.join(','))).size).toBe(before.length);
    reef.update(5,new Vector3(80,-20,-60),.5,false,1);
    expect(schools[0]!.thinInstanceGetWorldMatrices().map(m=>m.getTranslation().asArray())).not.toEqual(before);
    for(const m of schools){
      for(const matrix of m.thinInstanceGetWorldMatrices()){
        expect(Array.from(matrix.m).every(Number.isFinite)).toBe(true);
        const y=matrix.getTranslation().y;expect(y).toBeLessThan(-5);expect(y).toBeGreaterThan(-reef.depth+2);
      }
    }
    const bubbles=scene.getMeshByName('air rising from the wreck') as Mesh;
    expect(bubbles.isEnabled()).toBe(true);
    for(const matrix of bubbles.thinInstanceGetWorldMatrices()){
      expect(matrix.getTranslation().y).toBeLessThanOrEqual(0);
      expect(matrix.getTranslation().y).toBeGreaterThanOrEqual(-(reef.depth-7));
    }
    reef.update(6,new Vector3(80,-20,-60),.5,true,0);expect(bubbles.isEnabled()).toBe(false);
    reef.dispose();expect(scene.meshes).toHaveLength(0);expect(scene.materials).toEqual([defaultMaterial]);
    const again=new UnderwaterView(scene,81723,22,100,-40,.6,phone);
    expect(scene.getMeshByName('rippled sandy seabed')!.getVerticesData('position')).toEqual(positions);
    expect((scene.getMeshByName('school of reef fish') as Mesh).thinInstanceGetWorldMatrices().map(m=>m.getTranslation().asArray())).toEqual(before);
    again.dispose();scene.dispose();engine.dispose();
  });
});
