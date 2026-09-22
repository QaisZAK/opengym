// Offline food catalog + ranked local search. Pure (no network, no api.js), so it's unit-tested
// in foodDB.test.js and safe to import anywhere. The network layer (Open Food Facts) lives in
// foodApi.js and layers branded/packaged products on top of these results.
import { COMMON } from './foods.common.js'
import { LEVANTINE } from './foods.levantine.js'

// Stable ids for the catalog so React keys and log references are consistent.
export const FOODS = [...COMMON.map((f, i) => ({ id: 'c' + i, ...f })), ...LEVANTINE]

// Substring match ranked so the most useful hit is first: exact name, then starts-with, then a
// word that starts with the query, then anywhere. The user's own foods win ties. Capped at 30.
export function localSearch(q, customFoods = []) {
  const ql = q.toLowerCase().trim()
  if (!ql) return []
  const scored = []
  for (const f of [...customFoods, ...FOODS]) {
    const nm = (f.name || '').toLowerCase()
    const at = nm.indexOf(ql)
    if (at < 0) continue
    let rank = nm === ql ? 0 : at === 0 ? 1 : (' ' + nm).includes(' ' + ql) ? 2 : 3
    if (f.source === 'custom') rank -= 0.5 // the user's own foods edge out catalog ties
    scored.push({ f, rank, at })
  }
  scored.sort((a, b) => a.rank - b.rank || a.at - b.at || a.f.name.length - b.f.name.length)
  return scored.slice(0, 30).map(s => s.f)
}
