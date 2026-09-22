// Plate math for a barbell: which plates go on each side to reach a total. Greedy from the
// heaviest plate — exact for the standard plate sets below.
export const PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] }
export const BAR = { kg: 20, lb: 45 }

export function platesPerSide(total, bar, plates) {
  let side = Math.round(((total - bar) / 2) * 1000) / 1000
  if (!(side > 0)) return { plates: [], rest: 0 }
  const out = []
  for (const p of plates) while (side >= p - 1e-9) { out.push(p); side = Math.round((side - p) * 1000) / 1000 }
  return { plates: out, rest: side } // rest > 0: that much per side can't be made with these plates
}
