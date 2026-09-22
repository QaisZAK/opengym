import { describe, it, expect } from 'vitest'
import { platesPerSide, PLATES, BAR } from './plates.js'

describe('platesPerSide', () => {
  it('loads the heaviest plates first', () => {
    expect(platesPerSide(100, BAR.kg, PLATES.kg).plates).toEqual([25, 15])
    expect(platesPerSide(225, BAR.lb, PLATES.lb).plates).toEqual([45, 45])
    expect(platesPerSide(62.5, 20, PLATES.kg).plates).toEqual([20, 1.25])
  })
  it('reports what cannot be loaded', () => {
    expect(platesPerSide(21, 20, PLATES.kg)).toEqual({ plates: [], rest: 0.5 })
  })
  it('returns nothing at or below the bar', () => {
    expect(platesPerSide(20, 20, PLATES.kg).plates).toEqual([])
    expect(platesPerSide(10, 20, PLATES.kg).plates).toEqual([])
  })
})
