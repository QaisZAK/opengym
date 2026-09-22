import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inQuiet, muted, streakAtRisk } from '../notify.js'

test('quiet hours handle same-day and overnight windows', () => {
  const night = { on: true, from: '22:00', to: '07:00' }
  assert.equal(inQuiet('23:30', night), true)
  assert.equal(inQuiet('06:59', night), true)
  assert.equal(inQuiet('07:00', night), false)
  assert.equal(inQuiet('12:00', night), false)
  assert.equal(inQuiet('13:00', { on: true, from: '12:00', to: '14:00' }), true)
  assert.equal(inQuiet('23:30', { ...night, on: false }), false)
})

test('snooze mutes until it runs out', () => {
  assert.equal(muted({ notify: { snoozeUntil: 2000 } }, '12:00', 1000), true)
  assert.equal(muted({ notify: { snoozeUntil: 2000 } }, '12:00', 3000), false)
  assert.equal(muted({}, '12:00'), false)
})

test('streak is at risk only on a Sunday after a trained week with nothing this week', () => {
  const lastWeek = [{ d: '2026-09-09' }]                        // Wed of the week before Mon 14 – Sun 20
  assert.equal(streakAtRisk(lastWeek, '2026-09-20'), true)      // Sunday, nothing this week
  assert.equal(streakAtRisk(lastWeek, '2026-09-19'), false)     // Saturday — not yet
  assert.equal(streakAtRisk([...lastWeek, { d: '2026-09-18' }], '2026-09-20'), false) // trained this week
  assert.equal(streakAtRisk([], '2026-09-20'), false)           // no streak to lose
})
