interface PurchaseLine { id: string; quantity: number; price?: number; currency?: string }
interface Assumptions { usdNok?: number; eurNok?: number; smallPartsUsd?: number; freightNok?: number }

export function calculateBudget(items: PurchaseLine[], assumptions: Assumptions = {}) {
  const { usdNok = 10, eurNok = 12, smallPartsUsd = 150, freightNok = 800 } = assumptions
  const subtotal = (currency: string) => items.filter(p => p.currency === currency).reduce((sum, p) => sum + (p.price ?? 0) * p.quantity, 0)
  const usd = subtotal('USD'), eur = subtotal('EUR')
  // This specific observed Norwegian listing is ex VAT. Other local prices are
  // used as shown; their final VAT display remains a documented checkout hold.
  const nok = items.filter(p => p.currency === 'NOK').reduce((sum, p) => sum + (p.price ?? 0) * p.quantity * (p.id === 'stop' ? 1.25 : 1), 0)
  const imported = (usd + smallPartsUsd) * usdNok + eur * eurNok + freightNok
  return { usd, eur, nok, importVat: imported * .25, total: imported * 1.25 + nok }
}
