import { describe, it, expect } from 'vitest'
import { toLen, fromLen, lenUnit, putMeasure } from './measure.js'

describe('measurements', () => {
  it('converts cm <-> in by the profile unit', () => {
    expect(lenUnit({ unit: 'lb' })).toBe('in')
    expect(lenUnit({ unit: 'kg' })).toBe('cm')
    expect(toLen(81.28, 'in')).toBe(32)
    expect(fromLen(32, 'in')).toBe(81.3)
    expect(toLen(80, 'cm')).toBe(80)
  })
  it('merges a day and keeps date order', () => {
    let l = putMeasure([], '2026-01-05', { waist: 80, chest: 0 })
    l = putMeasure(l, '2026-01-01', { waist: 82 })
    l = putMeasure(l, '2026-01-05', { chest: 100 })
    expect(l.map(m => m.d)).toEqual(['2026-01-01', '2026-01-05'])
    expect(l[1]).toMatchObject({ waist: 80, chest: 100 })
  })
})
