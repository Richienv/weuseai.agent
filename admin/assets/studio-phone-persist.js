// Tiny pending/job persist. Callers must write pending BEFORE thumbs.
export const PENDING_KEY = 'weuseai.studio.pending'
export const SNAP_KEY = 'weuseai.studio.jobsnap'

function writeStore(store, key, value) {
  try {
    store.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function readStore(store, key) {
  try {
    return store.getItem(key)
  } catch {
    return null
  }
}

function removeStore(store, key) {
  try { store.removeItem(key) } catch {}
}

function readJson(key) {
  for (const store of [sessionStorage, localStorage]) {
    const raw = readStore(store, key)
    if (!raw) continue
    try { return JSON.parse(raw) } catch {}
  }
  return null
}

function writeBoth(key, value) {
  const raw = JSON.stringify(value)
  writeStore(sessionStorage, key, raw)
  return writeStore(localStorage, key, raw)
}

export function writePending(id) {
  return writeBoth(PENDING_KEY, { id })
}

export function readPending() {
  const data = readJson(PENDING_KEY)
  return data && data.id ? String(data.id) : ''
}

export function clearPending() {
  removeStore(sessionStorage, PENDING_KEY)
  removeStore(localStorage, PENDING_KEY)
}

export function writeJobSnapshot(job) {
  if (!job || !job.id) return
  return writeBoth(SNAP_KEY, {
    id: job.id,
    status: job.status || null,
    error_code: job.error_code || null,
    phase: job.phase || null,
    label: job.label || null,
    updated_at: job.updated_at || null,
    view: job.view || null
  })
}

export function readJobSnapshot() {
  const data = readJson(SNAP_KEY)
  if (!data || !data.id) return null
  return {
    id: data.id,
    status: data.status || null,
    error_code: data.error_code || null,
    phase: data.phase || null,
    label: data.label || null,
    updated_at: data.updated_at || null,
    view: data.view || null
  }
}

export function persistFailed(fn) {
  try {
    return fn() === false
  } catch {
    return true
  }
}
