import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
/**
 * Illustrative bench with exaggerated component sizes. Since the coupling
 * work, what moves on it is driven by computed state: the field lines are
 * the E_y and η₀H_z profiles of the replayed Yee grid, the dipole arms glow
 * with the port charge C_a(v_oc − v), the cone follows the measured 8 Ω
 * voltage. The replay runs on a slowed clock: one captured 20.8 μs window is
 * shown over about eight seconds.
 */
export type Capture = {
  spaceTime: Float32Array;
  spaceTimeH: Float32Array;
  rfCharge: Float32Array;
  rfE: Float32Array;
  cells: number;
  steps: number;
  sources: number[];
  receiver: number;
  time: number;
};
export function createScene(host: HTMLElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#101c22");
  scene.fog = new THREE.Fog("#101c22", 15, 35);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(10, 10, 15);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.5, 0);
  controls.enableDamping = true;
  controls.minDistance = 8;
  controls.maxDistance = 26;
  controls.maxPolarAngle = Math.PI / 2.05;
  scene.add(new THREE.HemisphereLight("#c4e9f0", "#202027", 3));
  const light = new THREE.DirectionalLight("#ffe5b5", 4);
  light.position.set(3, 9, 5);
  scene.add(light);
  const copper = new THREE.MeshStandardMaterial({
    color: "#c89160",
    metalness: 0.7,
    roughness: 0.3,
  });
  const teal = new THREE.MeshStandardMaterial({
    color: "#6de3c6",
    metalness: 0.5,
    roughness: 0.25,
  });
  function box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
  ) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  }
  box(
    0,
    -0.3,
    0,
    13,
    0.35,
    5,
    new THREE.MeshStandardMaterial({ color: "#23363d", roughness: 0.8 }),
  );
  function wire(
    points: number[][],
    radius = 0.025,
    mat: THREE.Material = copper,
  ) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...(p as [number, number, number]))),
    );
    const m = new THREE.Mesh(
      new THREE.TubeGeometry(
        curve,
        Math.max(32, points.length * 3),
        radius,
        8,
        false,
      ),
      mat,
    );
    scene.add(m);
    return m;
  }
  // Feed line from the dipole gap to the tank and the return to ground.
  wire([
    [-5, 1.9, 0],
    [-4.4, 1.6, 0],
    [-3.6, 1.1, 0],
    [-3, 1, 0],
    [-1, 1, 0],
    [1, 1, 0],
    [3, 1, 0],
    [5, 1, 0],
  ]);
  wire([
    [-5, 2.1, 0],
    [-4.6, 2.3, 0.6],
    [-5, 0.1, 1.5],
    [0, 0, 1.5],
    [5, 0, 1.5],
  ]);
  const antenna = new THREE.Group();
  scene.add(antenna);
  antenna.position.set(-5, 2, 0);
  const armMaterial = () =>
    new THREE.MeshStandardMaterial({
      color: "#8fb8b0",
      metalness: 0.6,
      roughness: 0.3,
      emissive: new THREE.Color("#000000"),
    });
  const upperArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 1.85, 12),
    armMaterial(),
  );
  upperArm.position.y = 1.05;
  const lowerArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 1.85, 12),
    armMaterial(),
  );
  lowerArm.position.y = -1.05;
  antenna.add(upperArm, lowerArm);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1), teal);
  tip.position.y = 2;
  const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1), teal);
  foot.position.y = -2;
  antenna.add(tip, foot);
  const coilPoints: number[][] = [];
  for (let n = 0; n <= 320; n++) {
    const t = n / 320;
    coilPoints.push([
      -3 + 1.8 * t,
      1 + 0.46 * Math.cos(t * Math.PI * 20),
      0.46 * Math.sin(t * Math.PI * 20),
    ]);
  }
  wire(coilPoints, 0.055);
  wire([
    [-2, 1, 0],
    [-2, 1, 1.5],
    [-2, 0, 1.5],
  ]);
  const plates: THREE.Mesh[] = [];
  for (let j = 0; j < 2; j++)
    plates.push(
      box(-0.1 + j * 0.13, 1, 0, 0.035, 1.25, 1.6, j % 2 ? copper : teal),
    );
  wire([
    [0.4, 1, 0],
    [0.4, 0.1, 1.5],
  ]);
  box(
    2.5,
    1,
    0,
    0.7,
    0.28,
    0.3,
    new THREE.MeshStandardMaterial({ color: "#1a1f24" }),
  );
  box(2.7, 1, 0, 0.045, 0.3, 0.32, teal);
  box(3.5, 0.55, 0.8, 0.22, 1, 0.22, copper);
  const speaker = new THREE.Group();
  speaker.position.set(5, 1, 0);
  speaker.rotation.x = Math.PI / 2;
  scene.add(speaker);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.82, 0.1, 12, 64),
    copper,
  );
  speaker.add(ring);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.73, 0.32, 64, 1, true),
    new THREE.MeshStandardMaterial({
      color: "#4c6871",
      side: THREE.DoubleSide,
      metalness: 0.4,
      roughness: 0.5,
    }),
  );
  cone.rotation.x = Math.PI / 2;
  speaker.add(cone);
  const grid = new THREE.GridHelper(36, 36, "#30464f", "#1a2d35");
  grid.position.y = -0.5;
  scene.add(grid);
  const POINTS = 240;
  const fieldGeometry = new THREE.BufferGeometry();
  const fieldArray = new Float32Array(POINTS * 3);
  fieldGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(fieldArray, 3),
  );
  scene.add(
    new THREE.Line(
      fieldGeometry,
      new THREE.LineBasicMaterial({
        color: "#73e6ce",
        transparent: true,
        opacity: 0.8,
      }),
    ),
  );
  const magneticGeometry = new THREE.BufferGeometry();
  const magneticArray = new Float32Array(POINTS * 3);
  magneticGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(magneticArray, 3),
  );
  scene.add(
    new THREE.Line(
      magneticGeometry,
      new THREE.LineBasicMaterial({
        color: "#c6a6fa",
        transparent: true,
        opacity: 0.75,
      }),
    ),
  );
  // Small markers along the field line for the transmitter cells and the antenna cell.
  const markers = new THREE.Group();
  scene.add(markers);
  const resize = new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resize.observe(host);
  let capture: Capture | undefined,
    replay = 0,
    lastTime = 0,
    scale = 1,
    markersFor = -1;
  const plus = new THREE.Color("#5be0c0"),
    minus = new THREE.Color("#e0965b");
  /** Map a grid cell index to the bench x coordinate of the field line. */
  const cellX = (cell: number, c: Capture) => -9 + (cell / (c.cells - 1)) * 18;
  return {
    /**
     * `time` is the slowed visual clock (seconds); `pending` is the latest
     * capture from the worklet, adopted when the current replay has finished.
     */
    update(
      time: number,
      gap: number,
      angle: number,
      level: number,
      pending?: Capture,
    ) {
      antenna.rotation.z = (-angle * Math.PI) / 180;
      plates.forEach((p, j) => {
        p.position.x = 0.25 + (j - 0.5) * (0.16 + gap * 0.6);
      });
      cone.position.z = level * 0.15;
      const dt = Math.max(0, Math.min(0.1, time - lastTime));
      lastTime = time;
      if (pending && (!capture || pending.time !== capture.time) && (!capture || replay >= capture.steps - 1)) {
        capture = pending;
        replay = 0;
        let peak = 1e-9;
        for (let i = 0; i < capture.spaceTime.length; i++)
          peak = Math.max(peak, Math.abs(capture.spaceTime[i]));
        scale = 0.6 / peak;
      }
      if (capture) {
        const c = capture,
          row = Math.min(c.steps - 1, Math.floor(replay));
        replay = Math.min(c.steps - 1 + 1e-6, replay + (dt * c.steps) / 8);
        for (let n = 0; n < POINTS; n++) {
          const cell = (n / (POINTS - 1)) * (c.cells - 1);
          const i = Math.floor(cell),
            f = cell - i;
          const e0 = c.spaceTime[row * c.cells + i],
            e1 = c.spaceTime[row * c.cells + Math.min(i + 1, c.cells - 1)];
          const hi = Math.min(i, c.cells - 2);
          const h0 = c.spaceTimeH[row * (c.cells - 1) + hi],
            h1 = c.spaceTimeH[row * (c.cells - 1) + Math.min(hi + 1, c.cells - 2)];
          const x = -9 + (n / (POINTS - 1)) * 18;
          fieldArray.set([x, 3.8 + scale * ((1 - f) * e0 + f * e1), -2], n * 3);
          magneticArray.set([x, 3.8, -2 + scale * ((1 - f) * h0 + f * h1)], n * 3);
        }
        fieldGeometry.attributes.position.needsUpdate = true;
        magneticGeometry.attributes.position.needsUpdate = true;
        // Port charge on the arms: +q on one arm, −q on the other.
        const q = c.rfCharge[row];
        let qmax = 1e-9;
        for (const v of c.rfCharge) qmax = Math.max(qmax, Math.abs(v));
        const k = Math.min(1, Math.abs(q) / qmax);
        (upperArm.material as THREE.MeshStandardMaterial).emissive
          .copy(q >= 0 ? plus : minus)
          .multiplyScalar(k * 0.9);
        (lowerArm.material as THREE.MeshStandardMaterial).emissive
          .copy(q >= 0 ? minus : plus)
          .multiplyScalar(k * 0.9);
        if (markersFor !== c.cells) {
          markersFor = c.cells;
          markers.clear();
          for (const s of c.sources) {
            const m = new THREE.Mesh(
              new THREE.SphereGeometry(0.07),
              new THREE.MeshBasicMaterial({ color: "#f3d79a" }),
            );
            m.position.set(cellX(s, c), 3.8, -2);
            markers.add(m);
          }
          const r = new THREE.Mesh(
            new THREE.ConeGeometry(0.09, 0.25, 8),
            new THREE.MeshBasicMaterial({ color: "#ffffff" }),
          );
          r.position.set(cellX(c.receiver, c), 3.35, -2);
          markers.add(r);
        }
      }
      controls.update();
      renderer.render(scene, camera);
    },
    get replayFraction() {
      return capture ? replay / capture.steps : 0;
    },
    dispose() {
      resize.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          const m = o.material;
          for (const a of Array.isArray(m) ? m : [m]) a.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
