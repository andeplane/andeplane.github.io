import { useEffect, useState } from 'react'
import { Download, Pause, Play, RotateCcw } from 'lucide-react'
import { exampleCloud, examplePose, objects, roomAt, rooms, walls, type Point } from './mapExample'
import type { RobotVariant } from './variants'

export default function MappingDemo({ variant }: { variant: RobotVariant }) {
  const [mode, setMode] = useState<'floor' | 'cloud'>('floor')
  const [progress, setProgress] = useState(.45)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState<string>('kitchen')
  const [confirmed, setConfirmed] = useState<string[]>([])
  const [showObjects, setShowObjects] = useState(true)
  const [angle, setAngle] = useState(25)
  const pose = examplePose(progress), currentRoom = roomAt(pose.point)
  const room = rooms.find(r => r.id === selected) ?? rooms[0]
  const isConfirmed = confirmed.includes(room.id)
  useEffect(() => {
    if (!playing) return
    let previous: number | undefined, frame: number
    const tick = (time: number) => {
      // Clamp a background-tab gap; this is a viewer animation, never a control loop.
      if (previous === undefined) previous = time
      if (time - previous >= 80) {
        const elapsed = Math.min(time - previous, 250)
        setProgress(value => Math.min(1, value + elapsed / 45000))
        previous = time
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])
  useEffect(() => { if (progress === 1) setPlaying(false) }, [progress])

  const project = (x: number, y: number, z = 0): Point => {
    if (mode === 'floor') return [110 + x * 48, 30 + y * 48]
    const a = angle * Math.PI / 180, dx = x - 4, dy = y - 4.5
    return [310 + (dx * Math.cos(a) - dy * Math.sin(a)) * 39, 285 + (dx * Math.sin(a) + dy * Math.cos(a)) * 22 - z * 57]
  }
  const coordinates = (points: readonly Point[], z = 0) => points.map(([x, y]) => project(x, y, z).join(',')).join(' ')
  const [px, py] = project(...pose.point, .12)
  const [hx, hy] = project(pose.point[0] + Math.cos(pose.heading) * .5, pose.point[1] + Math.sin(pose.heading) * .5, .12)
  const svgHeading = Math.atan2(hy - py, hx - px) * 180 / Math.PI

  return <section id="mapping" className="kiwi-section">
    <div className="kiwi-section-heading"><div><span className="kiwi-eyebrow">05 / MAPPING ON THE MAC MINI</span><h2>A map it can<br />find itself in.</h2></div><p>Build a map while driving, recognize places on return, and attach objects and room names to locations. The Mac mini does the heavy processing over Wi-Fi.</p></div>
    <div className="kiwi-map-demo">
      <div className="kiwi-map-toolbar"><div><span className="kiwi-eyebrow">EXAMPLE DATA · NO ROBOT CONNECTED</span><p>An example of the planned map interface</p></div><div className="kiwi-map-tabs" role="group" aria-label="Map view"><button type="button" aria-pressed={mode === 'floor'} onClick={() => setMode('floor')}>2D floor plan</button><button type="button" aria-pressed={mode === 'cloud'} onClick={() => setMode('cloud')}>3D point cloud</button></div></div>
      <div className="kiwi-map-body"><div className="kiwi-map-viewport">
        <svg viewBox={mode === 'floor' ? '60 0 484 490' : '0 0 620 490'} style={{ aspectRatio: mode === 'floor' ? '484 / 490' : '620 / 490' }} role="img" aria-label={`${mode === 'floor' ? 'Floor plan' : 'Projected 3D point cloud'} of an authored example home, with robot position, route and labeled rooms`}>
          <defs><pattern id="kiwi-map-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#263a38" strokeWidth=".6" /></pattern></defs>
          <rect width="620" height="490" fill="url(#kiwi-map-grid)" />
          {rooms.map(r => {
            const [x, y, w, h] = r.bounds
            return <g key={r.id}>
              <polygon points={coordinates([[x, y], [x + w, y], [x + w, y + h], [x, y + h]])} fill={r.color} fillOpacity={selected === r.id ? .95 : .6} stroke={selected === r.id ? '#b8e8bf' : '#587167'} strokeWidth={selected === r.id ? 1.6 : .5} />
              {mode === 'floor' && <text x={project(x + w / 2, y + h / 2)[0]} y={project(x + w / 2, y + h / 2)[1]} textAnchor="middle" fill="#e7ede1" fontSize="15">{r.name}{confirmed.includes(r.id) ? ' ✓' : ' ?'}</text>}
            </g>
          })}
          {mode === 'floor' ? walls.map((wall, i) => <polyline key={i} points={coordinates([[wall[0], wall[1]], [wall[2], wall[3]]])} fill="none" stroke="#a7c5ba" strokeWidth="4" strokeLinecap="square" />) : exampleCloud.map(([x, y, z], i) => { const p = project(x, y, z); return <circle key={i} cx={p[0]} cy={p[1]} r="1.15" fill={z > 1 ? '#aacfc7' : '#639a98'} fillOpacity=".7" /> })}
          {showObjects && objects.map(o => {
            const corners: Point[] = [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.d], [o.x, o.y + o.d]]
            const label = project(o.x + o.w / 2, o.y + o.d / 2, mode === 'cloud' ? o.h + .1 : 0)
            return <g key={o.name}>
              {mode === 'cloud' && corners.map(([x, y], i) => { const bottom = project(x, y), top = project(x, y, o.h); return <line key={i} x1={bottom[0]} y1={bottom[1]} x2={top[0]} y2={top[1]} stroke="#c4aa6e" strokeWidth="1" /> })}
              <polygon points={coordinates(corners, mode === 'cloud' ? o.h : 0)} fill="#bda16b" fillOpacity=".18" stroke="#c4aa6e" strokeWidth="1" />
              <text x={label[0]} y={label[1]} fill="#ead8b3" fontSize={mode === 'cloud' ? 9 : 8} textAnchor="middle" dominantBaseline="middle">{o.name}</text>
            </g>
          })}
          <polyline points={coordinates(pose.trail, .06)} fill="none" stroke="#80dfb5" strokeWidth="2" strokeDasharray="3 4" />
          <g transform={`translate(${px} ${py}) rotate(${svgHeading})`}><circle r="10" fill="#80dfb5" stroke="#10251c" strokeWidth="2" /><path d="M15 0 3 -4V4Z" fill="#f1ffed" /></g>
          <text x={mode === 'floor' ? 90 : 20} y="480" fill="#9fbab0" fontSize="10">{mode === 'floor' ? '1 grid square = 0.5 m · example home: 8 × 9 m' : 'Projected 3D example · authored wall points and object boxes'}</text>
        </svg>
        {mode === 'cloud' && <label className="kiwi-map-orbit">Rotate view<input type="range" min="-90" max="90" value={angle} aria-label="Rotate map view" onChange={e => setAngle(Number(e.target.value))} /></label>}
      </div><aside className="kiwi-map-details"><span className="kiwi-eyebrow">ROOMS & OBJECTS</span><p>Select a room to inspect its suggested name.</p><div className="kiwi-map-rooms" role="group" aria-label="Inspect a room">{rooms.map(r => <button type="button" key={r.id} aria-pressed={selected === r.id} onClick={() => setSelected(r.id)}>{r.name}{confirmed.includes(r.id) && ' ✓'}</button>)}</div><div className="kiwi-map-room"><h3>{room.name}</h3><span>{isConfirmed ? 'Confirmed in this example' : 'Suggested room name'}</span><p>{room.reason}</p><p><strong>Object observations</strong><br />{room.objects.join(' · ')}</p><button type="button" disabled={isConfirmed} onClick={() => setConfirmed([...confirmed, room.id])}>{isConfirmed ? 'Name confirmed ✓' : `Confirm “${room.name}”`}</button><small>Example only. Nothing is sent to a robot or saved after leaving this page.</small></div></aside></div>
      <div className="kiwi-map-playback"><div><button type="button" aria-label={playing ? 'Pause example drive' : 'Play example drive'} onClick={() => { if (progress === 1) setProgress(0); setPlaying(!playing) }}>{playing ? <Pause size={16} /> : <Play size={16} />}</button><button type="button" aria-label="Restart example drive" onClick={() => { setProgress(0); setPlaying(false) }}><RotateCcw size={16} /></button><label>Example drive<input type="range" min="0" max="1000" value={Math.round(progress * 1000)} aria-label="Example drive progress" onChange={e => { setProgress(Number(e.target.value) / 1000); setPlaying(false) }} /></label><output>{Math.round(progress * 100)}%</output></div><p>Position: <strong>{pose.point[0].toFixed(1)}, {pose.point[1].toFixed(1)} m</strong><span> · {currentRoom?.name ?? 'Doorway'}</span></p><label><input type="checkbox" checked={showObjects} onChange={e => setShowObjects(e.target.checked)} /> Show objects</label></div>
    </div>
    <p className="kiwi-caption kiwi-map-caption">This is an interactive design example with an authored floor plan and drive path. It demonstrates the interface; it does not run SLAM or detect objects. In the real system, unobserved space stays unknown and uncertain room names remain suggestions.</p>
    <div className="kiwi-map-flow"><div><span>ON THE ROBOT</span><h3>Capture & move</h3><p>Capture and stream timestamped images, calibration data, wheel odometry and IMU readings. Local motion control stops on stale state or a lost connection.</p></div><div><span>ON THE MAC MINI</span><h3>Map & locate</h3><p>SLAM matches landmarks across frames, corrects drift when revisiting a place, and estimates the robot’s position in the map. Nav2 uses that map to plan routes.</p></div><div><span>VISION LLM · MAC MINI / CLOUD</span><h3>Give places meaning</h3><p>The vision model interprets selected images and map context. Associate its object observations with places, confirm suggested room names, then accept goals such as “go to the kitchen.”</p></div></div>
    <div className="kiwi-two-column"><div><h3>{variant.id === 'stereo' ? 'Stereo: the direct mapping route' : 'For this camera option'}</h3><p>{variant.id === 'stereo' ? 'After stereo calibration, RTAB-Map can build a map in metres and export a point cloud and occupancy grid. The mini can relate validated image regions from model observations to map geometry using stereo depth. Textureless floors, reflections and camera height still limit what is observed.' : 'Use the front camera for monocular SLAM and relate its scale to calibrated wheel motion or a measured visual marker. This can track position, but a useful dense 3D map and floor plan need an additional reconstruction step. Three independent cameras add views; they do not automatically add stereo depth.'}</p></div><div><h3>A practical Mac mini setup</h3><p>Use an Ubuntu 24.04 ARM64 virtual machine on an Apple Silicon mini for ROS 2 Jazzy. Run RTAB-Map for the stereo build; use a monocular tracking and reconstruction pipeline for the basic cameras. Check VM network reachability, timestamps and camera throughput first. Reuse the computer you already have; no extra robot sensor is required.</p></div></div>
    <div className="kiwi-actions"><a className="kiwi-secondary" href="/hardware/kiwi/mapping.md" download><Download size={16} /> SLAM & semantic mapping plan</a><a className="kiwi-secondary" href="https://github.com/introlab/rtabmap_ros/tree/ros2" target="_blank" rel="noreferrer">RTAB-Map documentation ↗</a></div>
  </section>
}
