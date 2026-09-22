import { describe, it, expect } from 'vitest'
import { computeTargets, entryMacros, dayTotals, remaining, ACTIVITY, GOAL } from './nutrition.js'

describe('computeTargets (Mifflin-St Jeor)', () => {
  it('matches a hand-computed male maintenance target', () => {
    // BMR = 10·80 + 6.25·180 − 5·30 + 5 = 1780 ; TDEE = 1780·1.55 = 2759
    const t = computeTargets({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, activity: 'moderate', goal: 'maintain' })
    expect(t).toEqual({ bmr: 1780, tdee: 2759, kcal: 2759, protein: 144, carbs: 373, fat: 77 })
  })

  it('matches a hand-computed female cut target', () => {
    // BMR = 10·60 + 6.25·165 − 5·25 − 161 = 1345.25 ; TDEE = 1849.7 ; ·0.8 = 1480
    const t = computeTargets({ sex: 'female', age: 25, heightCm: 165, weightKg: 60, activity: 'light', goal: 'lose' })
    expect(t).toEqual({ bmr: 1345, tdee: 1850, kcal: 1480, protein: 120, carbs: 158, fat: 41 })
  })

  it('scales calories by activity multiplier', () => {
    const kcal = a => computeTargets({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, activity: a, goal: 'maintain' }).kcal
    expect(kcal('sedentary')).toBe(2136)
    expect(kcal('light')).toBe(2448)
    expect(kcal('moderate')).toBe(2759)
    expect(kcal('active')).toBe(3071)
    expect(kcal('veryActive')).toBe(3382)
  })

  it('adjusts calories and protein by goal', () => {
    const base = { sex: 'male', age: 30, heightCm: 180, weightKg: 80, activity: 'moderate' }
    expect(computeTargets({ ...base, goal: 'lose' })).toMatchObject({ kcal: 2207, protein: 160 })
    expect(computeTargets({ ...base, goal: 'maintain' })).toMatchObject({ kcal: 2759, protein: 144 })
    expect(computeTargets({ ...base, goal: 'gain' })).toMatchObject({ kcal: 3173, protein: 144 })
  })

  it('applies a calorie floor so a cut never becomes an extreme deficit', () => {
    // small older woman: raw cut = 967 kcal, below the 1200 floor
    const t = computeTargets({ sex: 'female', age: 60, heightCm: 155, weightKg: 50, activity: 'sedentary', goal: 'lose' })
    expect(t.tdee).toBe(1209)
    expect(t.kcal).toBe(1200)
  })

  it('defaults activity and goal when omitted', () => {
    const t = computeTargets({ sex: 'male', age: 30, heightCm: 180, weightKg: 80 })
    expect(t.kcal).toBe(2759) // moderate + maintain
  })

  it('falls back to sane defaults for an unknown activity or goal', () => {
    const t = computeTargets({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, activity: 'nope', goal: 'nope' })
    expect(t.kcal).toBe(2759)
  })

  it('accepts numeric strings, the shape number inputs arrive in', () => {
    const t = computeTargets({ sex: 'male', age: '30', heightCm: '180', weightKg: '80', activity: 'moderate', goal: 'maintain' })
    expect(t.kcal).toBe(2759)
  })

  it('returns null when a required field is missing or invalid', () => {
    expect(computeTargets({ sex: 'male', age: 30, heightCm: 180 })).toBeNull()            // no weight
    expect(computeTargets({ sex: 'male', age: 30, weightKg: 80 })).toBeNull()             // no height
    expect(computeTargets({ sex: 'male', heightCm: 180, weightKg: 80 })).toBeNull()       // no age
    expect(computeTargets({ age: 30, heightCm: 180, weightKg: 80 })).toBeNull()           // no sex
    expect(computeTargets({ sex: 'x', age: 30, heightCm: 180, weightKg: 80 })).toBeNull() // bad sex
    expect(computeTargets({ sex: 'male', age: 0, heightCm: 180, weightKg: 80 })).toBeNull()
    expect(computeTargets({ sex: 'male', age: 30, heightCm: 180, weightKg: -5 })).toBeNull()
  })

  it('exposes the activity and goal option maps', () => {
    expect(Object.keys(ACTIVITY)).toEqual(['sedentary', 'light', 'moderate', 'active', 'veryActive'])
    expect(GOAL.maintain).toBe(1)
  })
})

describe('entryMacros', () => {
  const apple = { per: '100g', kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 }
  const bar = { per: 'serving', kcal: 200, protein: 8, carbs: 30, fat: 5 }
  const cereal = { per: '100g', servingG: 30, kcal: 400, protein: 10, carbs: 60, fat: 12 }

  it('scales a per-100g food by grams', () => {
    expect(entryMacros(apple, 150, 'g')).toEqual({ kcal: 78, protein: 0.5, carbs: 21, fat: 0.3 })
  })

  it('treats ml like grams for a per-100g food', () => {
    expect(entryMacros(apple, 100, 'ml')).toEqual({ kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 })
  })

  it('scales a per-serving food by servings', () => {
    expect(entryMacros(bar, 2, 'serving')).toEqual({ kcal: 400, protein: 16, carbs: 60, fat: 10 })
  })

  it('converts servings to grams for a per-100g food with a serving size', () => {
    expect(entryMacros(cereal, 1, 'serving')).toEqual({ kcal: 120, protein: 3, carbs: 18, fat: 3.6 })
  })

  it('returns zeros for a zero/negative/invalid portion', () => {
    expect(entryMacros(apple, 0, 'g')).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
    expect(entryMacros(apple, -5, 'g')).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
    expect(entryMacros(apple, 'x', 'g')).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  })

  it('returns zeros when grams cannot be converted to a per-serving food', () => {
    expect(entryMacros(bar, 100, 'g')).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  })
})

describe('dayTotals', () => {
  it('sums the stored macros of a list of entries', () => {
    const entries = [
      { kcal: 78, protein: 0.5, carbs: 21, fat: 0.3 },
      { kcal: 400, protein: 16, carbs: 60, fat: 10 }
    ]
    expect(dayTotals(entries)).toEqual({ kcal: 478, protein: 16.5, carbs: 81, fat: 10.3 })
  })

  it('is all zeros for an empty or missing day and tolerates missing fields', () => {
    expect(dayTotals([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
    expect(dayTotals(undefined)).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
    expect(dayTotals([{ kcal: 100 }])).toEqual({ kcal: 100, protein: 0, carbs: 0, fat: 0 })
  })
})

describe('remaining', () => {
  it('subtracts totals from targets and can go negative when over', () => {
    const targets = { kcal: 2000, protein: 150, carbs: 200, fat: 60 }
    expect(remaining(targets, { kcal: 1800, protein: 120, carbs: 210, fat: 40 }))
      .toEqual({ kcal: 200, protein: 30, carbs: -10, fat: 20 })
  })
})
