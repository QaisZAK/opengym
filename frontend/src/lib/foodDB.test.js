import { describe, it, expect } from 'vitest'
import { localSearch, FOODS } from './foodDB.js'

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
