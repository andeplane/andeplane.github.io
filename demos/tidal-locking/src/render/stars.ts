import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { NOISE_GLSL } from './noise.glsl.ts';
import { makeRng } from '../physics/rng.ts';

/**
 * Background: a few thousand stars and a faint galactic band.
 *
 * All-white, all-same-size points are the tell of a WebGL demo. Real stars vary in
 * brightness over orders of magnitude and in colour from blue-white to deep orange, and
 * a handful are much brighter than the rest. That variation is most of the effect.
 */
export function createStarfield(radius: number): Group {
  const group = new Group();
  group.add(createStars(radius, 5200));
  group.add(createMilkyWay(radius));
  return group;
}

function createStars(radius: number, count: number): Points {
  const rng = makeRng(90210);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Uniform on the sphere.
    const u = rng() * 2 - 1;
    const phi = rng() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = radius * s * Math.cos(phi);
    positions[i * 3 + 1] = radius * u;
    positions[i * 3 + 2] = radius * s * Math.sin(phi);

    // Colour temperature: mostly cool white, with a red-orange tail.
    const t = Math.pow(rng(), 2.2);
    const r = 1.0;
    const g = 1.0 - t * 0.42;
    const b = 1.0 - t * 0.78;

    // Brightness follows a steep power law, so a few stars really stand out.
    const mag = Math.pow(rng(), 3.4);
    const brightness = 0.16 + mag * 1.5;
    colors[i * 3] = r * brightness;
    colors[i * 3 + 1] = g * brightness;
    colors[i * 3 + 2] = b * brightness;
    sizes[i] = 1.1 + mag * 5.0;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('size', new BufferAttribute(sizes, 1));

  const material = new ShaderMaterial({
    uniforms: { uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      uniform float uScale;
      varying vec3 vColor;
      void main() {
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uScale;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vColor;
      void main() {
        // Soft core with a wide faint skirt, so bright stars read as points of light
        // rather than as discs.
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float core = exp(-d * d * 7.0);
        float skirt = exp(-d * 2.6) * 0.25;
        float a = clamp(core + skirt, 0.0, 1.0);
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -10;
  return points;
}

function createMilkyWay(radius: number): Mesh {
  const material = new ShaderMaterial({
    uniforms: {},
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        // A band tilted off the orbital plane, so it does not read as a level horizon.
        vec3 pole = normalize(vec3(0.34, 0.82, -0.46));
        float band = abs(dot(vDir, pole));
        float profile = exp(-band * band * 60.0);
        float clouds = clamp(fbm(vDir * 3.2, 6, 2.1, 0.55) * 1.4 + 0.45, 0.0, 1.0);
        float dust = smoothstep(0.35, 0.75, fbm(vDir * 5.5 + 20.0, 5, 2.2, 0.5) + 0.5);
        float a = profile * clouds * (1.0 - dust * 0.65);
        vec3 tint = mix(vec3(0.36, 0.42, 0.68), vec3(0.72, 0.68, 0.60), clouds);
        gl_FragColor = vec4(tint * a * 0.11, 1.0);
      }
    `,
    side: BackSide,
    depthWrite: false,
    blending: AdditiveBlending,
    transparent: true,
  });

  const mesh = new Mesh(new SphereGeometry(radius * 1.02, 48, 32), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -20;
  return mesh;
}
