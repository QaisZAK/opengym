// Water tracking — its own tab/module. Data lives under nutrition.water (synced + backed up like
// everything else); this view owns it end to end so it works whether or not calorie tracking is on.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { fmtNum, fmtDate, todayISO, isoOf, localTZ } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button, Stepper, Switch } from '../components/ui.jsx'

const getS = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)
const shift = (iso, d) => { const dt = new Date(iso + 'T12:00:00'); dt.setDate(dt.getDate() + d); return isoOf(dt) }

// Fill the water namespace defensively (the store overlay is shallow, and older states predate it).
function ensureWater(s) {
  const n = s.nutrition = s.nutrition || {}
  const w = n.water = n.water || {}
  w.goalMl = w.goalMl || 2000; w.log = w.log || {}
  w.reminder = w.reminder || { on: false, everyMin: 120, from: '09:00', to: '22:00', tz: null }
  return w
}
const addWater = (iso, ml) => update(s => { const w = ensureWater(s); w.log[iso] = Math.max(0, (w.log[iso] || 0) + ml) })
const setWaterGoal = ml => update(s => { const w = ensureWater(s); w.goalMl = Math.max(0, Math.round(ml) || 0) })
const setWaterReminder = patch => update(s => { const w = ensureWater(s); w.reminder = { ...w.reminder, ...patch, tz: localTZ() } })

function WaterRing({ ml, goal }) {
  const R = 54, C = 2 * Math.PI * R
  const pct = goal > 0 ? ml / goal : 0
  const off = C * (1 - Math.min(1, Math.max(0, pct)))
  return (
    <div style={{ position: 'relative', width: 148, height: 148, margin: '4px auto 0' }}>
      <svg viewBox="0 0 128 128" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
        <circle cx="64" cy="64" r={R} fill="none" stroke="var(--sep)" strokeWidth="11" />
        <circle cx="64" cy="64" r={R} fill="none" stroke="var(--teal)" strokeWidth="11" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{fmtNum(ml)}</div>
        <div className="small dim" style={{ marginTop: 3 }}>/ {fmtNum(goal)} ml</div>
      </div>
    </div>
  )
}

function WaterAdd({ iso, close }) {
  const [ml, setMl] = useState(300)
  return <>
    <h3>{t('Add water')}</h3>
    <div className="row cfgrow" style={{ margin: '8px 0 14px' }}><Stepper label={t('Millilitres')} value={ml} step={50} decimal={false} onChange={setMl} unit="ml" /></div>
    <Button variant="primary" onClick={() => { const n = Math.round(ml); if (n > 0) { addWater(iso, n); close(); toast(t('Added {0} ml', n)) } }}>{t('Add')}</Button>
  </>
}
const openWaterAdd = iso => ui().openSheet(close => <WaterAdd iso={iso} close={close} />)

function WaterSettings({ close }) {
  const w = getS().nutrition?.water || {}, r = w.reminder || {}
  const [goal, setGoal] = useState(w.goalMl || 2000)
  const [on, setOn] = useState(!!r.on)
  const [every, setEvery] = useState(r.everyMin || 120)
  const [from, setFrom] = useState(r.from || '09:00')
  const [to, setTo] = useState(r.to || '22:00')
  const save = () => {
    setWaterGoal(goal)
    setWaterReminder({ on, everyMin: Math.max(30, Math.round(every) || 120), from, to })
    close(); toast(t('Saved'))
  }
  return <>
    <h3>{t('Water settings')}</h3>
    <div className="row cfgrow" style={{ margin: '8px 0' }}><Stepper label={t('Daily goal (ml)')} value={goal} step={100} decimal={false} onChange={setGoal} unit="ml" /></div>
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
  const ml = (w.log && w.log[iso]) || 0
  const goal = w.goalMl || 2000
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
      <WaterRing ml={ml} goal={goal} />
      <div className="row between" style={{ margin: '10px 2px 14px' }}>
        <span className="muted small">{ml >= goal ? t('Goal reached — nice.') : t('{0} ml to go', fmtNum(Math.max(0, goal - ml)))}</span>
        <button className="chip" onClick={openWaterSettings}>{t('Goal: {0} ml', fmtNum(goal))}</button>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" icon="plus" onClick={() => addWater(iso, 250)}>250 ml</Button>
        <Button size="sm" icon="plus" onClick={() => addWater(iso, 500)}>500 ml</Button>
        <Button size="sm" onClick={() => openWaterAdd(iso)}>{t('Custom')}</Button>
        {ml > 0 && <Button size="sm" variant="ghost" className="dim" icon="reset" onClick={() => addWater(iso, -250)}>{t('Undo')}</Button>}
      </div>
    </div>

    <div className="card">
      <h2>{t('Last 7 days')}</h2>
      {days.map(d => {
        const v = (w.log && w.log[d]) || 0
        const p = goal > 0 ? Math.min(100, Math.round((v / goal) * 100)) : 0
        return <div key={d} className="mrow">
          <span className="nm" style={{ minWidth: 70 }}>{d === todayISO() ? t('Today') : fmtDate(d)}</span>
          <span className="bar"><i style={{ width: p + '%', background: 'var(--teal)' }} /></span>
          <span className="v">{fmtNum(v)} ml</span>
        </div>
      })}
    </div>
  </>
}
