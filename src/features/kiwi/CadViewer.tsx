import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

interface CadPart { id: string; name: string; kind: string; meshNames?: string[]; explode?: number[] }
interface CadManifest { parts: CadPart[] }

export default function CadViewer({ assetPath, compact = false }: { assetPath: string; compact?: boolean }) {
  const mount = useRef<HTMLDivElement>(null)
  const model = useRef<THREE.Group | null>(null)
  const metadata = useRef<CadManifest | null>(null)
  const [explode, setExplode] = useState(0)
  const [shell, setShell] = useState(true)
  const [status, setStatus] = useState('Loading the CAD assembly…')
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState('Drag to orbit · scroll to zoom')
  const [partCount, setPartCount] = useState(0)
  const reset = useRef<() => void>(() => {})

  useEffect(() => {
    const el = mount.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) }
    catch { setError(true); setStatus('3D is unavailable on this device. Open the dimensioned drawing below.'); return }
    let disposed = false
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.005, 10)
    camera.position.set(0.42, 0.34, -0.43)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x11191c, 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.5
    renderer.domElement.setAttribute('aria-label', 'Interactive Kiwi CAD assembly. Use mouse or touch to orbit. Equivalent STEP files and drawings are available below.')
    renderer.domElement.setAttribute('role', 'img')
    el.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.085, 0)
    controls.enableDamping = true
    controls.minDistance = 0.2
    controls.maxDistance = 1.7
    controls.maxPolarAngle = Math.PI * 0.92
    controls.update()
    reset.current = () => { camera.position.set(0.42, 0.34, -0.43); controls.target.set(0, 0.085, 0); controls.update() }
    scene.add(new THREE.HemisphereLight(0xe5f4ff, 0x45534c, 3))
    const key = new THREE.DirectionalLight(0xffffff, 4)
    key.position.set(1, 2, 1); scene.add(key)
    const rim = new THREE.DirectionalLight(0x7ce5c4, 2)
    rim.position.set(-1, 0.5, -1); scene.add(rim)
    const grid = new THREE.GridHelper(0.8, 32, 0x355851, 0x263a38)
    grid.position.y = -0.002; scene.add(grid)
    const observer = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix()
    })
    observer.observe(el)
    const raycaster = new THREE.Raycaster()
    const click = (event: PointerEvent) => {
      if (!model.current) return
      const rect = renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera)
      const hit = raycaster.intersectObject(model.current, true).find(item => item.object.visible)
      if (!hit) return
      let obj: THREE.Object3D | null = hit.object
      while (obj && !obj.userData.cadPart) obj = obj.parent
      const part = obj?.userData.cadPart as CadPart | undefined
      if (part) setSelected(`${part.name} · ${part.kind === 'printed' ? '3D printed' : 'purchased reference'}`)
    }
    renderer.domElement.addEventListener('pointerup', click)
    Promise.all([
      new GLTFLoader().loadAsync(`${assetPath}assembly.glb`),
      fetch(`${assetPath}manifest.json`).then(r => { if (!r.ok) throw new Error('CAD manifest unavailable'); return r.json() as Promise<CadManifest> }),
    ]).then(([gltf, manifest]) => {
      if (disposed) { gltf.scene.traverse(obj => { if (obj instanceof THREE.Mesh) obj.geometry.dispose() }); return }
      model.current = gltf.scene; metadata.current = manifest
      for (const part of manifest.parts) {
        for (const name of part.meshNames?.length ? part.meshNames : [part.id]) {
          const obj = gltf.scene.getObjectByName(name)
          if (obj) { obj.userData.cadPart = part; obj.userData.basePosition = obj.position.clone() }
        }
      }
      scene.add(gltf.scene)
      setPartCount(manifest.parts.length); setStatus('CAD assembly loaded')
    }).catch(() => { if (!disposed) { setError(true); setStatus('Could not load the 3D assembly. The dimensioned drawing and downloadable CAD remain available below.') } })
    let visible = false
    const draw = () => { controls.update(); renderer.render(scene, camera) }
    const updateLoop = () => renderer.setAnimationLoop(visible && document.visibilityState === 'visible' ? draw : null)
    const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; updateLoop() }, { rootMargin: '150px' })
    intersection.observe(el)
    document.addEventListener('visibilitychange', updateLoop)
    return () => {
      disposed = true; observer.disconnect(); intersection.disconnect(); document.removeEventListener('visibilitychange', updateLoop); renderer.setAnimationLoop(null)
      renderer.domElement.removeEventListener('pointerup', click)
      controls.dispose()
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach(material => material.dispose())
        }
      })
      renderer.dispose(); renderer.domElement.remove(); model.current = null
    }
  }, [assetPath])

  useEffect(() => {
    const group = model.current
    if (!group || !metadata.current) return
    for (const part of metadata.current.parts) {
      for (const name of part.meshNames?.length ? part.meshNames : [part.id]) {
        const obj = group.getObjectByName(name)
        if (!obj) continue
        const base = obj.userData.basePosition as THREE.Vector3 | undefined
        if (base) obj.position.copy(base).add(new THREE.Vector3(...(part.explode ?? [0, 0, 0]) as [number, number, number]).multiplyScalar(explode / 100))
        obj.visible = shell || !/shell|lid|cover|bumper/i.test(part.id)
      }
    }
  }, [explode, shell, partCount])

  return <div className={`kiwi-cad${compact ? ' kiwi-cad-compact' : ''}`}>
    <div className="kiwi-cad-stage" ref={mount} data-ready={partCount > 0}>
      {error && <img className="kiwi-cad-fallback" src={`${assetPath}assembly-drawing.svg`} alt="Dimensioned top and side views of the selected Kiwi robot" />}
      <span className="kiwi-cad-label">REV B / {assetPath.split('/').filter(Boolean).at(-1)?.replace(/-/g, ' ').toUpperCase()}</span>
      <span className="kiwi-cad-selection" aria-live="polite">{selected}</span>
    </div>
    {!compact && <div className="kiwi-cad-controls">
      <label>Explode assembly <input aria-label="Explode assembly" type="range" min="0" max="100" value={explode} onChange={e => setExplode(Number(e.target.value))} /><output>{explode}%</output></label>
      <button type="button" aria-pressed={!shell} onClick={() => setShell(!shell)}>{shell ? 'Remove shell' : 'Show shell'}</button>
      <button type="button" onClick={() => { reset.current(); setExplode(0); setShell(true) }}>Reset view</button>
    </div>}
    <p className="kiwi-caption" role="status">{status}.{!compact && ' Printed parts are dimensioned solids. Bought components are reference envelopes; check dimensions against the actual parts before printing.'}</p>
  </div>
}
