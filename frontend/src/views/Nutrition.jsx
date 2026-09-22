// Nutrition tab — daily calorie & macro log. Gated on S.nutrition.on (Settings); the route and
// this view render nothing meaningful until it's turned on. All persistence rides the normal
// store: mutations go through update(), so entries sync and back up like everything else.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { fmtNum, fmtDate, todayISO, isoOf, uid } from '../lib/format.js'
import { lastBW } from '../lib/history.js'
import { t } from '../lib/i18n.js'
import { computeTargets, entryMacros, dayTotals, remaining, mealMacros, recipePerServing, ACTIVITY } from '../lib/nutrition.js'
import { localSearch } from '../lib/foodDB.js'
import { offSearch } from '../lib/foodApi.js'
import Icon from '../components/Icon.jsx'
import { Section, Row, Button, Segmented, NumberField, Stepper, SelectRow, SearchField } from '../components/ui.jsx'

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
  return n
}

const addEntry = (iso, entry) => update(s => { const n = nz(s); (n.log[iso] = n.log[iso] || []).push({ id: uid(), ...entry }) })
const updateEntry = (iso, id, entry) => update(s => { const n = nz(s); const d = n.log[iso] || []; const i = d.findIndex(e => e.id === id); if (i >= 0) d[i] = { ...d[i], ...entry, id } })
const delEntry = (iso, id) => update(s => { const n = nz(s); n.log[iso] = (n.log[iso] || []).filter(e => e.id !== id) })
const upsertFood = food => update(s => { const n = nz(s); const i = n.foods.findIndex(f => f.id === food.id); if (i >= 0) n.foods[i] = food; else n.foods.push(food) })
const saveTargets = (profile, targets) => update(s => { const n = nz(s); n.profile = profile; n.targets = targets })
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

/* ---------- labels & portion helpers ---------- */
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']
const mealLabel = m => t({ breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' }[m] || m)
const unitLabel = (u, q) => (u === 'serving' ? t(q === 1 ? 'serving' : 'servings') : u)
const portionLabel = e => fmtNum(e.qty) + ' ' + unitLabel(e.unit, e.qty)
const baseOf = f => ({ per: f.per, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, ...(f.servingG > 0 ? { servingG: f.servingG } : {}) })
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
    </Section>
  )
}

/* ============================ sheets ============================ */
function FoodRow({ food, onClick }) {
  const per = food.per === 'serving' ? t('serving') : '100g'
  return (
    <div className="item" onClick={onClick}>
      <div className="grow">
        <div className="tt">{food.name}{food.estimate && <span className="tag" style={{ marginLeft: 6 }}>{t('est.')}</span>}</div>
        <div className="ss">{fmtNum(food.kcal)} kcal · {per}{food.brand ? ' · ' + food.brand : ''}</div>
      </div>
      <Icon name="plus" className="chev" />
    </div>
  )
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
    {!onPick && <div className="row" style={{ gap: 8, margin: '4px 0 10px' }}>
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
  const save = () => {
    if (!(qty > 0)) { toast(t('Enter a portion')); return }
    if (onAdd) { onAdd({ food: { ...baseOf(food), name: food.name }, qty: +qty, unit }); close(); return } // into a meal/recipe, not the day
    const entry = { meal, name: food.name, qty: +qty, unit, ...m, source: food.source || 'custom', base: baseOf(food) }
    if (editId) updateEntry(iso, editId, entry); else addEntry(iso, entry)
    close(); toast(t('Logged'))
  }
  return <>
    <h3>{food.name}{food.estimate && <span className="tag" style={{ marginLeft: 8 }}>{t('estimate')}</span>}</h3>
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

function CustomFood({ meal, iso, close }) {
  const [name, setName] = useState('')
  const [per, setPer] = useState('100g')
  const [kcal, setKcal] = useState(null); const [p, setP] = useState(null); const [c, setC] = useState(null); const [f, setF] = useState(null)
  const build = () => {
    if (!name.trim()) { toast(t('Give it a name')); return null }
    if (!(kcal > 0)) { toast(t('Enter calories')); return null }
    const food = { id: 'f' + uid(), name: name.trim(), per, kcal: Math.round(kcal), protein: numN(p) || 0, carbs: numN(c) || 0, fat: numN(f) || 0, source: 'custom' }
    upsertFood(food)
    return food
  }
  return <>
    <h3>{t('New food')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Saved to your foods so you can log it again.')}</div>
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
    <Button variant="primary" onClick={() => { const food = build(); if (food) { close(); openPortion(food, meal, iso) } }}>{t('Save & log')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={() => { if (build()) { close(); toast(t('Food saved')) } }}>{t('Just save')}</Button>
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
  const [sex, setSex] = useState(pr.sex || (S.body === 'female' ? 'female' : 'male'))
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
const openLog = (meal, iso) => ui().openSheet(close => <LogSheet meal={meal} iso={iso} close={close} />)
const openPortion = (food, meal, iso, opts = {}) => ui().openSheet(close => <Portion food={food} meal={meal} iso={iso} editId={opts.editId} initQty={opts.initQty} initUnit={opts.initUnit} onAdd={opts.onAdd} close={close} />)
const openQuickAdd = (meal, iso) => ui().openSheet(close => <QuickAdd meal={meal} iso={iso} close={close} />)
const openCustomFood = (meal, iso) => ui().openSheet(close => <CustomFood meal={meal} iso={iso} close={close} />)

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
  const meals = n.meals || [], recipes = n.recipes || []
  return <>
    <h3>{t('Saved meals & recipes')}</h3>
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
  </>
}

const openFoodPicker = onPick => ui().openSheet(close => <LogSheet onPick={onPick} close={close} />)
const openMeals = () => ui().openSheet(close => <MealsManager close={close} />)
const openMealBuilder = existing => ui().openSheet(close => <MealBuilder existing={existing} close={close} />)
const openRecipeBuilder = existing => ui().openSheet(close => <RecipeBuilder existing={existing} close={close} />)

/* ============================ view ============================ */
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

    {MEALS.map(m => <MealSection key={m} meal={m} iso={iso} entries={entries} />)}

    <div className="dim small" style={{ textAlign: 'center', margin: '6px 0 4px', lineHeight: 1.6 }}>
      {t('Regional dishes are estimates — edit a portion to match your recipe.')}
    </div>
  </>
}
