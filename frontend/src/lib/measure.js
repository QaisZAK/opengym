// Body measurements. Stored in cm; shown in inches for lb profiles (same rule as the weight unit).
export const SITES = ['waist', 'chest', 'hips', 'arms', 'thighs', 'neck']
const CM_PER_IN = 2.54
export const lenUnit = S => (S?.unit === 'lb' ? 'in' : 'cm')
export const toLen = (cm, u) => Math.round((u === 'in' ? cm / CM_PER_IN : cm) * 10) / 10
export const fromLen = (v, u) => Math.round((u === 'in' ? v * CM_PER_IN : v) * 10) / 10

// Insert today's (or any day's) entry, replacing that day's values that were given; blank sites
// keep what that day already had. Kept in date order.
export function putMeasure(list, d, values) {
  const out = (list || []).filter(m => m.d !== d)
  const prev = (list || []).find(m => m.d === d) || {}
  const rec = { ...prev, d, t: Date.now() }
  for (const k of SITES) if (values[k] > 0) rec[k] = values[k]
  return [...out, rec].sort((a, b) => (a.d < b.d ? -1 : 1))
}
