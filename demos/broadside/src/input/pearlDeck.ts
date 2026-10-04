type Point = [number, number, number];
export interface PearlManifest {
  version: number;
  floorTriangles: [Point, Point, Point][];
  cabin: { floor: number; x: [number, number]; z: [number, number] };
  ramps?: { x: [number,number]; stations: [number,number][] }[];
}

/** Sample exported deck/stair surfaces without snapping through the cabin roof. */
export class PearlDeck {
  private cells = new Map<string, [Point, Point, Point][]>();
  constructor(readonly manifest: PearlManifest) {
    for (const t of manifest.floorTriangles) {
      const xs = t.map(p => p[0]), zs = t.map(p => p[2]);
      for (let x = Math.floor(Math.min(...xs) / 2); x <= Math.floor(Math.max(...xs) / 2); x++)
        for (let z = Math.floor(Math.min(...zs) / 2); z <= Math.floor(Math.max(...zs) / 2); z++) {
          const key = `${x},${z}`;
          const cell = this.cells.get(key) ?? []; cell.push(t); this.cells.set(key, cell);
        }
    }
  }
  inCabin(x: number, z: number): boolean {
    const c = this.manifest.cabin;
    return x > c.x[0] + .35 && x < c.x[1] - .35 && z > c.z[0] + .35 && z < c.z[1];
  }
  floor(x: number, z: number, feet: number): number | undefined {
    // Continuous collision ramps bridge tiny seams between authored stair treads.
    for (const ramp of this.manifest.ramps ?? []) {
      if (x < ramp.x[0] || x > ramp.x[1]) continue;
      for (let i=1;i<ramp.stations.length;i++) {
        const a=ramp.stations[i-1]!, b=ramp.stations[i]!;
        if (z<a[0] || z>b[0]) continue;
        const y=a[1]+(b[1]-a[1])*(z-a[0])/(b[0]-a[0]);
        if (y<=feet+.4 && feet-y<1) return y;
      }
    }
    let floor: number | undefined;
    if (this.inCabin(x, z) && this.manifest.cabin.floor <= feet + .4) floor = this.manifest.cabin.floor;
    if (Math.abs(x)<1.15 && z>-12.2 && z<-10.4 && feet+.4>=this.manifest.cabin.floor)
      floor=this.manifest.cabin.floor;
    for (const [a, b, c] of this.cells.get(`${Math.floor(x / 2)},${Math.floor(z / 2)}`) ?? []) {
      const d = (b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
      if (Math.abs(d) < 1e-8) continue;
      const u = ((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d;
      const v = ((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;
      if (u < -.001 || v < -.001 || u+v > 1.001) continue;
      const y = u*a[1]+v*b[1]+(1-u-v)*c[1];
      if (y <= feet + .4 && (floor === undefined || y > floor)) floor = y;
    }
    return floor;
  }
  walkable(x: number, z: number, feet: number): boolean {
    if (Math.abs(x) > 5.6 || z < -21.6 || z > 22) return false;
    // The lower room connects to the main deck through its central doorway.
    if (feet < 6.2 && z < -10.7 && z > -12.2 && Math.abs(x) > 1.15) return false;
    const floor=this.floor(x,z,feet);
    // Rails bound the authored deck. A missing upper face must not lead straight
    // through the roof to the cabin floor six metres below; jumping still works.
    return floor !== undefined && floor >= feet-1.6;
  }
}
