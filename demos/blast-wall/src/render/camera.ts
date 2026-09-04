/**
 * Orbit camera and the four matrix routines that need to exist for one.
 *
 * A matrix library would be five kilobytes to do this much, so it is here instead:
 * perspective, look-at, multiply, and the inverse-projection ray the editor uses to turn
 * a click into a direction in the world.
 */

export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  // Reversed-Z is not worth the extra state here; a plain 0..1 depth range is fine at
  // these scales.
  m[10] = far / (near - far);
  m[11] = -1;
  m[14] = (far * near) / (near - far);
  return m;
}

export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const z = norm(sub(eye, target));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  const m = new Float32Array(16);
  m[0] = x[0]; m[1] = y[0]; m[2] = z[0]; m[3] = 0;
  m[4] = x[1]; m[5] = y[1]; m[6] = z[1]; m[7] = 0;
  m[8] = x[2]; m[9] = y[2]; m[10] = z[2]; m[11] = 0;
  m[12] = -dot(x, eye); m[13] = -dot(y, eye); m[14] = -dot(z, eye); m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const m = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      m[c * 4 + r] = s;
    }
  }
  return m;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export class OrbitCamera {
  /** Radians, measured from +z toward +x. */
  azimuth = -0.62;
  /** Radians above the horizon. */
  elevation = 0.28;
  distance = 9;
  target: Vec3 = [1.8, 1.3, 0.05];
  fov = (48 * Math.PI) / 180;

  eye(): Vec3 {
    const ce = Math.cos(this.elevation);
    return [
      this.target[0] + this.distance * ce * Math.sin(this.azimuth),
      this.target[1] + this.distance * Math.sin(this.elevation),
      this.target[2] + this.distance * ce * Math.cos(this.azimuth),
    ];
  }

  viewProj(aspect: number): Mat4 {
    const far = Math.max(120, this.distance * 12);
    return multiply(perspective(this.fov, aspect, 0.05, far), lookAt(this.eye(), this.target, [0, 1, 0]));
  }

  orbit(dx: number, dy: number): void {
    this.azimuth -= dx * 0.006;
    this.elevation = clamp(this.elevation + dy * 0.006, -0.35, 1.45);
  }

  zoom(delta: number): void {
    this.distance = clamp(this.distance * Math.exp(delta * 0.0012), 0.8, 90);
  }

  /** Slide the target in the camera's own screen plane. */
  pan(dx: number, dy: number, height: number): void {
    const scale = (2 * this.distance * Math.tan(this.fov / 2)) / height;
    const e = this.eye();
    const fwd = norm(sub(this.target, e));
    const right = norm(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    for (let i = 0; i < 3; i++) {
      this.target[i] += (-dx * right[i] + dy * up[i]) * scale;
    }
    this.target[1] = Math.max(this.target[1], 0.05);
  }

  /** World-space ray through a point given in normalised device coordinates. */
  ray(ndcX: number, ndcY: number, aspect: number): { origin: Vec3; dir: Vec3 } {
    const e = this.eye();
    const fwd = norm(sub(this.target, e));
    const right = norm(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    const t = Math.tan(this.fov / 2);
    const dir = norm([
      fwd[0] + right[0] * ndcX * t * aspect + up[0] * ndcY * t,
      fwd[1] + right[1] * ndcX * t * aspect + up[1] * ndcY * t,
      fwd[2] + right[2] * ndcX * t * aspect + up[2] * ndcY * t,
    ]);
    return { origin: e, dir };
  }

  /** World point → pixel coordinates, for the editor's overlay. */
  project(p: Vec3, aspect: number, width: number, height: number): [number, number, number] {
    const m = this.viewProj(aspect);
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    const iw = 1 / (Math.abs(w) < 1e-9 ? 1e-9 : w);
    return [((x * iw) * 0.5 + 0.5) * width, (0.5 - y * iw * 0.5) * height, w];
  }

  /** Frame a wall of the given extent. */
  frame(length: number, height: number, thickness: number): void {
    this.target = [length / 2, height * 0.5, thickness / 2];
    this.distance = Math.max(4, Math.hypot(length, height) * 1.5);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
