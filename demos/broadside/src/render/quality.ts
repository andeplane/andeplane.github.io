import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";

const MAX_RENDER_PIXELS = 8_000_000;

/** Babylon divides the CSS canvas size by this scale, so Retina needs 1 / DPR. */
export function displayRenderScale(
  width: number,
  height: number,
  devicePixelRatio: number,
  maxDimension = 16384,
): number {
  const w = Math.max(1, width), h = Math.max(1, height);
  const nativeRatio = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;
  // Keep phones at native resolution. Bound unusually large desktop buffers and
  // respect the GPU's render-target limit without treating touch as low quality.
  const ratio = Math.min(
    nativeRatio,
    Math.sqrt(MAX_RENDER_PIXELS / (w * h)),
    maxDimension / Math.max(w, h),
  );
  return 1 / ratio;
}

export function antialiasSamples(engine: AbstractEngine): number {
  return Math.max(1, Math.min(4, engine.getCaps().maxMSAASamples || 1));
}

/** Keep rock, deck and coin detail sharp when viewed at grazing angles. */
export function configureTextureQuality(engine: AbstractEngine): void {
  const anisotropy = Math.max(1, Math.min(16, engine.getCaps().maxAnisotropy || 1));
  engine.onNewSceneAddedObservable.add(scene => {
    scene.onNewTextureAddedObservable.add(texture => {
      texture.anisotropicFilteringLevel = anisotropy;
    });
  });
}
