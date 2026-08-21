import {
  listAiVideoOps,
  setAiVideoOpsFulfillment,
  type AiVideoOpsOrderRow,
  type AiVideoOpsPromoRow,
  type AiVideoOpsStore,
} from './admin-ai-video-ops-handler.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

function supabaseHeaders(prefer?: string): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    accept: 'application/json',
    ...(prefer ? { prefer } : {}),
  }
}

type OrderJoin = {
  id: string
  provider_order_id: string
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
  customers: { email: string } | { email: string }[] | null
}

function emailOf(value: OrderJoin['customers']): string {
  if (!value) return ''
  if (Array.isArray(value)) return value[0]?.email ?? ''
  return value.email ?? ''
}

function asOrder(row: OrderJoin): AiVideoOpsOrderRow {
  return {
    id: row.id,
    provider_order_id: row.provider_order_id,
    email: emailOf(row.customers),
    product_code: row.product_code,
    amount_idr: row.amount_idr,
    list_amount_idr: row.list_amount_idr,
    status: row.status,
    claim_code: row.claim_code,
    fulfillment_status: row.fulfillment_status,
    fulfillment_note: row.fulfillment_note,
    fulfillment_updated_at: row.fulfillment_updated_at,
    fulfillment_updated_by: row.fulfillment_updated_by,
    paid_at: row.paid_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    refund_requested_at: row.refund_requested_at,
  }
}

export function createAiVideoOpsStore(): AiVideoOpsStore {
  return {
    async listOrders() {
      const select = [
        'id,provider_order_id,product_code,amount_idr,list_amount_idr,status,claim_code',
        'fulfillment_status,fulfillment_note,fulfillment_updated_at,fulfillment_updated_by',
        'paid_at,created_at,updated_at,refund_requested_at,customers(email)',
      ].join(',')
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_orders?select=${encodeURIComponent(select)}&order=created_at.desc&limit=300`,
        { headers: supabaseHeaders() },
      )
      if (!response.ok) throw new Error(`orders ${response.status}`)
      const rows = await response.json() as OrderJoin[]
      return rows.map(asOrder)
    },
    async listPromos() {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_promos?select=id,serial,source_order_id,created_at,expires_at,redeemed_at,redeemed_order_id&order=created_at.desc&limit=300`,
        { headers: supabaseHeaders() },
      )
      if (!response.ok) throw new Error(`promos ${response.status}`)
      const rows = await response.json() as Array<Record<string, unknown>>
      const orderIds = [...new Set(rows.flatMap((row) => [row.source_order_id, row.redeemed_order_id].filter(Boolean)))]
      const orders = new Map<string, { provider_order_id: string; email: string }>()
      if (orderIds.length > 0) {
        const orderSelect = 'id,provider_order_id,customers(email)'
        const orderRes = await fetch(
          `${SUPABASE_URL}/rest/v1/ai_video_orders?select=${encodeURIComponent(orderSelect)}&id=in.(${orderIds.join(',')})`,
          { headers: supabaseHeaders() },
        )
        if (orderRes.ok) {
          const orderRows = await orderRes.json() as Array<OrderJoin & { id: string }>
          for (const order of orderRows) {
            orders.set(order.id, { provider_order_id: order.provider_order_id, email: emailOf(order.customers) })
          }
        }
      }
      return rows.map((row) => {
        const source = orders.get(String(row.source_order_id))
        const redeemed = row.redeemed_order_id ? orders.get(String(row.redeemed_order_id)) : null
        return {
          id: String(row.id),
          serial: String(row.serial ?? ''),
          source_order_id: String(row.source_order_id),
          source_provider_order_id: source?.provider_order_id ?? '',
          source_email: source?.email ?? '',
          created_at: String(row.created_at),
          expires_at: String(row.expires_at),
          redeemed_at: row.redeemed_at ? String(row.redeemed_at) : null,
          redeemed_order_id: row.redeemed_order_id ? String(row.redeemed_order_id) : null,
          redeemed_provider_order_id: redeemed?.provider_order_id ?? null,
          redeemed_email: redeemed?.email ?? null,
        } satisfies AiVideoOpsPromoRow
      })
    },
    async setFulfillment(input) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/set_ai_video_fulfillment`, {
        method: 'POST',
        headers: { ...supabaseHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          p_order_id: input.orderId,
          p_status: input.status,
          p_actor: input.actor,
          p_note: input.note ?? null,
        }),
      })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`fulfillment ${response.status}`)
      const row = await response.json() as OrderJoin
      const customerRes = await fetch(
        `${SUPABASE_URL}/rest/v1/customers?select=email&id=eq.${row.customer_id ?? ''}&limit=1`,
        { headers: supabaseHeaders() },
      )
      let email = ''
      if (customerRes.ok) {
        const customers = await customerRes.json() as Array<{ email?: string }>
        email = customers[0]?.email ?? ''
      }
      return asOrder({ ...row, customers: { email } })
    },
    async findOrder(orderId) {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_orders?select=id,status,amount_idr,currency,provider_payment_id,refund_request_id&id=eq.${orderId}&limit=1`,
        { headers: supabaseHeaders() },
      )
      if (!response.ok) throw new Error(`order ${response.status}`)
      const rows = await response.json() as Array<Record<string, unknown>>
      const row = rows[0]
      if (!row) return null
      return {
        id: String(row.id),
        status: String(row.status),
        amountIdr: Number(row.amount_idr),
        currency: String(row.currency),
        providerPaymentId: row.provider_payment_id ? String(row.provider_payment_id) : null,
        refundRequestId: row.refund_request_id ? String(row.refund_request_id) : null,
      }
    },
  }
}

export { listAiVideoOps, setAiVideoOpsFulfillment }
export const aiVideoOpsConfigured = (): boolean => Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY)
