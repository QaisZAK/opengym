// Google Drive progress photos — client-only. An access token (drive.file scope: the app only
// ever sees files it created) is obtained in the browser via Google Identity Services and kept in
// memory. It is NEVER sent to or stored on the openGym server. Photos live in the user's own
// Drive; app state stores only the Drive file id. The instance's OAuth client id comes from
// GET /api/config (config.google.clientId); without it the whole feature stays hidden.
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER = 'openGym Progress'

let gisPromise = null
let token = null
let tokenExp = 0

export const driveConfigured = config => !!config?.google?.clientId

function loadGis() {
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    const s = document.createElement('script')
    s.src = GIS_SRC; s.async = true; s.defer = true
    s.onload = () => resolve()
    s.onerror = () => { gisPromise = null; reject(new Error('Could not load Google sign-in')) }
    document.head.appendChild(s)
  })
  return gisPromise
}

// prompt: 'consent' for the first connect (shows the picker), '' to refresh silently afterwards.
async function requestToken(clientId, prompt) {
  await loadGis()
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      prompt,
      callback: r => {
        if (r.error) return reject(new Error(r.error))
        token = r.access_token
        tokenExp = Date.now() + ((+r.expires_in || 3600) - 60) * 1000
        resolve(token)
      },
      error_callback: e => reject(new Error(e?.type || 'authorization failed'))
    })
    client.requestAccessToken()
  })
}

async function validToken(clientId) {
  if (token && Date.now() < tokenExp) return token
  return requestToken(clientId, '')
}

// First-time connect — always shows Google's consent/account picker. Throws if the user declines.
export async function connectDrive(clientId) {
  await requestToken(clientId, 'consent')
  return true
}
export function disconnectDrive() {
  try { if (token && window.google?.accounts?.oauth2?.revoke) window.google.accounts.oauth2.revoke(token) } catch { /* best effort */ }
  token = null; tokenExp = 0
}

// Find (or create) the app's Drive folder. Pass the cached id to skip the lookup; returns the id
// the caller should persist (in S.google.folderId).
export async function ensureFolder(clientId, cachedId) {
  const t = await validToken(clientId)
  if (cachedId) return cachedId
  const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${FOLDER}' and trashed=false`)
  const found = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, { headers: { Authorization: 'Bearer ' + t } }).then(r => r.json())
  if (found.files && found.files[0]) return found.files[0].id
  const made = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' })
  }).then(r => r.json())
  return made.id
}

export async function uploadPhoto(clientId, folderId, blob, name) {
  const t = await validToken(clientId)
  const meta = { name, ...(folderId ? { parents: [folderId] } : {}) }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
  form.append('file', blob)
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { Authorization: 'Bearer ' + t }, body: form
  })
  if (!r.ok) throw new Error('upload failed (' + r.status + ')')
  return (await r.json()).id
}

// Fetch a stored photo's bytes with the token and hand back an object URL (revoke it after use).
export async function photoUrl(clientId, fileId) {
  const t = await validToken(clientId)
  const r = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', { headers: { Authorization: 'Bearer ' + t } })
  if (!r.ok) throw new Error('could not load photo (' + r.status + ')')
  return URL.createObjectURL(await r.blob())
}

// Downscale + JPEG-compress a picked photo before upload (no dependency — canvas only).
export function resizeImage(file, max = 1080, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d').drawImage(img, 0, 0, w, h)
      cv.toBlob(b => (b ? resolve(b) : reject(new Error('could not process image'))), 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')) }
    img.src = url
  })
}
