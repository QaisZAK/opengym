// CSV exports of the data a user might want in a spreadsheet. Pure — the caller downloads/shares.
import { EXIDX } from './exercises.js'

const cell = v => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
export const toCSV = rows => rows.map(r => r.map(cell).join(',')).join('\n') + '\n'

// One row per logged set.
export function workoutsCSV(S) {
  const rows = [['date', 'workout', 'exercise', 'set', 'type', 'weight', 'reps', 'seconds', 'minutes', 'speed', 'done']]
  for (const w of S.workouts || []) for (const e of w.entries || []) (e.sets || []).forEach((s, i) =>
    rows.push([w.d, w.name, (EXIDX[e.id] || {}).n || e.n || e.id, i + 1, s.type || 'work', s.w, s.r, s.sec, s.min, s.speed, s.done ? 1 : 0]))
  return toCSV(rows)
}

export function bodyweightCSV(S) {
  return toCSV([['date', 'weight', 'unit'], ...(S.bodyweight || []).map(b => [b.d, b.w, S.unit])])
}

export function nutritionCSV(S) {
  const rows = [['date', 'meal', 'food', 'qty', 'unit', 'kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium_mg']]
  const log = S.nutrition?.log || {}
  for (const d of Object.keys(log).sort()) for (const e of log[d] || [])
    rows.push([d, e.meal, e.name, e.qty, e.unit, e.kcal, e.protein, e.carbs, e.fat, e.fiber, e.sugar, e.sodium])
  return toCSV(rows)
}
