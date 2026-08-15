/**
 * localStorage guarded against SecurityError. With cookies/site data blocked the
 * bare API throws, and anything on the startup path that touches it would take the
 * whole app down with it. Degrade instead: reads return null (onboarding simply
 * reappears), writes are dropped.
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
