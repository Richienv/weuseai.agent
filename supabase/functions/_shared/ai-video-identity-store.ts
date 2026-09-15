// Supabase (service-role) store for the ai-video-identity function.
// Tables and view come from 20260914010000_ai_video_identities.sql. The
// handler owns every rule; this file only moves rows and Storage objects.

import {
  AI_VIDEO_IDENTITY_BUCKET,
  type AiVideoIdentityAssetRow,
  type AiVideoIdentityRow,
  type AiVideoIdentityStore,
} from './ai-video-identity-handler.ts'

type SupabaseClientLike = any

const IDENTITY_COLUMNS = [
  'id', 'owner_kind', 'customer_id', 'order_id', 'display_name', 'group_id', 'verification_status',
  'byted_token_enc', 'session_expires_at', 'callback_nonce_hash', 'callback_result_code', 'consent_at',
  'consent_text_version', 'verification_billed', 'created_at', 'revoked_at',
].join(',')

const ASSET_COLUMNS = [
  'id', 'identity_id', 'asset_id', 'asset_type', 'status', 'failed_reason', 'source_path', 'name',
  'last_checked_at', 'last_inference_at', 'created_at', 'deleted_at',
].join(',')

export function createAiVideoIdentitySupabaseStore(
  supabase: SupabaseClientLike,
  bucket: string = AI_VIDEO_IDENTITY_BUCKET,
): AiVideoIdentityStore {
  return {
    async findOrder(orderId, customerId) {
      const { data, error } = await supabase.from('ai_video_orders')
        .select('id,customer_id,status').eq('id', orderId).eq('customer_id', customerId).maybeSingle()
      if (error) throw error
      return data ? { id: String(data.id), customer_id: String(data.customer_id), status: String(data.status) } : null
    },
    async listIdentities(filter) {
      let query = supabase.from('ai_video_identities').select(IDENTITY_COLUMNS)
        .is('revoked_at', null).order('created_at', { ascending: false }).limit(60)
      if (filter.customerId) query = query.eq('customer_id', filter.customerId)
      if (filter.orderId) query = query.eq('order_id', filter.orderId)
      if (filter.ownerKind) query = query.eq('owner_kind', filter.ownerKind)
      const { data, error } = await query
      if (error) throw error
      return ((data ?? []) as AiVideoIdentityRow[])
    },
    async getIdentity(id) {
      const { data, error } = await supabase.from('ai_video_identities').select(IDENTITY_COLUMNS).eq('id', id).maybeSingle()
      if (error) throw error
      return (data as AiVideoIdentityRow | null) ?? null
    },
    async findIdentityByNonceHash(hash) {
      const { data, error } = await supabase.from('ai_video_identities').select(IDENTITY_COLUMNS)
        .eq('callback_nonce_hash', hash).maybeSingle()
      if (error) throw error
      return (data as AiVideoIdentityRow | null) ?? null
    },
    async insertIdentity(input) {
      const { data, error } = await supabase.from('ai_video_identities').insert(input).select(IDENTITY_COLUMNS).single()
      if (error) throw mapDbError(error)
      return data as AiVideoIdentityRow
    },
    async updateIdentity(id, patch) {
      const { data, error } = await supabase.from('ai_video_identities')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id).select(IDENTITY_COLUMNS).single()
      if (error) throw mapDbError(error)
      return data as AiVideoIdentityRow
    },
    async insertConsent(input) {
      const { error } = await supabase.from('consent_events').insert(input)
      if (error) throw error
    },
    async listAssets(identityIds) {
      if (identityIds.length === 0) return []
      const { data, error } = await supabase.from('ai_video_identity_assets').select(ASSET_COLUMNS)
        .in('identity_id', [...identityIds]).is('deleted_at', null).order('created_at', { ascending: true })
      if (error) throw error
      return ((data ?? []) as AiVideoIdentityAssetRow[])
    },
    async insertAsset(input) {
      const { data, error } = await supabase.from('ai_video_identity_assets').insert(input).select(ASSET_COLUMNS).single()
      if (error) throw mapDbError(error)
      return data as AiVideoIdentityAssetRow
    },
    async updateAsset(id, patch) {
      const { data, error } = await supabase.from('ai_video_identity_assets')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id).select(ASSET_COLUMNS).single()
      if (error) throw mapDbError(error)
      return data as AiVideoIdentityAssetRow
    },
    async countAssetsCreatedSince(sinceIso) {
      const { count, error } = await supabase.from('ai_video_identity_assets')
        .select('id', { count: 'exact', head: true }).gte('created_at', sinceIso)
      if (error) throw error
      return Number(count) || 0
    },
    async quota() {
      const { data, error } = await supabase.from('ai_video_identity_quota')
        .select('active_assets,groups,asset_limit,group_limit,alert').limit(1).maybeSingle()
      if (error) throw error
      return {
        active_assets: Number(data?.active_assets) || 0,
        groups: Number(data?.groups) || 0,
        asset_limit: Number(data?.asset_limit) || 50,
        group_limit: Number(data?.group_limit) || 50,
        alert: data?.alert === true,
      }
    },
    async gcCandidates(limit) {
      const { data, error } = await supabase.rpc('ai_video_identity_gc_candidates')
      if (error) throw error
      return ((Array.isArray(data) ? data : []) as AiVideoIdentityAssetRow[]).slice(0, limit)
    },
    async createSignedUploadUrl(path) {
      const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path)
      if (error || !data?.signedUrl) throw new Error('upload_sign_failed')
      return { url: String(data.signedUrl), token: typeof data.token === 'string' && data.token ? data.token : null }
    },
    async statObject(path) {
      const slash = path.lastIndexOf('/')
      const dir = slash > 0 ? path.slice(0, slash) : ''
      const file = slash > 0 ? path.slice(slash + 1) : path
      const { data, error } = await supabase.storage.from(bucket).list(dir, { limit: 5, search: file })
      if (error) throw new Error('storage_list_failed')
      const match = (Array.isArray(data) ? data : []).find((row: { name?: unknown }) => row?.name === file)
      if (!match) return null
      const metadata = (match as { metadata?: Record<string, unknown> | null }).metadata ?? null
      const size = metadata && typeof metadata.size === 'number' ? metadata.size : null
      const contentType = metadata && typeof metadata.mimetype === 'string' ? metadata.mimetype : null
      return { size, contentType }
    },
    async createSignedDownloadUrl(path, ttlSeconds) {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSeconds)
      if (error || !data?.signedUrl) throw new Error('download_sign_failed')
      return String(data.signedUrl)
    },
  }
}

// PostgREST surfaces trigger RAISEs as message text and unique violations as
// code 23505; the handler keys on stable Error messages.
function mapDbError(error: { code?: unknown; message?: unknown; details?: unknown }): Error {
  const text = `${String(error.message ?? '')} ${String(error.details ?? '')}`
  if (text.includes('identity_asset_cap')) return new Error('identity_asset_cap')
  if (text.includes('identity_not_found')) return new Error('not_found')
  if (error.code === '23505' || /duplicate key/i.test(text)) return new Error('duplicate')
  return error instanceof Error ? error : new Error(String(error.message ?? 'db_error'))
}
