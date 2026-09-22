import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData } from './helpers.mjs';

tempData();
const { validateMeals } = await import('../coach/validate.js');
const { buildMeals } = await import('../coach/payload.js');

const ITEM = { name: 'Chicken breast', qty: 150, unit: 'g', kcal: 248, protein: 46, carbs: 0, fat: 5.4 };

test('validateMeals accepts a well-formed plan and rounds numbers', () => {
  const v = validateMeals({ coach_contract: 1, meals: [{ slot: 'lunch', name: 'Chicken & rice', items: [ITEM, { ...ITEM, name: 'Rice', protein: 4.44 }] }], notes: 'fits' });
  assert.equal(v.ok, true);
  assert.equal(v.plan.meals[0].items[1].protein, 4.4);
  assert.equal(v.plan.notes, 'fits');
});

test('validateMeals rejects off-contract slots, units and numbers with repairable errors', () => {
  const v = validateMeals({ meals: [{ slot: 'brunch', name: 'x', items: [{ ...ITEM, unit: 'cup', kcal: -5 }] }] });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => e.includes('slot')));
  assert.ok(v.errors.some(e => e.includes('unit')));
  assert.ok(v.errors.some(e => e.includes('kcal')));
  assert.equal(validateMeals({ meals: [] }).ok, false);
  assert.equal(validateMeals(null).ok, false);
});

test('buildMeals sends only the allowlisted nutrition fields', () => {
  const S = {
    lang: 'en', routines: [], week: {}, dayPlan: {},
    workouts: [{ secret: 'training history must not ride along' }],
    nutrition: {
      targets: { kcal: 2000, protein: 150, carbs: 200, fat: 60 },
      log: { '2026-01-01': [{ meal: 'breakfast', name: 'Oats', kcal: 400, protein: 15, carbs: 60, fat: 8, private: 'x' }] },
      prefs: { avoid: 'shrimp', halal: true, notes: 'likes spicy' },
      foods: [{ id: 'f1', name: 'Shake', per: 'serving', kcal: 200, protein: 30, carbs: 5, fat: 3, barcode: '123' }]
    }
  };
  const p = buildMeals(S, 'u1', { request: 'high protein', today: '2026-01-01' });
  assert.deepEqual(Object.keys(p).sort(), ['coach_contract', 'eaten', 'eatenSlots', 'kind', 'meta', 'prefs', 'profile', 'remaining', 'request', 'savedFoods', 'savedMeals', 'targets', 'training'].sort());
  assert.equal(p.remaining.kcal, 1600);
  assert.deepEqual(p.eatenSlots, ['breakfast']);
  assert.deepEqual(Object.keys(p.savedFoods[0]).sort(), ['carbs', 'fat', 'kcal', 'name', 'per', 'protein']);
  assert.ok(!JSON.stringify(p).includes('training history'));
  assert.ok(!JSON.stringify(p).includes('"u1"'));
});
