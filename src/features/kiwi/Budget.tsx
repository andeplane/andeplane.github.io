import { useEffect, useState } from 'react'
import { parts } from './data'
import { calculateBudget } from './budgetMath'

const money = (n: number) => `NOK ${(Math.round(n / 100) * 100).toLocaleString('en-US')}`

export function HeroCost({ total }: { total?: number }) {
  return <a className="kiwi-hero-cost" href="#budget"><span>Estimated base build</span><strong>≈ {money(total ?? calculateBudget(parts).total)}</strong><small>Planning estimate incl. VAT & freight allowances ↗</small></a>
}

export default function Budget({ onEstimateChange }: { onEstimateChange?: (total: number) => void }) {
  const [rate, setRate] = useState(10), [smallParts, setSmallParts] = useState(150), [shipping, setShipping] = useState(800), [euroRate, setEuroRate] = useState(12)
  const budget = calculateBudget(parts, { usdNok: rate, eurNok: euroRate, smallPartsUsd: smallParts, freightNok: shipping })
  const { total, importVat } = budget
  useEffect(() => { onEstimateChange?.(total) }, [total, onEstimateChange])
  return <section id="budget" className="kiwi-budget" aria-labelledby="kiwi-budget-title">
    <div className="kiwi-budget-heading"><div><span className="kiwi-eyebrow">PARTS & BUILD BUDGET</span><h2 id="kiwi-budget-title">What would it cost?</h2></div><div className="kiwi-budget-number"><strong>{money(total)}</strong><span>estimated wheeled base · no arm or dock</span></div></div>
    <div className="kiwi-budget-lines"><div><span>Priced imported core parts</span><strong>USD {budget.usd.toFixed(2)} + EUR {budget.eur.toFixed(2)}</strong></div><div><span>Battery, charger & stop switch</span><strong>NOK {budget.nok.toFixed(2)}</strong></div><div><span>Wiring, fasteners, SD, bench supply & filament</span><strong>USD {smallParts.toFixed(0)} allowance</strong></div><div><span>Combined freight placeholder</span><strong>NOK {shipping.toFixed(0)}</strong></div><div><span>Estimated import VAT on foreign items + freight</span><strong>NOK {importVat.toFixed(0)}</strong></div></div>
    <details><summary>Adjust the planning assumptions</summary><div className="kiwi-budget-inputs"><label>USD → NOK planning rate<input type="number" aria-label="USD to NOK planning rate" min="1" max="30" step="0.1" value={rate} onChange={e => setRate(Math.max(1, Number(e.target.value) || 1))} /></label><label>EUR → NOK planning rate<input type="number" aria-label="EUR to NOK planning rate" min="1" max="30" step="0.1" value={euroRate} onChange={e => setEuroRate(Math.max(1, Number(e.target.value) || 1))} /></label><label>Small parts allowance (USD)<input type="number" min="0" max="1000" step="10" value={smallParts} onChange={e => setSmallParts(Math.max(0, Number(e.target.value) || 0))} /></label><label>Freight allowance (NOK)<input type="number" min="0" max="10000" step="100" value={shipping} onChange={e => setShipping(Math.max(0, Number(e.target.value) || 0))} /></label></div></details>
    <p className="kiwi-caption">Planning calculation, not a checkout quotation. The defaults 10 NOK/USD and 12 NOK/EUR are assumptions, not live rates. Foreign prices are used as listed, with a conservative <a href="https://www.toll.no/en/online-shopping/calculation-norwegian-vat" target="_blank" rel="noreferrer">25% import VAT</a> allowance; export-tax adjustments may reduce the total. The NOK stop price is adjusted from ex-VAT. Battery/charger VAT mode, freight, clearance fees and stock need checkout confirmation. Small items are an allowance; tools and optional upgrades are excluded. <a href="#parts">Inspect every component →</a></p>
    <div className="kiwi-budget-options"><a href="#upgrades"><span>Arm + wrist camera</span><strong>+ USD 250–300</strong><small>additional parts allowance, before freight/import</small></a><a href="#upgrades"><span>Self-charging dock study</span><strong>USD 150–250</strong><small>replacement pack + charging hardware allowance</small></a></div>
  </section>
}
