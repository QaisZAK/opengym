// Nutrition tab — daily calorie & macro log. Gated on S.nutrition.on (Settings); the route and
// this view render nothing meaningful until it's turned on. All persistence rides the normal
// store: mutations go through update(), so entries sync and back up like everything else.
import { useEffect, useState, useRef } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { fmtNum, fmtDate, todayISO, isoOf, uid } from '../lib/format.js'
import { lastBW } from '../lib/history.js'
import { t } from '../lib/i18n.js'
import { computeTargets, entryMacros, dayTotals, remaining, mealMacros, recipePerServing, suggestFor, ACTIVITY, EXTRAS } from '../lib/nutrition.js'
import { localSearch, quickFoods, FOODS } from '../lib/foodDB.js'
import { offSearch, offBarcode } from '../lib/foodApi.js'
import Icon from '../components/Icon.jsx'
import { Section, Row, Button, Segmented, NumberField, Stepper, SelectRow, SearchField, Switch } from '../components/ui.jsx'

/* ---------- module-scope store access (same pattern as sheets.jsx) ---------- */
const getS = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)
const numN = v => { const x = Number(v); return Number.isFinite(x) ? x : null }

// Fill any nutrition sub-field an older saved state is missing (the store overlay is shallow).
function nz(s) {
  const n = s.nutrition || (s.nutrition = {})
  if (n.on == null) n.on = false
  n.profile = n.profile || { sex: null, age: null, heightCm: null, activity: 'moderate', goal: 'maintain' }
  n.targets = n.targets || { kcal: null, protein: null, carbs: null, fat: null, manual: false }
  n.log = n.log || {}; n.foods = n.foods || []; n.meals = n.meals || []; n.recipes = n.recipes || []
  n.prefs = n.prefs || { avoid: '', halal: false, notes: '' }
  n.favs = n.favs || []
  return n
}
const sameFood = (a, b) => a.name.toLowerCase() === b.name.toLowerCase()
const isFav = food => (getS().nutrition?.favs || []).some(f => sameFood(f, food))
const toggleFav = food => update(s => {
  const n = nz(s); const i = n.favs.findIndex(f => sameFood(f, food))
  if (i >= 0) n.favs.splice(i, 1); else n.favs.push({ ...baseOf(food), name: food.name, source: food.source })
})

const addEntry = (iso, entry) => update(s => { const n = nz(s); (n.log[iso] = n.log[iso] || []).push({ id: uid(), ...entry }) })
const updateEntry = (iso, id, entry) => update(s => { const n = nz(s); const d = n.log[iso] || []; const i = d.findIndex(e => e.id === id); if (i >= 0) d[i] = { ...d[i], ...entry, id } })
const delEntry = (iso, id) => update(s => { const n = nz(s); n.log[iso] = (n.log[iso] || []).filter(e => e.id !== id) })
const upsertFood = food => update(s => { const n = nz(s); const i = n.foods.findIndex(f => f.id === food.id); if (i >= 0) n.foods[i] = food; else n.foods.push(food) })
const delFood = id => update(s => { const n = nz(s); n.foods = n.foods.filter(f => f.id !== id) })
// Sex is one source of truth on s.body (which also drives the body-diagram figure); nutrition.profile
// keeps only the nutrition-specific bits (age, height, activity, goal).
const saveTargets = (profile, targets) => update(s => {
  const n = nz(s)
  s.body = profile.sex === 'female' ? 'female' : 'male'
  n.profile = { age: profile.age, heightCm: profile.heightCm, activity: profile.activity, goal: profile.goal }
  n.targets = targets
})
const upsertMeal = m => update(s => { const n = nz(s); const i = n.meals.findIndex(x => x.id === m.id); if (i >= 0) n.meals[i] = m; else n.meals.push(m) })
const delMeal = id => update(s => { const n = nz(s); n.meals = n.meals.filter(m => m.id !== id) })
const upsertRecipe = r => update(s => { const n = nz(s); const i = n.recipes.findIndex(x => x.id === r.id); if (i >= 0) n.recipes[i] = r; else n.recipes.push(r) })
const delRecipe = id => update(s => { const n = nz(s); n.recipes = n.recipes.filter(r => r.id !== id) })
// Log every item of a saved meal into a day slot as individual entries (so each stays editable).
const logMeal = (m, iso, slot) => update(s => {
  const n = nz(s); const day = (n.log[iso] = n.log[iso] || [])
  ;(m.items || []).forEach(it => day.push({ id: uid(), meal: slot, name: it.food.name, qty: it.qty, unit: it.unit, ...entryMacros(it.food, it.qty, it.unit), source: 'meal', base: it.food }))
})
// A recipe behaves like a per-serving food when logging (qty = servings), so it reuses Portion.
const recFood = r => ({ name: r.name, per: 'serving', ...recipePerServing(r), source: 'recipe' })
const savePrefs = p => update(s => { const n = nz(s); n.prefs = p })

// Suggestion candidates: the user's saved meals, recipes and custom foods (a default portion of
// each), padded with high-protein catalog staples when they've saved little.
function candidateList(n) {
  const out = []
  ;(n.meals || []).forEach(m => { const mm = mealMacros(m.items); out.push({ name: m.name, kind: 'meal', ref: m, kcal: mm.kcal, protein: mm.protein }) })
  ;(n.recipes || []).forEach(r => { const ps = recipePerServing(r); out.push({ name: r.name, kind: 'recipe', ref: r, kcal: ps.kcal, protein: ps.protein }) })
  const foodCand = f => { const unit = f.per === 'serving' ? 'serving' : 'g'; const qty = f.per === 'serving' ? 1 : (f.servingG || 100); const mm = entryMacros(f, qty, unit); return { name: f.name, kind: 'food', ref: f, qty, unit, kcal: mm.kcal, protein: mm.protein } }
  ;(n.foods || []).forEach(f => out.push(foodCand(f)))
  if (out.length < 4) for (const f of FOODS) { const c = foodCand(f); if (c.protein >= 15) out.push(c); if (out.length >= 12) break }
  return out
}
export const slotForNow = () => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack' }
function logCandidate(c, iso, slot) {
  if (c.kind === 'meal') return logMeal(c.ref, iso, slot)
  if (c.kind === 'recipe') { const rf = recFood(c.ref); return addEntry(iso, { meal: slot, name: rf.name, qty: 1, unit: 'serving', ...recipePerServing(c.ref), source: 'recipe', base: rf }) }
  const f = c.ref, mm = entryMacros(f, c.qty, c.unit)
  addEntry(iso, { meal: slot, name: f.name, qty: c.qty, unit: c.unit, ...mm, source: f.source || 'custom', base: { ...baseOf(f), name: f.name } })
}

/* ---------- labels & portion helpers ---------- */
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']
const mealLabel = m => t({ breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' }[m] || m)
const unitLabel = (u, q) => (u === 'serving' ? t(q === 1 ? 'serving' : 'servings') : u)
const portionLabel = e => fmtNum(e.qty) + ' ' + unitLabel(e.unit, e.qty)
const baseOf = f => ({ per: f.per, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, ...(f.servingG > 0 ? { servingG: f.servingG } : {}),
  ...Object.fromEntries(EXTRAS.filter(k => f[k] != null).map(k => [k, f[k]])) })
// "Fiber 5 g · Sugar 2 g · Sodium 300 mg" — only the ones present; empty when none.
const extrasLine = m => EXTRAS.filter(k => m[k] != null).map(k => `${t(EXTRA_LABEL[k])} ${fmtNum(m[k])} ${k === 'sodium' ? 'mg' : 'g'}`).join(' · ')
const EXTRA_LABEL = { fiber: 'Fiber', sugar: 'Sugar', sodium: 'Sodium' }
const shift = (iso, d) => { const dt = new Date(iso + 'T12:00:00'); dt.setDate(dt.getDate() + d); return isoOf(dt) }

function unitOptions(food) {
  const g = { value: 'g', label: 'g' }, ml = { value: 'ml', label: 'ml' }, sv = { value: 'serving', label: t('serving') }
  if (food.per === 'serving') return food.servingG > 0 ? [sv, g] : [sv]
  return food.servingG > 0 ? [g, ml, sv] : [g, ml]
}
const defaultQty = (food, unit) => (unit === 'serving' ? 1 : (food.servingG > 0 ? food.servingG : 100))

/* ============================ summary widgets ============================ */
function KcalRing({ consumed, target }) {
  const R = 54, C = 2 * Math.PI * R
  const pct = target > 0 ? consumed / target : 0
  const over = target > 0 && consumed > target
  const off = C * (1 - Math.min(1, Math.max(0, pct)))
  return (
    <div style={{ position: 'relative', width: 148, height: 148, margin: '4px auto 0' }}>
      <svg viewBox="0 0 128 128" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
        <circle cx="64" cy="64" r={R} fill="none" stroke="var(--sep)" strokeWidth="11" />
        <circle cx="64" cy="64" r={R} fill="none" stroke={over ? 'var(--red)' : 'var(--acc)'} strokeWidth="11"
          strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{fmtNum(consumed)}</div>
        <div className="small dim" style={{ marginTop: 3 }}>/ {fmtNum(target)}</div>
      </div>
    </div>
  )
}

function MacroBar({ label, val, target, color }) {
  const pct = target > 0 ? Math.min(100, Math.round((val / target) * 100)) : 0
  return (
    <div className="mrow">
      <span className="nm">{label}</span>
      <span className="bar"><i style={{ width: pct + '%', background: color }} /></span>
      <span className="v">{fmtNum(val)}{target > 0 ? ' / ' + fmtNum(target) : ''} g</span>
    </div>
  )
}

function MealSection({ meal, iso, entries }) {
  const rows = entries.filter(e => e.meal === meal)
  const tot = dayTotals(rows)
  return (
    <Section title={mealLabel(meal)}
      footer={rows.length ? `${fmtNum(tot.kcal)} kcal · P ${fmtNum(tot.protein)} · C ${fmtNum(tot.carbs)} · F ${fmtNum(tot.fat)}` : null}>
      {rows.map(e => (
        <Row key={e.id} title={e.name} subtitle={portionLabel(e)} value={fmtNum(e.kcal) + ' kcal'} onClick={() => openEntry(iso, e)} />
      ))}
      <Row icon="plus" iconTint="var(--acc)" title={t('Add food')} onClick={() => openLog(meal, iso)} />
      {rows.length > 0 && <Row icon="clipboard" iconTint="var(--grey)" title={t('Copy {0} to…', mealLabel(meal))} onClick={() => openCopy(iso, meal)} />}
    </Section>
  )
}

/* ============================ sheets ============================ */
function FoodRow({ food, onClick, icon = 'plus' }) {
  const per = food.per === 'serving' ? t('serving') : '100g'
  return (
    <div className="item" onClick={onClick}>
      <div className="grow">
        <div className="tt">{food.fav && <Icon name="starFill" style={{ color: 'var(--yellow)', marginRight: 4 }} />}{food.name}{food.estimate && <span className="tag" style={{ marginLeft: 6 }}>{t('est.')}</span>}</div>
        <div className="ss">{fmtNum(food.kcal)} kcal · {per}{food.brand ? ' · ' + food.brand : ''}</div>
      </div>
      <Icon name={icon} className="chev" />
    </div>
  )
}

// Barcode/QR scanner. Native BarcodeDetector where present (Android Chrome); zxing-wasm is
// lazy-loaded as the iOS-Safari fallback — the wasm is fetched only here, never in the main
// bundle. Manual entry always works, and the camera is released on unmount.
function Scanner({ onCode, close }) {
  const videoRef = useRef(null)
  const [err, setErr] = useState('')
  const [manual, setManual] = useState('')
  useEffect(() => {
    let stream, raf, stop = false, last = 0
    const FMT = ['ean_13', 'upc_a', 'ean_8', 'upc_e', 'qr_code']
    const cleanup = () => { stop = true; if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(tr => tr.stop()) }
    const hit = code => { if (stop) return; cleanup(); onCode(String(code)) }
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setErr(t('Camera not available — enter the code below.')); return }
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); videoRef.current.srcObject = stream; await videoRef.current.play() }
      catch { setErr(t('Camera blocked — allow access or enter the code below.')); return }
      if ('BarcodeDetector' in window) {
        const det = new window.BarcodeDetector({ formats: FMT })
        const tick = async () => {
          if (stop) return
          try { const r = await det.detect(videoRef.current); if (r && r.length) return hit(r[0].rawValue) } catch { /* frame not ready */ }
          raf = requestAnimationFrame(tick)
        }
        tick()
      } else {
        let zx
        try { zx = await import('zxing-wasm/reader') } catch { setErr(t('Scanner unavailable — enter the code below.')); return }
        const cv = document.createElement('canvas')
        const tick = async () => {
          if (stop) return
          const v = videoRef.current, now = Date.now()
          if (v && v.videoWidth && now - last > 250) { // throttle the wasm decode
            last = now; cv.width = v.videoWidth; cv.height = v.videoHeight
            cv.getContext('2d').drawImage(v, 0, 0)
            try {
              const res = await zx.readBarcodes(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height), { formats: ['EAN-13', 'UPC-A', 'EAN-8', 'UPC-E', 'QRCode'], tryHarder: true })
              if (res && res[0]?.text) return hit(res[0].text)
            } catch { /* keep trying */ }
          }
          raf = requestAnimationFrame(tick)
        }
        tick()
      }
    }
    start()
    return cleanup
  }, [])
  const lookUp = () => { const c = manual.trim(); if (c) onCode(c) }
  return <>
    <h3>{t('Scan barcode')}</h3>
    {err
      ? <div className="small" style={{ color: 'var(--yellow)', margin: '4px 0 12px' }}>{err}</div>
      : <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000', aspectRatio: '4 / 3', marginBottom: 12 }}>
        <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: '24% 12%', border: '2px solid var(--acc)', borderRadius: 10 }} />
      </div>}
    <div className="muted small" style={{ marginBottom: 8 }}>{t('Point the camera at an EAN/UPC barcode or QR code, or type the number.')}</div>
    <div className="row" style={{ gap: 8 }}>
      <input className="field" inputMode="numeric" placeholder={t('Barcode number')} value={manual}
        onChange={e => setManual(e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={e => e.key === 'Enter' && lookUp()} style={{ flex: 1 }} />
      <Button variant="primary" onClick={lookUp}>{t('Look up')}</Button>
    </div>
  </>
}

function MealRow({ m, onClick }) {
  const tot = mealMacros(m.items)
  return <div className="item" onClick={onClick}>
    <span className="lrow-i"><Icon name="list" /></span>
    <div className="grow"><div className="tt">{m.name}</div><div className="ss">{fmtNum(tot.kcal)} kcal · {(m.items || []).length} {t('items')}</div></div>
    <Icon name="plus" className="chev" />
  </div>
}
function RecipeRow({ r, onClick }) {
  const ps = recipePerServing(r)
  return <div className="item" onClick={onClick}>
    <span className="lrow-i"><Icon name="clipboard" /></span>
    <div className="grow"><div className="tt">{r.name}</div><div className="ss">{fmtNum(ps.kcal)} kcal/{t('serving')} · {r.servings || 1} {t('servings')}</div></div>
    <Icon name="plus" className="chev" />
  </div>
}

function LogSheet({ meal, iso, onPick, close }) {
  const n = getS().nutrition || {}
  const foods = n.foods || [], meals = n.meals || [], recipes = n.recipes || []
  const [q, setQ] = useState('')
  const [off, setOff] = useState([])
  const [loading, setLoading] = useState(false)
  const local = localSearch(q, foods)
  const quick = q.trim() ? [] : quickFoods(n.log, n.favs)
  const pick = onPick || (f => openPortion(f, meal, iso))
  useEffect(() => {
    setOff([])
    const ql = q.trim()
    if (ql.length < 2) { setLoading(false); return }
    setLoading(true)
    let live = true
    const id = setTimeout(async () => { const r = await offSearch(ql); if (live) { setOff(r); setLoading(false) } }, 350)
    return () => { live = false; clearTimeout(id) }
  }, [q])
  return <>
    <h3>{onPick ? t('Add food') : t('Add to {0}', mealLabel(meal))}</h3>
    {!onPick && <div className="row" style={{ gap: 8, margin: '4px 0 10px', flexWrap: 'wrap' }}>
      <Button size="sm" icon="barcode" onClick={() => openScan(meal, iso)}>{t('Scan')}</Button>
      <Button size="sm" icon="plus" onClick={() => openQuickAdd(meal, iso)}>{t('Quick add')}</Button>
      <Button size="sm" icon="pencil" onClick={() => openCustomFood(meal, iso)}>{t('New food')}</Button>
    </div>}
    <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder={t('Search foods…')} />
    {!onPick && !q.trim() && (meals.length + recipes.length > 0) && <>
      <div className="sect-t" style={{ padding: '12px 2px 2px' }}>{t('Saved meals')}</div>
      <div className="list">
        {meals.map(m => <MealRow key={m.id} m={m} onClick={() => { logMeal(m, iso, meal); close(); toast(t('Logged {0}', m.name)) }} />)}
        {recipes.map(r => <RecipeRow key={r.id} r={r} onClick={() => openPortion(recFood(r), meal, iso)} />)}
      </div>
    </>}
    {quick.length > 0 && <>
      <div className="sect-t" style={{ padding: '12px 2px 2px' }}>{t('Favourites & recent')}</div>
      <div className="list">{quick.map(f => <FoodRow key={'q' + f.name} food={f} onClick={() => pick(f)} />)}</div>
    </>}
    <div className="list" style={{ marginTop: 10 }}>
      {local.map(f => <FoodRow key={f.id || f.code || f.name} food={f} onClick={() => pick(f)} />)}
      {off.length > 0 && <div className="sect-t" style={{ padding: '10px 2px 2px' }}>Open Food Facts</div>}
      {off.map(f => <FoodRow key={'off' + (f.code || f.name)} food={f} onClick={() => pick(f)} />)}
      {loading && <div className="muted small" style={{ padding: 8 }}>{t('Searching…')}</div>}
      {!loading && !local.length && !off.length && q.trim().length >= 2 &&
        <div className="muted small" style={{ padding: 8 }}>{t('No matches — try Quick add or New food.')}</div>}
    </div>
    {off.length > 0 && <div className="dim small" style={{ marginTop: 8 }}>{t('Nutrition data from {0}', 'Open Food Facts')}</div>}
  </>
}

function Portion({ food, meal, iso, editId, initQty, initUnit, onAdd, close }) {
  const opts = unitOptions(food)
  const [unit, setUnit] = useState(initUnit && opts.some(o => o.value === initUnit) ? initUnit : opts[0].value)
  const [qty, setQty] = useState(initQty ?? defaultQty(food, initUnit || opts[0].value))
  const m = entryMacros(food, qty, unit)
  const [fav, setFav] = useState(() => isFav(food))
  const save = () => {
    if (!(qty > 0)) { toast(t('Enter a portion')); return }
    if (onAdd) { onAdd({ food: { ...baseOf(food), name: food.name }, qty: +qty, unit }); close(); return } // into a meal/recipe, not the day
    const entry = { meal, name: food.name, qty: +qty, unit, ...m, source: food.source || 'custom', base: baseOf(food) }
    if (editId) updateEntry(iso, editId, entry); else addEntry(iso, entry)
    close(); toast(t('Logged'))
  }
  return <>
    <h3 className="row" style={{ gap: 8 }}><span className="grow">{food.name}{food.estimate && <span className="tag" style={{ marginLeft: 8 }}>{t('estimate')}</span>}</span>
      <button className="iconbtn" style={fav ? { color: 'var(--yellow)' } : undefined} onClick={() => { toggleFav(food); setFav(!fav) }}
        aria-label={fav ? t('Remove from favourites') : t('Add to favourites')} aria-pressed={fav}><Icon name={fav ? 'starFill' : 'star'} /></button></h3>
    {!onAdd && <div className="muted small" style={{ marginBottom: 12 }}>{t('Into {0}', mealLabel(meal))}</div>}
    {opts.length > 1 && <div style={{ marginBottom: 12 }}><Segmented options={opts} value={unit} onChange={u => { setUnit(u); setQty(defaultQty(food, u)) }} /></div>}
    <div className="row cfgrow" style={{ marginBottom: 14 }}>
      <Stepper label={t('Amount')} value={qty} step={unit === 'serving' ? 1 : 10} decimal onChange={setQty} unit={unit === 'serving' ? '' : unit} />
    </div>
    <div className="tiles" style={{ marginBottom: 14 }}>
      <div className="tile"><div className="l">{t('Calories')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fmtNum(m.kcal)}</div></div>
      <div className="tile"><div className="l">{t('Protein')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fmtNum(m.protein)}</div></div>
      <div className="tile"><div className="l">{t('Carbs')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fmtNum(m.carbs)}</div></div>
      <div className="tile"><div className="l">{t('Fat')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fmtNum(m.fat)}</div></div>
    </div>
    {extrasLine(m) && <div className="muted small" style={{ margin: '-6px 2px 14px' }}>{extrasLine(m)}</div>}
    <Button variant="primary" onClick={save}>{editId ? t('Save') : onAdd ? t('Add') : t('Add to log')}</Button>
  </>
}

function QuickAdd({ meal, iso, close }) {
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState(null); const [p, setP] = useState(null); const [c, setC] = useState(null); const [f, setF] = useState(null)
  const save = () => {
    if (!name.trim()) { toast(t('Give it a name')); return }
    if (!(kcal > 0)) { toast(t('Enter calories')); return }
    addEntry(iso, { meal, name: name.trim(), qty: 1, unit: 'serving', kcal: Math.round(kcal), protein: numN(p) || 0, carbs: numN(c) || 0, fat: numN(f) || 0, source: 'quick' })
    close(); toast(t('Logged'))
  }
  return <>
    <h3>{t('Quick add')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Calories now, macros if you know them. Into {0}.', mealLabel(meal))}</div>
    <input className="field" placeholder={t('Name')} value={name} onChange={e => setName(e.target.value)} maxLength={60} />
    <div className="row cfgrow" style={{ margin: '12px 0' }}>
      <div className="stp-w"><span className="stp-l">{t('Calories')}</span><NumberField value={kcal} nullable decimal={false} onChange={setKcal} /></div>
    </div>
    <div className="row cfgrow" style={{ marginBottom: 14 }}>
      <div className="stp-w"><span className="stp-l">{t('Protein (g)')}</span><NumberField value={p} nullable onChange={setP} /></div>
      <div className="stp-w"><span className="stp-l">{t('Carbs (g)')}</span><NumberField value={c} nullable onChange={setC} /></div>
      <div className="stp-w"><span className="stp-l">{t('Fat (g)')}</span><NumberField value={f} nullable onChange={setF} /></div>
    </div>
    <Button variant="primary" onClick={save}>{t('Add to log')}</Button>
  </>
}

function CustomFood({ meal, iso, code, existing: ex, close }) {
  const [name, setName] = useState(ex?.name || '')
  const [per, setPer] = useState(ex?.per || '100g')
  const [kcal, setKcal] = useState(ex?.kcal ?? null); const [p, setP] = useState(ex?.protein ?? null); const [c, setC] = useState(ex?.carbs ?? null); const [f, setF] = useState(ex?.fat ?? null)
  const [x, setX] = useState(() => Object.fromEntries(EXTRAS.map(k => [k, ex?.[k] ?? null])))
  code = code || ex?.barcode
  const build = () => {
    if (!name.trim()) { toast(t('Give it a name')); return null }
    if (!(kcal > 0)) { toast(t('Enter calories')); return null }
    const food = { ...ex, id: ex?.id || 'f' + uid(), name: name.trim(), per, kcal: Math.round(kcal), protein: numN(p) || 0, carbs: numN(c) || 0, fat: numN(f) || 0, source: 'custom', ...(code ? { barcode: code } : {}) }
    for (const k of EXTRAS) { if (numN(x[k]) != null) food[k] = numN(x[k]); else delete food[k] }
    upsertFood(food)
    return food
  }
  if (ex) return <>
    <h3>{t('Edit food')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Past log entries keep the values they were logged with.')}</div>
    <FoodFields {...{ name, setName, per, setPer, kcal, setKcal, p, setP, c, setC, f, setF, x, setX }} />
    <Button variant="primary" onClick={() => { if (build()) { close(); toast(t('Food saved')) } }}>{t('Save')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="danger" icon="trash" onClick={() => { delFood(ex.id); close(); toast(t('Food deleted')) }}>{t('Delete food')}</Button>
  </>
  return <>
    <h3>{t('New food')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Saved to your foods so you can log it again.')}</div>
    {code && <div className="muted small" style={{ marginBottom: 12 }}>{t('Barcode: {0}', code)}</div>}
    <FoodFields {...{ name, setName, per, setPer, kcal, setKcal, p, setP, c, setC, f, setF, x, setX }} />
    <Button variant="primary" onClick={() => { const food = build(); if (food) { close(); openPortion(food, meal, iso) } }}>{t('Save & log')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={() => { if (build()) { close(); toast(t('Food saved')) } }}>{t('Just save')}</Button>
  </>
}

function FoodFields({ name, setName, per, setPer, kcal, setKcal, p, setP, c, setC, f, setF, x, setX }) {
  return <>
    <input className="field" placeholder={t('Name')} value={name} onChange={e => setName(e.target.value)} maxLength={60} />
    <div style={{ margin: '12px 0' }}>
      <Segmented options={[{ value: '100g', label: t('per 100 g/ml') }, { value: 'serving', label: t('per serving') }]} value={per} onChange={setPer} />
    </div>
    <div className="row cfgrow" style={{ marginBottom: 10 }}>
      <div className="stp-w"><span className="stp-l">{t('Calories')}</span><NumberField value={kcal} nullable decimal={false} onChange={setKcal} /></div>
    </div>
    <div className="row cfgrow" style={{ marginBottom: 14 }}>
      <div className="stp-w"><span className="stp-l">{t('Protein (g)')}</span><NumberField value={p} nullable onChange={setP} /></div>
      <div className="stp-w"><span className="stp-l">{t('Carbs (g)')}</span><NumberField value={c} nullable onChange={setC} /></div>
      <div className="stp-w"><span className="stp-l">{t('Fat (g)')}</span><NumberField value={f} nullable onChange={setF} /></div>
    </div>
    <div className="row cfgrow" style={{ marginBottom: 14 }}>
      {EXTRAS.map(k => <div key={k} className="stp-w"><span className="stp-l">{t(EXTRA_LABEL[k])} ({k === 'sodium' ? 'mg' : 'g'})</span>
        <NumberField value={x[k]} nullable decimal={k !== 'sodium'} onChange={v => setX(o => ({ ...o, [k]: v }))} placeholder={t('optional')} /></div>)}
    </div>
  </>
}

const ACT_OPTS = [
  { value: 'sedentary', label: t('Sedentary'), subtitle: t('little or no exercise') },
  { value: 'light', label: t('Light'), subtitle: t('1–3 days/week') },
  { value: 'moderate', label: t('Moderate'), subtitle: t('3–5 days/week') },
  { value: 'active', label: t('Active'), subtitle: t('6–7 days/week') },
  { value: 'veryActive', label: t('Very active'), subtitle: t('hard training / physical job') }
]

function Targets({ close }) {
  const S = getS(); const n = S.nutrition || {}; const pr = n.profile || {}; const tg = n.targets || {}
  const [sex, setSex] = useState(S.body === 'female' ? 'female' : 'male')
  const [age, setAge] = useState(pr.age || null)
  const [ht, setHt] = useState(pr.heightCm || null)
  const [act, setAct] = useState(pr.activity || 'moderate')
  const [goal, setGoal] = useState(pr.goal || 'maintain')
  const [kcal, setKcal] = useState(tg.kcal || null); const [p, setP] = useState(tg.protein || null)
  const [c, setC] = useState(tg.carbs || null); const [f, setF] = useState(tg.fat || null)
  const bw = lastBW(S)
  const weightKg = bw ? (S.unit === 'lb' ? bw.w * 0.45359237 : bw.w) : null
  const sugg = computeTargets({ sex, age, heightCm: ht, weightKg, activity: act, goal })
  const applySugg = () => { if (!sugg) { toast(t('Add age, height and a logged body weight first')); return } setKcal(sugg.kcal); setP(sugg.protein); setC(sugg.carbs); setF(sugg.fat) }
  const save = () => {
    if (!(kcal > 0)) { toast(t('Set a calorie target')); return }
    saveTargets({ sex, age: numN(age), heightCm: numN(ht), activity: act, goal },
      { kcal: Math.round(kcal), protein: numN(p) || 0, carbs: numN(c) || 0, fat: numN(f) || 0, manual: true })
    close(); toast(t('Targets saved'))
  }
  return <>
    <h3>{t('Goals & targets')}</h3>
    <div style={{ marginBottom: 12 }}><Segmented options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]} value={sex} onChange={setSex} /></div>
    <div className="row cfgrow" style={{ marginBottom: 12 }}>
      <div className="stp-w"><span className="stp-l">{t('Age')}</span><NumberField value={age} nullable decimal={false} onChange={setAge} /></div>
      <div className="stp-w"><span className="stp-l">{t('Height (cm)')}</span><NumberField value={ht} nullable decimal={false} onChange={setHt} /></div>
    </div>
    <div className="sect-b" style={{ marginBottom: 12 }}>
      <SelectRow title={t('Activity')} sheetTitle={t('Activity level')} value={act} onChange={setAct} options={ACT_OPTS} />
    </div>
    <div style={{ marginBottom: 12 }}><Segmented options={[{ value: 'lose', label: t('Lose') }, { value: 'maintain', label: t('Maintain') }, { value: 'gain', label: t('Gain') }]} value={goal} onChange={setGoal} /></div>
    {sugg
      ? <div className="muted small" style={{ marginBottom: 8 }}>{t('Suggested: {0} kcal · P {1} · C {2} · F {3}', sugg.kcal, sugg.protein, sugg.carbs, sugg.fat)}</div>
      : <div className="small" style={{ color: 'var(--yellow)', marginBottom: 8 }}>{t('Add age, height and a logged body weight for a suggestion.')}</div>}
    <Button size="sm" icon="sparkles" onClick={applySugg}>{t('Use suggested')}</Button>
    <h4 className="sec">{t('Daily targets')}</h4>
    <div className="row cfgrow" style={{ marginBottom: 10 }}>
      <div className="stp-w"><span className="stp-l">{t('Calories')}</span><NumberField value={kcal} nullable decimal={false} onChange={setKcal} /></div>
    </div>
    <div className="row cfgrow" style={{ marginBottom: 16 }}>
      <div className="stp-w"><span className="stp-l">{t('Protein (g)')}</span><NumberField value={p} nullable onChange={setP} /></div>
      <div className="stp-w"><span className="stp-l">{t('Carbs (g)')}</span><NumberField value={c} nullable onChange={setC} /></div>
      <div className="stp-w"><span className="stp-l">{t('Fat (g)')}</span><NumberField value={f} nullable onChange={setF} /></div>
    </div>
    <Button variant="primary" onClick={save}>{t('Save targets')}</Button>
  </>
}

function openEntry(iso, e) {
  ui().openSheet(close => <>
    <h3>{e.name}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{portionLabel(e)} · {mealLabel(e.meal)}</div>
    <div className="tiles">
      <div className="tile"><div className="l">{t('Calories')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fmtNum(e.kcal)}</div></div>
      <div className="tile"><div className="l">{t('Protein')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fmtNum(e.protein)}</div></div>
      <div className="tile"><div className="l">{t('Carbs')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fmtNum(e.carbs)}</div></div>
      <div className="tile"><div className="l">{t('Fat')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fmtNum(e.fat)}</div></div>
    </div>
    {e.base && <><div style={{ height: 10 }} /><Button icon="pencil" onClick={() => { close(); openPortion({ ...e.base, name: e.name, source: e.source }, e.meal, iso, { editId: e.id, initQty: e.qty, initUnit: e.unit }) }}>{t('Edit portion')}</Button></>}
    <div style={{ height: 8 }} />
    <Button variant="danger" icon="trash" onClick={() => { delEntry(iso, e.id); close(); toast(t('Removed')) }}>{t('Remove')}</Button>
  </>, { kind: 'center' })
}
export const openTargets = () => ui().openSheet(close => <Targets close={close} />)
export const openLog = (meal, iso) => ui().openSheet(close => <LogSheet meal={meal} iso={iso} close={close} />)
const openPortion = (food, meal, iso, opts = {}) => ui().openSheet(close => <Portion food={food} meal={meal} iso={iso} editId={opts.editId} initQty={opts.initQty} initUnit={opts.initUnit} onAdd={opts.onAdd} close={close} />)
const openQuickAdd = (meal, iso) => ui().openSheet(close => <QuickAdd meal={meal} iso={iso} close={close} />)
const openCustomFood = (meal, iso, code, existing) => ui().openSheet(close => <CustomFood meal={meal} iso={iso} code={code} existing={existing} close={close} />)

// A scanned/typed code: match the user's own barcoded foods offline first, then Open Food Facts;
// if nothing is found, offer to create the food with the code prefilled.
async function handleCode(code, meal, iso) {
  const foods = getS().nutrition?.foods || []
  const own = foods.find(f => f.barcode === code)
  if (own) { openPortion(own, meal, iso); return }
  try { const food = await offBarcode(code); openPortion({ ...food, barcode: code }, meal, iso) }
  catch { toast(t('Barcode not found — add it as a food')); openCustomFood(meal, iso, code) }
}
const openScan = (meal, iso) => ui().openSheet(close => <Scanner onCode={code => { close(); handleCode(code, meal, iso) }} close={close} />)

function ItemList({ items, setItems }) {
  return <div className="list" style={{ margin: '12px 0' }}>
    {items.map((it, i) => <div key={i} className="item">
      <div className="grow"><div className="tt">{it.food.name}</div><div className="ss">{portionLabel(it)}</div></div>
      <button className="iconbtn" style={{ color: 'var(--red)' }} onClick={() => setItems(x => x.filter((_, j) => j !== i))} aria-label={t('Remove')}><Icon name="trash" /></button>
    </div>)}
    {!items.length && <div className="muted small" style={{ padding: 8 }}>{t('No foods yet.')}</div>}
  </div>
}

function MealBuilder({ existing, close }) {
  const [name, setName] = useState(existing?.name || '')
  const [items, setItems] = useState(existing?.items || [])
  const tot = mealMacros(items)
  const addFood = () => openFoodPicker(food => openPortion(food, null, null, { onAdd: it => setItems(x => [...x, it]) }))
  const save = () => {
    if (!name.trim()) { toast(t('Give it a name')); return }
    if (!items.length) { toast(t('Add at least one food')); return }
    upsertMeal({ id: existing?.id || 'm' + uid(), name: name.trim(), items }); close(); toast(t('Meal saved'))
  }
  return <>
    <h3>{existing ? t('Edit meal') : t('New meal')}</h3>
    <input className="field" placeholder={t('Meal name, e.g. My usual breakfast')} value={name} onChange={e => setName(e.target.value)} maxLength={60} />
    <ItemList items={items} setItems={setItems} />
    <Button icon="plus" onClick={addFood}>{t('Add food')}</Button>
    <div className="muted small" style={{ margin: '10px 2px' }}>{fmtNum(tot.kcal)} kcal · P {fmtNum(tot.protein)} · C {fmtNum(tot.carbs)} · F {fmtNum(tot.fat)}</div>
    <Button variant="primary" onClick={save}>{t('Save meal')}</Button>
    {existing && <><div style={{ height: 8 }} /><Button variant="danger" icon="trash" onClick={() => { delMeal(existing.id); close(); toast(t('Meal deleted')) }}>{t('Delete meal')}</Button></>}
  </>
}

function RecipeBuilder({ existing, close }) {
  const [name, setName] = useState(existing?.name || '')
  const [servings, setServings] = useState(existing?.servings || 4)
  const [items, setItems] = useState(existing?.items || [])
  const ps = recipePerServing({ servings, items })
  const addFood = () => openFoodPicker(food => openPortion(food, null, null, { onAdd: it => setItems(x => [...x, it]) }))
  const save = () => {
    if (!name.trim()) { toast(t('Give it a name')); return }
    if (!items.length) { toast(t('Add at least one ingredient')); return }
    upsertRecipe({ id: existing?.id || 'r' + uid(), name: name.trim(), servings: Math.max(1, Math.round(servings) || 1), items }); close(); toast(t('Recipe saved'))
  }
  return <>
    <h3>{existing ? t('Edit recipe') : t('New recipe')}</h3>
    <input className="field" placeholder={t('Recipe name')} value={name} onChange={e => setName(e.target.value)} maxLength={60} />
    <div className="row cfgrow" style={{ margin: '12px 0' }}><Stepper label={t('Servings')} value={servings} step={1} decimal={false} onChange={setServings} /></div>
    <ItemList items={items} setItems={setItems} />
    <Button icon="plus" onClick={addFood}>{t('Add ingredient')}</Button>
    <div className="muted small" style={{ margin: '10px 2px' }}>{t('Per serving:')} {fmtNum(ps.kcal)} kcal · P {fmtNum(ps.protein)} · C {fmtNum(ps.carbs)} · F {fmtNum(ps.fat)}</div>
    <Button variant="primary" onClick={save}>{t('Save recipe')}</Button>
    {existing && <><div style={{ height: 8 }} /><Button variant="danger" icon="trash" onClick={() => { delRecipe(existing.id); close(); toast(t('Recipe deleted')) }}>{t('Delete recipe')}</Button></>}
  </>
}

function MealsManager({ close }) {
  const n = getS().nutrition || {}
  const meals = n.meals || [], recipes = n.recipes || [], foods = n.foods || []
  return <>
    <h3>{t('Meals, recipes & foods')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('Build a meal or recipe once, then log it in a tap from any day.')}</div>
    <div className="row" style={{ gap: 8, marginBottom: 10 }}>
      <Button size="sm" icon="plus" onClick={() => { close(); openMealBuilder() }}>{t('New meal')}</Button>
      <Button size="sm" icon="plus" onClick={() => { close(); openRecipeBuilder() }}>{t('New recipe')}</Button>
    </div>
    <div className="list">
      {meals.map(m => <MealRow key={m.id} m={m} onClick={() => { close(); openMealBuilder(m) }} />)}
      {recipes.map(r => <RecipeRow key={r.id} r={r} onClick={() => { close(); openRecipeBuilder(r) }} />)}
      {!meals.length && !recipes.length && <div className="muted small" style={{ padding: 8 }}>{t('Nothing saved yet.')}</div>}
    </div>
    {foods.length > 0 && <>
      <div className="sect-t" style={{ padding: '14px 2px 2px' }}>{t('My foods')}</div>
      <div className="list">{foods.map(f => <FoodRow key={f.id} food={f} icon="pencil" onClick={() => { close(); openCustomFood(null, null, null, f) }} />)}</div>
    </>}
  </>
}

const openFoodPicker = onPick => ui().openSheet(close => <LogSheet onPick={onPick} close={close} />)
const openMeals = () => ui().openSheet(close => <MealsManager close={close} />)
const openMealBuilder = existing => ui().openSheet(close => <MealBuilder existing={existing} close={close} />)
const openRecipeBuilder = existing => ui().openSheet(close => <RecipeBuilder existing={existing} close={close} />)

function Prefs({ close }) {
  const pr = getS().nutrition?.prefs || {}
  const [avoid, setAvoid] = useState(pr.avoid || '')
  const [halal, setHalal] = useState(!!pr.halal)
  const [notes, setNotes] = useState(pr.notes || '')
  return <>
    <h3>{t('Food preferences')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Used to filter suggestions (and by the AI Coach later).')}</div>
    <label className="stp-l">{t('Avoid (comma-separated)')}</label>
    <input className="field" placeholder={t('e.g. shrimp, mushrooms')} value={avoid} onChange={e => setAvoid(e.target.value)} maxLength={200} />
    <div className="row between" style={{ padding: '12px 2px', margin: '6px 0' }}>
      <span className="lrow-t">{t('Halal only')}</span><Switch checked={halal} onChange={setHalal} />
    </div>
    <label className="stp-l">{t('Notes (allergies, budget, likes)')}</label>
    <textarea className="field area" rows={3} value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} />
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={() => { savePrefs({ avoid: avoid.trim(), halal, notes: notes.trim() }); close(); toast(t('Preferences saved')) }}>{t('Save')}</Button>
  </>
}

function Suggest({ iso, close }) {
  const n = getS().nutrition || {}
  const tg = n.targets || {}
  const tot = dayTotals((n.log && n.log[iso]) || [])
  const rem = remaining({ kcal: tg.kcal, protein: tg.protein, carbs: tg.carbs, fat: tg.fat }, tot)
  const list = suggestFor(rem, candidateList(n), n.prefs || {})
  const slot = slotForNow()
  return <>
    <h3>{t('Suggestions')}</h3>
    {tg.kcal > 0
      ? <div className="muted small" style={{ marginBottom: 10 }}>{rem.kcal > 0 ? t('{0} kcal and {1} g protein left today.', fmtNum(rem.kcal), fmtNum(rem.protein)) : t("You're at your calorie target for today.")}</div>
      : <div className="small" style={{ color: 'var(--yellow)', marginBottom: 10 }}>{t('Set your targets to get suggestions that fit your day.')}</div>}
    <div className="list">
      {list.map((c, i) => <div key={i} className="item" onClick={() => { logCandidate(c, iso, slot); close(); toast(t('Added {0} to {1}', c.name, mealLabel(slot))) }}>
        <span className="lrow-i"><Icon name={c.kind === 'meal' ? 'list' : c.kind === 'recipe' ? 'clipboard' : 'flame'} /></span>
        <div className="grow"><div className="tt">{c.name}</div><div className="ss">{fmtNum(c.kcal)} kcal · P {fmtNum(c.protein)}{c.fits ? '' : ' · ' + t('over budget')}</div></div>
        <Icon name="plus" className="chev" />
      </div>)}
      {!list.length && <div className="muted small" style={{ padding: 8 }}>{rem.kcal <= 0 && tg.kcal > 0 ? t("You've hit today's calories.") : t('Save a few meals or foods and they’ll show up here.')}</div>}
    </div>
    <div className="dim small" style={{ marginTop: 10 }}>{t('Tapping adds it to {0}. AI-generated suggestions arrive when the Coach is connected.', mealLabel(slot))}</div>
    <div style={{ height: 8 }} />
    <Button variant="ghost" icon="gear" onClick={() => { close(); openPrefs() }}>{t('Food preferences')}</Button>
  </>
}

const openSuggest = iso => ui().openSheet(close => <Suggest iso={iso} close={close} />)
const openPrefs = () => ui().openSheet(close => <Prefs close={close} />)

/* ============================ view ============================ */
// Copy a day's entries (or one meal's) onto another date — fresh ids, same meal slots.
const copyEntries = (from, to, meal) => update(s => {
  const n = nz(s); const src = (n.log[from] || []).filter(e => !meal || e.meal === meal)
  ;(n.log[to] = n.log[to] || []).push(...src.map(e => ({ ...e, id: uid() })))
})
function CopySheet({ iso, meal, close }) {
  const [to, setTo] = useState(iso < todayISO() ? todayISO() : shift(iso, 1))
  return <>
    <h3>{meal ? t('Copy {0}', mealLabel(meal)) : t('Copy this day')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('From {0}. Entries are added to whatever that day already has.', fmtDate(iso, true))}</div>
    <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      {[[shift(iso, 1), t('Next day')], [todayISO(), t('Today')], [shift(todayISO(), 1), t('Tomorrow')]].filter(([d], i, a) => d !== iso && a.findIndex(x => x[0] === d) === i)
        .map(([d, l]) => <button key={d} className="chip" style={d === to ? { outline: '2px solid var(--acc)' } : undefined} onClick={() => setTo(d)}>{l}</button>)}
    </div>
    <input type="date" className="field" value={to} onChange={e => e.target.value && setTo(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" disabled={to === iso} onClick={() => { copyEntries(iso, to, meal); close(); toast(t('Copied to {0}', fmtDate(to, true))) }}>{t('Copy')}</Button>
  </>
}
const openCopy = (iso, meal) => ui().openSheet(close => <CopySheet iso={iso} meal={meal} close={close} />)

export default function Nutrition() {
  const S = useStore(s => s.S)
  const n = S.nutrition || {}
  const [iso, setIso] = useState(todayISO())
  const entries = (n.log && n.log[iso]) || []
  const tot = dayTotals(entries)
  const tg = n.targets || {}
  const hasTargets = tg.kcal > 0
  const rem = hasTargets ? remaining({ kcal: tg.kcal, protein: tg.protein, carbs: tg.carbs, fat: tg.fat }, tot) : null

  return <>
    <div className="hdr">
      <div><h1>{t('Nutrition')}</h1><div className="sub">{t('Calories & macros')}</div></div>
      <div className="row" style={{ gap: 6 }}>
        <button className="iconbtn" onClick={() => openSuggest(iso)} aria-label={t('Suggestions')}><Icon name="lightbulb" /></button>
        <button className="iconbtn" onClick={openMeals} aria-label={t('Saved meals')}><Icon name="clipboard" /></button>
        <button className="iconbtn" onClick={openTargets} aria-label={t('Goals & targets')}><Icon name="target" /></button>
      </div>
    </div>

    <div className="row between" style={{ marginBottom: 14 }}>
      <button className="iconbtn" onClick={() => setIso(shift(iso, -1))} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
      <button className="chip" style={{ minWidth: 130 }} onClick={() => setIso(todayISO())}>{iso === todayISO() ? t('Today') : fmtDate(iso, true)}</button>
      <button className="iconbtn" onClick={() => setIso(shift(iso, 1))} disabled={iso >= todayISO()} aria-label={t('Next day')}><Icon name="chevronRight" /></button>
    </div>

    <div className="card">
      {hasTargets ? <>
        <KcalRing consumed={tot.kcal} target={tg.kcal} />
        <div className="row between" style={{ margin: '10px 2px 14px' }}>
          <span className="muted small">{rem.kcal >= 0 ? t('{0} kcal left', fmtNum(rem.kcal)) : t('{0} kcal over', fmtNum(-rem.kcal))}</span>
          <button className="chip" onClick={openTargets}>{t('Edit targets')}</button>
        </div>
        <MacroBar label={t('Protein')} val={tot.protein} target={tg.protein} color="var(--blue)" />
        <MacroBar label={t('Carbs')} val={tot.carbs} target={tg.carbs} color="var(--teal)" />
        <MacroBar label={t('Fat')} val={tot.fat} target={tg.fat} color="var(--orange)" />
      </> : <>
        <div className="tiles">
          <div className="tile"><div className="l"><Icon name="flame" />{t('Calories')}</div><div className="v">{fmtNum(tot.kcal)}</div></div>
          <div className="tile"><div className="l">{t('Protein')}</div><div className="v">{fmtNum(tot.protein)}</div></div>
          <div className="tile"><div className="l">{t('Carbs')}</div><div className="v">{fmtNum(tot.carbs)}</div></div>
          <div className="tile"><div className="l">{t('Fat')}</div><div className="v">{fmtNum(tot.fat)}</div></div>
        </div>
        <div style={{ height: 12 }} />
        <Button variant="primary" icon="target" onClick={openTargets}>{t('Set your targets')}</Button>
      </>}
    </div>

    {extrasLine(tot) && <div className="muted small" style={{ textAlign: 'center', margin: '-4px 0 12px' }}>{extrasLine(tot)}</div>}
    {MEALS.map(m => <MealSection key={m} meal={m} iso={iso} entries={entries} />)}
    {entries.length > 0 && <Button icon="clipboard" onClick={() => openCopy(iso)}>{t('Copy this day to…')}</Button>}

    <div className="dim small" style={{ textAlign: 'center', margin: '6px 0 4px', lineHeight: 1.6 }}>
      {t('Regional dishes are estimates — edit a portion to match your recipe.')}
    </div>
  </>
}
