const WA_NUMBER = '6282154902561'
const CLAIM_RE = /^WU-[2-9A-HJ-NP-Z]{4}$/
const PROMO_RE = /^[0-9]{8,12}$/
const CODE39 = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', '*': 'nwnnwnwnn',
}
const FEED_MS = 1750
const POLL_MS = 4000
const LOCAL_CAPABILITY_COOKIE = 'ai_video_local_capability'
const LOCAL_PREVIEW_HOSTS = ['127.0.0.1', 'localhost']
const UNPAID_NOTE = 'Pembayaran belum masuk. Tunggu sebentar, lalu cek lagi.'
const BURSTS = [0.075, 0.18, 0.285, 0.39, 0.495, 0.6, 0.705, 0.81, 0.915, 1]
const SKUS = {
  'dfy-ultra': { label: 'AI Konten Ultra Realistic' },
  'dfy-foto5': { label: '3x Poster Realistic' },
  'ai-video-lifetime': { label: 'AI Video Agent · Lifetime' },
}
const PREVIEW_ORDER = {
  status: 'paid',
  sku: 'dfy-ultra',
  label: 'AI Konten Ultra Realistic',
  amount_idr: 499_000,
  email: 'preview@localhost',
  claim_code: 'WU-DEMO',
  paid_at: '2026-08-21T02:20:00.000Z',
  promo_serial: '0000000125',
  promo_expires_at: '2026-08-28T02:20:00.000Z',
}

const endpointOrigin = document.querySelector('meta[name="supabase-functions-origin"]')?.content || '/functions/v1'
const printer = document.querySelector('#printer')
const feed = document.querySelector('#receipt-feed')
const claimRow = document.querySelector('#claim-row')
const claimEl = document.querySelector('#ticket-claim')
const dateRow = document.querySelector('#date-row')
const promoBlock = document.querySelector('#promo-block')
const thanksBlock = document.querySelector('#thanks-block')
const barcodeEl = document.querySelector('#ticket-barcode')
const retryBtn = document.querySelector('#retry-btn')
const chatLink = document.querySelector('#chat-link')
const waLink = document.querySelector('#wa-link')
const localBadge = document.querySelector('#local-badge')
const noteEl = document.querySelector('#receipt-note')

const isLocalPreviewHost = (hostname = window.location.hostname) =>
  LOCAL_PREVIEW_HOSTS.includes(hostname)

const canPreviewPrint = (location = window.location) => {
  if (!isLocalPreviewHost(location.hostname)) return false
  return new URLSearchParams(location.search).get('preview') === 'print'
}

if (isLocalPreviewHost()) {
  localBadge.textContent = 'LOCAL MOCK · BUKAN TRANSAKSI'
  localBadge.hidden = false
}

const hashParams = new URLSearchParams(window.location.hash.slice(1))
const recoveryToken = hashParams.get('recovery_token')
if (recoveryToken) {
  hashParams.delete('recovery_token')
  const cleanHash = hashParams.toString()
  history.replaceState({}, '', `${window.location.pathname}${window.location.search}${cleanHash ? `#${cleanHash}` : ''}`)
}

const formatIdr = (value) => `Rp ${Number(value).toLocaleString('id-ID')}`
const formatWhen = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const code39Svg = (serial) => {
  const payload = `*${serial}*`
  const unit = 2
  let x = unit * 4
  const rects = []
  for (const char of payload) {
    const pattern = CODE39[char]
    if (!pattern) return ''
    for (const cell of pattern) {
      const w = cell === 'w' ? unit * 3 : unit
      if (cell !== 's') rects.push(`<rect x="${x}" y="0" width="${w}" height="36" fill="#111111"/>`)
      x += w
    }
    const gap = unit
    x += gap
  }
  const width = x + unit * 4
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 36" width="100%" height="36" aria-hidden="true">${rects.join('')}</svg>`
}
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const setText = (id, value) => {
  const node = document.querySelector(id)
  if (node) node.textContent = value
}

const setNote = (text) => {
  if (!noteEl) return
  noteEl.textContent = text
  noteEl.hidden = !text
}

const setRetryBusy = (busy) => {
  retryBtn.disabled = busy
  retryBtn.textContent = busy ? 'Mengecek…' : 'Cek lagi'
}

const setStage = (stage) => {
  printer.dataset.stage = stage
  printer.dataset.feed = 'stepped'
  feed.setAttribute('aria-hidden', stage === 'complete' ? 'false' : 'true')
  retryBtn.hidden = stage !== 'processing'
  chatLink.hidden = stage !== 'processing'
  waLink.hidden = stage !== 'complete'
}

const paintTicket = (order, preview = false) => {
  const sku = SKUS[order.sku]?.label || order.label || '—'
  setText('#ticket-sku', sku)
  setText('#ticket-amount', Number.isFinite(order.amount_idr) ? formatIdr(order.amount_idr) : '—')
  setText('#ticket-email', order.email || '—')
  setText(
    '#ticket-foot',
    preview
      ? 'LOCAL MOCK · BUKAN TRANSAKSI. Kode ini bukan klaim sungguhan.'
      : 'Kode ini muncul hanya setelah Midtrans menandai lunas.',
  )
}

const hideClaim = () => {
  claimRow.hidden = true
  claimEl.textContent = ''
  if (dateRow) dateRow.hidden = true
  if (promoBlock) promoBlock.hidden = true
  if (thanksBlock) thanksBlock.hidden = true
  if (barcodeEl) barcodeEl.innerHTML = ''
  setText('#ticket-promo', '')
  setText('#ticket-date', '')
  setText('#ticket-promo-deadline', '')
  waLink.href = `https://wa.me/${WA_NUMBER}`
}

const showPaid = (order, preview = false) => {
  paintTicket(order, preview)
  claimRow.hidden = false
  claimEl.textContent = order.claim_code
  if (dateRow) {
    dateRow.hidden = false
    setText('#ticket-date', formatWhen(order.paid_at))
  }
  const serial = String(order.promo_serial || '')
  if (promoBlock && PROMO_RE.test(serial)) {
    promoBlock.hidden = false
    setText('#ticket-promo', serial)
    setText('#ticket-promo-deadline', `${formatWhen(order.promo_expires_at)} (7 hari)`)
    if (barcodeEl) barcodeEl.innerHTML = code39Svg(serial)
  } else if (promoBlock) {
    promoBlock.hidden = true
  }
  if (thanksBlock) thanksBlock.hidden = false
  waLink.href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`${order.claim_code}\nSKU=${order.sku}`)}`
}

const readCookie = (name) => {
  const parts = document.cookie.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed.startsWith(`${name}=`)) continue
    return decodeURIComponent(trimmed.slice(name.length + 1))
  }
  return ''
}

const capability = () => {
  const stored = sessionStorage.getItem('ai_video_capability') || ''
  if (stored) return stored
  if (!isLocalPreviewHost()) return ''
  const cookie = readCookie(LOCAL_CAPABILITY_COOKIE)
  if (!cookie) return ''
  sessionStorage.setItem('ai_video_capability', cookie)
  return cookie
}

let audioCtx = null
const getAudio = () => {
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) audioCtx = new Ctor()
  return audioCtx
}

const unlockAudio = async () => {
  const ctx = getAudio()
  if (!ctx) return null
  try {
    if (ctx.state === 'suspended') await ctx.resume()
  } catch {
    return null
  }
  return ctx.state === 'running' ? ctx : null
}

const playTick = (ctx, when) => {
  const length = Math.floor(ctx.sampleRate * 0.05)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length)
  }
  const noise = ctx.createBufferSource()
  noise.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1700
  filter.Q.value = 7
  const buzz = ctx.createOscillator()
  buzz.type = 'square'
  buzz.frequency.value = 92
  const noiseGain = ctx.createGain()
  const buzzGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.0001, when)
  noiseGain.gain.exponentialRampToValueAtTime(0.16, when + 0.006)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04)
  buzzGain.gain.setValueAtTime(0.0001, when)
  buzzGain.gain.exponentialRampToValueAtTime(0.04, when + 0.004)
  buzzGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.03)
  noise.connect(filter).connect(noiseGain).connect(ctx.destination)
  buzz.connect(buzzGain).connect(ctx.destination)
  noise.start(when)
  buzz.start(when)
  noise.stop(when + 0.05)
  buzz.stop(when + 0.04)
}

const cuePrintFeel = async () => {
  if (reduceMotion()) return
  const pattern = []
  for (let i = 0; i < BURSTS.length; i++) {
    const start = BURSTS[i] * FEED_MS
    const next = (BURSTS[i + 1] ?? 1) * FEED_MS
    const buzz = 34
    pattern.push(buzz)
    if (i < BURSTS.length - 1) pattern.push(Math.max(16, next - start - buzz))
  }
  try { navigator.vibrate?.(pattern) } catch { /* iOS and denied vibration stay silent */ }

  const ctx = await unlockAudio()
  if (!ctx) return
  const now = ctx.currentTime + 0.02
  for (const burst of BURSTS) playTick(ctx, now + burst * (FEED_MS / 1000))
}

const exchangeRecovery = async (token) => {
  const response = await fetch(`${endpointOrigin}/ai-video-session`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'exchange', recovery_token: token }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || typeof data.ai_video_capability !== 'string') return false
  sessionStorage.setItem('ai_video_capability', data.ai_video_capability)
  return true
}

const fetchReceipt = async () => {
  const token = capability()
  if (!token) return null
  const response = await fetch(`${endpointOrigin}/ai-video-session`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      'x-ai-video-capability': token,
    },
    body: JSON.stringify({ action: 'status' }),
  })
  if (!response.ok) return null
  return response.json().catch(() => null)
}

const isLiveReceipt = (data) => {
  const order = data?.order
  return Boolean(
    order &&
    order.status === 'paid' &&
    CLAIM_RE.test(String(order.claim_code || '')) &&
    typeof order.sku === 'string',
  )
}

let printLock = false
let pollTimer = null

const stopPoll = () => {
  if (!pollTimer) return
  window.clearInterval(pollTimer)
  pollTimer = null
}

const startPoll = () => {
  if (pollTimer || canPreviewPrint() || !capability()) return
  pollTimer = window.setInterval(() => {
    if (printer.dataset.stage !== 'processing') {
      stopPoll()
      return
    }
    void loadReceipt({ quiet: true })
  }, POLL_MS)
}

const finishPrint = (order, preview = false) => {
  if (printLock) return
  printLock = true
  stopPoll()
  showPaid(order, preview)
  setNote('')
  setStage('complete')
}

const printReceipt = (order, preview = false) => {
  printLock = false
  stopPoll()
  showPaid(order, preview)
  setNote('')
  if (reduceMotion()) {
    finishPrint(order, preview)
    return
  }
  setStage('printing')
  void cuePrintFeel()
  const done = () => finishPrint(order, preview)
  feed.addEventListener('animationend', (event) => {
    if (event.animationName === 'receipt-print') done()
  }, { once: true })
  window.setTimeout(done, FEED_MS + 120)
}

const loadReceipt = async ({ quiet = false } = {}) => {
  if (printer.dataset.stage === 'printing' || printer.dataset.stage === 'complete') return
  if (!quiet) {
    hideClaim()
    setStage('processing')
    if (!noteEl?.textContent) setNote('')
    setRetryBusy(true)
  }
  try {
    if (recoveryToken && !capability()) {
      await exchangeRecovery(recoveryToken)
    }
    const data = await fetchReceipt()
    if (isLiveReceipt(data)) {
      printReceipt({
        ...data.order,
        paid_at: data.order.paid_at || data.receipt?.paid_at,
        promo_serial: data.order.promo_serial || data.receipt?.promo?.serial,
        promo_expires_at: data.order.promo_expires_at || data.receipt?.promo?.expires_at,
      })
      return
    }
    if (data?.order) paintTicket(data.order)
    setNote(UNPAID_NOTE)
    startPoll()
  } catch {
    setNote(UNPAID_NOTE)
    startPoll()
  } finally {
    if (!quiet) setRetryBusy(false)
  }
}

retryBtn.addEventListener('click', () => {
  void unlockAudio()
  void loadReceipt()
})
document.addEventListener('pointerdown', () => { void unlockAudio() }, { once: true })

if (canPreviewPrint()) {
  printReceipt(PREVIEW_ORDER, true)
} else {
  void loadReceipt()
}
