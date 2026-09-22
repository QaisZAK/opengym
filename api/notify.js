// Notification rules shared by the server's reminder loops. Pure — tested in test/notify.test.js.
// Settings live in the user's state as S.notify = { quiet: { on, from, to }, snoozeUntil,
// weight: { on, time }, streak: { on } }; any of it may be missing on older profiles.

// Is hh:mm inside a quiet window? Windows may wrap midnight (22:00 → 07:00).
export function inQuiet(hhmm, quiet) {
  if (!quiet?.on || !quiet.from || !quiet.to || quiet.from === quiet.to) return false;
  return quiet.from < quiet.to ? hhmm >= quiet.from && hhmm < quiet.to : hhmm >= quiet.from || hhmm < quiet.to;
}

// Should scheduled reminders stay silent right now? (Rest-timer alerts and Coach results are
// replies to something the user just did, so the loops only call this for reminders.)
export function muted(S, hhmm, nowMs = Date.now()) {
  const n = S?.notify;
  return !!(n && ((n.snoozeUntil && n.snoozeUntil > nowMs) || inQuiet(hhmm, n.quiet)));
}

// Monday-based ISO week start (YYYY-MM-DD) for a date string.
const weekStart = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

// Streak at risk: it's Sunday, you trained last week, and nothing is logged this week yet.
export function streakAtRisk(workouts, today) {
  if (new Date(today + 'T12:00:00Z').getUTCDay() !== 0) return false;
  const thisWk = weekStart(today);
  const d = new Date(thisWk + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7);
  const lastWk = d.toISOString().slice(0, 10);
  const weeks = new Set((workouts || []).map(w => weekStart(w.d)));
  return weeks.has(lastWk) && !weeks.has(thisWk);
}
