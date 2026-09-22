import { describe, it, expect } from 'vitest'
import { localSearch, quickFoods, FOODS } from './foodDB.js'

describe('quickFoods', () => {
  const b = { per: '100g', kcal: 100, protein: 1, carbs: 1, fat: 1 }
  const log = {
    '2026-01-01': [{ name: 'Oats', base: b }, { name: 'Egg', base: b }],
    '2026-01-02': [{ name: 'Rice', base: b }, { name: 'Quick', qty: 1 }, { name: 'egg', base: b }]
  }
  it('lists favourites first, then most-recent log foods, deduped by name', () => {
    const r = quickFoods(log, [{ name: 'Rice', ...b }])
    expect(r.map(f => f.name)).toEqual(['Rice', 'egg', 'Oats'])
    expect(r[0].fav).toBe(true)
  })
  it('skips quick-add entries (no base) and respects the limit', () => {
    expect(quickFoods(log, [], 2).map(f => f.name)).toEqual(['egg', 'Rice'])
    expect(quickFoods(undefined)).toEqual([])
  })
})

describe('FOODS catalog', () => {
  it('ships a sizable offline catalog of common foods', () => {
    expect(FOODS.length).toBeGreaterThan(150)
  })
  it('covers the everyday staples people expect to find', () => {
    for (const term of ['egg', 'coffee', 'chicken', 'rice', 'milk', 'banana', 'bread', 'apple'])
      expect(localSearch(term).length, `expected a match for "${term}"`).toBeGreaterThan(0)
  })
})

describe('localSearch', () => {
  it('returns the closest name first (starts-with beats contains)', () => {
    expect(localSearch('egg')[0].name.toLowerCase()).toContain('egg')
    expect(localSearch('rice')[0].name.toLowerCase().startsWith('rice')).toBe(true)
  })
  it("ranks the user's own foods above catalog matches on a tie", () => {
    const custom = [{ id: 'x', name: 'Egg special', per: '100g', kcal: 100, source: 'custom' }]
    expect(localSearch('egg', custom)[0].id).toBe('x')
  })
  it('returns nothing for a blank query and caps the result count', () => {
    expect(localSearch('')).toEqual([])
    expect(localSearch('   ')).toEqual([])
    expect(localSearch('e').length).toBeLessThanOrEqual(30)
  })
  it('is case-insensitive', () => {
    expect(localSearch('EGG').length).toBe(localSearch('egg').length)
  })
})
