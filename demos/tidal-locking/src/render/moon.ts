import {
  Group,
  Matrix3,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { asset, loadMap } from './textures.ts';

/**
 * The moon: an icosphere whose every vertex is pushed through the soft body's
 * deformation gradient.
 *
 * The tidal potential is quadratic in position, so the l=2 response of the body is
 * affine to very good accuracy. That means one 3x3 matrix reproduces the entire
 * deformation of the surface -- no per-vertex skinning, no weights, no seams, and
 * normals that are exact rather than approximated, since for an affine map the correct
 * normal transform is just the inverse transpose. It also lets us use a 40k-vertex
 * sphere for a clean silhouette at no per-frame CPU cost.
 */
export class MoonView {
  readonly group = new Group();
  private readonly material: ShaderMaterial;

  private readonly deform = new Matrix3();
  private readonly rotation = new Matrix3();
  private readonly stretch = new Matrix3();
  private readonly scratch = new Matrix3();

  constructor(renderer: WebGLRenderer, radius: number) {
    // A sphere rather than an icosphere: equirectangular UVs, with the seam already
    // split across duplicated vertices, are what the LRO maps need.
    const geometry = new SphereGeometry(radius, 320, 160);

    this.material = new ShaderMaterial({
      uniforms: {
        uDeform: { value: new Matrix3() },
        uNormalDeform: { value: new Matrix3() },
        uColor: { value: loadMap(renderer, asset('moon_color.jpg'), true) },
        uHeight: { value: loadMap(renderer, asset('moon_height.jpg'), false) },
        uRadius: { value: radius },
        uRelief: { value: 0.006 * radius },
        uSunDir: { value: new Vector3(1, 0, 0) },
        uEarthDir: { value: new Vector3(-1, 0, 0) },
        uEarthshine: { value: 0.16 },
        uNearSideMark: { value: 0 },
      },
      vertexShader: MOON_VERT,
      fragmentShader: MOON_FRAG,
    });

    const body = new Mesh(geometry, this.material);
    body.frustumCulled = false;
    this.group.add(body);

  }

  /**
   * Feed in the body's deformation gradient.
   *
   * `exaggeration` scales the tidal bulge for the eye without touching the physics. It
   * is applied to the stretch only, never to the whole matrix: exaggerating F directly
   * would amplify the rotation as well and smear the moon into a blur.
   */
  update(f: ArrayLike<number>, exaggeration: number): void {
    this.deform.set(f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[8]);

    if (exaggeration !== 1) {
      polarDecompose(this.deform, this.rotation, this.stretch, this.scratch);
      // stretch <- I + s (stretch - I)
      const e = this.stretch.elements;
      for (let i = 0; i < 9; i++) {
        const identity = i % 4 === 0 ? 1 : 0;
        e[i] = identity + exaggeration * (e[i] - identity);
      }
      this.deform.multiplyMatrices(this.rotation, this.stretch);
    }

    const uniforms = this.material.uniforms;
    (uniforms.uDeform.value as Matrix3).copy(this.deform);
    (uniforms.uNormalDeform.value as Matrix3).copy(this.deform).invert().transpose();
  }

  setLighting(sunDir: Vector3, earthDir: Vector3): void {
    (this.material.uniforms.uSunDir.value as Vector3).copy(sunDir);
    (this.material.uniforms.uEarthDir.value as Vector3).copy(earthDir);
  }

  setNearSideMark(on: boolean): void {
    this.material.uniforms.uNearSideMark.value = on ? 1 : 0;
  }

  setRelief(amount: number): void {
    this.material.uniforms.uRelief.value = amount;
  }
}

/**
 * Split M into a rotation and a symmetric stretch, M = R S, by Newton iteration on
 * R <- (R + R^-T) / 2. Converges in a handful of steps for a near-rotation.
 */
function polarDecompose(m: Matrix3, rotation: Matrix3, stretch: Matrix3, tmp: Matrix3): void {
  rotation.copy(m);
  for (let i = 0; i < 8; i++) {
    tmp.copy(rotation).invert().transpose();
    const a = rotation.elements;
    const b = tmp.elements;
    let delta = 0;
    for (let j = 0; j < 9; j++) {
      const next = 0.5 * (a[j] + b[j]);
      delta += Math.abs(next - a[j]);
      a[j] = next;
    }
    if (delta < 1e-12) break;
  }
  stretch.copy(rotation).transpose().multiply(m);
}

const MOON_VERT = /* glsl */ `
uniform mat3 uDeform;
uniform mat3 uNormalDeform;
uniform float uRadius;
uniform float uRelief;
uniform sampler2D uHeight;

varying vec2 vUv;
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vec3 dir = normalize(position);
  vUv = uv;
  vObj = dir;

  // Real lunar topography, from the LOLA laser altimeter. Displacing the geometry
  // rather than only perturbing normals is what puts crater rims on the silhouette --
  // and the limb is where the eye checks whether a sphere is really a landscape.
  float h = texture2D(uHeight, uv).r - 0.5;

  // Relief is applied in the body's rest frame and then carried through the
  // deformation, so the terrain rides along with the tidal bulge rather than sliding
  // over it.
  vec3 rest = dir * (uRadius + h * uRelief);
  vec3 deformed = uDeform * rest;

  vec4 world = modelMatrix * vec4(deformed, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * (uNormalDeform * dir));
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const MOON_FRAG = /* glsl */ `
precision highp float;

uniform mat3 uNormalDeform;
uniform sampler2D uColor;
uniform sampler2D uHeight;
uniform vec3 uSunDir;
uniform vec3 uEarthDir;
uniform float uEarthshine;
uniform float uNearSideMark;
uniform float uRelief;
uniform float uRadius;

varying vec2 vUv;
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vWorld;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

void main() {
  vec3 dir = normalize(vObj);

  // Normal from the altimetry. Four taps of the height map, scaled by how much surface
  // each texel covers, so the bump strength does not change with map resolution.
  vec2 texel = vec2(1.0) / vec2(1024.0, 512.0);
  float hL = texture2D(uHeight, vUv - vec2(texel.x, 0.0)).r;
  float hR = texture2D(uHeight, vUv + vec2(texel.x, 0.0)).r;
  float hD = texture2D(uHeight, vUv - vec2(0.0, texel.y)).r;
  float hU = texture2D(uHeight, vUv + vec2(0.0, texel.y)).r;

  // Longitude lines crowd together toward the poles, so the east-west gradient has to
  // be divided by cos(latitude) or the terrain smears into streaks up there.
  float cosLat = max(sqrt(max(1.0 - dir.y * dir.y, 0.0)), 0.15);
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), dir));
  vec3 north = cross(dir, east);
  float scale = uRelief / uRadius * 95.0;
  vec3 objNormal = normalize(
    dir - scale * ((hR - hL) / cosLat * east + (hU - hD) * north));
  vec3 n = normalize(uNormalDeform * objNormal);

  // LROC colour, already carrying the maria, the ray systems and every real crater.
  vec3 albedo = toLinear(texture2D(uColor, vUv).rgb);

  if (uNearSideMark > 0.5) {
    float ring = smoothstep(0.03, 0.0, abs(dot(dir, vec3(-1.0, 0.0, 0.0)) - 0.72));
    albedo = mix(albedo, vec3(0.85, 0.45, 0.18), ring * 0.85);
  }

  vec3 viewDir = normalize(cameraPosition - vWorld);
  float mu0 = max(dot(n, uSunDir), 0.0);
  float mu = max(dot(n, viewDir), 0.0);
  float phase = degrees(acos(clamp(dot(uSunDir, viewDir), -1.0, 1.0)));

  // The lunar-Lambert law of McEwen, as used by USGS ISIS for lunar imagery. At full
  // moon it is pure Lommel-Seeliger -- a flat disc with no limb darkening, which is why
  // the real full moon looks like a cut-out rather than a shaded ball -- and it drifts
  // toward Lambert as the crescent narrows. Lambert alone is visibly wrong near full.
  float L = clamp(1.0 - 0.019 * phase + 0.000242 * phase * phase
                      - 1.46e-6 * phase * phase * phase, 0.0, 1.0);
  float disk = (1.0 - L) * mu0 + 2.0 * L * mu0 / (mu0 + mu + 1e-4);

  // Shadow-hiding opposition surge, normalised so it equals one at zero phase and dims
  // away from it. Adding a surge on top instead would simply make the full moon too
  // bright, which is the usual mistake.
  float t = tan(radians(phase) * 0.5);
  float surge = (1.0 + 0.45 / (1.0 + t / 0.06)) / 1.45;

  // Gain chosen so the sub-solar point lands near 0.26 in scene-linear terms. Under
  // ACES that is where the 0.06-to-0.20 span of real lunar albedo separates into the
  // most tonal steps; push it past about 1.0 and mare, highland and fresh ejecta all
  // compress into the top of the curve and the moon goes flat white.
  vec3 color = albedo * disk * surge * 2.2;

  // Earthshine fills the night side with the light of a blue planet overhead.
  color += albedo * uEarthshine * max(dot(n, uEarthDir), 0.0)
         * (1.0 - smoothstep(-0.04, 0.06, dot(n, uSunDir))) * vec3(0.42, 0.58, 1.0);

  // Starlight, so the dark limb never goes to pure black.
  color += albedo * 0.012;

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;


