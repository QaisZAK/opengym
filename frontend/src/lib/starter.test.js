import { describe, it, expect } from 'vitest'
import { TEMPLATES, templatePlan, duplicateRoutine } from './starter.js'
import { EXIDX } from './exercises.js'

describe('starter templates', () => {
  it('only reference exercises that exist', () => {
    for (const tpl of TEMPLATES) for (const [, , list] of tpl.spec) for (const [id] of list) expect(EXIDX[id], `${tpl.key}: ${id}`).toBeTruthy()
  })
  it('schedule every weekday onto one of the template routines', () => {
    const { routines, week } = templatePlan('fb')
    expect(routines).toHaveLength(2)
    expect(week[1]).toBe(routines[0].id)
    expect(week[5]).toBe(routines[0].id)
    expect(week[3]).toBe(routines[1].id)
  })
})

describe('duplicateRoutine', () => {
  it('copies with new ids and its own superset links', () => {
    const r = { id: 'r', name: 'A', emoji: 'x', ex: [{ id: '1', sg: 's' }, { id: '2', sg: 's' }, { id: '3' }] }
    const c = duplicateRoutine(r, 'A copy')
    expect(c.id).not.toBe('r')
    expect(c.name).toBe('A copy')
    expect(c.ex[0].sg).toBe(c.ex[1].sg)
    expect(c.ex[0].sg).not.toBe('s')
    expect(c.ex[2].sg).toBeUndefined()
    expect(r.ex[0].sg).toBe('s')
  })
})
