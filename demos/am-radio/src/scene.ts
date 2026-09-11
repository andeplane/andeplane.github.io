import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
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
  wire([
    [-5, 0, 0],
    [-5, 1, 0],
    [-3, 1, 0],
    [-1, 1, 0],
    [1, 1, 0],
    [3, 1, 0],
    [5, 1, 0],
  ]);
  wire([
    [-5, 0, 1.5],
    [0, 0, 1.5],
    [5, 0, 1.5],
  ]);
  const antenna = new THREE.Group();
  scene.add(antenna);
  antenna.position.set(-5, 0, 0);
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 4, 12),
    teal,
  );
  rod.position.y = 2;
  antenna.add(rod);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12), teal);
  tip.position.y = 4;
  antenna.add(tip);
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
  const fieldGeometry = new THREE.BufferGeometry();
  const fieldArray = new Float32Array(240 * 3);
  fieldGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(fieldArray, 3),
  );
  const field = new THREE.Line(
    fieldGeometry,
    new THREE.LineBasicMaterial({
      color: "#73e6ce",
      transparent: true,
      opacity: 0.8,
    }),
  );
  scene.add(field);
  const magneticGeometry = new THREE.BufferGeometry();
  const magneticArray = new Float32Array(240 * 3);
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
  const resize = new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resize.observe(host);
  return {
    update(
      time: number,
      gap: number,
      angle: number,
      level: number,
      depth: number,
      fieldStrength: number,
    ) {
      antenna.rotation.z = (-angle * Math.PI) / 180;
      plates.forEach((p, j) => {
        p.position.x = 0.25 + (j - 0.5) * (0.16 + gap * 0.6);
      });
      cone.position.z = level * 0.15;
      for (let n = 0; n < 240; n++) {
        const x = -9 + (n / 239) * 18;
        const phase = x * 1.7 - time * 2;
        const wave =
          (1 + depth * Math.sin(0.2 * phase)) *
          0.55 *
          fieldStrength *
          Math.sin(phase);
        fieldArray.set([x, 3.8 + wave, -2], n * 3);
        magneticArray.set([x, 3.8, -2 + wave], n * 3);
      }
      fieldGeometry.attributes.position.needsUpdate = true;
      magneticGeometry.attributes.position.needsUpdate = true;
      controls.update();
      renderer.render(scene, camera);
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
