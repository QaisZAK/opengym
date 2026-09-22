# Nutrition & Water — Design

Design reference for the nutrition features added to this fork (`QaisZAK/opengym`).
Read this before touching nutrition code. It records the decisions and the shape everything hangs off.

## Principles (inherited from upstream)

- **Dependency-light.** New deps are a hard sell. Exactly one new runtime dep is planned: `zxing-wasm`
  (barcode fallback), lazy-loaded only on the scan screen.
- **Reuse what's here.** `LineChart`, `ui.jsx` controls, the sheet system, Web Push, the Coach
  pipeline. No new patterns where an existing one fits.
- **Opt-in namespace.** Nutrition is off by default per profile, exactly like the Coach. A profile
  that never turns it on gets the same app it had before.
- **Upstream-merge-friendly.** New code lives in its own files/modules where possible, so merges from
  `upstream` (alexpcosta) stay easy.
- **Mobile-first**, English-only for now (all new strings still go through `t()` so a locale can be
  dropped in later). No RTL.

## Decisions

| # | Decision |
|---|----------|
| D1 | **No AI photo/label scan.** Dropped as not worth the hassle. Removes the Messages-API/vision work, the credential re-enablement, and the nginx body-size bump. |
| D2 | **AI meal suggestions reuse the Coach pipeline** (consent + daily caps + closed-list JSON validation) and whatever credential the Coach is connected with. No separate AI credential path. |
| D3 | Barcode/QR scan stays — it's a camera + decoder, not AI. |
| D4 | Test **local-first**, then a **staging** pass on a real phone before each live deploy. |
| D5 | Food data: **Open Food Facts** (proxied through the API for User-Agent + caching) plus a bundled **Levantine/Jordanian starter list** and user **custom foods**. |
| D6 | English only; no Arabic/RTL. |

## State shape

One namespace added to `DEF` in `frontend/src/store/useStore.js`. Adding it there means every load path
(`Object.assign(clone(DEF), state)`) backfills it for existing profiles automatically, and it syncs +
backs up for free via `/api/data`.

```js
nutrition: {
  on: false,                                  // per-profile toggle (Settings). Off by default.
  profile: {                                  // for target computation
    sex: null,                                // falls back to S.body ('male'/'female')
    age: null, heightCm: null,
    activity: 'moderate',                     // sedentary|light|moderate|active|veryActive
    goal: 'maintain'                          // lose|maintain|gain
  },
  targets: { kcal: null, protein: null, carbs: null, fat: null, manual: false },
  // null target = "use the computed value". manual:true = user overrode; stop recomputing.
  log: {                                      // keyed by ISO date (local)
    // "2026-09-22": [ { id, meal, name, qty, unit, kcal, protein, carbs, fat, source, ref? } ]
    // meal: breakfast|lunch|dinner|snack ; unit: g|ml|serving
    // source: search|barcode|meal|quick|custom  (ref = food/meal id when applicable)
  },
  foods:   [],  // custom foods: { id, name, per: '100g'|'serving', kcal, protein, carbs, fat, barcode?, brand?, estimate? }
  meals:   [],  // saved meals:  { id, name, items: [{ food, qty, unit }] }
  recipes: [],  // recipes:      { id, name, servings, items: [...] }  -> per-serving macros
  water: {      // shape reserved now; built in the water phase
    goalMl: 2000,
    log: {},                                  // { "iso": totalMl }
    reminder: { on: false, everyMin: 120, from: '09:00', to: '22:00', tz: null }
  }
}
```

**Shallow-overlay caveat:** the store overlay is shallow (top-level only). If a profile already has a
saved `nutrition` object and we later add a new sub-field to `DEF.nutrition`, that sub-field is **not**
backfilled. So nutrition helpers must default missing sub-fields defensively rather than assume they
exist. Keep reads tolerant (`n.foods || []`, `n.water?.goalMl ?? 2000`).

## API routes (new)

The API is raw `node:http` with exact-string routing and **no path params**, so new endpoints use query
strings (matching the existing `/api/admin/user?id=`). Each starts with the standard auth guard
(`const user = readSession(req); if (!user) return json(res, 401, ...)`).

- `GET /api/food/search?q=…` — proxy Open Food Facts search. Server sets the required `User-Agent`
  header and caches responses in a module-level `Map` + TTL (same idiom as the existing
  `challenges`/`presence` maps). Uses Node global `fetch` — no backend dependency.
- `GET /api/food/barcode?code=…` — OFF product lookup by barcode.

Response normalized to `{ code, name, brand, per100g: { kcal, protein, carbs, fat }, serving? }`.
Attribution (ODbL) shown on OFF-sourced results.

All user nutrition state uses the existing `/api/data` GET/PUT — no new persistence routes.

AI meal suggestions (later phase) go through the existing Coach job/route infrastructure, not a new
route pattern.

## Screens

All built from existing components (`ui.jsx`, `sheets.jsx`, `LineChart`, `Modals`).

- **Nutrition tab** — 6th tab in `TabBar`, rendered only when `nutrition.on`. Daily view: kcal + P/C/F
  vs targets, grouped Breakfast/Lunch/Dinner/Snacks, day navigator, editable past days.
- **Log-entry sheet** (copy the `BwSheet` template) with sources: Search / Barcode / Saved meal /
  Recent / Quick-add. Portions in g/ml/servings.
- **Targets** — Mifflin-St Jeor BMR + activity multiplier, editable, sane floors (no extreme deficits).
  Pure helper `frontend/src/lib/nutrition.js` with vitest tests.
- **Stats** — calorie + protein trend cards reusing `LineChart` like the bodyweight-vs-goal chart.
- **Settings** — Nutrition section: on/off `Switch`, profile inputs, target editing.

## Phase plan

Each phase is a branch → PR on the fork, with vitest tests for pure logic
(`cd frontend && npm test`, `cd api && npm test`). Local test → staging on-device check → deploy with a
`data/` backup taken first.

| Phase | Brief | Scope |
|-------|-------|-------|
| 0 | 5.0 | Fork + remotes + local dev running + this design doc. |
| 1 | 5.1 | Calorie & macro tracking: tab, toggle, daily log, targets (+tests), OFF proxy, Levantine list, trends. |
| 2 | 5.2 | Saved meals + recipes. |
| 3 | 5.3 | Barcode/QR scan (`BarcodeDetector` + lazy `zxing-wasm` fallback + manual entry). |
| 4 | 5.5 | AI meal suggestions (reuse Coach pipeline) + a non-AI fallback that always works. |
| 5 | 5.6 | Water tracker + reminders (shape reserved in Phase 1). |

## Deploy / ops notes

- **Don't touch** `RP_ID` / `ORIGIN` (invalidates passkeys) or `data/`.
- Back up `data/` before every deploy:
  `tar czf /root/backups/pre-deploy-$(date +%F-%H%M).tar.gz -C /opt/opengym data`
- No nginx `client_max_body_size` change needed (D1 removed image upload; barcode sends only a code).
- Water reminders reuse Web Push (`src/lib/push.js` + `public/sw.js`) with a distinct `water` tag, and
  the mobile local-notification path (`syncReminder`) with a fresh notification-id range.
