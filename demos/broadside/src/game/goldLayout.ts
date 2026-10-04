import { GOLD_AREAS, COIN_POSE_STRIDE, GOLD_POSE_VERSION } from "./goldAreas";

export function validGoldLayout(data: ArrayBuffer, count: number, world: number): boolean {
  if (!GOLD_AREAS[world] || count < 0 || count > 100000 || count % 1000 || data.byteLength !== count * COIN_POSE_STRIDE * 4) return false;
  const poses = new Float32Array(data);
  for (let i = 0; i < poses.length; i += COIN_POSE_STRIDE) {
    if (!Array.from(poses.subarray(i, i + COIN_POSE_STRIDE)).every(Number.isFinite)) return false;
    if (Math.abs(poses[i]!) > 5 || Math.abs(poses[i + 2]!) > 5 || poses[i + 1]! < -0.6 || poses[i + 1]! > 32) return false;
    const norm = Math.hypot(poses[i + 3]!, poses[i + 4]!, poses[i + 5]!, poses[i + 6]!);
    if (Math.abs(norm - 1) > 0.01) return false;
  }
  return true;
}

let database: Promise<IDBDatabase | null> | undefined;
function coinDatabase(): Promise<IDBDatabase | null> {
  return database ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open("broadside.coin-poses", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("banks");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function savedLayout(key: string): Promise<ArrayBuffer | null> {
  const db = await coinDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction("banks").objectStore("banks").get(key);
      request.onsuccess = () => resolve(request.result instanceof ArrayBuffer ? request.result : null);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function storeLayout(key: string, data: ArrayBuffer): Promise<void> {
  const db = await coinDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction("banks", "readwrite");
      tx.objectStore("banks").put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}
/** Physics is baked once. Visitors load identical settled poses, never re-simulate their fortune. */
export async function loadGoldLayout(world: number, count: number, persistent = true): Promise<Float32Array> {
  if (!count) return new Float32Array();
  const key = `${GOLD_POSE_VERSION}:${world}:${count}`;
  const saved = persistent ? await savedLayout(key) : null;
  if (saved && validGoldLayout(saved, count, world)) return new Float32Array(saved);
  if(count > 10000) {
    // Deposits normally reload their saved physics poses. With unavailable storage,
    // extend the baked hoard in deterministic layers instead of requesting absent assets.
    const base=await loadGoldLayout(world,10000,persistent),stride=COIN_POSE_STRIDE;
    const peak=Math.max(...Array.from({length:10000},(_,i)=>base[i*stride+1]!));
    const poses=new Float32Array(count*stride);
    for(let i=0;i<count;i++) {
      const src=(i%10000)*stride,dst=i*stride,layer=Math.floor(i/10000);
      poses.set(base.subarray(src,src+stride),dst);poses[dst+1]!+=layer*(peak+.12);
    }
    if(persistent)await storeLayout(key,poses.slice().buffer);
    return poses;
  }
  const response = await fetch(`${import.meta.env.BASE_URL}assets/hoard/world-${world}/${count}.bin`);
  if (!response.ok) throw new Error("Could not load the gold bank");
  const data = await response.arrayBuffer();
  if (!validGoldLayout(data, count, world)) throw new Error("Invalid settled coin poses");
  if (persistent) await storeLayout(key, data);
  return new Float32Array(data);
}

export async function saveGoldLayout(world: number, poses: Float32Array, persistent = true): Promise<void> {
  const data = poses.slice().buffer;
  const count = poses.length / COIN_POSE_STRIDE;
  if (!validGoldLayout(data, count, world)) throw new Error("Invalid resting coin deposit");
  if (persistent) await storeLayout(`${GOLD_POSE_VERSION}:${world}:${count}`, data);
}
