# Water & caffeine

The **Water** tab tracks what you drink. It's always available (no toggle).

## Logging

Tap a tile to log a preset: glass, baby / small / large bottle, coffee, tea, soda, energy drink —
or **More** for espresso, juice, milk and a custom amount. Each drink counts toward your goal by its
**hydration factor** (water 1.0, coffee 0.95, soda 0.9, energy drink 0.85…) and adds its
**caffeine** (mg per 100 ml). Entries snapshot those values, so today's totals never change if the
table is tuned later. The Home widget has two one-tap quick adds.

## Settings (gear icon)

- **Unit** — ml or fl oz (defaults to oz for lb profiles). Stored as ml either way.
- **Daily goal** — with a logged body weight, a suggestion of ~35 ml/kg (1.5–5 L) is one tap away.
- **Caffeine limit** — default 400 mg/day (0 turns it off); the day turns red once you're over.
- **Reminders** — every N minutes inside your own from/to hours, until the goal is reached. They
  need push notifications on (Settings → Notifications) and respect quiet hours and snooze.

## Data

`nutrition.water = { goalMl, unit, cafMax, reminder, log[date][] }`. Older days stored as a plain
ml number are migrated on read. Pure logic with tests: `frontend/src/lib/water.js`.
