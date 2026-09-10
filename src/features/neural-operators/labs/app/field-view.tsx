'use client';
import { useEffect, useRef, useState } from 'react';
import { color } from '@/features/neural-operators/labs/lib/operator';
export function Heatmap({
  values,
  n,
  label,
}: {
  values: number[];
  n: number;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const im = ctx.createImageData(n, n);
    values.forEach((v, i) => {
      const c = color(v);
      im.data.set([...c, 255], i * 4);
    });
    ctx.putImageData(im, 0, 0);
  }, [values, n]);
  return (
    <canvas
      ref={ref}
      width={n}
      height={n}
      role="img"
      aria-label={label}
      className="heatmap"
    />
  );
}
export function Surface({ values, n }: { values: number[]; n: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    import('three')
      .then(async (THREE) => {
        const { OrbitControls } =
          await import('three/addons/controls/OrbitControls.js');
        if (cancelled || !ref.current) return;
        try {
          const host = ref.current,
            scene = new THREE.Scene();
          scene.background = new THREE.Color('#101c30');
          const camera = new THREE.PerspectiveCamera(
            38,
            host.clientWidth / 320,
            0.1,
            100,
          );
          camera.position.set(3, 3.5, 3.3);
          const renderer = new THREE.WebGLRenderer({ antialias: true });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          renderer.setSize(host.clientWidth, 320);
          host.appendChild(renderer.domElement);
          const controls = new OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.enablePan = false;
          controls.minDistance = 2;
          controls.maxDistance = 9;
          const geo = new THREE.PlaneGeometry(3, 3, n - 1, n - 1);
          geo.rotateX(-Math.PI / 2);
          const pos = geo.attributes.position;
          const colors = [];
          for (let i = 0; i < pos.count; i++) {
            pos.setY(i, values[i] * 0.65);
            colors.push(...color(values[i]).map((v) => v / 255));
          }
          geo.setAttribute(
            'color',
            new THREE.Float32BufferAttribute(colors, 3),
          );
          geo.computeVertexNormals();
          const mat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
          });
          scene.add(new THREE.Mesh(geo, mat));
          const grid = new THREE.GridHelper(4, 16, 0x405773, 0x263950);
          grid.position.y = -1.25;
          scene.add(grid);
          const resize = new ResizeObserver(() => {
            const width = host.clientWidth;
            if (!width) return;
            camera.aspect = width / 320;
            camera.updateProjectionMatrix();
            renderer.setSize(width, 320);
          });
          resize.observe(host);
          let frame = 0;
          const render = () => {
            controls.update();
            renderer.render(scene, camera);
            frame = requestAnimationFrame(render);
          };
          render();
          cleanup = () => {
            cancelAnimationFrame(frame);
            resize.disconnect();
            controls.dispose();
            geo.dispose();
            mat.dispose();
            grid.geometry.dispose();
            (grid.material as import('three').Material).dispose();
            renderer.dispose();
            renderer.domElement.remove();
          };
        } catch {
          setError(true);
        }
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [values, n]);
  return error ? (
    <div>
      <p>3D is unavailable on this device. The same field is shown below.</p>
      <Heatmap values={values} n={n} label="Predicted temperature field" />
    </div>
  ) : (
    <div
      ref={ref}
      className="surface"
      role="img"
      aria-label="Interactive 3D temperature field; drag to rotate, scroll to zoom"
    />
  );
}
