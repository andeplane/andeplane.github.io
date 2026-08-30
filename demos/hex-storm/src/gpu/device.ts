/** WebGPU device bring-up and the "needs WebGPU" screen. */

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
    const errors: string[] = [];
    (window as unknown as { __gpuErrors: string[] }).__gpuErrors = errors;
    device.onuncapturederror = (ev) => {
      errors.push(ev.error.message);
      console.error('[webgpu]', ev.error.message);
    };
    device.lost.then((info) => {
      if (info.reason !== 'destroyed') {
        showUnsupported('The GPU device was lost. Reload the page to restart the storm.');
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
