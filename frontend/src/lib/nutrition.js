// Pure nutrition helpers: daily target calculation (Mifflin-St Jeor) and macro maths.
// No store or DOM access — every input is passed in. Tested in nutrition.test.js.

export const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryActive: 1.9 }
export const GOAL = { lose: 0.8, maintain: 1, gain: 1.15 }

// Round to one decimal, nudging past IEEE-754 error so a mathematical x.x5 rounds the human way
// (0.3·1.5 = 0.449999… must land on 0.5, not 0.4). Macros are only ever shown to one decimal.
const r1 = n => Math.round(n * 10 + (n < 0 ? -1e-9 : 1e-9)) / 10

// Daily calorie + macro targets from a profile, or null when the body inputs aren't usable.
// Editable afterwards; a calorie floor keeps a cut from turning into an extreme deficit.
export function computeTargets({ sex, age, heightCm, weightKg, activity = 'moderate', goal = 'maintain' } = {}) {
  const kg = Number(weightKg), cm = Number(heightCm), yr = Number(age)
  const s = sex === 'male' || sex === 'female' ? sex : null
  if (!s || !(kg > 0) || !(cm > 0) || !(yr > 0)) return null
  const mult = ACTIVITY[activity] ?? ACTIVITY.moderate
  const factor = GOAL[goal] ?? GOAL.maintain
  const bmr = 10 * kg + 6.25 * cm - 5 * yr + (s === 'male' ? 5 : -161)
  const tdee = bmr * mult
  const floor = Math.max(Math.round(bmr), 1200)                 // never prescribe below BMR, hard-floored at 1200
  const kcal = Math.max(Math.round(tdee * factor), floor)
  const protein = Math.round((goal === 'lose' ? 2.0 : 1.8) * kg) // more protein on a cut to spare muscle
  const fat = Math.round(kcal * 0.25 / 9)                        // 25% of calories from fat
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)) // the remainder
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, carbs, fat }
}

// Grams / ml / servings → macros for one logged entry. Foods carry macros per 100 g|ml
// (per:'100g') or per serving (per:'serving'); servingG bridges the two when it's known.
export function entryMacros(food, qty, unit) {
  const q = Number(qty)
  if (!food || !(q > 0)) return { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  let factor = 0
  if (unit === 'serving') {
    factor = food.per === 'serving' ? q : food.servingG > 0 ? q * food.servingG / 100 : 0
  } else { // 'g' or 'ml'
    factor = food.per === '100g' ? q / 100 : food.servingG > 0 ? q / food.servingG : 0
  }
  return {
    kcal: Math.round((food.kcal || 0) * factor),
    protein: r1((food.protein || 0) * factor),
    carbs: r1((food.carbs || 0) * factor),
    fat: r1((food.fat || 0) * factor)
  }
}

// Sum the macros already stored on each entry (entries snapshot their macros at log time, so
// editing or deleting a food later never rewrites history).
export function dayTotals(entries) {
  const sum = (entries || []).reduce((a, e) => ({
    kcal: a.kcal + (e.kcal || 0), protein: a.protein + (e.protein || 0),
    carbs: a.carbs + (e.carbs || 0), fat: a.fat + (e.fat || 0)
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })
  return { kcal: Math.round(sum.kcal), protein: r1(sum.protein), carbs: r1(sum.carbs), fat: r1(sum.fat) }
}

// What's left against target (negative = over).
export function remaining(targets, totals) {
  return {
    kcal: Math.round((targets.kcal || 0) - (totals.kcal || 0)),
    protein: r1((targets.protein || 0) - (totals.protein || 0)),
    carbs: r1((targets.carbs || 0) - (totals.carbs || 0)),
    fat: r1((targets.fat || 0) - (totals.fat || 0))
  }
}
