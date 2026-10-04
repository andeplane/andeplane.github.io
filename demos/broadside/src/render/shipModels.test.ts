import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { AssetContainer as Container } from '@babylonjs/core/assetContainer.js';
import { AssetContainer } from '@babylonjs/core/assetContainer.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import { ShipModels } from './shipModels';

vi.mock('@babylonjs/core/Loading/sceneLoader.js', () => ({ LoadAssetContainerAsync: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.mocked(LoadAssetContainerAsync).mockReset(); });

const fixture = () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 200})));
  return {engine, scene, models: new ShipModels(scene)};
};
describe('voyage model lifetime', () => {
  it('releases all off-scene asset containers when leaving a voyage', async () => {
    const {engine, scene, models} = fixture();
    const disposals: ReturnType<typeof vi.spyOn>[] = [];
    vi.mocked(LoadAssetContainerAsync).mockImplementation(async () => {
      const container = new AssetContainer(scene);
      disposals.push(vi.spyOn(container, 'dispose'));
      return container;
    });
    expect((await models.load()).blackPearl).toBe(true);
    expect(disposals).toHaveLength(5);
    scene.dispose();
    expect(disposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true);
    engine.dispose();
  });
  it('disposes in-flight class loads after cancellation and skips the Pearl load', async () => {
    const {engine, scene, models} = fixture();
    const pending: (() => void)[] = [];
    const containers = Array.from({length:4}, () => ({dispose:vi.fn()}) as unknown as Container);
    const disposals = containers.map(c => vi.spyOn(c, 'dispose'));
    vi.mocked(LoadAssetContainerAsync).mockImplementation(() => new Promise(resolve => {
      const container = containers[pending.length]!;
      pending.push(() => resolve(container));
    }));
    const loading = models.load();
    await vi.waitFor(() => expect(pending).toHaveLength(4));
    scene.dispose();
    pending.forEach(resolve => resolve());
    expect((await loading).blackPearl).toBe(false);
    expect(LoadAssetContainerAsync).toHaveBeenCalledTimes(4);
    expect(disposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true);
    engine.dispose();
  });
  it('releases a Pearl load that finishes after leaving the scene', async () => {
    const {engine, scene, models} = fixture();
    let finish: (() => void) | undefined;
    const pearl = {dispose:vi.fn()} as unknown as Container, dispose = vi.spyOn(pearl, 'dispose');
    vi.mocked(LoadAssetContainerAsync).mockImplementation(async url => {
      if (String(url).includes('black-pearl.glb')) return new Promise(resolve => {finish = () => resolve(pearl);});
      return new AssetContainer(scene);
    });
    const loading = models.load();
    await vi.waitFor(() => expect(finish).toBeDefined());
    scene.dispose(); finish!();
    expect((await loading).blackPearl).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
    engine.dispose();
  });
});
