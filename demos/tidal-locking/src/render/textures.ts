import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
  type WebGLRenderer,
} from 'three';

const loader = new TextureLoader();
const pending: Promise<unknown>[] = [];

/**
 * Resolves once every map requested so far has decoded.
 *
 * Worth waiting for: the moon's colour map is several megabytes, and until it arrives
 * the moon renders as a black disc. Physics is running by then, so without this the
 * first thing anyone sees is a hole in the sky where the subject should be.
 */
export function texturesReady(): Promise<unknown> {
  return Promise.all(pending);
}

/**
 * Load an equirectangular map with the settings a globe actually needs.
 *
 * Anisotropy is the single biggest quality lever here: a sphere's limb is entirely
 * grazing-angle texels, and at the default of 1 they smear into mush exactly where the
 * eye goes first. Colour maps are tagged sRGB and data maps are not -- a raw
 * ShaderMaterial does no decoding for you, unlike the built-in materials, so getting
 * this wrong washes everything out.
 */
export function loadMap(renderer: WebGLRenderer, url: string, colour: boolean): Texture {
  let settle: () => void = () => {};
  pending.push(new Promise<void>((resolve) => (settle = resolve)));
  // Resolve on failure too, so one missing file cannot hold the page on its splash.
  const texture = loader.load(url, settle, undefined, settle);
  texture.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

/** Base path for bundled assets, so this works under a GitHub Pages subpath. */
export function asset(name: string): string {
  return `${import.meta.env.BASE_URL}textures/${name}`;
}
