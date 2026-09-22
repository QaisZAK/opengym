// Open Food Facts proxy. The server makes the outbound call so it can set the User-Agent OFF
// requires and cache results; the client only ever talks to /api/food/*. Pure normalizers
// (tested in test/food.test.js) turn an OFF product into the app's food shape; the fetch
// wrappers below are thin and dependency-free (Node global fetch).

export const OFF_ATTR = 'Open Food Facts (ODbL)'
const UA = 'openGym/1.2.3 (+https://dalleh.store)'
const FIELDS = 'code,product_name,generic_name,brands,nutriments,serving_quantity'

const num = x => { const n = Number(x); return Number.isFinite(n) ? n : null }
const round1 = n => (n == null ? null : Math.round(n * 10 + 1e-9) / 10)
const kcalFromKj = kj => { const n = num(kj); return n == null ? null : n / 4.184 }

// OFF nutriments are per 100 g/ml. energy-kcal_100g is kcal; energy_100g is kJ (the fallback).
export function normalizeProduct(p) {
  if (!p) return null
  const n = p.nutriments || {}
  const kcal = round1(num(n['energy-kcal_100g']) ?? kcalFromKj(n.energy_100g))
  const name = String(p.product_name || p.generic_name || '').trim()
  if (!name || kcal == null) return null // unusable without a name and an energy value
  const food = {
    code: p.code || p._id || null,
    name,
    brand: String(p.brands || '').split(',')[0].trim() || null,
    per: '100g',
    kcal,
    protein: round1(num(n.proteins_100g)) ?? 0,
    carbs: round1(num(n.carbohydrates_100g)) ?? 0,
    fat: round1(num(n.fat_100g)) ?? 0,
    source: 'off'
  }
  const sg = num(p.serving_quantity)
  if (sg && sg > 0) food.servingG = round1(sg)
  // Optional extras — only carried when OFF has them. Sodium comes in g/100g; the app uses mg.
  const fiber = round1(num(n.fiber_100g)), sugar = round1(num(n.sugars_100g)), sodium = num(n.sodium_100g)
  if (fiber != null) food.fiber = fiber
  if (sugar != null) food.sugar = sugar
  if (sodium != null) food.sodium = Math.round(sodium * 1000)
  return food
}

export function normalizeSearch(json, limit = 20) {
  const out = [], seen = new Set()
  for (const p of json?.products || []) {
    const f = normalizeProduct(p)
    if (!f) continue
    if (f.code && seen.has(f.code)) continue
    if (f.code) seen.add(f.code)
    out.push(f)
    if (out.length >= limit) break
  }
  return out
}

/* ---------- fetch + in-memory TTL cache (mirrors server.js challenge/presence maps) ---------- */
const cache = new Map() // url -> { exp, data }
async function offJson(url, ttlMs) {
  const hit = cache.get(url)
  if (hit && hit.exp > Date.now()) return hit.data
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error('off ' + r.status)
  const data = await r.json()
  cache.set(url, { exp: Date.now() + ttlMs, data })
  return data
}
setInterval(() => { const now = Date.now(); for (const [k, v] of cache) if (v.exp < now) cache.delete(k) }, 10 * 60000).unref?.()

export async function foodSearch(q, limit = 20) {
  const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=' + encodeURIComponent(q) +
    '&search_simple=1&action=process&json=1&page_size=' + limit + '&fields=' + FIELDS
  try { return normalizeSearch(await offJson(url, 60 * 60000), limit) } // 1h
  catch { return [] }
}

export async function foodBarcode(code) {
  const url = 'https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(code) + '.json?fields=' + FIELDS
  try {
    const data = await offJson(url, 24 * 60 * 60000) // 24h — packaged products are stable
    return data && data.status === 1 ? normalizeProduct(data.product) : null
  } catch { return null }
}
