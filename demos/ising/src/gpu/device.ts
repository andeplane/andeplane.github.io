/** WebGPU device bring-up and the "needs WebGPU" screen. */

import { SIZES } from '../physics/lattice.ts';

export interface Gpu {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}

export function showUnsupported(message?: string): void {
  const el = document.getElementById('unsupported')!;
  if (message) {
    const p = el.querySelector('p');
    if (p) p.textContent = message;
  }
  el.hidden = false;
  document.getElementById('loading')?.remove();
}

export async function initGpu(canvas: HTMLCanvasElement): Promise<Gpu | null> {
  if (!('gpu' in navigator)) {
    showUnsupported();
    return null;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      showUnsupported();
      return null;
    }
    const device = await adapter.requestDevice();
    device.lost.then((info) => {
      if (info.reason !== 'destroyed') {
        showUnsupported('The GPU device was lost. Reload the page to restart the lab.');
      }
    });
    const context = canvas.getContext('webgpu');
    if (!context) {
      showUnsupported();
      return null;
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });
    return { device, context, format };
  } catch {
    showUnsupported();
    return null;
  }
}

/**
 * Largest lattice the device can bind, capped a tier lower on touch-first devices —
 * the point of the size control is that the user can always go bigger themselves.
 */
export function defaultSize(device: GPUDevice): number {
  const limit = device.limits.maxStorageBufferBindingSize;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const fits = SIZES.filter((L) => L * L * 4 <= limit);
  const pick = coarse ? fits[Math.min(1, fits.length - 1)] : fits[fits.length - 2] ?? fits[fits.length - 1];
  return pick ?? 510;
}

export function maxSize(device: GPUDevice): number {
  const limit = device.limits.maxStorageBufferBindingSize;
  const fits = SIZES.filter((L) => L * L * 4 <= limit);
  return fits[fits.length - 1] ?? 510;
}
