/**
 * localStorage guarded against SecurityError. With cookies/site data blocked the bare API
 * throws, and anything on the startup path that touches it would take the whole app down
 * with it. Degrade instead: reads return null, writes are dropped.
 *
 * Same shape as `demos/ising/src/storage.ts`.
 */

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the preference just doesn't persist.
  }
}

export function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // As above.
  }
}
