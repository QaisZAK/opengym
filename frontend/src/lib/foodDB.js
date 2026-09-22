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

// Quick-pick list for an empty search: favourites first (in starred order), then foods from the
// log, most recently logged first, deduped by name. Recents are derived from the log itself (each
// entry keeps its per-unit `base`), so there's no separate history to keep in sync.
export function quickFoods(log = {}, favs = [], limit = 12) {
  const seen = new Set(favs.map(f => f.name.toLowerCase()))
  const out = favs.map(f => ({ ...f, fav: true }))
  for (const iso of Object.keys(log).sort().reverse()) {
    for (const e of [...(log[iso] || [])].reverse()) {
      const k = (e.name || '').toLowerCase()
      if (!e.base || !k || seen.has(k)) continue
      seen.add(k)
      out.push({ ...e.base, name: e.name, source: e.source })
    }
    if (out.length >= limit) break
  }
  return out.slice(0, Math.max(limit, favs.length))
}
