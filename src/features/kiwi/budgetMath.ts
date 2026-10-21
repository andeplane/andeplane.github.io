interface PurchaseLine { id: string; category?: string; quantity: number; price?: number; currency?: string }
export interface Assumptions { usdNok?: number; eurNok?: number; smallPartsUsd?: number; freightNok?: number }
export const defaultAssumptions: Required<Assumptions> = { usdNok: 10, eurNok: 12, smallPartsUsd: 150, freightNok: 800 }

export function unitCostNok(item: PurchaseLine, assumptions: Assumptions = {}, includeImportVat = false) {
  const rates = { ...defaultAssumptions, ...assumptions }
  const rate = item.currency === 'USD' ? rates.usdNok : item.currency === 'EUR' ? rates.eurNok : 1
  const vat = item.id === 'stop' || (includeImportVat && item.currency !== 'NOK') ? 1.25 : 1
  return (item.price ?? 0) * rate * vat
}

export function calculateBudget(items: PurchaseLine[], assumptions: Assumptions = {}) {
  const { usdNok, eurNok, smallPartsUsd, freightNok } = { ...defaultAssumptions, ...assumptions }
  const subtotal = (currency: string) => items.filter(p => p.currency === currency).reduce((sum, p) => sum + (p.price ?? 0) * p.quantity, 0)
  const usd = subtotal('USD'), eur = subtotal('EUR')
  // This specific observed Norwegian listing is ex VAT. Other local prices are
  // used as shown; their final VAT display remains a documented checkout hold.
  const nok = items.filter(p => p.currency === 'NOK').reduce((sum, p) => sum + (p.price ?? 0) * p.quantity * (p.id === 'stop' ? 1.25 : 1), 0)
  const imported = (usd + smallPartsUsd) * usdNok + eur * eurNok + freightNok
  const components = { cameras: 0, drive: 0, compute: 0, power: 0, otherInputs: 0, materials: smallPartsUsd * usdNok }
  for (const item of items) {
    const value = item.quantity * unitCostNok(item, assumptions)
    if (item.id === 'camera') components.cameras += value
    else if (item.category === 'Drive') components.drive += value
    else if (item.category === 'Compute') components.compute += value
    else if (item.category === 'Power') components.power += value
    else if (item.category === 'Sensing') components.otherInputs += value
    else components.materials += value
  }
  return { usd, eur, nok, components, freight: freightNok, importVat: imported * .25, total: imported * 1.25 + nok }
}
