// Food lookup for the log-entry sheet. Local matches (the user's custom foods + the Levantine
// starter list) are instant and work offline; Open Food Facts is queried through the API proxy
// and never throws, so search still shows local results when the network or OFF is down.
import { api } from './api.js'
import { LEVANTINE } from './foods.levantine.js'

export function localSearch(q, customFoods = []) {
  const ql = q.toLowerCase().trim()
  if (!ql) return []
  return [...customFoods, ...LEVANTINE].filter(f => (f.name || '').toLowerCase().includes(ql)).slice(0, 25)
}

export async function offSearch(q) {
  try { const { results } = await api('/api/food/search?q=' + encodeURIComponent(q)); return results || [] }
  catch { return [] }
}

export async function offBarcode(code) {
  const { food } = await api('/api/food/barcode?code=' + encodeURIComponent(code))
  return food
}
