import { describe, it, expect } from 'vitest'
import { DRINKS, drinkByKey, mkEntry, normalizeDay, dayWater, waterUnit, toUnit, fromUnit, suggestGoalMl } from './water.js'

describe('suggestGoalMl', () => {
  it('is ~35 ml/kg rounded to 50 ml, clamped to 1.5–5 L', () => {
    expect(suggestGoalMl(80)).toBe(2800)
    expect(suggestGoalMl(30)).toBe(1500)
    expect(suggestGoalMl(200)).toBe(5000)
    expect(suggestGoalMl(null)).toBe(null)
  })
})

describe('water units', () => {
  it('converts ml <-> US fl oz, storing whole ml', () => {
    expect(toUnit(250, 'ml')).toBe(250)
    expect(toUnit(236.6, 'oz')).toBe(8)
    expect(fromUnit(8, 'oz')).toBe(237)
    expect(fromUnit(toUnit(500, 'oz'), 'oz')).toBeCloseTo(500, -1)
  })
  it('defaults to oz for lb profiles unless set explicitly', () => {
    expect(waterUnit({ unit: 'lb' })).toBe('oz')
    expect(waterUnit({ unit: 'kg' })).toBe('ml')
    expect(waterUnit({ unit: 'lb', nutrition: { water: { unit: 'ml' } } })).toBe('ml')
  })
})

describe('DRINKS catalog', () => {
  it('has the common presets with hydration + caffeine', () => {
    expect(DRINKS.length).toBeGreaterThanOrEqual(8)
    expect(drinkByKey('coffee')).toMatchObject({ caf: 40, hydration: 0.95 })
    expect(drinkByKey('glass').hydration).toBe(1)
    expect(drinkByKey('energy').caf).toBe(32)
  })
})

describe('mkEntry', () => {
  it('snapshots a drink at a chosen volume', () => {
    expect(mkEntry(drinkByKey('coffee'), 300)).toEqual({ key: 'coffee', name: 'Coffee', icon: 'coffee', ml: 300, hydration: 0.95, caf: 40 })
  })
})

describe('normalizeDay', () => {
  it('passes an entry array through and migrates an old plain-ml number', () => {
    const a = [{ key: 'glass', ml: 250, hydration: 1, caf: 0 }]
    expect(normalizeDay(a)).toBe(a)
    expect(normalizeDay(500)).toEqual([{ key: 'glass', name: 'Water', icon: 'glass', ml: 500, hydration: 1, caf: 0 }])
    expect(normalizeDay(0)).toEqual([])
    expect(normalizeDay(undefined)).toEqual([])
  })
})

describe('dayWater', () => {
  it('sums volume, hydration-adjusted ml and caffeine', () => {
    // 250 water (all counts) + 240 coffee (×0.95 = 228, caffeine 2.4×40 = 96)
    expect(dayWater([
      { key: 'glass', ml: 250, hydration: 1, caf: 0 },
      { key: 'coffee', ml: 240, hydration: 0.95, caf: 40 }
    ])).toEqual({ ml: 490, hydration: 478, caffeine: 96, count: 2 })
  })
  it('handles the migrated number form and empty days', () => {
    expect(dayWater(500)).toEqual({ ml: 500, hydration: 500, caffeine: 0, count: 1 })
    expect(dayWater([])).toEqual({ ml: 0, hydration: 0, caffeine: 0, count: 0 })
  })
})
