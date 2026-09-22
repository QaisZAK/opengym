import { describe, it, expect } from 'vitest'
import { toCSV, workoutsCSV, bodyweightCSV, nutritionCSV } from './export.js'

describe('toCSV', () => {
  it('quotes commas, quotes and newlines; blanks null', () => {
    expect(toCSV([['a', 'b,c', 'say "hi"', null, 'x\ny']])).toBe('a,"b,c","say ""hi""",,"x\ny"\n')
  })
})

describe('exports', () => {
  const S = {
    unit: 'kg',
    workouts: [{ d: '2026-01-01', name: 'Push', entries: [{ id: 'zz', n: 'Custom', sets: [{ w: 60, r: 8, done: true }, { w: 40, r: 5, type: 'warmup', done: true }] }] }],
    bodyweight: [{ d: '2026-01-01', w: 80.5 }],
    nutrition: { log: { '2026-01-02': [{ meal: 'lunch', name: 'Rice, cooked', qty: 150, unit: 'g', kcal: 195, protein: 4, carbs: 42, fat: 0.4 }] } }
  }
  it('writes one row per set with its type', () => {
    const lines = workoutsCSV(S).trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('2026-01-01,Push,Custom,1,work,60,8,,,,1')
    expect(lines[2]).toContain(',warmup,40,5,')
  })
  it('writes body weight and nutrition rows', () => {
    expect(bodyweightCSV(S)).toBe('date,weight,unit\n2026-01-01,80.5,kg\n')
    expect(nutritionCSV(S).split('\n')[1]).toBe('2026-01-02,lunch,"Rice, cooked",150,g,195,4,42,0.4,,,')
  })
})
