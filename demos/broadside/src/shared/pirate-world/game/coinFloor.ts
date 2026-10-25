import { caveFloor } from "../input/caveLayout";
import type { GoldCollisionPatch } from "./goldCollision";
export function coinFloor(area:{x:number;z:number},floorY?:number):GoldCollisionPatch {
  const minX=floorY===undefined?-15:-4.7,maxX=floorY===undefined?36:4.7;
  const minZ=floorY===undefined?-19:-7.5,maxZ=floorY===undefined?50:7.5;
  const nx=Math.ceil((maxX-minX)/.28),nz=Math.ceil((maxZ-minZ)/.28);
  const vertices=new Float32Array((nx+1)*(nz+1)*3),indices=new Uint32Array(nx*nz*6);
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++) {
    const x=minX+i*(maxX-minX)/nx,z=minZ+j*(maxZ-minZ)/nz,k=(j*(nx+1)+i)*3;
    vertices.set([x-(floorY===undefined?area.x:0),floorY??caveFloor(x,z),z-(floorY===undefined?area.z:0)],k);
    if(i<nx&&j<nz){const a=j*(nx+1)+i;indices.set([a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2],(j*nx+i)*6);}
  }
  return {vertices,indices};
}
