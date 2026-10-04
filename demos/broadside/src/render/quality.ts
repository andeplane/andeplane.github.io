import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";

const MAX_RENDER_PIXELS = 8_000_000;
const phoneEngines = new WeakSet<AbstractEngine>();

export function configurePhoneRendering(engine: AbstractEngine, phone: boolean): void {
  if (phone) phoneEngines.add(engine);
}

export const isPhoneRendering = (engine: AbstractEngine): boolean => phoneEngines.has(engine);

/** Babylon divides the CSS canvas size by this scale, so Retina needs 1 / DPR. */
export function displayRenderScale(
  width: number,
  height: number,
  devicePixelRatio: number,
  maxDimension = 16384,
  phone = false,
): number {
  const w = Math.max(1, width), h = Math.max(1, height);
  const nativeRatio = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;
  // A 3x phone with HDR and multisampling can exhaust WKWebView's memory limit.
  // DOM controls stay native-resolution; bound only the 3D drawing buffer.
  const ratio = Math.min(
    nativeRatio,
    phone ? 1.5 : nativeRatio,
    Math.sqrt((phone ? 1_000_000 : MAX_RENDER_PIXELS) / (w * h)),
    maxDimension / Math.max(w, h),
  );
  return 1 / ratio;
}

export function antialiasSamples(engine: AbstractEngine): number {
  if (isPhoneRendering(engine)) return 1; // FXAA smooths edges without MSAA buffers.
  return Math.max(1, Math.min(4, engine.getCaps().maxMSAASamples || 1));
}

/** Keep rock, deck and coin detail sharp when viewed at grazing angles. */
export function configureTextureQuality(engine: AbstractEngine): void {
  const anisotropy = Math.max(1, Math.min(isPhoneRendering(engine) ? 4 : 16, engine.getCaps().maxAnisotropy || 1));
  engine.onNewSceneAddedObservable.add(scene => {
    scene.onNewTextureAddedObservable.add(texture => {
      texture.anisotropicFilteringLevel = anisotropy;
    });
  });
}
