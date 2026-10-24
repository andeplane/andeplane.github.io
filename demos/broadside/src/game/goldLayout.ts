import { removedCoinPose, GOLD_AREAS, COIN_POSE_STRIDE, GOLD_POSE_VERSION } from "./goldAreas";

export function validGoldLayout(data: ArrayBuffer, count: number, world: number): boolean {
  if (!GOLD_AREAS[world] || count < 0 || count > 100000 || count % 100 || data.byteLength !== count * COIN_POSE_STRIDE * 4) return false;
  const poses = new Float32Array(data);
  for (let i = 0; i < poses.length; i += COIN_POSE_STRIDE) {
    if (!Array.from(poses.subarray(i, i + COIN_POSE_STRIDE)).every(Number.isFinite)) return false;
    if (removedCoinPose(poses, i)) {
      if (poses[i] !== 0 || poses[i + 1] !== 0 || poses[i + 2] !== 0) return false;
      continue;
    }
    const area=GOLD_AREAS[world]!,x=poses[i]!+area.x,z=poses[i+2]!+area.z;
    // The full cavern and its canal floor, rather than an imaginary bank box.
    // Also accepts ship-hold local coordinates, using the same layout format.
    if (x < -16 || x > 37 || z < -20 || z > 51 || poses[i + 1]! < -1.5 || poses[i + 1]! > 32) return false;
    const norm = Math.hypot(poses[i + 3]!, poses[i + 4]!, poses[i + 5]!, poses[i + 6]!);
    if (Math.abs(norm - 1) > 0.01) return false;
  }
  return true;
}

const databases = new Map<string, Promise<IDBDatabase | null>>();
function coinDatabase(namespace: string): Promise<IDBDatabase | null> {
  const existing = databases.get(namespace);
  if (existing) return existing;
  const database = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(namespace, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("banks");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  databases.set(namespace, database);
  return database;
}
async function savedLayout(key: string, namespace: string): Promise<ArrayBuffer | null> {
  const db = await coinDatabase(namespace);
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction("banks").objectStore("banks").get(key);
      request.onsuccess = () => resolve(request.result instanceof ArrayBuffer ? request.result : null);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function storeLayout(key: string, data: ArrayBuffer, namespace: string): Promise<void> {
  const db = await coinDatabase(namespace);
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction("banks", "readwrite");
      const store=tx.objectStore("banks");
      store.put(data,key);
      // Keep the current snapshot and the newest previous/future snapshot for
      // interrupted delivery recovery, rather than accumulating an endless history.
      if(typeof store.getAllKeys === "function"){
        const request=store.getAllKeys(),prefix=key.slice(0,key.lastIndexOf(':')+1);
        request.onsuccess=()=>{
          const keys=request.result.filter((k):k is string=>typeof k==='string'&&k.startsWith(prefix));
          keys.sort((a,b)=>Number(b.slice(prefix.length))-Number(a.slice(prefix.length)));
          const keep=new Set([key,...keys.slice(0,2)]);
          for(const old of keys)if(!keep.has(old))store.delete(old);
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}
/** Physics is baked once. Visitors load identical settled poses, never re-simulate their fortune. */
export async function loadGoldLayout(world: number, count: number, persistent = true, namespace = "broadside.coin-poses", balance = count): Promise<Float32Array> {
  if (!count) return new Float32Array();
  const key = `${GOLD_POSE_VERSION}:${world}:${balance}`;
  const saved = persistent ? await savedLayout(key, namespace) : null;
  if (saved && validGoldLayout(saved, count, world)) return new Float32Array(saved);
  if(count > 10000) {
    // Deposits normally reload their saved physics poses. With unavailable storage,
    // extend the baked hoard in deterministic layers instead of requesting absent assets.
    const base=await loadGoldLayout(world,10000,persistent,namespace),stride=COIN_POSE_STRIDE;
    const peak=Math.max(...Array.from({length:10000},(_,i)=>base[i*stride+1]!));
    const poses=new Float32Array(count*stride);
    for(let i=0;i<count;i++) {
      const src=(i%10000)*stride,dst=i*stride,layer=Math.floor(i/10000);
      poses.set(base.subarray(src,src+stride),dst);
      if (!removedCoinPose(base, src)) poses[dst+1]!+=layer*(peak+.12);
    }
    if(persistent)await storeLayout(key,poses.slice().buffer,namespace);
    return poses;
  }
  const bakedCount = Math.ceil(count / 1000) * 1000;
  const response = await fetch(`${import.meta.env.BASE_URL}assets/hoard/world-${world}/${bakedCount}.bin`);
  if (!response.ok) throw new Error("Could not load the gold bank");
  const baked = await response.arrayBuffer();
  if (!validGoldLayout(baked, bakedCount, world)) throw new Error("Invalid settled coin poses");
  const data = baked.slice(0, count * COIN_POSE_STRIDE * 4);
  if (!validGoldLayout(data, count, world)) throw new Error("Invalid settled coin poses");
  if (persistent) await storeLayout(key, data, namespace);
  return new Float32Array(data);
}

export async function saveGoldLayout(world: number, poses: Float32Array, persistent = true, namespace = "broadside.coin-poses", balance = poses.length / COIN_POSE_STRIDE): Promise<void> {
  const data = poses.slice().buffer;
  const count = poses.length / COIN_POSE_STRIDE;
  if (!validGoldLayout(data, count, world)) throw new Error("Invalid resting coin deposit");
  if (persistent) await storeLayout(`${GOLD_POSE_VERSION}:${world}:${balance}`, data, namespace);
}
