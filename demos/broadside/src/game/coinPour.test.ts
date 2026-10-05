import {describe,expect,it} from 'vitest';
import {pourTilt,canSpill,tiltedCoin,carriedCoin} from './coinPour';
import {Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
describe('carried and tilting chest coin poses',()=>{
  const source=new Float32Array([1,.6,-.2,0,0,0,1]);
  it('spills before full inversion and bounds the shared motion',()=>{
    expect(pourTilt(-1)).toBeCloseTo(0);expect(pourTilt(2)).toBeCloseTo(-Math.PI*1.08);
    expect(canSpill(.2)).toBe(false);expect(canSpill(.45)).toBe(true);
    const half=tiltedCoin(source,0,4,.5);
    const angle=pourTilt(.5);
    expect(half.position.x).toBeCloseTo(Math.cos(angle)-.6*Math.sin(angle));expect(half.position.y).toBeCloseTo(4+Math.sin(angle)+.6*Math.cos(angle));
    const full=tiltedCoin(source,0,4,1);
    expect(full.position.x).toBeLessThan(0);expect(full.position.y).toBeLessThan(4);expect(full.position.z).toBeCloseTo(-.2);
    expect(Math.hypot(...Object.values(full.rotation))).toBeCloseTo(1);
  });
  it('matches full render transforms while carried with arbitrary heading and tilt',()=>{
    const q=Quaternion.RotationYawPitchRoll(.7,.1,-.2),translation={x:8,y:.5,z:-5};
    const p=carriedCoin(source,0,{position:translation,rotation:q,lid:0});
    const expected=new Vector3(1,.6,-.2).rotateByQuaternionToRef(q,new Vector3()).add(new Vector3(8,.5,-5));
    expect(p.position.x).toBeCloseTo(expected.x);expect(p.position.y).toBeCloseTo(expected.y);expect(p.position.z).toBeCloseTo(expected.z);
    expect(p.rotation).toMatchObject({x:q.x,y:q.y,z:q.z,w:q.w});
  });
});
