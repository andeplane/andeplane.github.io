import { COIN_POSE_STRIDE, COIN_RADIUS, COIN_THICKNESS } from "./goldAreas";

/** The permanent hoard is one collision mesh, rather than thousands of
 * overlapping broad-phase objects. Keep every coin's saved pose and solid rim. */
export function settledGoldCollision(poses: Float32Array): { vertices: Float32Array; indices: Uint32Array } {
  const segments = 12, perCoin = segments * 2 + 2;
  const count = poses.length / COIN_POSE_STRIDE;
  const vertices = new Float32Array(count * perCoin * 3);
  const indices = new Uint32Array(count * segments * 12);
  for (let coin = 0; coin < count; coin++) {
    const p = coin * COIN_POSE_STRIDE, base = coin * perCoin;
    const qx = poses[p + 3]!, qy = poses[p + 4]!, qz = poses[p + 5]!, qw = poses[p + 6]!;
    const vertex = (index: number, x: number, y: number, z: number) => {
      const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
      vertices.set([
        poses[p]! + x + qw * tx + qy * tz - qz * ty,
        poses[p + 1]! + y + qw * ty + qz * tx - qx * tz,
        poses[p + 2]! + z + qw * tz + qx * ty - qy * tx,
      ], (base + index) * 3);
    };
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2, x = Math.cos(a) * COIN_RADIUS, z = Math.sin(a) * COIN_RADIUS;
      vertex(i, x, -COIN_THICKNESS / 2, z);
      vertex(i + segments, x, COIN_THICKNESS / 2, z);
      const next = (i + 1) % segments, b = base + i, n = base + next;
      indices.set([
        b, n, b + segments, n, n + segments, b + segments,
        base + segments * 2, n, b,
        base + segments * 2 + 1, b + segments, n + segments,
      ], (coin * segments + i) * 12);
    }
    vertex(segments * 2, 0, -COIN_THICKNESS / 2, 0);
    vertex(segments * 2 + 1, 0, COIN_THICKNESS / 2, 0);
  }
  return { vertices, indices };
}

export interface GoldCollisionPatch { vertices: Float32Array; indices: Uint32Array; }
/** Resting coins never move. Collapse buried geometry into the exposed upper
 * envelope, and split it into small broad-phase bounds. Rendering retains every
 * original coin pose; this inexpensive surface is only used for contacts. */
export function settledGoldPatches(poses: Float32Array): GoldCollisionPatch[] {
  if (!poses.length) return [];
  if (poses.length <= 32 * COIN_POSE_STRIDE) return [settledGoldCollision(poses)];
  const grid = .14, patchSize = 16, cells = new Map<string, number>();
  let bottom = Infinity;
  for (let i = 0; i < poses.length; i += COIN_POSE_STRIDE) {
    const x=poses[i]!, y=poses[i+1]!, z=poses[i+2]!;
    const ny=1-2*(poses[i+3]!**2+poses[i+5]!**2);
    const extent=Math.sqrt(Math.max(0,1-ny*ny))*COIN_RADIUS+Math.abs(ny)*COIN_THICKNESS/2;
    bottom=Math.min(bottom,y-extent-.02);
    // A cell-sized conservative footprint seals cracks between touching coins.
    // Retain the height of tilted coins as well as flat ones.
    for(let gz=Math.floor((z-COIN_RADIUS)/grid);gz<=Math.floor((z+COIN_RADIUS)/grid);gz++)
      for(let gx=Math.floor((x-COIN_RADIUS)/grid);gx<=Math.floor((x+COIN_RADIUS)/grid);gx++) {
        const dx=Math.max(0,gx*grid-x,x-(gx+1)*grid),dz=Math.max(0,gz*grid-z,z-(gz+1)*grid);
        if(dx*dx+dz*dz>COIN_RADIUS**2)continue;
        const key=gx+':'+gz;cells.set(key,Math.max(cells.get(key)??-Infinity,y+extent));
      }
  }
  const groups=new Map<string, [number,number][]>();
  for(const key of cells.keys()) {
    const [x,z]=key.split(':').map(Number) as [number,number];
    const patch=Math.floor(x/patchSize)+':'+Math.floor(z/patchSize);
    const group=groups.get(patch)??[];group.push([x,z]);groups.set(patch,group);
  }
  const height=(x:number,z:number)=>Math.max(...[[-1,-1],[-1,0],[0,-1],[0,0]].map(([dx,dz])=>cells.get((x+dx!)+':'+(z+dz!))??bottom));
  return [...groups.values()].map(group=>{
    const vertices:number[]=[],indices:number[]=[];
    const vertex=(x:number,y:number,z:number)=>{const i=vertices.length/3;vertices.push(x*grid,y,z*grid);return i;};
    for(const [x,z] of group) {
      const a=vertex(x,height(x,z),z),b=vertex(x+1,height(x+1,z),z),c=vertex(x,height(x,z+1),z+1),d=vertex(x+1,height(x+1,z+1),z+1);
      indices.push(a,c,b,b,c,d);
      // Solid outer silhouette, without interior/buried coin faces.
      for(const [dx,dz,u,v] of [[0,-1,a,b],[1,0,b,d],[0,1,d,c],[-1,0,c,a]]) {
        if(cells.has((x+dx!)+':'+(z+dz!)))continue;
        const ui=u!*3,vi=v!*3,lo=vertices.length/3;
        vertices.push(vertices[ui]!,bottom,vertices[ui+2]!,vertices[vi]!,bottom,vertices[vi+2]!);
        indices.push(u!,v!,lo,v!,lo+1,lo);
      }
    }
    return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
  });
}
