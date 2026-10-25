import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { shipHoldCamera } from '../shared/pirate-world/render/shipHoldCamera';
import { holdCargoPosition } from '../shared/pirate-world/render/cargoChests';

describe('shared ship hold framing', () => {
  it('shows the whole active open chest and both previous chests on a393-by852 phone', () => {
    const engine = new NullEngine({ renderWidth:393,renderHeight:852,textureSize:512,deterministicLockstep:false,lockstepMaxSteps:4 });
    const scene = new Scene(engine), framing = shipHoldCamera(true, 0, true);
    const camera = new FreeCamera('test hold framing',Vector3.Zero(),scene);
    camera.position.copyFromFloats(framing.position.x,framing.position.y,framing.position.z);
    camera.setTarget(new Vector3(framing.target.x,framing.target.y,framing.target.z));camera.fov=framing.fov;
    const projection=camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
    const boxes=[{x:0,y:1.05,z:0,scale:1},holdCargoPosition(0),holdCargoPosition(1)];
    for(const box of boxes)for(const dx of [-1,1])for(const dy of [0,1])for(const dz of [-1,1]){
      const point=new Vector3(box.x+dx*1.85*box.scale,box.y+dy*3.3*box.scale,box.z+dz*1.4*box.scale);
      const screen=Vector3.Project(point,Matrix.Identity(),projection,camera.viewport.toGlobal(393,852));
      expect(screen.x).toBeGreaterThan(0);expect(screen.x).toBeLessThan(393);
      expect(screen.y).toBeGreaterThan(0);expect(screen.y).toBeLessThan(852);
    }
    scene.dispose();engine.dispose();
  });
  it('looks over the front rim at actual coins resting on the bottom of a100-coin chest', () => {
    const {position}=shipHoldCamera(true,0,true);
    const coin={y:1.05+.29,z:.6},frontRim={y:1.05+1.45,z:-.99};
    const fraction=(frontRim.z-position.z)/(coin.z-position.z);
    const sightlineHeight=position.y+(coin.y-position.y)*fraction;
    expect(sightlineHeight).toBeGreaterThan(frontRim.y);
    expect(position.y).toBeLessThan(6.25); // Stay below the cabin ceiling.
  });
});
