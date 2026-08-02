import {
  ACESFilmicToneMapping,
  HalfFloatType,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  composer: EffectComposer;
  /** Hand the camera over to a view mode, or give it back to the orbit controls. */
  setCameraDriven(driven: boolean): void;
  render(): void;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Tone mapping and the sRGB transform are applied by OutputPass at the end of the
  // chain, but the renderer is where they are configured -- OutputPass reads them from
  // here.
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();

  // A narrow field of view. The default 75 degrees distorts spheres toward the edges of
  // the frame and makes everything look like a video game.
  const camera = new PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.05, 4000);
  // Well above the orbital plane, so the orbit opens into a broad ellipse and the moon
  // -- pinned above the planet in the co-rotating view -- clears the planet's disc
  // instead of sitting on top of it.
  camera.position.set(1.2, 17.5, 15.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2.2;
  controls.maxDistance = 120;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;

  // `antialias: true` is ignored the moment rendering goes through a composer, so the
  // multisampling has to be asked for on the composer's own target instead. Without it
  // the moon's limb against black space is a staircase.
  const size = renderer.getDrawingBufferSize(new Vector2());
  const target = new WebGLRenderTarget(size.x, size.y, {
    type: HalfFloatType,
    samples: 4,
  });

  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  // A high threshold: only the sunlit limb, the city lights and the star cores should
  // glow. Blooming the whole scene at a low threshold is the fastest route to looking
  // cheap.
  const bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0.45, 0.62, 1.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    const s = renderer.getDrawingBufferSize(new Vector2());
    bloom.setSize(s.x, s.y);
  };
  window.addEventListener('resize', onResize);

  const home = camera.position.clone();

  return {
    renderer,
    scene,
    camera,
    controls,
    composer,
    setCameraDriven(driven: boolean) {
      controls.enabled = !driven;
      if (!driven) {
        camera.position.copy(home);
        controls.target.set(0, 0, 0);
        camera.up.set(0, 1, 0);
        controls.update();
      }
    },
    render() {
      // Skipped when a view mode is driving the camera itself: OrbitControls recomputes
      // the camera from its own spherical coordinates on every update and would fight it.
      if (controls.enabled) controls.update();
      composer.render();
    },
  };
}
