export const AI_VIDEO_PRODUCT_CODE = 'ai-video-lifetime' as const
export const AI_VIDEO_PRICE_IDR = 450_000 as const
export const AI_VIDEO_CURRENCY = 'IDR' as const
export const AI_VIDEO_POLICY_VERSION = 'v1.2' as const
export const AI_VIDEO_CAPABILITY_TTL_SECONDS = 24 * 60 * 60

export const AI_VIDEO_SKUS = {
  'ai-video-lifetime': {
    code: 'ai-video-lifetime',
    priceIdr: 450_000,
    compareAtIdr: null,
    label: 'AI Video Agent · Lifetime',
    description: 'weuseai.agent AI Video Lifetime',
    fulfillment: 'agent',
  },
  'dfy-ultra': {
    code: 'dfy-ultra',
    priceIdr: 499_000,
    compareAtIdr: 999_000,
    label: 'AI Konten Ultra Realistic',
    description: 'weuseai.agent AI Konten Ultra Realistic',
    fulfillment: 'whatsapp',
  },
  'dfy-foto5': {
    code: 'dfy-foto5',
    priceIdr: 99_000,
    compareAtIdr: 249_000,
    label: '3x Poster Realistic',
    description: 'weuseai.agent 3x Poster Realistic',
    fulfillment: 'whatsapp',
  },
} as const

export type AiVideoSkuCode = keyof typeof AI_VIDEO_SKUS
export type AiVideoSku = (typeof AI_VIDEO_SKUS)[AiVideoSkuCode]

const SKU_CODES = new Set<string>(Object.keys(AI_VIDEO_SKUS))
const SKU_AMOUNTS = new Set<number>(Object.values(AI_VIDEO_SKUS).map((sku) => sku.priceIdr))

export function discountedAiVideoListAmount(listAmountIdr: number): number {
  return listAmountIdr - Math.trunc((listAmountIdr * 25) / 100)
}

export function resolveAiVideoSku(raw: unknown): AiVideoSku {
  if (typeof raw === 'string' && SKU_CODES.has(raw)) return AI_VIDEO_SKUS[raw as AiVideoSkuCode]
  return AI_VIDEO_SKUS['ai-video-lifetime']
}

export function isKnownAiVideoAmount(amount: number): boolean {
  if (SKU_AMOUNTS.has(amount)) return true
  for (const listAmount of SKU_AMOUNTS) {
    if (discountedAiVideoListAmount(listAmount) === amount) return true
  }
  return false
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MIDTRANS_CHANNELS = new Set([
  'gopay', 'other_qris', 'bca_va', 'bni_va', 'bri_va',
  'echannel', 'permata_va', 'cimb_va', 'credit_card',
  'ovo', 'dana', 'shopeepay', 'kredivo', 'akulaku',
])
const ATTRIBUTION_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign',
  'utm_content', 'utm_term', 'fbclid',
] as const

export type AiVideoAttribution = Partial<Record<typeof ATTRIBUTION_KEYS[number], string>>

export function buildAiVideoOrderId(orderId: string): string {
  if (!UUID_RE.test(orderId)) throw new Error('invalid_ai_video_order_uuid')
  return `av-${orderId.toLowerCase()}`
}

export function sanitizeAiVideoAttribution(value: unknown): AiVideoAttribution {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as Record<string, unknown>
  const result: AiVideoAttribution = {}
  for (const key of ATTRIBUTION_KEYS) {
    const raw = source[key]
    if (typeof raw !== 'string') continue
    const normalized = raw.trim().slice(0, 200)
    if (normalized) result[key] = normalized
  }
  return result
}

export function resolveAiVideoEnabledPayments(raw: string | undefined): string[] {
  if (!raw?.trim()) throw new Error('MIDTRANS_AI_VIDEO_ENABLED_PAYMENTS is required')
  const channels = raw.split(',').map((item) => item.trim()).filter(Boolean)
  if (channels.length === 0 || channels.length > 12) {
    throw new Error('invalid AI video Midtrans channel count')
  }
  if (new Set(channels).size !== channels.length) {
    throw new Error('duplicate AI video Midtrans channel')
  }
  for (const channel of channels) {
    if (!MIDTRANS_CHANNELS.has(channel)) throw new Error('unknown AI video Midtrans channel')
  }
  return channels
}
