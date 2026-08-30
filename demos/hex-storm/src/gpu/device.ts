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
    showUnsupported('navigator.gpu is missing — this browser has WebGPU disabled or unavailable.');
    return null;
  }
  try {
    const adapter =
      (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })) ??
      (await navigator.gpu.requestAdapter());
    if (!adapter) {
      showUnsupported('navigator.gpu exists but requestAdapter() returned null — no usable GPU adapter.');
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
      showUnsupported('canvas.getContext("webgpu") returned null.');
      return null;
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });
    return { device, context, format };
  } catch (err) {
    console.error('[hex-storm] WebGPU init failed', err);
    showUnsupported(`WebGPU init failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
