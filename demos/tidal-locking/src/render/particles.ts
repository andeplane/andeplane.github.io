import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Points,
  ShaderMaterial,
} from 'three';
import type { SpringNetwork } from '../physics/world.ts';

/**
 * The machinery, exposed: every particle and every spring.
 *
 * Worth showing at least once. The moon looks like a solid body, and the point of this
 * view is that it is not -- it is a few hundred masses on springs, and the smooth
 * ellipsoid you were watching is what that adds up to.
 */
export class ParticleView {
  readonly points: Points;
  readonly bonds: LineSegments;

  private readonly positions: Float32Array;
  private readonly bondPositions: Float32Array;
  private readonly springs: SpringNetwork;

  constructor(count: number, springs: SpringNetwork) {
    this.springs = springs;
    this.positions = new Float32Array(count * 3);
    this.bondPositions = new Float32Array(springs.count * 6);

    const pointGeometry = new BufferGeometry();
    pointGeometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.points = new Points(
      pointGeometry,
      new ShaderMaterial({
        uniforms: {},
        vertexShader: /* glsl */ `
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = 260.0 / -mv.z;
          }
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            if (d > 1.0) discard;
            gl_FragColor = vec4(1.0, 0.85, 0.6, exp(-d * d * 3.0));
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;

    const bondGeometry = new BufferGeometry();
    bondGeometry.setAttribute('position', new BufferAttribute(this.bondPositions, 3));
    this.bonds = new LineSegments(
      bondGeometry,
      new LineBasicMaterial({
        color: 0x5f7fb5,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.bonds.frustumCulled = false;
  }

  update(particles: Float32Array): void {
    if (!this.points.visible && !this.bonds.visible) return;
    this.positions.set(particles);
    this.points.geometry.attributes.position.needsUpdate = true;

    const { a, b, count } = this.springs;
    for (let s = 0; s < count; s++) {
      const i = a[s] * 3;
      const j = b[s] * 3;
      const o = s * 6;
      this.bondPositions[o] = particles[i];
      this.bondPositions[o + 1] = particles[i + 1];
      this.bondPositions[o + 2] = particles[i + 2];
      this.bondPositions[o + 3] = particles[j];
      this.bondPositions[o + 4] = particles[j + 1];
      this.bondPositions[o + 5] = particles[j + 2];
    }
    this.bonds.geometry.attributes.position.needsUpdate = true;
  }

  setVisible(visible: boolean): void {
    this.points.visible = visible;
    this.bonds.visible = visible;
  }
}
