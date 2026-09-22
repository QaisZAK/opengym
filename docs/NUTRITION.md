# Nutrition

Calorie and macro tracking inside openGym. Off by default — turn it on per profile in
**Settings → Nutrition**, and a **Food** tab appears.

## Targets

**Food → target icon.** Enter sex, age, height, activity and goal (lose / maintain / gain); with a
logged body weight the app suggests calories (Mifflin-St Jeor × activity, never below your BMR or
1,200 kcal) and macros (protein 1.8 g/kg, 2.0 on a cut; 25 % fat; carbs the rest). Every number is
editable. Sex is shared with the body-diagram figure, so it's set in one place.

## Logging

Each day has Breakfast, Lunch, Dinner and Snacks. **Add food** opens a search over:

- **Favourites & recent** — shown before you type. Star any food from its portion sheet.
- **An offline catalog** of ~200 everyday and Levantine foods — works with no network.
- **Open Food Facts** — branded products, searched through the server (which sets the required
  User-Agent and caches results). Fiber, sugar and sodium come along when OFF has them.
- **Scan** — barcode/QR via the camera (`BarcodeDetector`, with a lazy `zxing-wasm` fallback) or
  typed. Your own barcoded foods match first, offline.
- **Quick add** — just calories (and macros if you know them).
- **New food** — your own, per 100 g/ml or per serving, optional fiber/sugar/sodium, and an optional
  **named serving** ("1 cup = 240 g") that then shows up as a portion unit.

Entries snapshot their macros when logged, so editing or deleting a food later never rewrites your
history. Tap an entry to change its portion or delete it. **Copy {meal} to…** / **Copy this day
to…** duplicate entries onto another date.

## Meals & recipes

**Food → clipboard icon.** A *meal* is a set of foods you log together in one tap; a *recipe* is
ingredients divided into servings and logged per serving. The same sheet lists **My foods** to edit
or delete your custom foods.

## Suggestions and AI meal plans

**Food → lightbulb.** Suggestions rank your saved meals, recipes and foods by how well they fit
the calories and protein you have left, skipping anything in your **food preferences** (avoid
list, halal). This works with no AI at all.

**AI meal plan** (same sheet) uses the instance's [AI Coach](AI_COACH.md) to plan the rest of today
from your targets, what you've eaten, your preferences, your saved foods and whether today is a
training day. Log any planned meal straight into its slot, or save it as a meal. Requirements:

- the instance owner has enabled and connected the Coach (Admin → AI Coach — e.g. a Claude
  setup-token; nothing goes in the repo or `.env`);
- your profile has given the Coach consent **v2**, which adds the *nutrition* data category
  (profiles that consented before are asked again).

What is sent is an allowlist (`buildMeals` in `api/coach/payload.js`): targets, today's totals and
eaten slots, preferences, up to 40 saved foods and 20 saved meals (names + macros), and the name of
today's routine. No training history, no name, no account data. The answer is validated against a
closed schema (`validateMeals`) before the app shows it.

## Data

Everything lives in the profile's synced state under `nutrition`: `on`, `profile`, `targets`,
`log[date][]`, `foods`, `meals`, `recipes`, `prefs`, `favs`, and `water` (see [WATER.md](WATER.md)).
It's included in backups and the Stats CSV export.

Pure logic with tests: `frontend/src/lib/nutrition.js`, `foodDB.js`; the OFF proxy is
`api/food.js` (+ `api/test/food.test.js`).
