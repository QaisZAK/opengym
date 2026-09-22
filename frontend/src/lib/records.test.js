import { describe, it, expect } from 'vitest'
import { recordsOf, newRecords } from './records.js'

const W = (d, sets, id = 'x') => ({ d, entries: [{ id, sets: sets.map(s => ({ done: true, ...s })) }] })

describe('recordsOf', () => {
  it('tracks weight, reps, volume, hold and est-1RM with their dates', () => {
    const r = recordsOf([W('2026-01-01', [{ w: 100, r: 5 }, { w: 60, r: 12 }]), W('2026-01-08', [{ w: 90, r: 5 }])]).x
    expect(r.weight).toMatchObject({ v: 100, d: '2026-01-01' })
    expect(r.reps).toMatchObject({ v: 12, w: 60 })
    expect(r.volume.v).toBe(1220)
    expect(r.e1rm.v).toBeCloseTo(116.7, 1)
    expect(r.hold).toBeUndefined()
  })
  it('ignores warm-ups and unfinished sets', () => {
    const r = recordsOf([W('d', [{ w: 200, r: 1, type: 'warmup' }, { w: 300, r: 1, done: false }, { w: 50, r: 5 }])]).x
    expect(r.weight.v).toBe(50)
  })
})

describe('newRecords', () => {
  const hist = [W('2026-01-01', [{ w: 100, r: 5 }, { sec: 30 }])]
  it('reports the extra kinds the entry beats', () => {
    expect(newRecords(hist, W('n', [{ w: 80, r: 8 }, { w: 80, r: 8 }]).entries[0])).toEqual(['reps', 'volume'])
    expect(newRecords(hist, W('n', [{ sec: 45 }]).entries[0])).toEqual(['hold'])
  })
  it('stays quiet on a first-ever session', () => {
    expect(newRecords([], W('n', [{ w: 80, r: 8 }]).entries[0])).toEqual([])
  })
})
