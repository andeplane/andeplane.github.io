import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUpRight, Download, MoveUpRight, Plus, Minus } from 'lucide-react'
import { sources, type Part } from './data'
import { calculateBudget, defaultAssumptions, unitCostNok, type Assumptions } from './budgetMath'
import { variants, variantPath, variantAssets, variantCad, type RobotVariant } from './variants'
import { limitedWheelRpm, WHEEL_ANGLES_DEG } from './kinematics'
import './kiwi.css'
import Budget, { HeroCost, money } from './Budget'
import Upgrades from './Upgrades'

const CadViewer = lazy(() => import('./CadViewer'))
const categories = ['All', 'Drive', 'Compute', 'Sensing', 'Power', 'Assembly']
const asset = '/hardware/kiwi/'

function DriveDemo() {
  const [vx, setVx] = useState(0), [vy, setVy] = useState(0.15), [omega, setOmega] = useState(0)
  const rpm = limitedWheelRpm(vx, vy, omega)
  return <div className="kiwi-drive-demo">
    <svg viewBox="0 0 360 320" role="img" aria-label="Top view of three tangentially driven omni wheels at 120 degrees, with commanded direction and wheel speeds">
      <defs><marker id="kiwi-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#80dfb5" /></marker></defs>
      <circle cx="180" cy="154" r="105" fill="#172528" stroke="#47645c" strokeWidth="1.5" strokeDasharray="4 5" />
      <path d="M180 34V274M60 154H300" stroke="#293e3b" />
      <text x="180" y="20" textAnchor="middle" fill="#b8ccc4" fontSize="12">FORWARD (+Y)</text>
      {WHEEL_ANGLES_DEG.map((a, i) => {
        const x = 180 + 105 * Math.cos(a * Math.PI / 180), y = 154 - 105 * Math.sin(a * Math.PI / 180)
        return <g key={a}><g transform={`translate(${x} ${y}) rotate(${-a})`}><rect x="-12" y="-30" width="24" height="60" rx="8" fill="#0c1517" stroke="#80dfb5" /><path d="M-9 -18h18 M-9 -6h18 M-9 6h18 M-9 18h18" stroke="#57756a" strokeWidth="4" /></g><text x={x + (x > 190 ? -42 : 0)} y={y + (y > 200 ? 53 : -42)} textAnchor="middle" fill="#e2f1e8" fontSize="13">{['A', 'B', 'C'][i]} {rpm.actual[i].toFixed(0)} rpm</text></g>
      })}
      <line x1="180" y1="154" x2={180 + vx * 340} y2={154 - vy * 340} stroke="#80dfb5" strokeWidth="4" markerEnd="url(#kiwi-arrow)" />
      <circle cx="180" cy="154" r="5" fill="#80dfb5" />
      <text x="180" y="310" textAnchor="middle" fill="#a9c1b6" fontSize="12">Each wheel can roll freely sideways.</text>
    </svg>
    <div className="kiwi-drive-inputs">
      <span className="kiwi-eyebrow">TRY THE WHEEL MIXER</span>
      {[
        { name: 'Sideways', value: vx, set: setVx, unit: 'm/s', max: 0.25, step: 0.01 },
        { name: 'Forward', value: vy, set: setVy, unit: 'm/s', max: 0.25, step: 0.01 },
        { name: 'Turn', value: omega, set: setOmega, unit: 'rad/s', max: 1, step: 0.05 },
      ].map(control => <label key={control.name}><span>{control.name}<output>{control.value.toFixed(2)} {control.unit}</output></span><input type="range" aria-label={control.name} min={-control.max} max={control.max} step={control.step} value={control.value} onChange={e => control.set(Number(e.target.value))} /></label>)}
      <button type="button" onClick={() => { setVx(0); setVy(0); setOmega(0) }}>Stop</button>
      <p className="kiwi-caption">Kinematics demonstration, not a connection to a robot. Wheel speeds scale together above an illustrative 80 rpm limit{rpm.scale < 1 ? ` (${(rpm.scale * 100).toFixed(0)}% of request)` : ''}.</p>
    </div>
  </div>
}

function PartsList({ parts, assumptions }: { parts: Part[]; assumptions: Assumptions }) {
  const [category, setCategory] = useState('All'), [search, setSearch] = useState('')
  const filtered = useMemo(() => parts.filter(p => (category === 'All' || p.category === category) && `${p.name} ${p.note}`.toLowerCase().includes(search.toLowerCase())), [category, search, parts])
  return <>
    <div className="kiwi-parts-toolbar"><div className="kiwi-filters" aria-label="Filter parts">{categories.map(c => <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div><input type="search" aria-label="Search parts" placeholder="Find a component…" value={search} onChange={e => setSearch(e.target.value)} /></div>
    <div className="kiwi-table-scroll"><table className="kiwi-parts-table"><thead><tr><th>Component</th><th>Qty</th><th>Estimated unit price</th><th>Compatibility & ordering notes</th></tr></thead><tbody>{filtered.map(part => <tr key={part.id}><td><span className="kiwi-part-category">{part.category}</span><a href={part.url} target="_blank" rel="noreferrer">{part.name}<ArrowUpRight size={13} /></a></td><td>{part.quantity} {part.unit}</td><td>{part.price !== undefined ? money(unitCostNok(part, assumptions, true), 1) : 'In materials allowance'}</td><td>{part.note}{part.status && <span className="kiwi-order-status">{part.status}</span>}</td></tr>)}</tbody></table></div>
    {filtered.length === 0 && <p>No matching components.</p>}
    <p className="kiwi-caption">Unit prices are converted to NOK and include the estimated VAT used in the budget; shipping is separate. The linked stores may charge in another currency. Unpriced items are covered by the materials allowance. Sources checked 20–21 October 2026; final checkout and stock remain unconfirmed.</p>
  </>
}

const downloads = [
  ['assembly.step', 'STEP assembly', 'Editable solid geometry'],
  ['kiwi-print-pack.zip', 'Print pack', 'Individual STLs + fit coupons'],
  ['source.zip', 'Parametric source', 'CadQuery script + parameters'],
  ['assembly-drawing.svg', 'Dimensioned drawing', 'Top and side views'],
  ['assembly-guide.md', 'Assembly & print guide', 'Fasteners, tolerances, sequence'],
  ['validation.json', 'CAD check results', 'Geometric checks and limits'],
]

function VariantSelector({ selected, assumptions }: { selected: RobotVariant; assumptions: Assumptions }) {
  return <nav className="kiwi-variants" aria-label="Robot options"><div><span className="kiwi-eyebrow">CHOOSE YOUR ROBOT</span><p>Vision only. Same wheeled base, three camera options.</p></div><div className="kiwi-variant-buttons">{variants.map(variant => <Link key={variant.id} to={variantPath(variant)} aria-current={selected.id === variant.id ? 'page' : undefined}><span>{variant.number} / {variant.label}</span><strong>≈ {money(calculateBudget(variant.items, assumptions).total)}</strong><small>{variant.id === 'stereo' ? 'Two synchronized eyes for depth' : variant.id === 'three-cameras' ? 'More coverage to the sides' : 'The simplest place to start'}</small></Link>)}</div><small>Complete-build estimates including battery, charger, VAT and shipping. Select a version for its own model and parts.</small></nav>
}

function CameraDiagram({ variant }: { variant: RobotVariant }) {
  const cameras = variant.id === 'three-cameras' ? [[160, 44, 0], [49, 145, -90], [271, 145, 90]] : variant.id === 'stereo' ? [[140, 44, 0], [180, 44, 0]] : [[160, 44, 0]]
  return <svg className="kiwi-camera-layout" viewBox="0 0 320 245" role="img" aria-label={`${variant.label}: schematic camera positions on the robot`}><circle cx="160" cy="139" r="86" fill="#152b23" stroke="#4e7563" strokeWidth="2" /><text x="160" y="23" textAnchor="middle" fill="#a8c7b6" fontSize="12">FRONT</text>{cameras.map(([x,y,angle],i) => <g key={i} transform={`translate(${x} ${y}) rotate(${angle})`}><path d="M0 -14V-24m-5 5 5-5 5 5" fill="none" stroke="#80dfb5" strokeWidth="2"/><rect x="-13" y="-9" width="26" height="18" rx="4" fill="#0a1511" stroke="#80dfb5"/><circle r="5" fill="#67a78a"/></g>)}<text x="160" y="144" textAnchor="middle" fill="#dbece2" fontSize="16">{variant.id === 'stereo' ? 'Stereo pair' : `${variant.cameraQuantity} camera${variant.cameraQuantity > 1 ? 's' : ''}`}</text><text x="160" y="242" textAnchor="middle" fill="#8da99b" fontSize="10">Camera positions · schematic</text></svg>
}

export default function Kiwi() {
  const { variant: variantId } = useParams()
  const [assumptions, setAssumptions] = useState(defaultAssumptions)
  const variant = variants.find(v => v.id === (variantId ?? 'front-camera'))
  if (!variant) return <Navigate to="/hardware/kiwi/front-camera/" replace />
  return <KiwiVersion key={variant.id} variant={variant} assumptions={assumptions} onAssumptionsChange={setAssumptions} />
}

function KiwiVersion({ variant, assumptions, onAssumptionsChange }: { variant: RobotVariant; assumptions: Required<Assumptions>; onAssumptionsChange: (next: Required<Assumptions>) => void }) {
  const [open, setOpen] = useState<string | null>('vision')
  const { hash } = useLocation()
  const totalCost = calculateBudget(variant.items, assumptions).total
  const files = variantAssets(variant), cadFiles = variantCad(variant)
  useEffect(() => {
    document.title = `Kiwi · ${variant.label} · Anders Hafreager (andeplane)`
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [hash, variant.label])
  return <article className="kiwi-page">
    <VariantSelector selected={variant} assumptions={assumptions} />
    <div className="kiwi-breadcrumb"><Link to="/hardware">Hardware</Link><span>/</span><span>Kiwi · {variant.shortLabel}</span></div>
    <header className="kiwi-hero">
      <div className="kiwi-hero-copy"><span className="kiwi-eyebrow"><span className="kiwi-status-dot" /> OPTION {variant.number} / VISION ONLY</span><h1>Kiwi<span>{variant.label}.</span></h1><p>{variant.description}</p><HeroCost total={totalCost} /><div className="kiwi-actions"><a className="kiwi-primary" href="#design">Explore this design <ArrowDown size={16} /></a><a className="kiwi-secondary" href="#parts">Find the parts <ArrowUpRight size={16} /></a></div><div className="kiwi-specs"><div><strong>~29 cm</strong><span>overall wheel envelope</span></div><div><strong>3 wheels</strong><span>move in any direction</span></div><div><strong>Vision only</strong><span>no distance sensors</span></div></div></div>
      <figure className="kiwi-hero-model"><Suspense fallback={<div className="kiwi-loading">Loading this robot's CAD…</div>}><CadViewer assetPath={cadFiles} compact /></Suspense><figcaption>{variant.label} · actual CAD assembly, not a built robot</figcaption></figure>
    </header>
    <Budget items={variant.items} assumptions={assumptions} onChange={onAssumptionsChange} cameraLabel={variant.cameraLabel} />
    <div className="kiwi-project-state"><span className="kiwi-state-tag">REV B</span><p>Vision-only prototype design. The selected camera hardware, model and parts list belong to this version. Print fit, electronics and driving still need physical testing.</p></div>
    <nav className="kiwi-section-nav" aria-label="Project sections"><a href="#budget">Cost</a><a href="#design">01 Design</a><a href="#movement">02 Movement</a><a href="#sensing">03 Sensing</a><a href="#brain">04 Intelligence</a><a href="#parts">05 Parts</a><a href="#build">06 Build</a><a href="#upgrades">07 Arm & dock</a></nav>

    <section id="design" className="kiwi-section"><div className="kiwi-section-heading"><div><span className="kiwi-eyebrow">01 / THE PHYSICAL DESIGN</span><h2>Open it up.</h2></div><p>A serviceable assembly with split printed panels, replaceable motor clamps, a low battery, and clear routes for cables.</p></div>
      <Suspense fallback={<div className="kiwi-loading">Loading CAD viewer…</div>}><CadViewer assetPath={cadFiles} /></Suspense>
      <div className="kiwi-design-notes"><div><span>01</span><h3>Print in manageable pieces</h3><p>Split chassis and removable shell sections fit a 256 × 256 mm bed. Start with the motor and insert fit coupons before committing to the full shell.</p></div><div><span>02</span><h3>Build around real interfaces</h3><p>25 mm motor clamps, 4 mm shaft hubs, a Pi mounting pattern, a restrained battery, and a camera mount matched to this version. Purchased parts are labeled reference models.</p></div><div><span>03</span><h3>Keep it accessible</h3><p>The lid opens for wiring, cooling, and charging access. Motors remain replaceable. The battery sits below the computer and camera to lower the center of mass.</p></div></div>
      <div className="kiwi-downloads">{downloads.map(([file, title, subtitle]) => <a key={file} href={`${cadFiles}${file}`} download><Download size={19} /><span><strong>{title}</strong><small>{subtitle}</small></span><ArrowUpRight size={15} /></a>)}</div>
    </section>

    <section id="movement" className="kiwi-section"><div className="kiwi-section-heading"><div><span className="kiwi-eyebrow">02 / THREE WHEELS, THREE MOTORS</span><h2>Sideways is a direction.</h2></div><p>Three omni wheels sit 120° apart. Their passive rollers let each wheel slide in the direction its motor cannot drive.</p></div><DriveDemo />
      <div className="kiwi-two-column"><div><h3>Geared motors, not positional servos</h3><p>Each 75:1 motor has an encoder. A local controller compares the requested and measured speed, then adjusts the motor driver. Combining three wheel speeds controls sideways motion, forward motion, and rotation.</p></div><div><h3>Start slow on a smooth floor</h3><p>The 60 mm wheels have about 0.31 m/s unloaded speed at 12 V. Initial commissioning should be much slower; 0.25 m/s is a later design ceiling, not a measured operating speed. Rugs, thresholds, and roller vibration need physical testing.</p></div></div>
    </section>

    <section id="sensing" className="kiwi-section"><div className="kiwi-section-heading"><div><span className="kiwi-eyebrow">03 / VISION ONLY</span><h2>{variant.label}.</h2></div><p>{variant.capability}</p></div>
      <div className="kiwi-camera-panel"><CameraDiagram variant={variant} /><div><span className="kiwi-eyebrow">INEXPENSIVE CAMERA HARDWARE</span><h3>{variant.cameraProduct.name}</h3><p>{variant.cameraQuantity} × approximately {money(variant.cameraProduct.price * assumptions.usdNok * 1.25, 10)} per module, including estimated VAT. {variant.id === 'stereo' ? `One USB module holds both cameras ${variant.cameraProduct.baselineMm} mm apart. Depth matching runs on the Pi or home computer.` : 'A basic 2 MP USB camera with fixed focus. High-end image quality is not required for the first experiments.'}</p><p className="kiwi-caption">{variant.limitation} <a href={variant.cameraProduct.url} target="_blank" rel="noreferrer">Camera specifications ↗</a></p></div></div>
      <div className="kiwi-accordions">{[
        ['vision', 'What does vision only mean here?', 'Cameras provide all information about the surrounding scene. There are no ToF distance sensors, ultrasonic sensors or lidar. Wheel encoders and an IMU measure the robot’s own movement. The physical bumper switches register contact.'],
        ['depth', 'Will it know how far away things are?', variant.id === 'stereo' ? 'The two synchronized cameras can measure stereo disparity after calibration. A known baseline gives metric scale, but the useful distance range and accuracy need testing with the actual lenses and image settings.' : 'A single image gives appearance and perspective, not a direct distance measurement. Known visual markers, motion over several frames and calibrated odometry can help. Learned monocular depth is an estimate and needs validation.'],
        ['coverage', 'Can it drive sideways and backwards?', 'The wheel arrangement allows it. Before driving into an area outside the current view, the robot must turn to inspect it or use a recently verified view. Three cameras add side coverage; none of these versions sees continuously behind itself.'],
        ['stereo', 'Are three separate cameras a stereo system?', 'No. The front and side cameras provide different views and are not synchronized as a stereo pair. The stereo version uses a dedicated rigid, synchronized two-camera module with overlapping views.'],
        ['stairs', 'What about stairs?', 'No stair-avoidance capability has been demonstrated. Begin on a flat floor away from stairs, then test camera coverage and stopping behavior on the physical robot.'],
      ].map(([id, title, content]) => <div key={id}><h3><button type="button" aria-expanded={open === id} aria-controls={`kiwi-faq-${id}`} onClick={() => setOpen(open === id ? null : id)}>{title}{open === id ? <Minus size={18} /> : <Plus size={18} />}</button></h3><div id={`kiwi-faq-${id}`} hidden={open !== id}><p>{content}</p></div></div>)}</div>
    </section>

    <section id="brain" className="kiwi-section"><div className="kiwi-section-heading"><div><span className="kiwi-eyebrow">04 / INTELLIGENCE IN LAYERS</span><h2>The model chooses.<br />The robot moves.</h2></div><p>Wi-Fi carries observations and goals. Immediate control and stopping stay on the robot.</p></div>
      <div className="kiwi-pipeline"><div><span>HOME MAC / CLOUD</span><h3>Decision service</h3><p>Images + map summary + allowed choices</p><strong>“Inspect the kitchen”</strong></div><MoveUpRight aria-hidden="true" /><div><span>RASPBERRY PI</span><h3>Navigation</h3><p>Images, motion estimate, path and speed limits</p><strong>vx, vy, ω</strong></div><MoveUpRight aria-hidden="true" /><div><span>LOCAL MICROCONTROLLER</span><h3>Motor control</h3><p>Encoders + PID + watchdog + bumpers</p><strong>Three wheel speeds</strong></div></div>
      <div className="kiwi-algorithms"><div className="kiwi-algorithm-row"><span>01</span><div><h3>{variant.algorithmTitle}</h3><p>{variant.algorithmBody}</p></div><small>Pi / home computer</small></div><div className="kiwi-algorithm-row"><span>02</span><div><h3>Track the base's movement</h3><p>Wheel encoders and an IMU give a short-term motion estimate. Omni wheels can slip, so visual landmarks are needed to correct drift.</p></div><small>On Pi</small></div><div className="kiwi-algorithm-row"><span>03</span><div><h3>Build up to navigation</h3><p>{variant.mappingBody}</p></div><small>Needs testing</small></div><div className="kiwi-algorithm-row"><span>04</span><div><h3>Choose the next goal</h3><p>OpenAI Decisions can choose among supplied intents. Responses function calling or a local model adapter can request a destination. The robot checks the request and handles the movement locally.</p></div><small>Home Mac / cloud</small></div></div>
      <div className="kiwi-code-panel"><div><span className="kiwi-eyebrow">THE APPLICATION CONTRACT</span><h3>A goal, not a motor pulse.</h3><p>The robot accepts only known destinations or bounded actions, checks that the observation is fresh, and verifies each result. A response that fits a schema can still be the wrong decision.</p><p>OpenAI Decisions is documented as a public beta with typed choice, predicate, and score answers. It does not replace the navigation stack.</p></div><pre aria-label="Illustrative robot goal contract, not an API wire format"><code>{`// Application-level goal; not API wire format\n{\n  "action": "navigate_to",\n  "destination": "kitchen",\n  "observation_id": "frame-1042",\n  "expires_in_ms": 2000\n}\n\n// Robot checks: known goal, fresh state,\n// valid localization, observed free space.\n// Stale command or missing heartbeat → stop.`}</code></pre></div>
      <p className="kiwi-caption">Planned stack: ROS 2 Jazzy / Ubuntu 24.04 arm64, with OpenCV, camera drivers and navigation packages matched to the chosen version. Installability, CPU load, camera throughput, latency, and stopping behavior have not been tested on the physical robot. Proposed control rates are engineering targets, not measured performance.</p>
      <div className="kiwi-actions"><a className="kiwi-secondary" href={`${asset}autonomy.md`} download><Download size={16} /> Algorithm & integration notes</a></div>
    </section>

    <section id="parts" className="kiwi-section"><div className="kiwi-section-heading"><div><span className="kiwi-eyebrow">05 / THE SHOPPING LIST</span><h2>Every part has a job.</h2></div><p>Exact drive interfaces, electronics, power, cables, and assembly hardware. Follow the linked listing and check the order notes.</p></div><PartsList parts={variant.items} assumptions={assumptions} /><div className="kiwi-actions"><a className="kiwi-secondary" href={`${files}bill-of-materials.csv`} download><Download size={16} /> Download BOM</a><a className="kiwi-secondary" href={`${files}wiring.md`} download><Download size={16} /> Wiring & power plan</a><a className="kiwi-secondary" href={`${files}parts.md`} download><Download size={16} /> Detailed purchasing notes</a></div></section>

    <section id="build" className="kiwi-section"><div className="kiwi-section-heading"><div><span className="kiwi-eyebrow">06 / FROM DESIGN TO ROBOT</span><h2>Build it in useful steps.</h2></div><p>The first milestone is a controllable base. Each later stage adds a capability that can be checked on its own.</p></div><ol className="kiwi-build-steps">{[
      ['Check the interfaces', 'Print the clamp and insert coupons. Confirm the actual motor, hub, wheel, camera, and battery dimensions. Resolve fit before printing the larger pieces.'],
      ['Assemble a rolling base', 'Fit chassis, motors, hubs, wheels, and battery restraint. Verify clearance through a full wheel rotation. Check fastener engagement and cable routing.'],
      ['Commission the electronics', 'Check polarity, regulated rails, current limits, encoder levels, fusing, stop switch, and command timeout on the bench with wheels lifted.'],
      ['Drive it manually', 'Measure wheel direction and encoder scale. Tune speed control. Test low-speed forward, lateral, and turning motion on the actual floor.'],
      ['Add vision and navigation', 'Calibrate the selected cameras, check coverage and image latency, measure stopping distance, then add landmarks or mapping within a small tested area.'],
      ['Connect the model', 'Start with fixed choices such as wait, inspect a known zone, and return home. Test stale images, failed localization, slow responses, and Wi-Fi loss.'],
    ].map(([title, text], index) => <li key={title}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{title}</h3><p>{text}</p></div><span className="kiwi-pending">Physical test pending</span></li>)}</ol>
      <div className="kiwi-evidence"><h3>What the files establish</h3><p>CAD checks establish geometric properties reported in the downloadable validation file. The viewer and ImageGen image do not establish print fit, electrical reliability, measured runtime, or autonomous driving. Those results belong here after the prototype has been assembled and tested.</p></div>
    </section>

    <Upgrades usdNok={assumptions.usdNok} />
    <section className="kiwi-section kiwi-sources"><span className="kiwi-eyebrow">DESIGN REFERENCES / CHECKED 20–21 OCTOBER 2026</span><h2>Sources & specifications</h2><div>{sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><span><strong>{source.title}</strong><small>{source.detail}</small></span><ArrowUpRight size={16} /></a>)}</div><p className="kiwi-caption">Additional component and algorithm references are included in the downloadable research and wiring documents.</p></section>
  </article>
}
