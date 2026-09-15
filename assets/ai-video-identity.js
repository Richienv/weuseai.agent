import {
  AUDIO_MAX_BYTES, AUDIO_MAX_SECONDS, AUDIO_MIN_SECONDS,
  IMAGE_MAX_BYTES, IMAGE_MAX_RATIO, IMAGE_MAX_SIDE, IMAGE_MIN_RATIO, IMAGE_MIN_SIDE,
  audioKind, audioMime, imageKind, imageMime, inspectAudio, inspectImage, putWithProgress,
} from '/assets/ai-video-identity-media.js'
import {
  CONSENT_VERSION, ERRORS, REASONS,
  callIdentity, capability, exchangeRecovery, isLocalPreviewHost, messageFor, takeRecoveryToken,
} from '/assets/ai-video-identity-api.js'

const WA_NUMBER = '6282154902561'
const POLL_MS = 15_000
const STORE = {
  id: 'ai_video_identity_id',
  step: 'ai_video_identity_step',
  h5: 'ai_video_identity_h5',
  expires: 'ai_video_identity_h5_expires',
  name: 'ai_video_identity_name',
}
const REQUIRED_SLOTS = ['full_body', 'close_up']
const SLOTS = {
  full_body: { label: 'Foto seluruh badan', assetType: 'Image', kind: 'image', empty: 'Belum ada foto' },
  close_up: { label: 'Foto wajah dekat', assetType: 'Image', kind: 'image', empty: 'Belum ada foto' },
  voice: { label: 'Klip suara', assetType: 'Audio', kind: 'audio', empty: 'Belum ada klip' },
}
const STATE_LABEL = { processing: 'Diproses', active: 'Siap', failed: 'Gagal' }
const GATE_TITLE = 'Halaman ini untuk pelanggan yang sudah bayar'

const page = document.querySelector('#identity-page')
const statusLine = document.querySelector('#status-line')
const gate = document.querySelector('#gate')
const gateTitle = document.querySelector('#gate-title')
const gateNote = document.querySelector('#gate-note')
const gateRetry = document.querySelector('#gate-retry')
const gateReceipt = document.querySelector('#gate-receipt')
const stepNodes = [...document.querySelectorAll('.step')]
const stepperItems = [...document.querySelectorAll('#steps li')]
const consentForm = document.querySelector('#consent-form')
const nameInput = document.querySelector('#display-name')
const consentCheck = document.querySelector('#consent-check')
const consentError = document.querySelector('#consent-error')
const consentSubmit = document.querySelector('#consent-submit')
const verifyTimer = document.querySelector('#verify-timer')
const verifyDeadline = document.querySelector('#verify-deadline')
const verifyNote = document.querySelector('#verify-note')
const verifyOpen = document.querySelector('#verify-open')
const verifyCheck = document.querySelector('#verify-check')
const verifyRestart = document.querySelector('#verify-restart')
const quotaNote = document.querySelector('#quota-note')
const uploadNext = document.querySelector('#upload-next')
const assetList = document.querySelector('#asset-list')
const processingRefresh = document.querySelector('#processing-refresh')
const readyName = document.querySelector('#ready-name')
const readyAssets = document.querySelector('#ready-assets')
const readyWa = document.querySelector('#ready-wa')
const revokeBtn = document.querySelector('#revoke-btn')
const localBadge = document.querySelector('#local-badge')

let current = null
let quota = null
let pollTimer = null
let h5Link = sessionStorage.getItem(STORE.h5) || ''
let h5Expires = sessionStorage.getItem(STORE.expires) || ''
const recoveryToken = takeRecoveryToken()

if (isLocalPreviewHost()) {
  localBadge.textContent = 'LOCAL MOCK · BUKAN TRANSAKSI'
  localBadge.hidden = false
}

// ---- UI helpers ----
const setStatus = (text, tone = '') => {
  statusLine.textContent = text || ''
  if (tone) statusLine.dataset.tone = tone
  else delete statusLine.dataset.tone
}

const setBusy = (button, busy, label) => {
  if (!button) return
  button.disabled = busy
  button.setAttribute('aria-busy', busy ? 'true' : 'false')
  if (label !== undefined) {
    if (busy) { button.dataset.label = button.textContent; button.textContent = label }
    else if (button.dataset.label) { button.textContent = button.dataset.label; delete button.dataset.label }
  }
}

const formatTime = (value) => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })
}

const showStep = (step) => {
  const changed = page.dataset.step !== String(step)
  gate.hidden = true
  page.dataset.step = String(step)
  for (const node of stepNodes) node.hidden = Number(node.dataset.step) !== step
  for (const item of stepperItems) {
    const n = Number(item.dataset.step)
    if (n === step) item.setAttribute('aria-current', 'step')
    else item.removeAttribute('aria-current')
    item.dataset.done = n < step ? 'true' : 'false'
  }
  sessionStorage.setItem(STORE.step, String(step))
  if (step !== 4) stopPoll()
  if (!changed) return
  setStatus('')
  const heading = stepNodes.find((node) => Number(node.dataset.step) === step)?.querySelector('.title')
  heading?.focus()
}

const showGate = (note, { retry = false, title = GATE_TITLE } = {}) => {
  stopPoll()
  for (const node of stepNodes) node.hidden = true
  for (const item of stepperItems) { item.removeAttribute('aria-current'); item.dataset.done = 'false' }
  page.dataset.step = '0'
  gateTitle.textContent = title
  gateNote.textContent = note || 'Buka halaman ini dari receipt pembayaran, atau selesaikan pembayaran dulu.'
  gateRetry.hidden = !retry
  gateReceipt.classList.toggle('btn-primary', !retry)
  gateReceipt.classList.toggle('ghost', retry)
  gate.hidden = false
  gateTitle.focus()
}

const rememberIdentity = (identity) => {
  current = identity
  if (identity?.id) sessionStorage.setItem(STORE.id, identity.id)
}

const forgetIdentity = () => {
  current = null
  h5Link = ''
  h5Expires = ''
  for (const key of Object.values(STORE)) sessionStorage.removeItem(key)
}

const rememberSession = (data) => {
  h5Link = typeof data.h5_link === 'string' ? data.h5_link : ''
  h5Expires = typeof data.expires_at === 'string' ? data.expires_at : ''
  sessionStorage.setItem(STORE.h5, h5Link)
  sessionStorage.setItem(STORE.expires, h5Expires)
}

// ---- identity shape helpers ----
const liveAssets = (identity) => (Array.isArray(identity?.assets) ? identity.assets : []).filter((asset) => asset && asset.slot && asset.status)

const slotAsset = (identity, slot) => {
  const matches = liveAssets(identity).filter((asset) => asset.slot === slot)
  return matches.find((a) => a.status === 'active') || matches.find((a) => a.status === 'processing') || matches[matches.length - 1] || null
}

const routeFor = (identity) => {
  if (!identity || identity.revoked_at) return 1
  if (identity.verification_status !== 'verified') return 2
  const required = REQUIRED_SLOTS.map((slot) => slotAsset(identity, slot))
  if (required.some((asset) => !asset)) return 3
  if (liveAssets(identity).some((asset) => asset.status === 'processing')) return 4
  if (required.some((asset) => asset.status === 'failed')) return 4
  return 5
}

const pickIdentity = (identities) => {
  const list = (Array.isArray(identities) ? identities : []).filter((row) => row && !row.revoked_at)
  const storedId = sessionStorage.getItem(STORE.id)
  const stored = list.find((row) => row.id === storedId)
  if (stored) return stored
  return [...list].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null
}

// ---- step 1: consent ----
const renderConsent = () => {
  nameInput.value = sessionStorage.getItem(STORE.name) || current?.display_name || ''
  consentCheck.checked = false
  consentError.hidden = true
  showStep(1)
}

consentForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  consentError.hidden = true
  const displayName = nameInput.value.trim()
  if (displayName.length < 1 || displayName.length > 80) {
    consentError.textContent = 'Isi nama karakter, 1 sampai 80 huruf.'
    consentError.hidden = false
    nameInput.focus()
    return
  }
  if (!consentCheck.checked) {
    consentError.textContent = ERRORS.consent_required
    consentError.hidden = false
    consentCheck.focus()
    return
  }
  sessionStorage.setItem(STORE.name, displayName)
  setBusy(consentSubmit, true, 'Menyiapkan…')
  setStatus('')
  try {
    const data = await callIdentity('start', { display_name: displayName, consent_version: CONSENT_VERSION })
    rememberIdentity({ id: data.identity_id, display_name: displayName, verification_status: 'pending', session_expires_at: data.expires_at, assets: [] })
    rememberSession(data)
    renderVerify()
  } catch (error) {
    if (handleGateError(error)) return
    consentError.textContent = messageFor(error)
    consentError.hidden = false
  } finally {
    setBusy(consentSubmit, false, '')
  }
})

// ---- step 2: verification ----
const sessionExpired = () => {
  const at = new Date(h5Expires || current?.session_expires_at || 0).getTime()
  return Number.isFinite(at) && at > 0 && at <= Date.now()
}

const renderVerify = ({ note = '', pending = false } = {}) => {
  const status = current?.verification_status || 'pending'
  const expired = status === 'expired' || sessionExpired()
  const canOpen = status === 'pending' && Boolean(h5Link) && !expired
  verifyOpen.hidden = !canOpen
  verifyCheck.hidden = !(pending && Boolean(capability()))
  verifyRestart.hidden = (canOpen && !pending) || status === 'verified'
  verifyTimer.hidden = !canOpen
  if (canOpen) verifyDeadline.textContent = formatTime(h5Expires || current?.session_expires_at)
  let text = note
  if (!text && status === 'failed') text = REASONS.verification_failed
  else if (!text && expired) text = REASONS.verification_expired
  else if (!text && status === 'pending' && !h5Link) text = 'Link verifikasi sebelumnya tidak tersimpan di browser ini. Mulai ulang untuk dapat link baru.'
  verifyNote.textContent = text
  verifyNote.hidden = !text
  showStep(2)
}

verifyOpen.addEventListener('click', () => {
  if (!h5Link) return
  setStatus('Membuka halaman verifikasi BytePlus…')
  window.location.assign(h5Link)
})

verifyRestart.addEventListener('click', async () => {
  const identityId = current?.id || sessionStorage.getItem(STORE.id)
  if (!identityId) { renderConsent(); return }
  setBusy(verifyRestart, true, 'Menyiapkan…')
  setStatus('')
  try {
    const data = await callIdentity('restart', { identity_id: identityId })
    rememberIdentity({ ...(current || {}), id: data.identity_id || identityId, verification_status: 'pending', session_expires_at: data.expires_at, assets: current?.assets || [] })
    rememberSession(data)
    renderVerify()
  } catch (error) {
    if (handleGateError(error)) return
    renderVerify({ note: messageFor(error) })
  } finally {
    setBusy(verifyRestart, false, '')
  }
})

verifyCheck.addEventListener('click', async () => {
  setBusy(verifyCheck, true, 'Mengecek…')
  try {
    await loadIdentity(current?.id || sessionStorage.getItem(STORE.id))
  } finally {
    setBusy(verifyCheck, false, '')
  }
})

const handleCallback = async (nonce) => {
  showStep(2)
  verifyOpen.hidden = true
  verifyRestart.hidden = true
  verifyTimer.hidden = true
  verifyNote.hidden = true
  setStatus('Mengecek hasil verifikasi…')
  if (!nonce) {
    setStatus('')
    renderVerify({ note: 'Link kembali tidak lengkap. Mulai ulang untuk dapat link baru.' })
    return
  }
  try {
    const data = await callIdentity('confirm', { nonce })
    const identityId = data.identity_id || current?.id || sessionStorage.getItem(STORE.id)
    rememberIdentity({ ...(current || {}), id: identityId, verification_status: data.verification_status, assets: current?.assets || [] })
    if (data.verification_status === 'verified') {
      sessionStorage.removeItem(STORE.h5)
      sessionStorage.removeItem(STORE.expires)
      h5Link = ''
      if (capability()) await loadList()
      else renderVerify({ note: 'Verifikasi berhasil. Buka halaman ini lagi dari receipt pembayaran untuk unggah foto.' })
      setStatus('Verifikasi wajah berhasil.', 'success')
      return
    }
    setStatus('')
    if (data.verification_status === 'failed') {
      renderVerify({ note: REASONS[data.reason_code] || REASONS.verification_failed })
      return
    }
    renderVerify({ note: 'Hasil verifikasi belum masuk. Tunggu sebentar, lalu cek hasil.', pending: true })
  } catch (error) {
    setStatus('')
    if (handleGateError(error)) return
    renderVerify({ note: error.code === 'verification_expired' ? REASONS.verification_expired : `${messageFor(error)} Mulai ulang kalau perlu link baru.` })
  }
}

// ---- step 3: upload ----
const slotNode = (slot) => document.querySelector(`.slot[data-slot="${slot}"]`)
const slotPart = (slot, role) => slotNode(slot)?.querySelector(`[data-role="${role}"]`)

const paintSlot = (slot) => {
  const node = slotNode(slot)
  if (!node) return
  const asset = slotAsset(current, slot)
  const state = slotPart(slot, 'state')
  const input = node.querySelector('input[type="file"]')
  if (asset) {
    node.dataset.state = asset.status
    state.textContent = asset.status === 'failed'
      ? `Gagal. ${REASONS[asset.reason_code] || REASONS.asset_failed} Ketuk untuk pilih file lain.`
      : `${STATE_LABEL[asset.status] || asset.status}.`
  } else {
    delete node.dataset.state
    state.textContent = SLOTS[slot].empty
  }
  // Active and processing assets stay put; the per-character cap is small.
  if (input && node.dataset.busy !== 'true') input.disabled = Boolean(asset) && asset.status !== 'failed'
}

const paintUploadStep = () => {
  for (const slot of Object.keys(SLOTS)) paintSlot(slot)
  const ready = REQUIRED_SLOTS.every((slot) => {
    const asset = slotAsset(current, slot)
    return asset && asset.status !== 'failed'
  })
  uploadNext.disabled = !ready
  const remaining = Number(quota?.remaining_assets)
  if (Number.isFinite(remaining) && remaining < 3) {
    quotaNote.textContent = remaining <= 0
      ? 'Kuota karakter di server sedang penuh. Kabari Richie lewat WhatsApp sebelum unggah.'
      : `Kuota aset di server tersisa ${remaining}. Kalau habis, kabari Richie.`
    quotaNote.hidden = false
  } else {
    quotaNote.hidden = true
  }
}

const renderUpload = () => {
  paintUploadStep()
  showStep(3)
}

const checkImage = async (file) => {
  const kind = imageKind(file)
  if (!kind) return { error: ERRORS.invalid_media }
  if (file.size > IMAGE_MAX_BYTES) return { error: 'Ukuran foto di atas 30 MB. Pilih foto yang lebih kecil.' }
  const size = await inspectImage(file)
  if (size) {
    const { width, height } = size
    if (Math.min(width, height) < IMAGE_MIN_SIDE || Math.max(width, height) > IMAGE_MAX_SIDE) {
      return { error: `Foto ${width} × ${height} px. Perlu 300 sampai 6000 px per sisi.` }
    }
    const ratio = width / height
    if (ratio < IMAGE_MIN_RATIO || ratio > IMAGE_MAX_RATIO) {
      return { error: 'Perbandingan sisi terlalu panjang. Pakai foto potret atau lanskap biasa.' }
    }
  }
  return { contentType: imageMime(kind) }
}

const checkAudio = async (file) => {
  const kind = audioKind(file)
  if (!kind) return { error: 'Format klip tidak didukung. Pakai MP3 atau WAV.' }
  if (file.size > AUDIO_MAX_BYTES) return { error: 'Ukuran klip di atas 15 MB. Potong klipnya dulu.' }
  const seconds = await inspectAudio(file)
  if (seconds > 0 && (seconds < AUDIO_MIN_SECONDS || seconds > AUDIO_MAX_SECONDS)) {
    return { error: `Klip ${Math.round(seconds)} detik. Perlu 2 sampai 30 detik.` }
  }
  return { contentType: audioMime(kind) }
}

const setSlotProgress = (slot, value, label) => {
  const progress = slotPart(slot, 'progress')
  const state = slotPart(slot, 'state')
  if (progress) {
    progress.hidden = value === null
    if (value !== null) progress.value = value
  }
  if (state && label) state.textContent = label
}

const setSlotError = (slot, text) => {
  const error = slotPart(slot, 'error')
  if (!error) return
  error.textContent = text || ''
  error.hidden = !text
}

const uploadSlot = async (slot, file) => {
  const spec = SLOTS[slot]
  if (!spec || !file || !current?.id) return
  const node = slotNode(slot)
  const input = node?.querySelector('input[type="file"]')
  setSlotError(slot, '')
  node.dataset.busy = 'true'
  if (input) input.disabled = true
  try {
    const check = spec.kind === 'image' ? await checkImage(file) : await checkAudio(file)
    if (check.error) { setSlotError(slot, check.error); paintSlot(slot); return }
    setSlotProgress(slot, 0, 'Menyiapkan unggahan…')
    const signed = await callIdentity('upload_sign', { identity_id: current.id, slot, content_type: check.contentType, bytes: file.size })
    const headers = { 'content-type': check.contentType, ...(signed.headers || {}) }
    await putWithProgress(signed.upload_url, headers, file, (pct) => setSlotProgress(slot, pct, `Mengunggah ${pct}%`))
    setSlotProgress(slot, 100, 'Mendaftarkan ke BytePlus…')
    const { asset } = await callIdentity('register', { identity_id: current.id, path: signed.path, asset_type: spec.assetType, slot })
    const kept = liveAssets(current).filter((row) => !(row.slot === slot && row.status === 'failed') && row.id !== asset?.id)
    rememberIdentity({ ...current, assets: asset ? [...kept, asset] : kept })
    setStatus(`${spec.label} terunggah. BytePlus sedang memproses.`, 'success')
  } catch (error) {
    if (handleGateError(error)) return
    setSlotError(slot, messageFor(error))
  } finally {
    setSlotProgress(slot, null)
    delete node.dataset.busy
    if (input) input.value = ''
    paintSlot(slot)
    if (Number(page.dataset.step) === 3) paintUploadStep()
    if (Number(page.dataset.step) === 4) renderProcessing()
  }
}

document.querySelector('#slots').addEventListener('change', (event) => {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || input.type !== 'file') return
  const file = input.files?.[0]
  if (file) void uploadSlot(input.dataset.slot, file)
})

uploadNext.addEventListener('click', () => {
  if (!current) return
  renderProcessing()
})

// ---- step 4: processing ----
const assetItem = (asset) => {
  const spec = SLOTS[asset.slot] || { label: asset.slot }
  const li = document.createElement('li')
  li.className = 'asset'
  li.dataset.slot = asset.slot
  const row = document.createElement('div')
  row.className = 'asset-row'
  const name = document.createElement('p')
  name.className = 'asset-name'
  name.textContent = spec.label
  const badge = document.createElement('span')
  badge.className = `badge badge-${asset.status}`
  badge.textContent = STATE_LABEL[asset.status] || asset.status
  row.append(name, badge)
  li.append(row)
  if (asset.status === 'failed') {
    const reason = document.createElement('p')
    reason.className = 'asset-reason'
    reason.textContent = REASONS[asset.reason_code] || REASONS.asset_failed
    li.append(reason)
    const replace = document.createElement('label')
    replace.className = 'asset-replace'
    replace.textContent = spec.kind === 'audio' ? 'Ganti klip' : 'Ganti foto'
    const input = document.createElement('input')
    input.type = 'file'
    input.className = 'sr-only'
    input.accept = slotNode(asset.slot)?.querySelector('input[type="file"]')?.accept || ''
    input.dataset.slot = asset.slot
    input.setAttribute('aria-label', `${replace.textContent} untuk ${spec.label}`)
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (file) void uploadSlot(asset.slot, file)
    })
    replace.append(input)
    li.append(replace)
  }
  return li
}

const renderProcessing = () => {
  const assets = liveAssets(current)
  assetList.replaceChildren(...assets.map(assetItem))
  const processing = assets.some((asset) => asset.status === 'processing')
  if (!processing) {
    const route = routeFor(current)
    if (route === 5) { renderReady(); return }
    if (route === 3) { renderUpload(); return }
  }
  showStep(4)
  if (processing) startPoll()
  else stopPoll()
}

const stopPoll = () => {
  if (!pollTimer) return
  window.clearInterval(pollTimer)
  pollTimer = null
}

const startPoll = () => {
  if (pollTimer) return
  pollTimer = window.setInterval(() => {
    if (Number(page.dataset.step) !== 4) { stopPoll(); return }
    void loadIdentity(current?.id, { quiet: true })
  }, POLL_MS)
}

processingRefresh.addEventListener('click', async () => {
  setBusy(processingRefresh, true, 'Mengecek…')
  try { await loadIdentity(current?.id) } finally { setBusy(processingRefresh, false, '') }
})

// ---- step 5: ready ----
const renderReady = () => {
  readyName.textContent = current?.display_name || 'Karakter'
  const rows = liveAssets(current).map((asset) => {
    const li = document.createElement('li')
    const label = document.createElement('span')
    label.textContent = SLOTS[asset.slot]?.label || asset.slot
    const state = document.createElement('span')
    state.textContent = STATE_LABEL[asset.status] || asset.status
    li.append(label, state)
    return li
  })
  readyAssets.replaceChildren(...rows)
  readyWa.href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Karakter ${current?.display_name || ''} sudah siap dipakai.`)}`
  const arrived = page.dataset.step === '4'
  showStep(5)
  if (arrived) setStatus('Semua foto sudah cocok. Karakter siap dipakai.', 'success')
}

revokeBtn.addEventListener('click', async () => {
  if (!current?.id) return
  const ok = window.confirm('Hapus karakter ini? Foto dan hasil verifikasi akan dihapus dari BytePlus dan dari kami.')
  if (!ok) return
  setBusy(revokeBtn, true, 'Menghapus…')
  try {
    await callIdentity('revoke', { identity_id: current.id })
    forgetIdentity()
    renderConsent()
    setStatus('Karakter dihapus.', 'success')
  } catch (error) {
    if (handleGateError(error)) return
    setStatus(messageFor(error), 'error')
  } finally {
    setBusy(revokeBtn, false, '')
  }
})

// ---- routing ----
const handleGateError = (error) => {
  const code = error?.code
  if (code === 'not_paid') {
    showGate('Pembayaran untuk pesanan ini belum masuk. Cek receipt dulu, lalu kembali ke sini.')
    return true
  }
  if (code === 'unauthorized' || error?.status === 401) {
    showGate(ERRORS.unauthorized)
    return true
  }
  return false
}

const applyIdentity = (identity, { fresh = false } = {}) => {
  rememberIdentity(identity)
  const route = routeFor(identity)
  if (route === 1) renderConsent()
  else if (route === 2) renderVerify()
  else if (route === 3) renderUpload()
  else if (route === 4) {
    renderProcessing()
    // `list` does not refresh processing assets; `status` does.
    if (!fresh) void loadIdentity(identity.id, { quiet: true })
  } else renderReady()
}

const loadIdentity = async (identityId, { quiet = false } = {}) => {
  if (!identityId) { await loadList(); return }
  try {
    const data = await callIdentity('status', { identity_id: identityId })
    if (data?.identity) applyIdentity(data.identity, { fresh: true })
    else await loadList()
  } catch (error) {
    if (handleGateError(error)) return
    if (error.status === 404) { sessionStorage.removeItem(STORE.id); await loadList(); return }
    if (!quiet) setStatus(messageFor(error), 'error')
  }
}

const loadList = async () => {
  try {
    const data = await callIdentity('list')
    quota = data?.quota || null
    const identity = pickIdentity(data?.identities)
    if (identity) applyIdentity(identity)
    else { current = null; renderConsent() }
  } catch (error) {
    if (handleGateError(error)) return
    showGate(messageFor(error), { retry: true, title: 'Karakter belum bisa dimuat' })
  }
}

const boot = async () => {
  const params = new URLSearchParams(window.location.search)
  const isCallback = params.get('stage') === 'callback'
  const nonce = params.get('n') || ''
  if (isCallback) history.replaceState({}, '', window.location.pathname)
  if (recoveryToken && !capability()) await exchangeRecovery(recoveryToken).catch(() => false)
  if (isCallback) {
    const storedId = sessionStorage.getItem(STORE.id)
    if (storedId && !current) current = { id: storedId, display_name: sessionStorage.getItem(STORE.name) || '', verification_status: 'pending', assets: [] }
    await handleCallback(nonce)
    return
  }
  if (!capability()) {
    showGate()
    return
  }
  await loadList()
}

gateRetry.addEventListener('click', async () => {
  setBusy(gateRetry, true, 'Memuat…')
  try { await loadList() } finally { setBusy(gateRetry, false, '') }
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Number(page.dataset.step) === 4 && current?.id) void loadIdentity(current.id, { quiet: true })
})

void boot()
