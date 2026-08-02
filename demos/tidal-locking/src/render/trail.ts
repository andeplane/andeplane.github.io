import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  ShaderMaterial,
  Vector3,
} from 'three';

/**
 * The moon's wake, plus two reference circles.
 *
 * The trail alone would not teach much -- the orbit is very nearly a circle. The rings
 * are what make the interesting part visible: one is frozen at the starting radius, the
 * other tracks the current one, and the gap that opens between them is the moon being
 * pushed outward by the angular momentum its own spin is losing.
 */
export class TrailView {
  readonly group = new Group();

  private readonly positions: Float32Array;
  private readonly ages: Float32Array;
  private readonly geometry = new BufferGeometry();
  private readonly capacity: number;
  private head = 0;
  private filled = 0;

  private readonly startRing: Line;
  private readonly nowRing: Line;
  private startRadius = 0;
  private resolvable = true;
  private wanted = true;

  constructor(capacity = 900) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.ages = new Float32Array(capacity);
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('age', new BufferAttribute(this.ages, 1));
    this.geometry.setDrawRange(0, 0);

    const material = new ShaderMaterial({
      uniforms: { uColor: { value: new Vector3(0.62, 0.76, 1.0) } },
      vertexShader: /* glsl */ `
        attribute float age;
        varying float vAge;
        void main() {
          vAge = age;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uColor;
        varying float vAge;
        void main() {
          float a = pow(clamp(1.0 - vAge, 0.0, 1.0), 2.0);
          gl_FragColor = vec4(uColor * (0.4 + 0.6 * a), a * 0.75);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    this.group.add(new Line(this.geometry, material));

    this.startRing = makeRing(0x2a3a58, 1);
    this.nowRing = makeRing(0x4d7fd6, 1);
    this.group.add(this.startRing, this.nowRing);
  }

  /**
   * Append a wake sample.
   *
   * The points are kept in draw order and shifted down when the buffer is full, rather
   * than wrapped. A wrapping ring buffer drawn as a polyline would stitch a chord
   * straight across the orbit at the seam every time it rolled over.
   */
  push(point: Vector3): void {
    if (this.filled === this.capacity) {
      this.positions.copyWithin(0, 3);
      this.head = this.capacity - 1;
    }
    const i = this.head * 3;
    this.positions[i] = point.x;
    this.positions[i + 1] = point.y;
    this.positions[i + 2] = point.z;
    this.head = Math.min(this.head + 1, this.capacity);
    this.filled = Math.min(this.filled + 1, this.capacity);

    for (let n = 0; n < this.filled; n++) {
      this.ages[n] = 1 - n / this.filled;
    }
    this.geometry.setDrawRange(0, this.filled);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.age.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  setRadii(current: number): void {
    if (this.startRadius === 0) this.startRadius = current;
    this.startRing.scale.setScalar(this.startRadius);
    this.nowRing.scale.setScalar(current);
  }

  /**
   * Hide the wake when the moon is moving too fast to resolve.
   *
   * This runs as a time lapse: at full speed an orbit takes about a tenth of a second,
   * so one animation frame covers tens of degrees of arc. Joining those samples draws a
   * star polygon across the orbit rather than a trail. Below the threshold the sampling
   * is dense enough for a real wake; above it the rings carry the information instead.
   */
  setResolvable(resolvable: boolean): void {
    this.resolvable = resolvable;
    this.group.children[0].visible = this.wanted && resolvable;
    if (!resolvable) {
      this.head = 0;
      this.filled = 0;
      this.geometry.setDrawRange(0, 0);
    }
  }

  reset(): void {
    this.head = 0;
    this.filled = 0;
    this.startRadius = 0;
    this.geometry.setDrawRange(0, 0);
  }

  setVisible(trail: boolean, rings: boolean): void {
    this.wanted = trail;
    this.group.children[0].visible = trail && this.resolvable;
    this.startRing.visible = rings;
    this.nowRing.visible = rings;
  }
}

function makeRing(color: number, radius: number): Line {
  const segments = 256;
  const points = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points[i * 3] = Math.cos(a) * radius;
    points[i * 3 + 1] = 0;
    points[i * 3 + 2] = Math.sin(a) * radius;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(points, 3));
  return new Line(geometry, new LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
}
