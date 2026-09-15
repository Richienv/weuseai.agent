// Read-only feed for the Studio "Karakter" picker: founder identities plus the
// identities registered by the customer behind a claim code. Only verified,
// unrevoked identities and their active assets come back; the start handler
// re-checks ownership server-side, so this list is a convenience, not a gate.

import { isAiVideoClaimCode } from './ai-video-claim-code.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AiVideoIdentityPickerAssetType = 'Image' | 'Video' | 'Audio'

export type AiVideoIdentityPickerAsset = {
  id: string
  asset_id: string
  asset_type: AiVideoIdentityPickerAssetType
  slot: string
}

export type AiVideoIdentityPickerItem = {
  id: string
  display_name: string
  owner_kind: 'founder' | 'customer'
  assets: AiVideoIdentityPickerAsset[]
}

// Raw identity row with its embedded assets, as the store returns it.
export type AiVideoIdentityReadRow = {
  id: string
  display_name: string
  owner_kind: string
  customer_id: string | null
  order_id: string | null
  verification_status: string
  revoked_at: string | null
  assets: Array<{
    id: string
    asset_id: string
    asset_type: string
    status: string
    name: string | null
    deleted_at: string | null
  }>
}

export type AiVideoIdentityReadScope = { orderId: string | null; customerId: string | null }

export type AiVideoIdentityReadStore = {
  findOrderByTid(tid: string): Promise<{ id: string; customerId: string | null } | null>
  listIdentities(scope: AiVideoIdentityReadScope): Promise<AiVideoIdentityReadRow[]>
}

export const aiVideoIdentityReadConfigured = (): boolean => Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY)

const ASSET_TYPE_ORDER: Record<AiVideoIdentityPickerAssetType, number> = { Image: 0, Video: 1, Audio: 2 }

function isAssetType(value: unknown): value is AiVideoIdentityPickerAssetType {
  return value === 'Image' || value === 'Video' || value === 'Audio'
}

// Pure shaping: drop anything the Studio must not offer, then sort founder
// identities first and, inside each, images before video before audio.
export function presentAiVideoIdentityPicker(
  rows: readonly AiVideoIdentityReadRow[],
  scope: AiVideoIdentityReadScope,
): AiVideoIdentityPickerItem[] {
  const items: AiVideoIdentityPickerItem[] = []
  for (const row of rows) {
    if (row.verification_status !== 'verified' || row.revoked_at) continue
    const founder = row.owner_kind === 'founder'
    if (!founder) {
      const sameOrder = Boolean(scope.orderId) && row.order_id === scope.orderId
      const sameCustomer = Boolean(scope.customerId) && row.customer_id === scope.customerId
      if (!sameOrder && !sameCustomer) continue
    }
    const assets = row.assets
      .filter((asset) => asset.status === 'active' && !asset.deleted_at && isAssetType(asset.asset_type))
      .map((asset) => ({
        id: asset.id,
        asset_id: asset.asset_id,
        asset_type: asset.asset_type as AiVideoIdentityPickerAssetType,
        slot: asset.name?.trim() || asset.asset_type.toLowerCase(),
      }))
      .sort((a, b) => ASSET_TYPE_ORDER[a.asset_type] - ASSET_TYPE_ORDER[b.asset_type] || a.slot.localeCompare(b.slot))
    if (!assets.length) continue
    items.push({
      id: row.id,
      display_name: row.display_name,
      owner_kind: founder ? 'founder' : 'customer',
      assets,
    })
  }
  return items.sort((a, b) =>
    (a.owner_kind === 'founder' ? 0 : 1) - (b.owner_kind === 'founder' ? 0 : 1)
    || a.display_name.localeCompare(b.display_name))
}

export async function listAiVideoIdentitiesForPicker(
  input: { tid: string },
  store: AiVideoIdentityReadStore,
): Promise<{ identities: AiVideoIdentityPickerItem[] } | { error: 'order_not_found'; status: 404 }> {
  const tid = input.tid.trim()
  let scope: AiVideoIdentityReadScope = { orderId: null, customerId: null }
  if (tid) {
    const order = isAiVideoClaimCode(tid) ? await store.findOrderByTid(tid) : null
    if (!order) return { error: 'order_not_found', status: 404 }
    scope = { orderId: order.id, customerId: order.customerId }
  }
  const rows = await store.listIdentities(scope)
  return { identities: presentAiVideoIdentityPicker(rows, scope) }
}

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    accept: 'application/json',
  }
}

export function createAiVideoIdentityReadStore(): AiVideoIdentityReadStore {
  return {
    async findOrderByTid(tid) {
      if (!isAiVideoClaimCode(tid)) return null
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_orders?select=id,customer_id&claim_code=eq.${tid}&limit=1`,
        { headers: supabaseHeaders() },
      )
      if (!response.ok) throw new Error(`identity_order ${response.status}`)
      const rows = await response.json() as Array<{ id?: string; customer_id?: string | null }>
      const row = rows[0]
      if (!row?.id) return null
      return { id: row.id, customerId: row.customer_id ? String(row.customer_id) : null }
    },
    async listIdentities(scope) {
      const owners = ['owner_kind.eq.founder']
      if (scope.orderId && UUID_RE.test(scope.orderId)) owners.push(`order_id.eq.${scope.orderId}`)
      if (scope.customerId && UUID_RE.test(scope.customerId)) owners.push(`customer_id.eq.${scope.customerId}`)
      const select = 'id,display_name,owner_kind,customer_id,order_id,verification_status,revoked_at,'
        + 'ai_video_identity_assets(id,asset_id,asset_type,status,name,deleted_at)'
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_identities?select=${select}`
        + `&verification_status=eq.verified&revoked_at=is.null&or=(${owners.join(',')})`
        + '&ai_video_identity_assets.status=eq.active&ai_video_identity_assets.deleted_at=is.null'
        + '&order=display_name.asc&limit=100',
        { headers: supabaseHeaders() },
      )
      if (!response.ok) throw new Error(`identity_list ${response.status}`)
      const rows = await response.json() as Array<Record<string, unknown>>
      return rows.map((row) => ({
        id: String(row.id ?? ''),
        display_name: String(row.display_name ?? ''),
        owner_kind: String(row.owner_kind ?? ''),
        customer_id: row.customer_id ? String(row.customer_id) : null,
        order_id: row.order_id ? String(row.order_id) : null,
        verification_status: String(row.verification_status ?? ''),
        revoked_at: row.revoked_at ? String(row.revoked_at) : null,
        assets: (Array.isArray(row.ai_video_identity_assets) ? row.ai_video_identity_assets as Array<Record<string, unknown>> : []).map((asset) => ({
          id: String(asset.id ?? ''),
          asset_id: String(asset.asset_id ?? ''),
          asset_type: String(asset.asset_type ?? ''),
          status: String(asset.status ?? ''),
          name: asset.name ? String(asset.name) : null,
          deleted_at: asset.deleted_at ? String(asset.deleted_at) : null,
        })),
      }))
    },
  }
}
