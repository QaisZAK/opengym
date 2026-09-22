// Water tracking — its own tab/module. Logs typed drinks (water bottles, coffee, tea, soda,
// energy…), each contributing hydration by its own factor and tracking caffeine. Data lives under
// nutrition.water (synced + backed up); this view owns it end to end.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { fmtNum, fmtDate, todayISO, isoOf, localTZ } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button, Stepper, Switch, Segmented } from '../components/ui.jsx'
import { DRINKS, drinkByKey, mkEntry, normalizeDay, dayWater, waterUnit, toUnit, fromUnit, fmtVol } from '../lib/water.js'

const getS = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)
const shift = (iso, d) => { const dt = new Date(iso + 'T12:00:00'); dt.setDate(dt.getDate() + d); return isoOf(dt) }

function ensureWater(s) {
  const n = s.nutrition = s.nutrition || {}
  const w = n.water = n.water || {}
  w.goalMl = w.goalMl || 2000; w.log = w.log || {}
  w.reminder = w.reminder || { on: false, everyMin: 120, from: '09:00', to: '22:00', tz: null }
  return w
}
// Entries are stored chronologically; remove by position (no per-entry id needed).
const logDrink = (iso, entry) => update(s => { const w = ensureWater(s); const day = normalizeDay(w.log[iso]).slice(); day.push(entry); w.log[iso] = day })
const removeDrinkAt = (iso, i) => update(s => { const w = ensureWater(s); const day = normalizeDay(w.log[iso]).slice(); day.splice(i, 1); w.log[iso] = day })
const setWaterGoal = (ml, unit) => update(s => { const w = ensureWater(s); w.goalMl = Math.max(0, Math.round(ml) || 0); w.unit = unit })
const setWaterReminder = patch => update(s => { const w = ensureWater(s); w.reminder = { ...w.reminder, ...patch, tz: localTZ() } })

// Quick-log a glass of water to today — used by the Home widget.
export function quickWater(ml) { logDrink(todayISO(), mkEntry(drinkByKey('glass'), ml)); toast(t('Added {0}', fmtVol(ml, waterUnit(getS())))) }

const TILE_DRINKS = ['glass', 'bottle_baby', 'bottle_s', 'bottle_l', 'coffee', 'tea', 'soda', 'energy'].map(drinkByKey)
const tileStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', background: 'var(--surface-2)', border: 'none', borderRadius: 12, cursor: 'pointer', color: 'var(--label)' }
const iconTile = { width: 40, height: 40, borderRadius: 11, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', color: 'var(--teal)', fontSize: 20 }

function WaterRing({ hydration, goal, u }) {
  const R = 54, C = 2 * Math.PI * R
  const pct = goal > 0 ? hydration / goal : 0
  const off = C * (1 - Math.min(1, Math.max(0, pct)))
  return (
    <div style={{ position: 'relative', width: 148, height: 148, margin: '4px auto 0' }}>
      <svg viewBox="0 0 128 128" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
        <circle cx="64" cy="64" r={R} fill="none" stroke="var(--sep)" strokeWidth="11" />
        <circle cx="64" cy="64" r={R} fill="none" stroke="var(--teal)" strokeWidth="11" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{fmtNum(toUnit(hydration, u))}</div>
        <div className="small dim" style={{ marginTop: 3 }}>/ {fmtVol(goal, u)}</div>
      </div>
    </div>
  )
}

function DrinkTile({ drink, u, onClick }) {
  return <button onClick={onClick} style={tileStyle}>
    <span style={iconTile}><Icon name={drink.icon} /></span>
    <span className="small" style={{ fontWeight: 600, lineHeight: 1.1, textAlign: 'center' }}>{t(drink.name)}</span>
    <span className="dim" style={{ fontSize: 11 }}>{fmtVol(drink.ml, u)}</span>
  </button>
}

function DrinkSheet({ iso, close }) {
  const [drink, setDrink] = useState(DRINKS[0])
  const u = waterUnit(getS())
  const [v, setV] = useState(toUnit(DRINKS[0].ml, u))
  const ml = fromUnit(v, u)
  const hyd = Math.round(ml * drink.hydration)
  const caf = Math.round((ml / 100) * drink.caf)
  return <>
    <h3>{t('Add a drink')}</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
      {DRINKS.map(d => <button key={d.key} onClick={() => { setDrink(d); setV(toUnit(d.ml, u)) }}
        style={{ ...tileStyle, outline: d.key === drink.key ? '2px solid var(--teal)' : 'none' }}>
        <span style={iconTile}><Icon name={d.icon} /></span>
        <span className="small" style={{ fontWeight: 600, lineHeight: 1.1, textAlign: 'center' }}>{t(d.name)}</span>
      </button>)}
    </div>
    <div className="row cfgrow" style={{ marginBottom: 10 }}><Stepper label={t('Amount')} value={v} step={u === 'oz' ? 1 : 50} decimal={u === 'oz'} onChange={setV} unit={u} /></div>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('{0} hydration', fmtVol(hyd, u))}{caf ? ` · ${caf} mg ${t('caffeine')}` : ''}</div>
    <Button variant="primary" onClick={() => { const n = Math.round(ml); if (n > 0) { logDrink(iso, mkEntry(drink, n)); close(); toast(t('Added {0}', t(drink.name))) } }}>{t('Add')}</Button>
  </>
}
const openDrinkSheet = iso => ui().openSheet(close => <DrinkSheet iso={iso} close={close} />)

function WaterSettings({ close }) {
  const w = getS().nutrition?.water || {}, r = w.reminder || {}
  const [unit, setUnit] = useState(waterUnit(getS()))
  const [goal, setGoal] = useState(toUnit(w.goalMl || 2000, unit))
  const [on, setOn] = useState(!!r.on)
  const [every, setEvery] = useState(r.everyMin || 120)
  const [from, setFrom] = useState(r.from || '09:00')
  const [to, setTo] = useState(r.to || '22:00')
  const save = () => {
    setWaterGoal(fromUnit(goal, unit), unit)
    setWaterReminder({ on, everyMin: Math.max(30, Math.round(every) || 120), from, to })
    close(); toast(t('Saved'))
  }
  return <>
    <h3>{t('Water settings')}</h3>
    <div style={{ margin: '8px 0 12px' }}><Segmented options={[{ value: 'ml', label: 'ml' }, { value: 'oz', label: 'fl oz' }]} value={unit} onChange={nu => { setGoal(toUnit(fromUnit(goal, unit), nu)); setUnit(nu) }} /></div>
    <div className="row cfgrow" style={{ margin: '8px 0' }}><Stepper label={t('Daily goal')} value={goal} step={unit === 'oz' ? 4 : 100} decimal={false} onChange={setGoal} unit={unit} /></div>
    <div className="row between" style={{ padding: '12px 2px' }}><span className="lrow-t">{t('Reminders')}</span><Switch checked={on} onChange={setOn} /></div>
    {on && <>
      <div className="row cfgrow" style={{ margin: '8px 0' }}><Stepper label={t('Every (minutes)')} value={every} step={30} decimal={false} onChange={setEvery} /></div>
      <div className="row cfgrow" style={{ margin: '8px 0' }}>
        <div className="stp-w"><span className="stp-l">{t('From')}</span><input type="time" className="timef" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="stp-w"><span className="stp-l">{t('To')}</span><input type="time" className="timef" value={to} onChange={e => setTo(e.target.value)} /></div>
      </div>
      <div className="dim small" style={{ margin: '2px 2px' }}>{t('Reminders arrive as notifications — turn Notifications on in Settings too.')}</div>
    </>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
  </>
}
const openWaterSettings = () => ui().openSheet(close => <WaterSettings close={close} />)

export default function Water() {
  const S = useStore(s => s.S)
  const w = S.nutrition?.water || {}
  const [iso, setIso] = useState(todayISO())
  const goal = w.goalMl || 2000
  const u = waterUnit(S)
  const entries = normalizeDay(w.log[iso])
  const d = dayWater(entries)
  const days = []
  for (let i = 6; i >= 0; i--) days.push(shift(iso, -i))
  return <>
    <div className="hdr">
      <div><h1>{t('Water')}</h1><div className="sub">{t('Daily hydration')}</div></div>
      <button className="iconbtn" onClick={openWaterSettings} aria-label={t('Water settings')}><Icon name="gear" /></button>
    </div>

    <div className="row between" style={{ marginBottom: 14 }}>
      <button className="iconbtn" onClick={() => setIso(shift(iso, -1))} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
      <button className="chip" style={{ minWidth: 130 }} onClick={() => setIso(todayISO())}>{iso === todayISO() ? t('Today') : fmtDate(iso, true)}</button>
      <button className="iconbtn" onClick={() => setIso(shift(iso, 1))} disabled={iso >= todayISO()} aria-label={t('Next day')}><Icon name="chevronRight" /></button>
    </div>

    <div className="card">
      <WaterRing hydration={d.hydration} goal={goal} u={u} />
      <div className="row" style={{ justifyContent: 'center', gap: 22, margin: '12px 0 14px' }}>
        <div style={{ textAlign: 'center' }}><div className="stat-v" style={{ fontSize: 18 }}>{fmtNum(toUnit(d.ml, u))}</div><div className="small dim">{t('{0} total', u)}</div></div>
        <div style={{ textAlign: 'center' }}><div className="stat-v" style={{ fontSize: 18 }}>{fmtNum(d.caffeine)}</div><div className="small dim">{t('mg caffeine')}</div></div>
      </div>
      <div className="row between">
        <span className="muted small">{d.hydration >= goal ? t('Goal reached — nice.') : t('{0} to go', fmtVol(Math.max(0, goal - d.hydration), u))}</span>
        <button className="chip" onClick={openWaterSettings}>{t('Goal: {0}', fmtVol(goal, u))}</button>
      </div>
    </div>

    <div className="card">
      <h2 style={{ marginBottom: 10 }}>{t('Add a drink')}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {TILE_DRINKS.map(dr => <DrinkTile key={dr.key} drink={dr} u={u} onClick={() => { logDrink(iso, mkEntry(dr, dr.ml)); toast(t('Added {0}', t(dr.name))) }} />)}
        <button onClick={() => openDrinkSheet(iso)} style={tileStyle}>
          <span style={iconTile}><Icon name="plus" /></span>
          <span className="small" style={{ fontWeight: 600 }}>{t('More')}</span>
          <span className="dim" style={{ fontSize: 11 }}>{t('custom')}</span>
        </button>
      </div>
    </div>

    {entries.length > 0 && <div className="card">
      <h2 style={{ marginBottom: 6 }}>{t('Today’s drinks')}</h2>
      <div className="list">
        {entries.map((e, i) => <div key={i} className="item">
          <span className="lrow-i" style={{ color: 'var(--teal)' }}><Icon name={e.icon || 'glass'} /></span>
          <div className="grow"><div className="tt">{t(e.name || 'Water')}</div><div className="ss">{fmtVol(e.ml, u)}{e.caf ? ` · ${Math.round((e.ml / 100) * e.caf)} mg` : ''}</div></div>
          <button className="iconbtn" style={{ color: 'var(--red)' }} onClick={() => removeDrinkAt(iso, i)} aria-label={t('Remove')}><Icon name="trash" /></button>
        </div>)}
      </div>
    </div>}

    <div className="card">
      <h2>{t('Last 7 days')}</h2>
      {days.map(day => {
        const dw = dayWater(w.log[day])
        const p = goal > 0 ? Math.min(100, Math.round((dw.hydration / goal) * 100)) : 0
        return <div key={day} className="mrow">
          <span className="nm" style={{ minWidth: 70 }}>{day === todayISO() ? t('Today') : fmtDate(day)}</span>
          <span className="bar"><i style={{ width: p + '%', background: 'var(--teal)' }} /></span>
          <span className="v">{fmtVol(dw.hydration, u)}</span>
        </div>
      })}
    </div>
  </>
}
