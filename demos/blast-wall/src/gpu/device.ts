/** WebGPU bring-up and the "needs WebGPU" screen. */

export interface Gpu {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}

export function showUnsupported(message?: string): void {
  const el = document.getElementById('unsupported');
  if (!el) return;
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
    const device = await adapter.requestDevice({
      // A wall of any size needs one big arena; the default 128 MiB cap is plenty but
      // the default per-binding cap is not.
      requiredLimits: {
        maxStorageBufferBindingSize: Math.min(
          adapter.limits.maxStorageBufferBindingSize,
          512 * 1024 * 1024,
        ),
        maxBufferSize: Math.min(adapter.limits.maxBufferSize, 512 * 1024 * 1024),
      },
    });
    device.lost.then((info) => {
      if (info.reason !== 'destroyed') {
        showUnsupported('The GPU device was lost. Reload the page to rebuild the wall.');
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
  } catch (err) {
    showUnsupported(`WebGPU failed to start: ${(err as Error).message}`);
    return null;
  }
}
