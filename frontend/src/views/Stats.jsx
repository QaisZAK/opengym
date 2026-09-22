import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { EXIDX } from '../lib/exercises.js'
import { lastBW, streakWeeks, setLabel, modeOf, effortOf, isWork } from '../lib/history.js'
import { fmtNum, fmtDate, fmtVol, todayISO, weekKey } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { bwSheet, goalSheet, calendarSheet, workoutDetailSheet, WorkoutRow, bwDeltaColor } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Heatmap from '../components/Heatmap.jsx'
import Icon from '../components/Icon.jsx'
import BodyMap, { BodyMapLegend } from '../components/BodyMap.jsx'
import { loadOfWorkouts, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import { e1rmSeries, best1RM } from '../lib/onerm.js'
import {
  hasEffort, displayScale, scaleName, toScale, avgRir, effortSummary, effortWeeks,
  effortHistogram, isHardSet, HARD_RIR
} from '../lib/effort.js'
import { Button, Segmented, SelectRow } from '../components/ui.jsx'
import { dayTotals } from '../lib/nutrition.js'
import { recordsOf } from '../lib/records.js'
import { workoutsCSV, bodyweightCSV, nutritionCSV } from '../lib/export.js'
import { MOBILE, shareExport } from '../lib/mobile.js'
import { useUI } from '../store/useUI.js'

// Which muscles the training in a window actually hit — and, the point of the card,
// which ones it keeps missing. Shading is relative within the window (lib/muscles.js).
function MuscleBalance({ S }) {
  const [win, setWin] = useState(7)
  const [hard, setHard] = useState(false)
  const [sel, setSel] = useState(null)
  const now = Date.now()
  const inWin = S.workouts.filter(w =>
    win === 0 ? true
      : win === 7 ? weekKey(w.d) === weekKey(todayISO())
        : (w.start || new Date(w.d).getTime()) > now - win * 86400000)
  // Counting only the sets taken near failure turns the map from "where did the volume go"
  // into "where did the stimulus go" — a muscle can lead on sets and still never be trained
  // hard. Offered only when the window holds ratings at all, since with none the hard map
  // would just be empty and read as "you trained nothing".
  const rated = inWin.some(w => w.entries.some(e => e.sets.some(s => s.done && isHardSet(s))))
  const on = hard && rated
  const load = loadOfWorkouts(inWin, on ? isHardSet : null)
  const { worked, missed } = rankOf(load)
  const top = worked.slice(0, 4)
  const max = worked.length ? load[worked[0]] : 0
  const sets = m => Math.round((load[m] || 0) * 10) / 10

  return <div className="card">
    <div className="row between" style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0 }}>{t('Muscle balance')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {on ? t('by hard sets') : t('by sets worked')}</span></h2>
      {rated && <Button size="sm" icon="flame" style={on ? { color: 'var(--yellow)' } : undefined}
        onClick={() => { setHard(h => !h); setSel(null) }}>{on ? t('Hard') : t('All')}</Button>}
    </div>
    <Segmented className="seg-range" value={win} onChange={v => { setWin(v); setSel(null) }}
      options={[{ value: 7, label: t('Week') }, { value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 0, label: t('All') }]} />
    {inWin.length ? <>
      <BodyMap className="tappable" load={load} body={S.body} selected={sel}
        onMuscle={m => setSel(s => (s === m ? null : m))} />
      <BodyMapLegend />
      {sel && <div className="mrow" style={{ borderTop: 'var(--hair) solid var(--sep)', marginTop: 4, paddingTop: 10 }}>
        <span className="nm"><b>{t(MUSCLE_NAME[sel])}</b></span>
        <span className="v">{sets(sel) ? t('{0} sets', sets(sel)) : on ? t('no hard sets') : t('not trained')}</span>
      </div>}
      {!sel && top.map(m => <div key={m} className="mrow">
        <span className="nm">{t(MUSCLE_NAME[m])}</span>
        <span className="bar"><i style={{ width: Math.round(load[m] / max * 100) + '%', background: on ? 'var(--yellow)' : undefined }} /></span>
        <span className="v">{t('{0} sets', sets(m))}</span>
      </div>)}
      {missed.length > 0 && <>
        <h4 className="sec" style={{ marginTop: 12 }}>{on ? t('No hard sets in this period') : t('Not trained in this period')}</h4>
        <div className="mchips">{missed.map(m => <span key={m} className="mchip miss">{t(MUSCLE_NAME[m])}</span>)}</div>
      </>}
      {!missed.length && worked.length > 0 &&
        <div className="muted small" style={{ marginTop: 10 }}>{on
          ? t('Every muscle group got at least one hard set in this period.')
          : t('Every muscle group got some work in this period.')}</div>}
    </> : <div className="muted small">{t('No workouts in this period yet.')}</div>}
  </div>
}

// How hard the training was — the half of the picture a volume chart cannot show. Everything
// is computed in RIR (lib/effort.js) and converted to whichever scale this profile reads.
// Every number carries how much of the training it speaks for: rating is optional and off by
// default, so a partly rated history is the normal case, and an average without its
// denominator would quietly speak for sets that were never rated.
function EffortCard({ S }) {
  const [win, setWin] = useState(90)
  const kind = displayScale(S)
  const hd = scaleName(kind)
  const sum = effortSummary(S, win)
  const weeks = effortWeeks(S, win)
  const hist = effortHistogram(S, win)
  const maxBin = Math.max(1, ...hist.map(b => b.n))
  // The week's set count rides along in the tooltip, because the pair is the reading:
  // volume up with effort up is fatigue piling up, volume up with effort flat is adaptation.
  const pts = weeks.map(w => ({ t: w.t, y: toScale(kind, w.rir), note: t('{0} sets', w.sets) }))
  // Bins run hardest-first in both scales: RIR 0 and RPE 10 are the same set.
  const binLabel = b => kind === 'rpe' ? (b.tail ? '≤ 6' : String(10 - b.rir)) : (b.tail ? b.rir + '+' : String(b.rir))

  return <div className="card">
    <h2>{t('Effort')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {t('how close to failure')}</span></h2>
    <Segmented className="seg-range" value={win} onChange={setWin}
      options={[{ value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
    {sum.rated === 0 ? <div className="muted small">{t('No rated sets in this period.')}</div> : <>
      <div className="row between" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div>
          <div className="stat-v">{sum.avg == null ? '—' : fmtNum(toScale(kind, sum.avg)) + ' ' + hd}</div>
          <div className="small dim">{t('average effort')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="stat-v" style={{ color: 'var(--yellow)' }}>{sum.hardPct == null ? '—' : Math.round(sum.hardPct * 100) + '%'}</div>
          <div className="small dim">{t('at {0} {1} or harder', hd, fmtNum(toScale(kind, HARD_RIR)))}</div>
        </div>
      </div>
      <div className="small dim" style={{ marginTop: 8 }}>{t('{0} of {1} finished sets rated', sum.rated, sum.done)}</div>
      {effortOf(S) === 'none' && <div className="small" style={{ color: 'var(--yellow)', marginTop: 4 }}>
        {t('Effort per set is switched off — turn it on in Settings to keep rating.')}
      </div>}
      {pts.length > 1 && <>
        <h4 className="sec" style={{ marginTop: 12 }}>{t('Week by week')}</h4>
        <div className="chart"><LineChart points={pts} h={140} unit={hd} color="var(--yellow)" invert={kind === 'rir'} /></div>
      </>}
      <h4 className="sec" style={{ marginTop: 12 }}>{t('Where the sets land')}</h4>
      {hist.map(b => <div key={b.rir} className="mrow">
        <span className="nm">{hd} {binLabel(b)}</span>
        <span className="bar"><i style={{ width: Math.round(b.n / maxBin * 100) + '%', background: b.rir <= HARD_RIR ? 'var(--yellow)' : 'var(--label-3)' }} /></span>
        <span className="v">{b.n ? b.n + ' · ' + Math.round(b.pct * 100) + '%' : '—'}</span>
      </div>)}
      <div className="small dim" style={{ marginTop: 8 }}>
        {t('Most working sets belong close to failure without living there — half at the floor and half at the top average out to a healthy-looking middle.')}
      </div>
    </>}
  </div>
}

// Calorie / protein trend, alongside the body-weight chart. Only shown once nutrition is on;
// each point is one logged day, drawn against the daily target as the goal line.
function NutritionCard({ S }) {
  const [range, setRange] = useState(90)
  const [metric, setMetric] = useState('kcal')
  const now = Date.now()
  const log = S.nutrition?.log || {}
  const tg = S.nutrition?.targets || {}
  const pts = Object.keys(log)
    .filter(d => (log[d] || []).length)
    .map(d => { const tot = dayTotals(log[d]); return { t: new Date(d + 'T12:00:00').getTime(), y: metric === 'kcal' ? tot.kcal : tot.protein, d } })
    .filter(p => range === 0 || p.t > now - range * 86400000)
    .sort((a, b) => a.t - b.t)
  const goal = metric === 'kcal' ? (tg.kcal || null) : (tg.protein || null)
  return <div className="card">
    <h2>{t('Nutrition')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {metric === 'kcal' ? t('calories') : t('protein')}</span></h2>
    <Segmented className="seg-range" value={metric} onChange={setMetric} options={[{ value: 'kcal', label: t('Calories') }, { value: 'protein', label: t('Protein') }]} />
    <div style={{ height: 8 }} />
    <Segmented className="seg-range" value={range} onChange={setRange}
      options={[{ value: 30, label: '1M' }, { value: 90, label: '3M' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
    {pts.length ? <div className="chart"><LineChart points={pts} h={160} unit={metric === 'kcal' ? 'kcal' : 'g'} goal={goal} color={metric === 'kcal' ? 'var(--orange)' : 'var(--blue)'} /></div>
      : <div className="muted small" style={{ marginTop: 10 }}>{t('Log some meals to see your trend.')}</div>}
  </div>
}

// Stats = the analytics hub: all charts, progress and history live here.
// Hand a text/image file to the user: the native build shares it, the web downloads it.
async function saveFile(blobOrText, name, type) {
  if (MOBILE && typeof blobOrText === 'string') { try { await shareExport(blobOrText, name) } catch { /* dismissed */ } return }
  const blob = typeof blobOrText === 'string' ? new Blob([blobOrText], { type }) : blobOrText
  const file = new File([blob], name, { type })
  if (navigator.canShare?.({ files: [file] }) && type.startsWith('image/')) { try { await navigator.share({ files: [file] }); return } catch { /* fall back to download */ } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
}

// A 1080×1080 summary card (totals + top lifts) drawn on a canvas, for sharing.
function summaryImage(S) {
  const c = document.createElement('canvas'); c.width = c.height = 1080
  const g = c.getContext('2d'), acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#a3e635'
  g.fillStyle = '#0c0e12'; g.fillRect(0, 0, 1080, 1080)
  g.fillStyle = acc; g.font = '700 64px system-ui, sans-serif'; g.fillText('openGym', 80, 150)
  g.fillStyle = '#9ca3af'; g.font = '400 36px system-ui, sans-serif'; g.fillText(fmtDate(todayISO(), true), 80, 205)
  const stat = (x, y, v, l) => { g.fillStyle = '#fff'; g.font = '700 110px system-ui, sans-serif'; g.fillText(String(v), x, y); g.fillStyle = '#9ca3af'; g.font = '400 34px system-ui, sans-serif'; g.fillText(l, x, y + 50) }
  stat(80, 400, S.workouts.length, t('workouts'))
  stat(560, 400, streakWeeks(S), t('week streak'))
  const top = Object.entries(recordsOf(S.workouts)).filter(([id, r]) => EXIDX[id] && r.weight).sort((a, b) => b[1].weight.v - a[1].weight.v).slice(0, 4)
  g.fillStyle = acc; g.font = '600 40px system-ui, sans-serif'; g.fillText(t('Top lifts'), 80, 580)
  top.forEach(([id, r], i) => {
    const y = 660 + i * 90, nm = EXIDX[id].n
    g.fillStyle = '#fff'; g.font = '500 40px system-ui, sans-serif'; g.fillText(nm.length > 26 ? nm.slice(0, 25) + '…' : nm, 80, y)
    g.textAlign = 'right'; g.fillText(`${fmtNum(r.weight.v)} ${S.unit}`, 1000, y); g.textAlign = 'left'
  })
  return new Promise(res => c.toBlob(res, 'image/png'))
}

function ExportSheet({ S }) {
  const d = todayISO()
  return <>
    <h3>{t('Export & share')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('CSV opens in any spreadsheet. The full backup (all data) lives in Settings.')}</div>
    <div className="list">
      <div className="item" onClick={() => saveFile(workoutsCSV(S), `opengym-workouts-${d}.csv`, 'text/csv')}><span className="lrow-i"><Icon name="dumbbell" /></span><div className="grow"><div className="tt">{t('Workouts (CSV)')}</div><div className="ss">{t('One row per set')}</div></div><Icon name="download" className="chev" /></div>
      <div className="item" onClick={() => saveFile(bodyweightCSV(S), `opengym-bodyweight-${d}.csv`, 'text/csv')}><span className="lrow-i"><Icon name="scale" /></span><div className="grow"><div className="tt">{t('Body weight (CSV)')}</div></div><Icon name="download" className="chev" /></div>
      {S.nutrition?.on && <div className="item" onClick={() => saveFile(nutritionCSV(S), `opengym-nutrition-${d}.csv`, 'text/csv')}><span className="lrow-i"><Icon name="flame" /></span><div className="grow"><div className="tt">{t('Nutrition (CSV)')}</div></div><Icon name="download" className="chev" /></div>}
      <div className="item" onClick={async () => saveFile(await summaryImage(S), `opengym-summary-${d}.png`, 'image/png')}><span className="lrow-i"><Icon name="trophy" /></span><div className="grow"><div className="tt">{t('Share a summary image')}</div><div className="ss">{t('Workouts, streak and top lifts')}</div></div><Icon name="upload" className="chev" /></div>
    </div>
  </>
}

// All-time bests per exercise, most recently improved first.
function RecordsCard({ S }) {
  const [all, setAll] = useState(false)
  const recs = Object.entries(recordsOf(S.workouts)).filter(([id, r]) => EXIDX[id] && Object.keys(r).length) // cardio has none
    .map(([id, r]) => ({ id, r, last: Math.max(...Object.values(r).map(x => +new Date(x.d) || 0)) }))
    .sort((a, b) => b.last - a.last)
  if (!recs.length) return null
  const chip = (label, x, v) => x && <span className="tag nocap" title={fmtDate(x.d, true)}>{label} <b>{v}</b></span>
  return <div className="card">
    <h2>{t('Records')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {t('all-time bests')}</span></h2>
    {(all ? recs : recs.slice(0, 6)).map(({ id, r }) => <div key={id} style={{ padding: '8px 0', borderBottom: 'var(--hair) solid var(--sep)' }}>
      <div className="capitalize" style={{ fontWeight: 600, marginBottom: 5 }}>{EXIDX[id].n}</div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {chip(t('Top'), r.weight, `${fmtNum(r.weight?.v)} ${S.unit}`)}
        {chip(t('1RM≈'), r.e1rm, `${fmtNum(r.e1rm?.v)} ${S.unit}`)}
        {chip(t('Reps'), r.reps, `${r.reps?.v}${r.reps?.w ? ' @ ' + fmtNum(r.reps.w) : ''}`)}
        {chip(t('Volume'), r.volume, fmtVol(r.volume?.v, S.unit))}
        {chip(t('Hold'), r.hold, `${r.hold?.v}s`)}
      </div>
    </div>)}
    {recs.length > 6 && <Button size="sm" variant="ghost" style={{ marginTop: 8 }} onClick={() => setAll(!all)}>{all ? t('Show less') : t('Show all {0}', recs.length)}</Button>}
  </div>
}

export default function Stats() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [range, setRange] = useState(90)
  const [exId, setExId] = useState(null)
  const [exMetric, setExMetric] = useState('top')
  const now = Date.now()
  const anyEffort = hasEffort(S)
  const kind = displayScale(S)
  const hd = scaleName(kind)

  const bwPts = S.bodyweight.filter(b => range === 0 || (b.t || new Date(b.d).getTime()) > now - range * 86400000)
    .map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))
  const bw30 = S.bodyweight.filter(b => (b.t || new Date(b.d).getTime()) > now - 30 * 86400000)
  const bwDelta30 = bw30.length > 1 ? bw30[bw30.length - 1].w - bw30[0].w : null
  const monthW = S.workouts.filter(w => w.d.slice(0, 7) === todayISO().slice(0, 7)).length

  const exHist = [...new Set(S.workouts.flatMap(w => w.entries.map(e => e.id)))].filter(id => EXIDX[id]).sort((a, b) => EXIDX[a].n < EXIDX[b].n ? -1 : 1)
  const curEx = exId && exHist.includes(exId) ? exId : exHist[0] || null
  // How this exercise was logged most recently decides what the curve means: top weight,
  // longest hold or top speed. Sets logged in another mode lack the field and score 0, so a
  // switched exercise drops its old points instead of mixing seconds into a weight chart.
  const curMode = curEx ? (() => {
    for (let i = S.workouts.length - 1; i >= 0; i--) {
      const en = S.workouts[i].entries.find(e => e.id === curEx)
      if (en) return modeOf({ ...(en.target || {}), id: curEx })
    }
    return modeOf({ id: curEx })
  })() : 'reps'
  const curCardio = curMode === 'cardio'
  const curTimed = curMode === 'time'
  const metric = s => curCardio ? (s.speed || 0) : curTimed ? (s.sec || 0) : (s.w || 0)
  const exUnit = curCardio ? 'km/h' : curTimed ? 's' : S.unit
  let exPts = [], exList = [], exBest = 0
  if (curEx) {
    S.workouts.forEach(w => {
      const en = w.entries.find(e => e.id === curEx)
      if (en) { const mx = Math.max(0, ...en.sets.filter(isWork).map(metric), curCardio || curTimed ? 0 : (en.topW || 0)); if (mx > 0) { exPts.push({ t: w.start, y: mx, d: w.d, sets: en.sets.filter(isWork), target: en.target }); if (mx > exBest) exBest = mx } }
    })
    exList = exPts.slice(-5).reverse()
  }
  // Estimated 1RM (issue #18) — only reps-mode training produces one, so cardio and timed
  // work simply have no points and the toggle stays hidden.
  const e1Pts = curEx ? e1rmSeries(S, curEx) : []
  const e1Best = curEx ? best1RM(S, curEx) : null
  const showE1 = e1Pts.length > 0
  // Effort on this exercise, per session. It rides on the top-set curve as well as having a
  // curve of its own, because the two only mean something together: the same weight moved
  // with more left in the tank is progress a weight-only chart draws as a flat line.
  const exRir = exPts.map(p => avgRir(p.sets))
  const showEff = exRir.filter(v => v != null).length >= 3
  const effPts = exPts.map((p, i) => (exRir[i] == null ? null : { t: p.t, y: toScale(kind, exRir[i]), d: p.d })).filter(Boolean)
  const onE1 = showE1 && exMetric === 'e1rm'
  const onEff = showEff && exMetric === 'effort'
  const topPts = exPts.map((p, i) => ({
    t: p.t, y: p.y, d: p.d,
    // 0 RIR (nothing left) is a full dot, 4+ a faint one; unrated sessions keep the plain line.
    m: exRir[i] == null ? null : 1 - Math.min(4, Math.max(0, exRir[i])) / 4,
    note: exRir[i] == null ? undefined : hd + ' ' + fmtNum(toScale(kind, exRir[i]))
  }))
  const exOpts = [{ value: 'top', label: t('Top set') }]
  if (showE1) exOpts.push({ value: 'e1rm', label: t('Est. 1RM') })
  if (showEff) exOpts.push({ value: 'effort', label: t('Effort') })

  return <>
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('Stats')}</h1><div className="sub">{t('Progress & history')}</div></div>
      <button className="iconbtn" onClick={() => useUI.getState().openSheet(() => <ExportSheet S={S} />)} aria-label={t('Export & share')}><Icon name="download" /></button>
      <button className="iconbtn" style={{ marginLeft: 6 }} onClick={() => nav('/history')} aria-label={t('History')}><Icon name="history" /></button>
    </div>

    <div className="tiles">
      <div className="tile"><div className="l"><Icon name="dumbbell" />{t('Workouts')}</div><div className="v">{S.workouts.length}</div></div>
      <div className="tile"><div className="l"><Icon name="calendar" />{t('This month')}</div><div className="v">{monthW}</div></div>
      <div className="tile"><div className="l"><Icon name="flame" />{t('Week streak')}</div><div className="v">{streakWeeks(S)}</div></div>
      <div className="tile"><div className="l"><Icon name="scale" />{t('Weight 30d')}</div><div className="v" style={{ fontSize: 22, color: bwDelta30 === null ? 'inherit' : bwDeltaColor(bwDelta30, (lastBW(S) || {}).w || 0) }}>{bwDelta30 === null ? '—' : (bwDelta30 > 0 ? '+' : '') + fmtNum(bwDelta30) + ' ' + S.unit}</div></div>
    </div>

    <div className="card">
      <h2>{t('Activity — last 12 months')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {t('by time trained')}</span></h2>
      <Heatmap S={S} onDay={iso => { const ws = S.workouts.filter(w => w.d === iso); if (ws.length === 1) workoutDetailSheet(ws[0]); else if (ws.length) calendarSheet(iso) }} />
    </div>

    {S.workouts.length > 0 && <MuscleBalance S={S} />}
    {anyEffort && <EffortCard S={S} />}

    <div className="cols">
      <div className="card">
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>{t('Body weight')}</h2>
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" icon="target" style={S.targetW ? { color: 'var(--yellow)' } : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
            <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
          </div>
        </div>
        <Segmented className="seg-range" value={range} onChange={setRange}
          options={[{ value: 30, label: '1M' }, { value: 90, label: '3M' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
        <div className="chart"><LineChart points={bwPts} h={160} unit={S.unit} goal={S.targetW} /></div>
      </div>

      <div className="card">
        <h2>{t('Exercise progress')}</h2>
        {exHist.length ? <>
          <div className="sect-b" style={{ marginBottom: 10 }}>
            <SelectRow title={t('Exercise')} sheetTitle={t('Exercise progress')} value={curEx} onChange={setExId}
              options={exHist.map(id => ({ value: id, label: EXIDX[id].n }))} />
          </div>
          {exOpts.length > 1 && <Segmented className="seg-range" value={onEff ? 'effort' : onE1 ? 'e1rm' : 'top'} onChange={setExMetric} options={exOpts} />}
          <div className="chart">
            {onEff
              ? <LineChart points={effPts} h={150} unit={hd} color="var(--yellow)" invert={kind === 'rir'} />
              : <LineChart points={onE1 ? e1Pts.map(p => ({ t: p.t, y: p.y, d: p.d })) : topPts} h={150} unit={exUnit} color="var(--blue)" />}
          </div>
          <div style={{ marginTop: 8 }}>{exList.map((p, i) => <div key={i} className="row between small" style={{ padding: '6px 0', borderBottom: 'var(--hair) solid var(--sep)' }}>
            <span className="muted">{fmtDate(p.d, true)}</span><span>{p.sets.map(s => setLabel(curEx, s, p.target)).join('  ')}</span></div>)}</div>
          <div className="small dim" style={{ marginTop: 8 }}>
            {onEff ? t('Average effort per workout') : onE1 ? t('Estimated 1RM per workout') : curCardio ? t('Top speed per workout') : curTimed ? t('Longest hold per workout') : t('Best set weight per workout')}
            {onEff ? '' : <> · {t('Best:')}{' '}<b className="accent">{fmtNum(onE1 ? e1Best.est : exBest)} {onE1 ? S.unit : exUnit}</b></>}
          </div>
          {onE1 && <div className="small dim" style={{ marginTop: 4 }}>
            {t('Best estimate from {0} on {1} — an estimate, not a tested max.', fmtNum(e1Best.w) + ' ' + S.unit + ' × ' + e1Best.r, fmtDate(e1Best.d, true))}
          </div>}
          {!onEff && !onE1 && showEff && <div className="small dim" style={{ marginTop: 4 }}>
            {t('A fuller dot means less left in the tank — the same weight at a lower {0} is progress the line alone does not show.', hd)}
          </div>}
        </> : <div className="muted small">{t('Finish your first workout to see progress curves here.')}</div>}
      </div>
    </div>

    <RecordsCard S={S} />
    {S.nutrition?.on && <NutritionCard S={S} />}

    {S.workouts.length > 0 && <>
      <div className="row between" style={{ marginBottom: 10 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Recent workouts')}</h4>
        <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/history')}>{t('All')} {S.workouts.length}</Button>
      </div>
      <div className="list">{[...S.workouts].reverse().slice(0, 6).map(w => <WorkoutRow key={w.id} w={w} onClick={() => workoutDetailSheet(w)} />)}</div>
    </>}
  </>
}
