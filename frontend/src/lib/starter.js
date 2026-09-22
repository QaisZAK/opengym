// Starter plan templates. Shared by the "Load a starter plan" picker (Plan, Home, Settings) and
// by the demo build, which seeds a history on top of the Push/Pull/Legs routines.
// Each routine is [name, glyph, [[exerciseId, sets, reps], …]]; `days` maps weekday → routine index.
import { uid } from './format.js'

const PPL = [
  ['Push Day', 'barbell', [['0025', 4, 8], ['0047', 3, 10], ['0426', 3, 10], ['0334', 3, 12], ['0241', 3, 12], ['0251', 3, 10]]],
  ['Pull Day', 'pullup', [['2330', 4, 10], ['0027', 4, 8], ['1323', 3, 10], ['0031', 3, 10], ['0313', 3, 12]]],
  ['Leg Day', 'legs', [['0043', 4, 8], ['0085', 3, 10], ['0739', 3, 12], ['0585', 3, 12], ['0586', 3, 12], ['0605', 4, 15]]]
]

export const TEMPLATES = [
  { key: 'ppl', name: 'Push / Pull / Legs', desc: '3 days · Mon, Wed, Fri', days: { 1: 0, 3: 1, 5: 2 }, spec: PPL },
  { key: 'ul', name: 'Upper / Lower', desc: '4 days · Mon, Tue, Thu, Fri', days: { 1: 0, 2: 1, 4: 2, 5: 3 }, spec: [
    ['Upper A', 'arm', [['0025', 4, 6], ['0027', 4, 8], ['0426', 3, 10], ['0198', 3, 10], ['0201', 3, 12]]],
    ['Lower A', 'legs', [['0043', 4, 6], ['0085', 3, 8], ['0585', 3, 12], ['0594', 4, 15]]],
    ['Upper B', 'figureStrength', [['0314', 4, 8], ['0861', 4, 10], ['0334', 3, 15], ['0652', 3, 8], ['0031', 3, 12]]],
    ['Lower B', 'legs', [['0032', 3, 5], ['0336', 3, 10], ['0586', 3, 12], ['0594', 4, 15]]]
  ] },
  { key: 'fb', name: 'Full body', desc: '3 days · A / B / A', days: { 1: 0, 3: 1, 5: 0 }, spec: [
    ['Full Body A', 'figureStrength', [['0043', 3, 8], ['0025', 3, 8], ['0027', 3, 10], ['0334', 2, 15]]],
    ['Full Body B', 'dumbbell', [['0032', 3, 5], ['0426', 3, 10], ['0198', 3, 10], ['0336', 2, 10]]]
  ] },
  { key: '5x5', name: 'Strength 5×5', desc: '3 days · A / B / A', days: { 1: 0, 3: 1, 5: 0 }, spec: [
    ['5×5 A', 'barbell', [['0043', 5, 5], ['0025', 5, 5], ['0027', 5, 5]]],
    ['5×5 B', 'barbell', [['0043', 5, 5], ['0091', 5, 5], ['0032', 1, 5]]]
  ] }
]

// Fresh routine objects (new ids) plus the weekday → routine id schedule for one template.
export function templatePlan(key = 'ppl') {
  const tpl = TEMPLATES.find(x => x.key === key) || TEMPLATES[0]
  const routines = tpl.spec.map(([name, emoji, list]) => ({ id: uid(), name, emoji, ex: list.map(([id, sets, reps]) => ({ id, sets, reps, weight: 0 })) }))
  const week = {}
  for (const [d, i] of Object.entries(tpl.days)) week[d] = routines[i].id
  return { routines, week }
}

// Push / Pull / Legs routines — [push, pull, legs].
export const starterRoutines = () => templatePlan('ppl').routines

// A copy of a routine with fresh ids (superset ids too, so the copy's links stay its own).
export function duplicateRoutine(r, name) {
  const sg = {}
  return { ...r, id: uid(), name, ex: r.ex.map(e => ({ ...e, ...(e.sg ? { sg: (sg[e.sg] = sg[e.sg] || uid()) } : {}) })) }
}
