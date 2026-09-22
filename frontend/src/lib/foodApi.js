// Open Food Facts network layer (branded/packaged products + barcodes), through the API proxy.
// Never throws — returns []/undefined on failure so the offline catalog (foodDB.js) still works.
// Local/offline search lives in foodDB.js (pure, no network) so it can be unit-tested.
import { api } from './api.js'

export async function offSearch(q) {
  try { const { results } = await api('/api/food/search?q=' + encodeURIComponent(q)); return results || [] }
  catch { return [] }
}

export async function offBarcode(code) {
  const { food } = await api('/api/food/barcode?code=' + encodeURIComponent(code))
  return food
}
