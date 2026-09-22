# Contributing to openGym

Thanks for taking a look! openGym is intentionally small and dependency-light, and the goal is
to keep it that way — easy to read, easy to self-host.

## Project layout

```
frontend/  React + Vite app (src/views, src/components, src/store, src/lib). Builds to static files.
           android/ + ios/ are the Capacitor shells for the standalone mobile app (docs/MOBILE.md).
api/       backend — server.js (Node, no framework) plus small modules: food.js (Open Food Facts
           proxy), notify.js (reminder rules), coach/ (AI Coach jobs, payload allowlist, validators).
           Any new top-level api module must also be COPY'd in api/Dockerfile.
web/       multi-stage Dockerfile (builds frontend → nginx) + nginx.conf (serves app, proxies /api).
media/     exercise img/gif (gitignored, fetched at runtime).
docs/      self-hosting, AI Coach, NUTRITION, WATER and PHOTOS guides.
```

Pure logic in `frontend/src/lib/`, each with a `*.test.js` beside it:

| Module | What it decides |
| --- | --- |
| `progression.js`, `onerm.js`, `history.js` | next session's load, 1RM, set types / warm-ups, reading a session back, editing history |
| `records.js` | all-time records and rep / volume / hold PRs |
| `plates.js` | plates per side for a barbell total |
| `starter.js` | starter plan templates, duplicating a routine |
| `nutrition.js`, `foodDB.js` | calorie & macro targets and maths, fiber/sugar/sodium, food search, favourites/recents |
| `water.js` | drinks, hydration & caffeine totals, ml/oz, goal suggestion |
| `measure.js` | body measurements (cm/in, per-day merge) |
| `export.js` | CSV exports |

## Running for development

```bash
cp .env.example .env
docker compose up -d --build      # api + web + media on :8080
# frontend hot reload:
cd frontend && npm install && npm run dev
# frontend logic (training, nutrition, water, records…):
cd frontend && npm test
# api logic (food proxy, reminders, Coach payload/validation/jobs via the fixture provider):
cd api && npm install && node --test test/*.test.js
```

The AI Coach can be exercised end to end without an AI account: pick the **fixture** provider in
Admin → AI Coach. It answers training reviews, plan creation and meal plans with canned, valid
output. Never commit a real provider credential — the Claude setup-token and Codex login are
entered in the admin dashboard at runtime and stored encrypted under `data/`.

## Guidelines

- **Keep it dependency-light.** The frontend uses React + Router + Zustand, plus `zxing-wasm` —
  lazy-loaded only when a browser lacks `BarcodeDetector`; new deps (front or back) are a hard sell.
  `api/` has `@simplewebauthn/server` (passkeys), `web-push` (notifications) and the Coach's
  provider runtimes — keep it near that.
- **Nutrition logic gets a unit test too.** Macro scaling, totals and targets are the numbers
  people make decisions from; they go in `src/lib` with tests, like training logic.
- **Additions stay opt-in.** A profile that never turns Nutrition on, or an instance without a
  `GOOGLE_CLIENT_ID`, must behave like upstream. New state keys go in `DEF` (store) and are read
  defensively, because saved states are overlaid on `DEF` only one level deep.
- **Match the style.** Small components, clear names, comments only where the "why" isn't obvious.
  State lives in the Zustand store (`src/store`); pure helpers in `src/lib`.
- **Don't commit** the exercise media (`media/`) or `data/` — they're gitignored.
- **Test the flow** you touched — click through the affected screens (and the workout flow) in a
  browser before opening a PR.
- **Training logic gets a unit test.** Anything deciding what you lift next, or reading a logged
  session back, belongs in a pure helper in `src/lib` with tests beside it (`npm test`). These
  rules are easy to get subtly wrong and nearly impossible to verify by clicking — the
  progression engine grew two real bugs that only a test pinned down.

## Good first issues

- More starter plans in `src/lib/starter.js` (PPL, upper/lower, full body and 5×5 exist)
- More foods in the offline catalog (`src/lib/foods.common.js`, `foods.levantine.js`)
- More languages for the exercise instructions (the dataset ships several)
- Percentage / training-max programming (5/3/1-style) on top of the progression engine in
  `src/lib/progression.js` — the policy interface is already there
- Screen-reader labels for the charts (keyboard and dialog basics are in place)

## Where to ask what

| You have | Goes to |
| --- | --- |
| A question, or self-hosting that won't behave | [Discussions → Q&A](https://github.com/DuarteSantos8/openGym/discussions/categories/q-a) |
| An idea you're not sure about yet | [Discussions → Ideas](https://github.com/DuarteSantos8/openGym/discussions/categories/ideas) |
| A reproducible bug | [Issues](https://github.com/DuarteSantos8/openGym/issues) |
| A change you've already built | A pull request |

An answered question in Q&A is worth more than the same answer buried in a closed issue — the
next person searching "passkey login fails behind my reverse proxy" actually finds it.

## Reporting bugs

Open an issue with: what you did, what you expected, what happened, and your browser/OS. If it's
about login/passkeys, include your `RP_ID`/`ORIGIN` (not the `data/` contents) — most login
issues are an origin mismatch.

By contributing you agree your work is licensed under the project's [GNU AGPL v3.0](LICENSE).
