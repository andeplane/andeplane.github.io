import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateBudget } from '../../src/features/kiwi/budgetMath.ts'

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
