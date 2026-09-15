// Capability handling and the ai-video-identity transport for the Karakter
// page. The capability path mirrors assets/ai-video-welcome.js: the JWT lives
// in sessionStorage under `ai_video_capability`, a `#recovery_token` is
// exchanged through `ai-video-session`, and local preview hosts may seed it
// from a cookie.

export const CONSENT_VERSION = 'v1'
export const CAPABILITY_KEY = 'ai_video_capability'
const LOCAL_CAPABILITY_COOKIE = 'ai_video_local_capability'
const LOCAL_PREVIEW_HOSTS = ['127.0.0.1', 'localhost']

export const REASONS = {
  face_mismatch: 'Wajah di foto tidak cocok dengan hasil verifikasi.',
  multiple_faces: 'Terdeteksi lebih dari satu wajah di foto.',
  asset_failed: 'Foto tidak memenuhi syarat. Coba foto lain.',
  invalid_media: 'Format file tidak didukung. Pakai JPG, PNG, WEBP, atau HEIC.',
  verification_failed: 'Verifikasi wajah belum berhasil. Coba lagi dengan cahaya yang cukup, tanpa topi atau masker.',
  verification_expired: 'Link verifikasi sudah lewat 30 menit. Mulai ulang untuk dapat link baru.',
}

export const ERRORS = {
  ...REASONS,
  consent_required: 'Centang persetujuan dulu sebelum lanjut.',
  identity_asset_cap: 'Karakter ini sudah mencapai batas jumlah foto.',
  ark_quota_exceeded: 'Kuota karakter di server sedang penuh. Kabari Richie lewat WhatsApp.',
  ark_rate_limited: 'Server sedang sibuk. Tunggu satu menit, lalu coba lagi.',
  ark_unavailable: 'Layanan verifikasi sedang tidak tersedia. Coba lagi beberapa menit lagi.',
  upload_failed: 'Unggahan terputus. Coba lagi.',
  upload_timeout: 'Unggahan terlalu lama. Cek koneksi, lalu coba lagi.',
  unauthorized: 'Sesi kamu sudah habis. Buka halaman ini lagi dari receipt pembayaran.',
  liveness_billing_blocked: 'Verifikasi wajah sedang ditutup. BytePlus mulai menagih pemeriksaan ini.',
}
export const FALLBACK_ERROR = 'Ada gangguan. Coba lagi dalam satu menit.'

export const endpointOrigin = document.querySelector('meta[name="supabase-functions-origin"]')?.content || '/functions/v1'

export const isLocalPreviewHost = (hostname = window.location.hostname) => LOCAL_PREVIEW_HOSTS.includes(hostname)

const readCookie = (name) => {
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(`${name}=`)) return decodeURIComponent(trimmed.slice(name.length + 1))
  }
  return ''
}

export const capability = () => {
  const stored = sessionStorage.getItem(CAPABILITY_KEY) || ''
  if (stored) return stored
  if (!isLocalPreviewHost()) return ''
  const cookie = readCookie(LOCAL_CAPABILITY_COOKIE)
  if (!cookie) return ''
  sessionStorage.setItem(CAPABILITY_KEY, cookie)
  return cookie
}

// Pulls `#recovery_token` out of the URL (and scrubs it from history).
export const takeRecoveryToken = () => {
  const hashParams = new URLSearchParams(window.location.hash.slice(1))
  const token = hashParams.get('recovery_token')
  if (!token) return ''
  hashParams.delete('recovery_token')
  const cleanHash = hashParams.toString()
  history.replaceState({}, '', `${window.location.pathname}${window.location.search}${cleanHash ? `#${cleanHash}` : ''}`)
  return token
}

export const exchangeRecovery = async (token) => {
  const response = await fetch(`${endpointOrigin}/ai-video-session`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'exchange', recovery_token: token }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || typeof data.ai_video_capability !== 'string') return false
  sessionStorage.setItem(CAPABILITY_KEY, data.ai_video_capability)
  return true
}

export class IdentityError extends Error {
  constructor(code, status) {
    super(code)
    this.code = code
    this.status = status
  }
}

// POST ${functionsOrigin}/ai-video-identity with { action, ...fields }.
// The capability header rides along whenever it is available; `confirm`
// is the one action the server accepts without it.
export const callIdentity = async (action, fields = {}) => {
  const headers = { 'content-type': 'application/json' }
  const token = capability()
  if (token) headers['x-ai-video-capability'] = token
  let response
  try {
    response = await fetch(`${endpointOrigin}/ai-video-identity`, {
      method: 'POST',
      cache: 'no-store',
      headers,
      body: JSON.stringify({ action, ...fields }),
    })
  } catch {
    throw new IdentityError('network', 0)
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code = typeof data.error === 'string' ? data.error : (response.status === 401 ? 'unauthorized' : 'unknown')
    throw new IdentityError(code, response.status)
  }
  return data
}

export const messageFor = (error) => {
  const code = error instanceof Error ? (error.code || error.message) : ''
  return ERRORS[code] || FALLBACK_ERROR
}
