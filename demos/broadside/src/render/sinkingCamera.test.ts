import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { createShip, SHIP_SPECS, SINK_DURATION } from '../sim/ships';
import { SinkingCamera, reefDepth } from './sinkingCamera';

afterEach(()=>vi.unstubAllGlobals());
describe('the sinking camera',()=>{
  it.each([390,1280])('descends smoothly from the current %s view and holds above the seabed',width=>{
    vi.stubGlobal('innerWidth',width);
    const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('wreck',new Vector3(15,75,-60),scene);
    camera.setTarget(Vector3.Zero());
    const ship=createShip(1,SHIP_SPECS.galleon,'player',{x:100,z:-40},.6),dive=new SinkingCamera();
    const original=camera.position.clone();dive.start(camera);
    // The rig is still free to update its overhead pose; the descent starts at the last visible frame.
    camera.position.set(100,90,-90);dive.apply(camera,ship);
    expect(camera.position.equals(original)).toBe(true);
    let previous=camera.position.clone(),maximumStep=0;
    for(let i=1;i<=SINK_DURATION*60;i++){
      ship.sinkTime=i/60;dive.apply(camera,ship);
      maximumStep=Math.max(maximumStep,Vector3.Distance(previous,camera.position));previous=camera.position.clone();
    }
    expect(maximumStep).toBeLessThan(2.5);
    expect(camera.position.y).toBeLessThan(-15);
    expect(camera.position.y).toBeGreaterThan(-reefDepth(ship.spec.length)+8);
    expect(camera.fovMode).toBe(width<600?Camera.FOVMODE_HORIZONTAL_FIXED:Camera.FOVMODE_VERTICAL_FIXED);
    expect(camera.rotation.z).toBe(0);expect(camera.minZ).toBe(.07);
    const last=camera.position.clone();ship.sinkTime=60;dive.apply(camera,ship);expect(camera.position.equals(last)).toBe(true);
    dive.reset();ship.sinkTime=0;camera.position.set(9,5,7);dive.apply(camera,ship);expect(camera.position.equals(new Vector3(9,5,7))).toBe(true);
    scene.dispose();engine.dispose();
  });
  it.each(Object.values(SHIP_SPECS))('keeps enough seabed depth for $class wrecks',spec=>{
    expect(reefDepth(spec.length)).toBeGreaterThan(spec.length*1.2+6);
  });
});
