import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeProduct, normalizeSearch } from '../food.js'

test('normalizeProduct maps an OFF product to our per-100g food shape', () => {
  const f = normalizeProduct({
    code: '737628064502',
    product_name: 'Peanut Butter',
    brands: 'Acme, Foo',
    nutriments: { 'energy-kcal_100g': 588, proteins_100g: 25, carbohydrates_100g: 20, fat_100g: 50 },
    serving_quantity: 32
  })
  assert.deepEqual(f, {
    code: '737628064502', name: 'Peanut Butter', brand: 'Acme',
    per: '100g', kcal: 588, protein: 25, carbs: 20, fat: 50, servingG: 32, source: 'off'
  })
})

test('normalizeProduct carries fiber, sugar and sodium (g → mg) when OFF has them', () => {
  const f = normalizeProduct({ code: '9', product_name: 'Oats', nutriments: { 'energy-kcal_100g': 380, fiber_100g: 10.1, sugars_100g: 1, sodium_100g: 0.006 } })
  assert.equal(f.fiber, 10.1)
  assert.equal(f.sugar, 1)
  assert.equal(f.sodium, 6)
})

test('normalizeProduct converts kJ energy when kcal is absent', () => {
  const f = normalizeProduct({
    code: '1', product_name: 'Juice',
    nutriments: { energy_100g: 190, proteins_100g: 0.5, carbohydrates_100g: 11, fat_100g: 0 }
  })
  assert.equal(f.kcal, 45.4) // 190 kJ / 4.184
})

test('normalizeProduct defaults missing macros to 0 and drops an absent serving size', () => {
  const f = normalizeProduct({ code: '2', product_name: 'Water', nutriments: { 'energy-kcal_100g': 0 } })
  assert.deepEqual(f, { code: '2', name: 'Water', brand: null, per: '100g', kcal: 0, protein: 0, carbs: 0, fat: 0, source: 'off' })
})

test('normalizeProduct rejects a product with no name or no energy', () => {
  assert.equal(normalizeProduct({ code: '3', nutriments: { 'energy-kcal_100g': 100 } }), null)          // no name
  assert.equal(normalizeProduct({ code: '4', product_name: 'Mystery', nutriments: {} }), null)          // no energy
  assert.equal(normalizeProduct(null), null)
})

test('normalizeProduct falls back to generic_name', () => {
  const f = normalizeProduct({ code: '5', generic_name: 'Olive oil', nutriments: { 'energy-kcal_100g': 884 } })
  assert.equal(f.name, 'Olive oil')
})

test('normalizeSearch skips unusable products, dedupes by code, and honours the limit', () => {
  const json = { products: [
    { code: 'A', product_name: 'Apple', nutriments: { 'energy-kcal_100g': 52 } },
    { code: 'A', product_name: 'Apple dup', nutriments: { 'energy-kcal_100g': 52 } }, // dup code
    { code: 'X', nutriments: { 'energy-kcal_100g': 10 } },                            // no name
    { code: 'B', product_name: 'Banana', nutriments: { 'energy-kcal_100g': 89 } }
  ] }
  assert.deepEqual(normalizeSearch(json).map(f => f.name), ['Apple', 'Banana'])
  assert.deepEqual(normalizeSearch(json, 1).map(f => f.name), ['Apple'])
  assert.deepEqual(normalizeSearch({}), [])
})
