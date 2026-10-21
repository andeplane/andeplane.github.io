import type { Part } from './data'
import { calculateBudget, type Assumptions } from './budgetMath'

export const money = (n: number, step = 100) => `NOK ${(Math.round(n / step) * step).toLocaleString('en-US')}`

export function HeroCost({ total }: { total: number }) {
  return <a className="kiwi-hero-cost" href="#budget"><span>Estimated complete build</span><strong>≈ {money(total)}</strong><small>Includes battery, charger, estimated VAT and shipping ↗</small></a>
}

export default function Budget({ items, assumptions, onChange, cameraLabel }: { items: Part[]; assumptions: Required<Assumptions>; onChange: (next: Required<Assumptions>) => void; cameraLabel: string }) {
  const budget = calculateBudget(items, assumptions)
  const change = (key: keyof Assumptions, value: number) => onChange({ ...assumptions, [key]: value })
  const rows = [
    [cameraLabel, budget.components.cameras],
    ['Three motors, omni wheels, hubs and drivers', budget.components.drive],
    [items.some(p => p.id === 'camera_hub') ? 'Raspberry Pi, cooler, motor controller and USB hub' : 'Raspberry Pi, cooler and motor controller', budget.components.compute],
    ['Battery, charger, power supply boards and switches', budget.components.power],
    ['IMU motion sensor and bumper switches', budget.components.otherInputs],
    ['Printed parts, wiring, fasteners, SD card and bench supply', budget.components.materials],
    ['Shipping allowance', budget.freight],
    ['Estimated import VAT', budget.importVat],
  ] as const
  const upgradePrice = (usd: number) => money(usd * assumptions.usdNok * 1.25)
  return <section id="budget" className="kiwi-budget" aria-labelledby="kiwi-budget-title">
    <div className="kiwi-budget-heading"><div><span className="kiwi-eyebrow">THIS ROBOT'S BUDGET</span><h2 id="kiwi-budget-title">Where the money goes</h2></div><div className="kiwi-budget-number"><strong>≈ {money(budget.total)}</strong><span>complete base · arm and dock extra</span></div></div>
    <p className="kiwi-budget-intro">All amounts below are in Norwegian kroner. The cameras are inexpensive; most of the cost is the shared drivetrain, computer and power system. There are no distance sensors in this design.</p>
    <div className="kiwi-budget-lines">{rows.map(([label, amount]) => <div key={label}><span>{label}</span><strong>{money(amount, 1)}</strong></div>)}</div>
    <p className="kiwi-caption">An estimate based on listed parts and allowances. Final prices, shipping and availability need checking before ordering. <a href="#parts">See the parts for this version →</a></p>
    <details><summary>Exchange rates and estimate settings</summary><p className="kiwi-caption">Uses {assumptions.usdNok} NOK/USD and {assumptions.eurNok} NOK/EUR. These are adjustable assumptions, not live rates. Foreign goods and shipping include an estimated <a href="https://www.toll.no/en/online-shopping/calculation-norwegian-vat" target="_blank" rel="noreferrer">25% import VAT</a>. Local prices are used as displayed; the stop switch is adjusted from its ex-VAT listing. The materials row includes an allowance of {money(assumptions.smallPartsUsd * assumptions.usdNok, 1)} plus the listed insert pack. Other tools, API usage and optional upgrades are extra. Rows round to the nearest krone; the total rounds to the nearest hundred.</p><div className="kiwi-budget-inputs"><label>NOK per US dollar<input type="number" aria-label="USD to NOK planning rate" min="1" max="30" step="0.1" value={assumptions.usdNok} onChange={e => change('usdNok', Math.max(1, Number(e.target.value) || 1))} /></label><label>NOK per euro<input type="number" aria-label="EUR to NOK planning rate" min="1" max="30" step="0.1" value={assumptions.eurNok} onChange={e => change('eurNok', Math.max(1, Number(e.target.value) || 1))} /></label><label>Materials allowance (NOK)<input type="number" min="0" max="30000" step="100" value={Math.round(assumptions.smallPartsUsd * assumptions.usdNok)} onChange={e => change('smallPartsUsd', Math.max(0, Number(e.target.value) || 0) / assumptions.usdNok)} /></label><label>Shipping allowance (NOK)<input type="number" min="0" max="10000" step="100" value={assumptions.freightNok} onChange={e => change('freightNok', Math.max(0, Number(e.target.value) || 0))} /></label></div></details>
    <div className="kiwi-budget-options"><a href="#upgrades"><span>Optional arm + wrist camera</span><strong>≈ {upgradePrice(250)}–{upgradePrice(300).replace('NOK ', '')} extra</strong><small>Rough parts budget including estimated VAT; shipping extra.</small></a><a href="#upgrades"><span>Optional self-charging dock</span><strong>≈ {upgradePrice(150)}–{upgradePrice(250).replace('NOK ', '')}</strong><small>Replacement battery and charging hardware, including estimated VAT; shipping extra.</small></a></div>
  </section>
}
