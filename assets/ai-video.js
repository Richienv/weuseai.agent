const POLICY_VERSION = 'v1.2'
const WA_NUMBER = '6282154902561'
const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid']
const SKUS = {
  'dfy-ultra': {
    label: 'AI Konten Ultra Realistic',
    priceIdr: 499_000,
    compare: 'Harga biasa Rp 999.000',
    cta: 'Ambil paket · Rp 499.000',
  },
  'dfy-foto5': {
    label: '3x Poster Realistic',
    priceIdr: 99_000,
    compare: 'Harga biasa Rp 249.000',
    cta: 'Ambil 3 poster · Rp 99.000',
  },
}

const endpointOrigin = document.querySelector('meta[name="supabase-functions-origin"]')?.content || '/functions/v1'
const deck = document.querySelector('#deck')
const slides = [...document.querySelectorAll('.slide')]
const dockCta = document.querySelector('#dock-cta')
const dockLabel = document.querySelector('#dock-cta-label')
const sheet = document.querySelector('#checkout-sheet')
const form = document.querySelector('#ai-video-checkout-form')
const done = document.querySelector('#sheet-done')
const submit = document.querySelector('#checkout-submit')
const status = document.querySelector('#checkout-status')
const email = document.querySelector('#email')
const promoInput = document.querySelector('#promo-serial')
const terms = document.querySelector('#terms')
const skuInput = document.querySelector('#sku')
const emailError = document.querySelector('#email-error')
const promoError = document.querySelector('#promo-error')
const productLabel = document.querySelector('#sheet-product-label')
const productPrice = document.querySelector('#sheet-product-price')
const productCompare = document.querySelector('#sheet-compare')
const submitLabel = document.querySelector('#checkout-submit-label')

let activeSlide = slides[0] || null
let quotedAmount = null
const PROMO_RE = /^[0-9]{8,12}$/

const formatIdr = (value) => `Rp ${value.toLocaleString('id-ID')}`

const attribution = () => {
  const incoming = new URLSearchParams(window.location.search)
  const result = {}
  for (const key of ATTRIBUTION_KEYS) {
    const value = incoming.get(key)
    if (value) result[key] = value.trim().slice(0, 200)
  }
  return result
}

const selectedSku = () => SKUS[skuInput.value] || SKUS['dfy-ultra']

const waHref = (skuCode, order, amount) => {
  const sku = SKUS[skuCode] || SKUS['dfy-ultra']
  const message = [
    `Halo Richie, aku sudah bayar ${sku.label}.`,
    '',
    `ORDER=${order}`,
    `SKU=${skuCode}`,
    `AMOUNT=Rp ${Number(amount).toLocaleString('id-ID')}`,
    '',
    'Balas chat ini, isi semua, lalu kirim 3 foto wajah di chat yang sama.',
    '',
    '1. Nama panggilan:',
    '2. Siapa di frame (1 orang / 2 orang):',
    '3. Adegan 1 kalimat:',
    '4. Rasio (9:16 / 16:9):',
    '5. Baju + lokasi:',
    '6. Audio (tanpa suara / 1 kalimat):',
    '7. Pakai hasil untuk (Reels / iklan / lain):',
    '',
    'Foto wajib: close-up nyata, depan + 3/4 + senyum. Cahaya biasa. Tanpa filter.',
  ].join('\n')
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`
}

const payableAmount = () => (
  Number.isInteger(quotedAmount) ? quotedAmount : selectedSku().priceIdr
)

const paintPrice = () => {
  const sku = selectedSku()
  const amount = payableAmount()
  productLabel.textContent = sku.label
  productPrice.textContent = formatIdr(amount)
  productCompare.textContent = amount === sku.priceIdr
    ? sku.compare
    : `Harga penuh ${formatIdr(sku.priceIdr)} · promo 25%`
  submitLabel.textContent = `Bayar ${formatIdr(amount)}`
}

const paintSku = (code) => {
  const key = SKUS[code] ? code : 'dfy-ultra'
  skuInput.value = key
  quotedAmount = null
  if (promoError) promoError.textContent = ''
  paintPrice()
}

const promoMessage = (code) => ({
  invalid_promo_serial: 'Serial 8 sampai 12 digit.',
  unknown_promo: 'Serial tidak dikenali.',
  promo_redeemed: 'Serial ini sudah dipakai.',
  promo_expired: 'Serial ini sudah lewat 7 hari.',
}[code] || 'Serial belum bisa dipakai.')

const quotePromo = async () => {
  const serial = promoInput?.value.trim() || ''
  if (!serial) {
    quotedAmount = null
    if (promoError) promoError.textContent = ''
    paintPrice()
    return true
  }
  if (!PROMO_RE.test(serial)) {
    quotedAmount = null
    if (promoError) promoError.textContent = 'Serial 8 sampai 12 digit.'
    paintPrice()
    return false
  }
  try {
    const response = await fetch(`${endpointOrigin}/create-ai-video-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'quote', sku: skuInput.value, promo_serial: serial }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      quotedAmount = null
      if (promoError) promoError.textContent = promoMessage(data.error)
      paintPrice()
      return false
    }
    if (!Number.isInteger(data.amount_idr) || data.amount_idr <= 0 || data.amount_idr >= selectedSku().priceIdr) {
      quotedAmount = null
      if (promoError) promoError.textContent = promoMessage('unknown_promo')
      paintPrice()
      return false
    }
    quotedAmount = data.amount_idr
    if (promoError) promoError.textContent = ''
    paintPrice()
    return true
  } catch {
    quotedAmount = null
    if (promoError) promoError.textContent = promoMessage('unknown_promo')
    paintPrice()
    return false
  }
}

const paintDock = (slide) => {
  if (!slide || !dockCta || !dockLabel) return
  activeSlide = slide
  const skuCode = slide.dataset.sku
  if (skuCode && SKUS[skuCode]) {
    dockCta.dataset.action = 'buy'
    dockCta.dataset.sku = skuCode
    dockLabel.textContent = SKUS[skuCode].cta
    return
  }
  dockCta.dataset.action = 'next'
  delete dockCta.dataset.sku
  dockLabel.textContent = 'Lihat paket'
}

const showForm = () => {
  form.hidden = false
  done.hidden = true
}

const showDone = ({ skuCode, amount, order }) => {
  const sku = SKUS[skuCode] || SKUS['dfy-ultra']
  document.querySelector('#done-product-label').textContent = sku.label
  document.querySelector('#done-product-price').textContent = formatIdr(Number(amount) || sku.priceIdr)
  document.querySelector('#done-order').textContent = order || '—'
  document.querySelector('#done-wa').href = waHref(skuCode, order, amount || sku.priceIdr)
  form.hidden = true
  done.hidden = false
}

const setStatus = (message, type = 'error') => {
  status.textContent = message
  status.classList.toggle('success', type === 'success')
}

const setBusy = (busy) => {
  submit.disabled = busy
  submitLabel.textContent = busy ? 'Menyiapkan pembayaran…' : `Bayar ${formatIdr(payableAmount())}`
}

const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const openSheet = (code) => {
  paintSku(code)
  setStatus('')
  emailError.textContent = ''
  if (promoError) promoError.textContent = ''
  showForm()
  sheet.showModal()
  email.focus()
}

const nextProductSlide = () => {
  const index = slides.indexOf(activeSlide)
  const target = slides.slice(Math.max(index, 0) + 1).find((slide) => slide.dataset.sku) || slides[1]
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

if (deck && slides.length) {
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
    if (visible) paintDock(visible.target)
  }, { root: deck, threshold: [0.45, 0.6, 0.8] })
  slides.forEach((slide) => observer.observe(slide))
  paintDock(slides[0])
}

dockCta?.addEventListener('click', () => {
  if (dockCta.dataset.action === 'buy') {
    openSheet(dockCta.dataset.sku)
    return
  }
  nextProductSlide()
})

document.querySelector('#sheet-close')?.addEventListener('click', () => sheet.close())
sheet?.addEventListener('click', (event) => {
  if (event.target === sheet) sheet.close()
})
sheet?.addEventListener('close', showForm)

const hashParams = new URLSearchParams(window.location.hash.slice(1))
const recoveryToken = hashParams.get('recovery_token')
if (recoveryToken) {
  hashParams.delete('recovery_token')
  const cleanHash = hashParams.toString()
  history.replaceState({}, '', `${window.location.pathname}${window.location.search}${cleanHash ? `#${cleanHash}` : ''}`)
}

const incomingSku = new URLSearchParams(window.location.search).get('sku')
if (incomingSku && SKUS[incomingSku]) {
  const target = document.querySelector(`[data-sku="${incomingSku}"]`)
  target?.scrollIntoView({ behavior: 'auto', block: 'start' })
  paintDock(target)
}

if (new URLSearchParams(window.location.search).get('payment') === 'failed') {
  openSheet(incomingSku && SKUS[incomingSku] ? incomingSku : 'dfy-ultra')
  setStatus('Pembayaran belum selesai. Coba lagi dari sini.')
}

promoInput?.addEventListener('blur', () => { void quotePromo() })

form?.addEventListener('submit', async (event) => {
  event.preventDefault()
  setStatus('')
  emailError.textContent = ''

  const normalizedEmail = email.value.trim().toLowerCase()
  if (!validEmail(normalizedEmail)) {
    emailError.textContent = 'Masukkan email yang valid.'
    email.focus()
    return
  }
  if (!terms.checked) {
    setStatus('Setujui Syarat, Privasi, dan Refund untuk lanjut.')
    terms.focus()
    return
  }

  const sku = selectedSku()
  const skuCode = skuInput.value
  const serial = promoInput?.value.trim() || ''
  if (serial && !await quotePromo()) {
    promoInput?.focus()
    return
  }
  setBusy(true)
  try {
    const response = await fetch(`${endpointOrigin}/create-ai-video-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        sku: skuCode,
        tos_accepted_at: new Date().toISOString(),
        marketing_opt_in_at: null,
        policy_version: POLICY_VERSION,
        attribution: attribution(),
        recovery_token: recoveryToken || undefined,
        promo_serial: serial || undefined,
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (response.status === 202 && data.recovery_required === true) {
      setStatus('Email ini sudah terdaftar. Cek inbox untuk link sekali pakai.', 'success')
      return
    }
    if (!response.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'checkout_unavailable')
    }
    if (
      !Number.isInteger(data.amount_idr) ||
      data.amount_idr <= 0 ||
      data.amount_idr > sku.priceIdr ||
      typeof data.redirect_url !== 'string' ||
      typeof data.ai_video_capability !== 'string'
    ) {
      throw new Error('invalid_checkout_response')
    }
    sessionStorage.setItem('ai_video_capability', data.ai_video_capability)
    sessionStorage.setItem('ai_video_sku', skuCode)
    setStatus('Checkout siap. Membuka Midtrans…', 'success')
    window.location.assign(data.redirect_url)
  } catch (error) {
    const code = error instanceof Error ? error.message : 'checkout_unavailable'
    const messages = {
      invalid_email: 'Email tidak valid.',
      checkout_closed: 'Checkout belum dibuka. WhatsApp Richie kalau kamu sudah dari iklan.',
      order_in_progress: 'Checkout untuk email ini masih aktif. Cek email.',
      invalid_promo_serial: 'Serial 8 sampai 12 digit.',
      unknown_promo: 'Serial tidak dikenali.',
      promo_redeemed: 'Serial ini sudah dipakai.',
      promo_expired: 'Serial ini sudah lewat 7 hari.',
    }
    setStatus(messages[code] || 'Pembayaran belum bisa disiapkan. Coba lagi dalam satu menit.')
  } finally {
    setBusy(false)
  }
})
