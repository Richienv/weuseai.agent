import { decryptCredential } from './integration-credential-crypto.ts'
import { getSeedanceTask, type ModelArkConfig, type SeedanceTask } from './modelark-client.ts'
import { TelegramBotClient } from './telegram-client.ts'
import type { AiVideoDeliveryJob, AiVideoProviderProcessorDeps } from './ai-video-provider-callback-handler.ts'

type SupabaseClientLike = any

export function createAiVideoProviderRuntime(input: {
  supabase: SupabaseClientLike
  encryptionKey: string
  botToken: string
  modelArk: ModelArkConfig
}): AiVideoProviderProcessorDeps & {
  findJobByTaskId(taskId: string): Promise<AiVideoDeliveryJob | null>
  findJobById(jobId: string): Promise<AiVideoDeliveryJob | null>
} {
  const { supabase, encryptionKey, botToken, modelArk } = input
  const telegram = new TelegramBotClient({ token: botToken })

  async function hydrate(row: Record<string, unknown> | null): Promise<AiVideoDeliveryJob | null> {
    if (!row?.provider_task_id || !row.provider_model_id || !row.channel_link_id) return null
    const [{ data: entitlement, error: entitlementError }, { data: channel, error: channelError }] = await Promise.all([
      supabase.from('ai_video_entitlements').select('status').eq('id', row.entitlement_id).eq('customer_id', row.customer_id).maybeSingle(),
      supabase.from('ai_video_channel_links').select('external_chat_id,status').eq('id', row.channel_link_id).maybeSingle(),
    ])
    if (entitlementError) throw entitlementError
    if (channelError) throw channelError
    if (!entitlement || !channel || channel.status !== 'active' || !channel.external_chat_id) return null
    return {
      id: String(row.id), customerId: String(row.customer_id), entitlementStatus: String(entitlement.status),
      providerTaskId: String(row.provider_task_id), providerModelId: String(row.provider_model_id),
      status: String(row.status), deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
      cleanupCompletedAt: row.cleanup_completed_at ? String(row.cleanup_completed_at) : null,
      channelChatId: String(channel.external_chat_id),
      inputBucket: row.input_bucket ? String(row.input_bucket) : null,
      inputPath: row.input_object_path ? String(row.input_object_path) : null,
    }
  }

  async function apiKey(customerId: string): Promise<string> {
    const { data, error } = await supabase.from('integration_credentials')
      .select('ciphertext,iv,auth_tag,key_version').eq('customer_id', customerId)
      .eq('integration', 'byteplus_modelark').is('revoked_at', null).maybeSingle()
    if (error) throw error
    if (!data) throw new Error('modelark_credential_missing')
    const plain = await decryptCredential(data, encryptionKey)
    let parsed: { api_key?: unknown }
    try { parsed = JSON.parse(plain) } catch { throw new Error('modelark_credential_invalid') }
    if (typeof parsed.api_key !== 'string') throw new Error('modelark_credential_invalid')
    return parsed.api_key
  }

  return {
    seedanceModelId: modelArk.seedanceModelId,
    async findJobByTaskId(taskId) {
      const { data, error } = await supabase.from('ai_video_render_jobs').select('*').eq('provider_task_id', taskId).maybeSingle()
      if (error) throw error
      return hydrate(data)
    },
    async findJobById(jobId) {
      const { data, error } = await supabase.from('ai_video_render_jobs').select('*').eq('id', jobId).maybeSingle()
      if (error) throw error
      return hydrate(data)
    },
    async getAuthoritativeTask(job) {
      return getSeedanceTask(job.providerTaskId, await apiKey(job.customerId), modelArk)
    },
    async updateProviderState(jobId: string, task: SeedanceTask) {
      const now = new Date().toISOString()
      const patch: Record<string, unknown> = { updated_at: now }
      if (task.status === 'queued') patch.status = 'submitted'
      else if (task.status === 'running') patch.status = 'running'
      else if (task.status === 'succeeded') {
        patch.status = 'succeeded'; patch.provider_video_url = task.videoUrl; patch.completed_at = now
      } else {
        patch.status = task.status; patch.failure_code = task.failureCode ?? `modelark_${task.status}`; patch.completed_at = now
      }
      const { error } = await supabase.from('ai_video_render_jobs').update(patch).eq('id', jobId)
      if (error) throw error
    },
    async claimDelivery(jobId) {
      const { data, error } = await supabase.rpc('claim_ai_video_delivery', { p_job_id: jobId, p_lease_seconds: 300 })
      if (error) throw error
      return data === true
    },
    async deliver(job, videoUrl) {
      await telegram.sendVideoAs(botToken, job.channelChatId, videoUrl, 'Video selesai. Kirim revisi sebagai brief baru kalau kamu ingin versi berikutnya.')
    },
    async markDelivered(jobId) {
      const now = new Date().toISOString()
      const { error } = await supabase.from('ai_video_render_jobs')
        .update({ delivered_at: now, lease_until: null, updated_at: now })
        .eq('id', jobId).is('delivered_at', null)
      if (error) throw error
    },
    async releaseDelivery(jobId) {
      const { error } = await supabase.from('ai_video_render_jobs')
        .update({ lease_until: null, updated_at: new Date().toISOString() }).eq('id', jobId)
      if (error) throw error
    },
    async cleanupInput(job) {
      if (job.inputBucket && job.inputPath) {
        const { error } = await supabase.storage.from(job.inputBucket).remove([job.inputPath])
        if (error) throw error
      }
      const { error } = await supabase.from('ai_video_render_jobs')
        .update({ cleanup_completed_at: new Date().toISOString(), lease_until: null, updated_at: new Date().toISOString() })
        .eq('id', job.id)
      if (error) throw error
    },
  }
}
