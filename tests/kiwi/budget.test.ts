import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateBudget } from '../../src/features/kiwi/budgetMath.ts'
import { readFile } from 'node:fs/promises'

test('parts budget counts quantities, currencies, local ex-VAT adjustment and freight VAT once', () => {
  const budget = calculateBudget([
    { id: 'motor', quantity: 3, price: 10, currency: 'USD' },
    { id: 'insert', quantity: 1, price: 8, currency: 'EUR' },
    { id: 'battery', quantity: 1, price: 100, currency: 'NOK' },
    { id: 'stop', quantity: 1, price: 200, currency: 'NOK' },
    { id: 'unquoted', quantity: 20, currency: 'USD' },
  ], { usdNok: 10, eurNok: 12, smallPartsUsd: 50, freightNok: 400 })
  assert.equal(budget.usd, 30)
  assert.equal(budget.eur, 8)
  assert.equal(budget.nok, 350)
  assert.equal(budget.importVat, 324)
  assert.equal(budget.total, 1970)
})

test('changing an exchange-rate assumption only changes foreign-currency costs and their VAT', () => {
  const items = [{ id: 'part', quantity: 2, price: 10, currency: 'USD' }, { id: 'local', quantity: 1, price: 100, currency: 'NOK' }]
  const a = calculateBudget(items, { usdNok: 10, smallPartsUsd: 0, freightNok: 0 })
  const b = calculateBudget(items, { usdNok: 11, smallPartsUsd: 0, freightNok: 0 })
  assert.equal(b.total - a.total, 25)
  assert.equal(b.nok, a.nok)
})

test('each vision-only version reconciles its displayed categories with its actual downloadable BOM', async () => {
  const variants = JSON.parse(await readFile(new URL('../../src/features/kiwi/variants.json', import.meta.url), 'utf8'))
  assert.deepEqual(variants.map(v => v.id), ['front-camera', 'three-cameras', 'stereo'])
  for (const variant of variants) {
    const bill = JSON.parse(await readFile(new URL(`../../public/hardware/kiwi/${variant.id}/parts.json`, import.meta.url), 'utf8'))
    assert.deepEqual(bill.items, variant.items, `${variant.id} downloadable parts match the page`)
    assert.ok(!bill.items.some(p => ['tof', 'mux', 'buck33'].includes(p.id)), `${variant.id} has no ranging hardware`)
    assert.equal(bill.items.find(p => p.id === 'camera').quantity, variant.id === 'three-cameras' ? 3 : 1)
    assert.equal(bill.items.some(p => p.id === 'camera_hub'), variant.id === 'three-cameras')
    assert.equal(bill.items.some(p => p.id === 'camera_power'), variant.id === 'three-cameras')
    const model = JSON.parse(await readFile(new URL(`../../public/hardware/kiwi/cad/${variant.id}/manifest.json`, import.meta.url), 'utf8'))
    for (const fastener of model.fasteners) {
      if (fastener.id === 'hardware_inserts') continue // One separately priced 100-pack supplies the used inserts.
      assert.equal(bill.items.find(p => p.id === fastener.id)?.quantity, fastener.quantity, `${variant.id} ${fastener.item} count comes from its CAD`)
    }
    const budget = calculateBudget(bill.items)
    const visibleSum = Object.values(budget.components).reduce((sum, n) => sum + n, 0) + budget.freight + budget.importVat
    assert.ok(Math.abs(visibleSum - budget.total) < 1e-8, `${variant.id} cost categories add up without counting VAT twice`)
  }
})
