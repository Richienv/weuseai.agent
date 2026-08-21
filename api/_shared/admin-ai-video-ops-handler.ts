import { AI_VIDEO_SKUS, resolveAiVideoSku } from './ai-video-product.js'
import { isAiVideoClaimCode } from './ai-video-claim-code.js'
import { isAiVideoPromoSerial, promoStatus } from './ai-video-promo.js'

export const AI_VIDEO_FULFILLMENT_STATUSES = [
  'processing', 'in_progress', 'delivered', 'refund_needed', 'refunded', 'extension',
] as const

export type AiVideoFulfillmentStatus = (typeof AI_VIDEO_FULFILLMENT_STATUSES)[number]
export type AiVideoOpsFilter = 'all' | 'today' | 'unpaid' | 'paid' | 'needs_action'

export type AiVideoOpsOrderRow = {
  id: string
  provider_order_id: string
  email: string
  product_code: string
  amount_idr: number
  list_amount_idr: number | null
  status: string
  claim_code: string | null
  fulfillment_status: string | null
  fulfillment_note: string | null
  fulfillment_updated_at: string | null
  fulfillment_updated_by: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
  refund_requested_at: string | null
}

export type AiVideoOpsPromoRow = {
  id: string
  serial: string
  source_order_id: string
  source_provider_order_id: string
  source_email: string
  created_at: string
  expires_at: string
  redeemed_at: string | null
  redeemed_order_id: string | null
  redeemed_provider_order_id: string | null
  redeemed_email: string | null
}

export type AiVideoOpsStore = {
  listOrders(): Promise<AiVideoOpsOrderRow[]>
  listPromos(): Promise<AiVideoOpsPromoRow[]>
  setFulfillment(input: {
    orderId: string
    status: AiVideoFulfillmentStatus
    actor: string
    note?: string | null
  }): Promise<AiVideoOpsOrderRow | null>
  findOrder(orderId: string): Promise<{
    id: string
    status: string
    amountIdr: number
    currency: string
    providerPaymentId: string | null
    refundRequestId: string | null
  } | null>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UNPAID = new Set(['pending', 'failed', 'expired'])
const NEEDS_ACTION = new Set(['processing', 'in_progress', 'refund_needed', 'extension'])

function jakartaDayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return new Date(`${year}-${month}-${day}T00:00:00+07:00`)
}

function matchesSearch(order: AiVideoOpsOrderRow, query: string): boolean {
  if (!query) return true
  const hay = [
    order.email, order.provider_order_id, order.claim_code ?? '', order.product_code, order.id,
  ].join(' ').toLowerCase()
  return hay.includes(query)
}

function matchesFilter(order: AiVideoOpsOrderRow, filter: AiVideoOpsFilter, now: Date): boolean {
  if (filter === 'all') return true
  if (filter === 'today') return new Date(order.created_at).getTime() >= jakartaDayStart(now).getTime()
  if (filter === 'unpaid') return UNPAID.has(order.status)
  if (filter === 'paid') return order.status === 'paid'
  if (filter === 'needs_action') {
    return order.status === 'held_for_review'
      || (order.status === 'paid' && (order.fulfillment_status == null || NEEDS_ACTION.has(order.fulfillment_status)))
  }
  return true
}

function publicClaimCode(order: AiVideoOpsOrderRow): string | null {
  if (order.status !== 'paid') return null
  return isAiVideoClaimCode(order.claim_code) ? order.claim_code : null
}

export function presentAiVideoOpsOrder(order: AiVideoOpsOrderRow, now = new Date()) {
  const sku = resolveAiVideoSku(order.product_code)
  return {
    id: order.id,
    order_id: order.provider_order_id,
    email: order.email,
    sku: sku.code,
    label: sku.label,
    amount_idr: order.amount_idr,
    list_amount_idr: order.list_amount_idr ?? order.amount_idr,
    currency: 'IDR',
    payment_status: order.status,
    claim_code: publicClaimCode(order),
    fulfillment: order.status === 'paid' || order.status === 'held_for_review' || order.status === 'refunded'
      ? (order.fulfillment_status ?? (order.status === 'paid' ? 'processing' : null))
      : null,
    fulfillment_note: order.fulfillment_note,
    fulfillment_updated_at: order.fulfillment_updated_at,
    fulfillment_updated_by: order.fulfillment_updated_by,
    paid_at: order.paid_at,
    created_at: order.created_at,
    refund_requested_at: order.refund_requested_at,
    needs_action: matchesFilter(order, 'needs_action', now),
  }
}

export function presentAiVideoOpsPromo(row: AiVideoOpsPromoRow, now = new Date()) {
  return {
    id: row.id,
    serial: isAiVideoPromoSerial(row.serial) ? row.serial : null,
    source_order_id: row.source_provider_order_id,
    source_email: row.source_email,
    created_at: row.created_at,
    expires_at: row.expires_at,
    redeemed_at: row.redeemed_at,
    redeemed_order_id: row.redeemed_provider_order_id,
    redeemed_email: row.redeemed_email,
    status: promoStatus({ redeemedAt: row.redeemed_at, expiresAt: row.expires_at, now }),
  }
}

export async function listAiVideoOps(
  input: { filter?: string; q?: string; now?: Date },
  store: AiVideoOpsStore,
) {
  const filter = (input.filter ?? 'all') as AiVideoOpsFilter
  const allowed: AiVideoOpsFilter[] = ['all', 'today', 'unpaid', 'paid', 'needs_action']
  if (!allowed.includes(filter)) return { error: 'invalid_filter' as const, status: 400 }
  const now = input.now ?? new Date()
  const query = typeof input.q === 'string' ? input.q.trim().toLowerCase() : ''
  const [orders, promos] = await Promise.all([store.listOrders(), store.listPromos()])
  const visibleOrders = orders
    .filter((row) => matchesFilter(row, filter, now) && matchesSearch(row, query))
    .map((row) => presentAiVideoOpsOrder(row, now))
  const visiblePromos = promos
    .filter((row) => {
      if (!query) return true
      return [
        row.serial, row.source_email, row.source_provider_order_id,
        row.redeemed_email ?? '', row.redeemed_provider_order_id ?? '',
      ].join(' ').toLowerCase().includes(query)
    })
    .map((row) => presentAiVideoOpsPromo(row, now))
  const paidToday = orders.filter((row) =>
    row.status === 'paid' && row.paid_at && new Date(row.paid_at).getTime() >= jakartaDayStart(now).getTime(),
  )
  return {
    ok: true as const,
    generated_at: now.toISOString(),
    poll_seconds: 15,
    summary: {
      paid_today: paidToday.length,
      paid_today_idr: paidToday.reduce((sum, row) => sum + row.amount_idr, 0),
      unpaid: orders.filter((row) => UNPAID.has(row.status)).length,
      needs_action: orders.filter((row) => matchesFilter(row, 'needs_action', now)).length,
      unused_promos: visiblePromos.filter((row) => row.status === 'unused').length,
    },
    skus: Object.values(AI_VIDEO_SKUS).map((sku) => ({ code: sku.code, label: sku.label, price_idr: sku.priceIdr })),
    orders: visibleOrders,
    promos: visiblePromos,
  }
}

export async function setAiVideoOpsFulfillment(
  body: Record<string, unknown>,
  store: AiVideoOpsStore,
) {
  const orderId = typeof body.order_id === 'string' ? body.order_id : ''
  const status = typeof body.fulfillment === 'string' ? body.fulfillment : ''
  const note = typeof body.note === 'string' ? body.note.slice(0, 280) : null
  if (!UUID_RE.test(orderId) || !AI_VIDEO_FULFILLMENT_STATUSES.includes(status as AiVideoFulfillmentStatus)) {
    return { error: 'invalid_input' as const, status: 400 }
  }
  const updated = await store.setFulfillment({
    orderId,
    status: status as AiVideoFulfillmentStatus,
    actor: 'admin',
    note,
  })
  if (!updated) return { error: 'order_not_found' as const, status: 404 }
  return { ok: true as const, order: presentAiVideoOpsOrder(updated) }
}
