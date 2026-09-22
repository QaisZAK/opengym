// All-time records per exercise (the Records wall) and the extra PR kinds a finished session can
// set. Warm-ups never count (isWork). Weight and est-1RM PRs keep their own long-standing logic
// in sheets.jsx; this adds reps (most in one set), session volume and longest hold.
import { isWork } from './history.js'
import { estimate1RM } from './onerm.js'

export function recordsOf(workouts) {
  const out = {}
  for (const w of workouts || []) for (const e of w.entries || []) {
    const sets = (e.sets || []).filter(isWork)
    if (!sets.length) continue
    const r = (out[e.id] = out[e.id] || {})
    const beat = (k, v, extra) => { if (v > 0 && (!r[k] || v > r[k].v)) r[k] = { v, d: w.d, ...extra } }
    beat('volume', sets.reduce((a, s) => a + (s.w || 0) * (s.r || 0), 0))
    for (const s of sets) {
      beat('weight', s.w || 0, { r: s.r })
      beat('reps', s.r || 0, { w: s.w })
      beat('hold', s.sec || 0)
      beat('e1rm', estimate1RM(s.w, s.r) || 0, { w: s.w, r: s.r })
    }
  }
  return out
}

// Every PR a finished workout recorded: weight (prs), est-1RM (prs1rm) and the extras (prsMore).
export const prCount = w => (w.prs?.length || 0) + (w.prs1rm?.length || 0) + (w.prsMore?.length || 0)

// Extra PR kinds this entry beats against prior history. A first-ever session sets no extra
// PRs (nothing to beat), so a new exercise doesn't light up with three badges at once.
export const EXTRA_PRS = ['reps', 'volume', 'hold']
export function newRecords(workouts, entry) {
  const prev = recordsOf(workouts)[entry.id]
  const now = recordsOf([{ entries: [entry] }])[entry.id]
  if (!prev || !now) return []
  return EXTRA_PRS.filter(k => prev[k] && now[k] && now[k].v > prev[k].v)
}
