/**
 * Glass vessels: the input reservoirs (one per row of valves) and the collectors (one per
 * column). Drawn as instanced quads; the fragment shader paints the glass, the graph-paper
 * back, and the water with depth absorption, a moving meniscus and caustic shimmer.
 * kind 0 is an upright tank (level rises), kind 1 a sight-glass lying on its side (the water
 * column grows to the right) for rows too thin for an upright tank.
 */
import * as THREE from 'three';

const VS = /* glsl */ `
in vec4 aRect;
in vec4 aData;   // level, kind, tint, glow
out vec2 vP;
out vec2 vSize;
flat out vec4 vData;
void main() {
  vSize = aRect.zw;
  vData = aData;
  vec2 pad = vec2(2.0);
  vec2 p = aRect.xy - pad + (position.xy + 0.5) * (aRect.zw + 2.0 * pad);
  vP = p - aRect.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}
`;

const FS = /* glsl */ `
precision highp float;
in vec2 vP;
in vec2 vSize;
flat in vec4 vData;
out vec4 fragColor;
uniform float uTime;

const vec3 POS = vec3(0.36, 0.84, 0.95);
const vec3 NEG = vec3(1.0, 0.62, 0.32);

float caustic(vec2 p, float t) {
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 3; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 3.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}

void main() {
  float level = vData.x;
  bool side = vData.y > 0.5;
  float tint = vData.z;
  float glow = vData.w;
  vec2 p = vP;
  vec2 s = vSize;
  float wall = clamp(min(s.x, s.y) * 0.08, 0.6, 2.0);
  // outside the glass?
  vec2 q = abs(p - s * 0.5) - s * 0.5;
  float outside = max(q.x, q.y);
  if (outside > 1.2) discard;
  float edge = smoothstep(-wall - 0.8, -wall + 0.2, outside) * (1.0 - smoothstep(0.2, 1.2, outside));
  // interior
  vec3 col = vec3(0.06, 0.085, 0.12);
  float a = 0.82;
  // graph-paper back
  if (min(s.x, s.y) > 24.0) {
    vec2 g = abs(fract(p / 8.0) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.08, min(g.x, g.y));
    col += vec3(0.6, 0.75, 0.9) * line * 0.035;
  }
  // water
  float extent = side ? s.x : s.y;
  float coord = side ? p.x : p.y;
  float across = side ? p.y / s.y : p.x / s.x;
  float wave = side ? 0.0 : (sin(across * 9.0 + uTime * 2.3) * 0.5 + sin(across * 23.0 - uTime * 3.7) * 0.25) * min(1.6, s.y * 0.012) * (0.4 + glow);
  float surf = level * (extent - 2.0 * wall) + wall + wave;
  float inWater = (1.0 - smoothstep(surf - 0.6, surf + 0.6, coord)) * step(0.0005, level);
  if (inWater > 0.0) {
    float depth = max(0.0, surf - coord) / max(extent, 1.0);
    vec3 tintCol = tint > 1.5 ? NEG : tint > 0.5 ? POS : vec3(0.42, 0.83, 1.0);
    vec3 shallow = mix(vec3(0.26, 0.62, 0.78), tintCol * 0.85, 0.35);
    vec3 deep = mix(vec3(0.03, 0.17, 0.27), tintCol * 0.22, 0.3);
    vec3 w = mix(shallow, deep, 1.0 - exp(-depth * 3.2));
    float c = caustic(vec2(p.x, p.y) * 0.06 + vec2(0.0, uTime * 0.05), uTime * 0.6 + 11.0);
    w += clamp(c, 0.0, 1.0) * vec3(0.3, 0.55, 0.6) * 0.22 * exp(-depth * 2.0);
    // meniscus: a bright line just under the surface
    float men = exp(-abs(surf - coord) * 0.9);
    w += vec3(0.75, 0.92, 1.0) * men * 0.55;
    w += vec3(0.4, 0.8, 1.0) * glow * 0.25;
    col = mix(col, w, inWater);
    a = mix(a, 0.96, inWater);
  }
  // glass: bright rims and a vertical sheen
  float sheen = exp(-pow((p.x / max(s.x, 1.0) - 0.22) * 9.0, 2.0)) * 0.08;
  col += vec3(0.8, 0.9, 1.0) * sheen;
  col = mix(col, vec3(0.78, 0.86, 0.95), edge * 0.55);
  a = max(a * (1.0 - smoothstep(0.0, 1.2, outside)), edge * 0.8);
  fragColor = vec4(col, a);
}
`;

export interface TankSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  level: number;
  side?: boolean;
  /** 0 plain water, 1 the + collector of a pair, 2 the − collector. */
  tint?: number;
  glow?: number;
}

export class TankLayer {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private rect: Float32Array;
  private data: Float32Array;
  private cap = 0;
  readonly mat: THREE.ShaderMaterial;

  constructor() {
    this.geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.rect = new Float32Array(0);
    this.data = new Float32Array(0);
    this.grow(4096);
    this.mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
  }

  private grow(n: number): void {
    this.cap = n;
    this.rect = new Float32Array(n * 4);
    this.data = new Float32Array(n * 4);
    this.geo.setAttribute('aRect', new THREE.InstancedBufferAttribute(this.rect, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aData', new THREE.InstancedBufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage));
  }

  set(tanks: TankSpec[]): void {
    // Fixed capacity: replacing instanced attributes after first draw is not picked up by three.
    const n = Math.min(tanks.length, this.cap);
    for (let i = 0; i < n; i++) {
      const t = tanks[i];
      this.rect.set([t.x, t.y, t.w, t.h], i * 4);
      this.data.set([Math.max(0, Math.min(1, t.level)), t.side ? 1 : 0, t.tint ?? 0, t.glow ?? 0], i * 4);
    }
    this.geo.instanceCount = n;
    this.geo.attributes.aRect.needsUpdate = true;
    this.geo.attributes.aData.needsUpdate = true;
  }
}
