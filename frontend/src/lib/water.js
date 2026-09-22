// Drink catalog for the water tracker. Each preset carries a default volume, a hydration factor
// (how much of the volume counts toward the hydration goal — plain water is 1.0, caffeinated and
// sugary drinks a little less) and caffeine in mg per 100 ml. Logged entries snapshot these values
// (like food entries snapshot macros), so dayWater is a pure sum and never depends on this table.
export const DRINKS = [
  { key: 'glass',       name: 'Glass of water', icon: 'glass',       ml: 250,  hydration: 1,    caf: 0 },
  { key: 'bottle_baby', name: 'Baby bottle',    icon: 'bottleBaby',  ml: 150,  hydration: 1,    caf: 0 },
  { key: 'bottle_s',    name: 'Small bottle',   icon: 'bottle',      ml: 500,  hydration: 1,    caf: 0 },
  { key: 'bottle_l',    name: 'Large bottle',   icon: 'bottleLarge', ml: 1500, hydration: 1,    caf: 0 },
  { key: 'coffee',      name: 'Coffee',         icon: 'coffee',      ml: 240,  hydration: 0.95, caf: 40 },
  { key: 'espresso',    name: 'Espresso',       icon: 'coffee',      ml: 30,   hydration: 0.95, caf: 212 },
  { key: 'tea',         name: 'Tea',            icon: 'tea',         ml: 240,  hydration: 0.98, caf: 20 },
  { key: 'soda',        name: 'Soda',           icon: 'soda',        ml: 330,  hydration: 0.9,  caf: 10 },
  { key: 'energy',      name: 'Energy drink',   icon: 'energy',      ml: 250,  hydration: 0.85, caf: 32 },
  { key: 'juice',       name: 'Juice',          icon: 'glass',       ml: 250,  hydration: 0.85, caf: 0 },
  { key: 'milk',        name: 'Milk',           icon: 'glass',       ml: 250,  hydration: 0.9,  caf: 0 }
]
export const drinkByKey = k => DRINKS.find(d => d.key === k)

// A log entry snapshot for a drink at a chosen volume (id + timestamp added by the caller).
export const mkEntry = (drink, ml) => ({ key: drink.key, name: drink.name, icon: drink.icon, ml: Math.round(ml), hydration: drink.hydration, caf: drink.caf })

// A day's log is an array of entries. Older days were a plain ml number (water only) — migrate.
export function normalizeDay(day) {
  if (Array.isArray(day)) return day
  if (typeof day === 'number' && day > 0) return [{ key: 'glass', name: 'Water', icon: 'glass', ml: day, hydration: 1, caf: 0 }]
  return []
}

// Totals for a day: raw volume, hydration-adjusted ml (counts toward the goal) and caffeine (mg).
export function dayWater(day) {
  const list = normalizeDay(day)
  let ml = 0, hydration = 0, caffeine = 0
  for (const e of list) {
    const v = +e.ml || 0
    ml += v
    hydration += v * (e.hydration ?? 1)
    caffeine += (v / 100) * (e.caf || 0)
  }
  return { ml: Math.round(ml), hydration: Math.round(hydration), caffeine: Math.round(caffeine), count: list.length }
}
