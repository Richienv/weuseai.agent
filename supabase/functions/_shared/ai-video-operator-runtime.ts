import {
  isAiVideoOperatorModel,
  isAiVideoOperatorProvider,
  isAiVideoOperatorResolution,
  isOperatorAssetRef,
  operatorAssetIdFromRef,
  operatorJobProvider,
  operatorMaxRefs,
  type AiVideoOperatorJob,
  type AiVideoOperatorModel,
  type AiVideoOperatorProvider,
  type AiVideoOperatorResolution,
} from './ai-video-operator.ts'
import {
  processAiVideoOperatorJob,
  type AiVideoOperatorDeliveryJob,
  type AiVideoOperatorProcessorDeps,
} from './ai-video-operator-callback-handler.ts'
import {
  createMonidSeedanceRun,
  getMonidRun,
  resolveMonidConfig,
} from './monid-client.ts'
import {
  ARK_SEEDANCE_25_MODEL_ID,
  createArkSeedanceTask,
  getArkSeedanceTask,
  resolveArkVideoConfig,
  type ArkVideoConfig,
  type SeedanceTask,
} from './modelark-client.ts'

type SupabaseClientLike = any

// Minimum plausible length for a BytePlus merchant key; the same bar the Ark
// client applies. Below this the job fails fast with modelark_not_configured.
const MODELARK_KEY_MIN_LENGTH = 16

export function asOperatorDeliveryJob(row: Record<string, unknown>): AiVideoOperatorDeliveryJob {
  return asJob(row)
}

function asJob(row: Record<string, unknown>): AiVideoOperatorDeliveryJob {
  const refUrls = Array.isArray(row.ref_urls) ? row.ref_urls.map(String) : []
  return {
    id: String(row.id),
    status: row.status as AiVideoOperatorJob['status'],
    prompt: String(row.prompt ?? ''),
    ratio: row.ratio as AiVideoOperatorJob['ratio'],
    durationSeconds: Number(row.duration_seconds) || 6,
    generateAudio: row.generate_audio === true,
    resolution: row.resolution ? String(row.resolution) : '720p',
    provider: isAiVideoOperatorProvider(row.provider) ? row.provider : operatorJobProvider(refUrls),
    providerTaskId: row.provider_task_id ? String(row.provider_task_id) : null,
    providerModelId: row.provider_model_id ? String(row.provider_model_id) : null,
    refUrls,
    refRoles: Array.isArray(row.ref_roles) ? row.ref_roles.map(String) : [],
    resultPath: row.result_path ? String(row.result_path) : null,
    attempt: Number(row.attempt) || 0,
  }
}

function modelOf(job: AiVideoOperatorDeliveryJob, row?: Record<string, unknown> | null): AiVideoOperatorModel {
  const raw = job.providerModelId || (row?.provider_model_id ? String(row.provider_model_id) : 'seedance-2.5')
  return isAiVideoOperatorModel(raw) ? raw : 'seedance-2.5'
}

function resolutionOf(job: AiVideoOperatorDeliveryJob, row?: Record<string, unknown> | null): AiVideoOperatorResolution {
  const raw = job.resolution || (row?.resolution ? String(row.resolution) : '720p')
  return isAiVideoOperatorResolution(raw) ? raw : '720p'
}

// The stored provider wins; a row without one (pre-identity-lane) is derived
// from its refs, so an asset:// job can never fall through to Monid.
export function operatorProviderOf(
  job: Pick<AiVideoOperatorDeliveryJob, 'provider' | 'refUrls'>,
  row?: Record<string, unknown> | null,
): AiVideoOperatorProvider {
  if (isAiVideoOperatorProvider(job.provider)) return job.provider
  if (row && isAiVideoOperatorProvider(row.provider)) return row.provider
  const refUrls = Array.isArray(row?.ref_urls) ? row!.ref_urls.map(String) : job.refUrls
  return operatorJobProvider(refUrls)
}

// Ark leaves failureCode null for expired/cancelled; keep the code namespaced
// to the provider so the Studio does not label an Ark failure as Monid.
function arkTaskWithFailureCode(task: SeedanceTask): SeedanceTask {
  if (task.status === 'queued' || task.status === 'running' || task.status === 'succeeded' || task.failureCode) return task
  return { ...task, failureCode: `modelark_${task.status}` }
}

export function createAiVideoOperatorRuntime(input: {
  supabase: SupabaseClientLike
  apiKey: string
  baseUrl?: string
  // BytePlus merchant key + Ark base for verified-identity (asset://) jobs.
  modelArkApiKey?: string
  modelArkBaseUrl?: string
}): AiVideoOperatorProcessorDeps & {
  findJobByTaskId(taskId: string): Promise<AiVideoOperatorDeliveryJob | null>
  findJobById(jobId: string): Promise<AiVideoOperatorDeliveryJob | null>
} {
  const { supabase, apiKey } = input
  const monid = resolveMonidConfig({ baseUrl: input.baseUrl })
  const modelArkApiKey = input.modelArkApiKey ?? ''
  let arkConfig: ArkVideoConfig | null = null

  function ark(): { apiKey: string; config: ArkVideoConfig } {
    if (modelArkApiKey.trim().length < MODELARK_KEY_MIN_LENGTH) throw new Error('modelark_not_configured')
    arkConfig ??= resolveArkVideoConfig({ baseUrl: input.modelArkBaseUrl })
    return { apiKey: modelArkApiKey, config: arkConfig }
  }

  // Best effort: a missed timestamp must never fail a job whose task is
  // already billed on Ark.
  async function touchIdentityAssets(urls: readonly string[]): Promise<void> {
    const assetIds = urls.filter(isOperatorAssetRef).map(operatorAssetIdFromRef)
    if (!assetIds.length) return
    try {
      await supabase.from('ai_video_identity_assets')
        .update({ last_inference_at: new Date().toISOString() })
        .in('asset_id', assetIds)
    } catch (error) {
      console.error(JSON.stringify({ event: 'identity_asset_touch_failed', asset_ids: assetIds, message: error instanceof Error ? error.message : 'unknown' }))
    }
  }

  // ref_roles is parallel to [...ref_urls, ...ref_paths]. Indexing by the
  // original position keeps roles aligned even when signing one path fails.
  async function signedRefs(row: Record<string, unknown>): Promise<{ urls: string[]; roles: string[] }> {
    const rawUrls = Array.isArray(row.ref_urls) ? row.ref_urls.map(String).filter(Boolean) : []
    const paths = Array.isArray(row.ref_paths) ? row.ref_paths.map(String).filter(Boolean) : []
    const declared = Array.isArray(row.ref_roles) ? row.ref_roles.map(String) : []
    const urls: string[] = []
    const roles: string[] = []
    rawUrls.forEach((url, index) => {
      urls.push(url)
      roles.push(declared[index] ?? 'reference_image')
    })
    for (let index = 0; index < paths.length; index++) {
      const { data, error } = await supabase.storage.from('ai-video-inputs').createSignedUrl(paths[index], 60 * 60)
      if (error || !data?.signedUrl) throw new Error('operator_reference_unavailable')
      urls.push(data.signedUrl)
      roles.push(declared[rawUrls.length + index] ?? 'reference_image')
    }
    const model = isAiVideoOperatorModel(row.provider_model_id) ? row.provider_model_id : 'seedance-2.5'
    if (urls.length > operatorMaxRefs(model)) throw new Error('operator_ref_cap')
    return { urls, roles }
  }

  return {
    seedanceModelId: 'seedance-2.5',
    async findJobByTaskId(taskId) {
      const { data, error } = await supabase.from('ai_video_operator_jobs').select('*').eq('provider_task_id', taskId).maybeSingle()
      if (error) throw error
      return data ? asJob(data) : null
    },
    async findJobById(jobId) {
      const { data, error } = await supabase.from('ai_video_operator_jobs').select('*').eq('id', jobId).maybeSingle()
      if (error) throw error
      return data ? asJob(data) : null
    },
    async beginSubmission(jobId) {
      const { data, error } = await supabase.from('ai_video_operator_jobs')
        .update({ attempt: 1, updated_at: new Date().toISOString() })
        .eq('id', jobId).eq('status', 'queued').eq('attempt', 0).is('provider_task_id', null).select('id')
      if (error) throw error
      return Boolean(data?.length)
    },
    async recordSyncError(jobId, code) {
      const { error } = await supabase.from('ai_video_operator_jobs')
        .update({ error_code: code, updated_at: new Date().toISOString() })
        .eq('id', jobId).in('status', ['submitted', 'running'])
      if (error) throw error
    },
    async submit(job) {
      const { data, error } = await supabase.from('ai_video_operator_jobs').select('*').eq('id', job.id).maybeSingle()
      if (error) throw error
      const refs = data ? await signedRefs(data) : { urls: job.refUrls, roles: job.refRoles }
      const model = modelOf(job, data)
      if (operatorProviderOf(job, data) === 'byteplus_modelark') {
        const { apiKey: arkKey, config } = ark()
        // asset:// refs pass straight through; Ark resolves them from the
        // merchant asset library. Signed https refs ride along untouched.
        const task = await createArkSeedanceTask({
          plan: {
            prompt: job.prompt,
            ratio: job.ratio,
            durationSeconds: job.durationSeconds,
            resolution: resolutionOf(job, data),
            generateAudio: job.generateAudio,
            model: ARK_SEEDANCE_25_MODEL_ID,
          },
          refs: refs.urls.map((url, index) => ({ url, role: refs.roles[index] ?? null })),
        }, arkKey, config)
        await touchIdentityAssets(refs.urls)
        return task
      }
      return createMonidSeedanceRun({
        plan: {
          prompt: job.prompt,
          ratio: job.ratio,
          durationSeconds: job.durationSeconds,
          generateAudio: job.generateAudio,
          model,
          resolution: resolutionOf(job, data),
        },
        signedInputUrls: refs.urls,
        refRoles: refs.roles,
      }, apiKey, monid)
    },
    async getAuthoritativeTask(job) {
      if (!job.providerTaskId) throw new Error('operator_task_missing')
      if (operatorProviderOf(job) === 'byteplus_modelark') {
        const { apiKey: arkKey, config } = ark()
        return arkTaskWithFailureCode(await getArkSeedanceTask(job.providerTaskId, arkKey, config))
      }
      return getMonidRun(job.providerTaskId, apiKey, monid)
    },
    async markSubmitted(jobId, taskId) {
      const { data } = await supabase.from('ai_video_operator_jobs').select('provider_model_id,provider,ref_urls').eq('id', jobId).maybeSingle()
      const model = data?.provider_model_id && isAiVideoOperatorModel(String(data.provider_model_id))
        ? String(data.provider_model_id)
        : 'seedance-2.5'
      const now = new Date().toISOString()
      const { error } = await supabase.from('ai_video_operator_jobs').update({
        status: 'submitted',
        provider: operatorProviderOf({ provider: null, refUrls: [] }, data ?? null),
        provider_model_id: model,
        provider_task_id: taskId,
        attempt: 1,
        submitted_at: now,
        updated_at: now,
        error_code: null,
      }).eq('id', jobId).eq('status', 'queued')
      if (error) throw error
    },
    async updateProviderState(jobId: string, task: SeedanceTask) {
      const { data: previous, error: previousError } = await supabase.from('ai_video_operator_jobs').select('usage,provider,ref_urls').eq('id', jobId).single()
      if (previousError) throw previousError
      const codePrefix = operatorProviderOf({ provider: null, refUrls: [] }, previous ?? null) === 'byteplus_modelark' ? 'modelark' : 'monid'
      const now = new Date().toISOString()
      const patch: Record<string, unknown> = {
        updated_at: now,
        usage: { ...(previous?.usage ?? {}), ...(task.usage.raw ?? {}) },
        error_code: null,
      }
      if (task.status === 'queued') patch.status = 'submitted'
      else if (task.status === 'running') patch.status = 'running'
      else if (task.status === 'succeeded') {
        patch.provider_video_url = task.videoUrl
        patch.status = 'running'
      } else {
        patch.status = task.status === 'cancelled' ? 'cancelled' : 'failed'
        patch.error_code = task.failureCode ?? `${codePrefix}_${task.status}`
        patch.completed_at = now
        patch.lease_until = null
      }
      const { error } = await supabase.from('ai_video_operator_jobs').update(patch).eq('id', jobId)
      if (error) throw error
    },
    async claimDelivery(jobId) {
      const { data, error } = await supabase.rpc('claim_ai_video_operator_delivery', {
        p_job_id: jobId, p_lease_seconds: 300,
      })
      if (error) throw error
      return data === true
    },
    async storeResult(job, videoUrl) {
      const download = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) })
      if (!download.ok) throw new Error('operator_result_download')
      const declaredSize = Number(download.headers.get('content-length'))
      if (declaredSize > 80 * 1024 * 1024) throw new Error('operator_result_size')
      const bytes = new Uint8Array(await download.arrayBuffer())
      if (bytes.byteLength < 32 || bytes.byteLength > 80 * 1024 * 1024) throw new Error('operator_result_size')
      if (String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp') throw new Error('operator_result_format')
      const path = `operator/${job.id}/result.mp4`
      const { error: uploadError } = await supabase.storage.from('ai-video-inputs').upload(path, bytes, {
        contentType: 'video/mp4',
        upsert: true,
      })
      if (uploadError) throw uploadError
      const now = new Date().toISOString()
      const { error: jobError } = await supabase.from('ai_video_operator_jobs').update({
        status: 'succeeded',
        error_code: null,
        result_bucket: 'ai-video-inputs',
        result_path: path,
        provider_video_url: videoUrl,
        completed_at: now,
        lease_until: null,
        updated_at: now,
      }).eq('id', job.id)
      if (jobError) throw jobError
      const { error: assetError } = await supabase.from('ai_video_operator_assets').insert({
        job_id: job.id, kind: 'result', bucket: 'ai-video-inputs', path,
      })
      if (assetError && !String(assetError.message ?? assetError.code ?? '').includes('duplicate')) {
        throw assetError
      }
      const raw = job.providerTaskId || job.providerModelId ? (await supabase.from('ai_video_operator_jobs').select('usage,provider_model_id,provider_task_id,provider,ref_urls').eq('id', job.id).maybeSingle()).data : null
      const usage = raw?.usage && typeof raw.usage === 'object' ? raw.usage as Record<string, unknown> : {}
      const cost = usage.cost && typeof usage.cost === 'object' ? usage.cost as { value?: unknown } : null
      const amount = typeof usage.cost_usd === 'number'
        ? usage.cost_usd
        : typeof cost?.value === 'number' ? cost.value : null
      await supabase.from('ai_video_operator_costs').insert({
        job_id: job.id,
        kind: 'seedance',
        model: raw?.provider_model_id ?? job.providerModelId ?? 'seedance-2.5',
        amount_usd: amount,
        meta: {
          provider: operatorProviderOf(job, raw ?? null),
          provider_task_id: raw?.provider_task_id ?? job.providerTaskId,
          usage,
        },
      })
    },
    async markFailed(jobId, code) {
      const now = new Date().toISOString()
      const { error } = await supabase.from('ai_video_operator_jobs').update({
        status: 'failed', error_code: code, completed_at: now, lease_until: null, updated_at: now,
      }).eq('id', jobId)
      if (error) throw error
    },
    async releaseDelivery(jobId) {
      const { error } = await supabase.from('ai_video_operator_jobs')
        .update({ lease_until: null, updated_at: new Date().toISOString() }).eq('id', jobId)
      if (error) throw error
    },
  }
}

export async function runAiVideoOperatorWorker(input: {
  claim(limit: number, leaseSeconds: number): Promise<AiVideoOperatorDeliveryJob[]>
  processor: AiVideoOperatorProcessorDeps
}): Promise<{ claimed: number; completed: number; failed: number }> {
  const jobs = await input.claim(1, 300)
  let completed = 0
  let failed = 0
  for (const job of jobs) {
    try {
      const result = await processAiVideoOperatorJob(job, input.processor)
      if (result === 'submitted' || result === 'pending') {
        await input.processor.releaseDelivery(job.id)
      }
      completed++
    } catch (error) {
      const raw = error instanceof Error ? error.message : ''
      const provider = operatorProviderOf(job)
      console.error(JSON.stringify({ event: 'operator_job_error', job_id: job.id, provider, provider_task_id: job.providerTaskId, phase: job.status, code: /^(monid_|modelark_|operator_|invalid_)/.test(raw) ? raw.slice(0, 80) : 'request_failed' }))
      if (job.status === 'queued' && !job.providerTaskId) {
        const code = /^(monid_(?:prompt_limit|rejected|unauthorized|blocked|rate_limited)|modelark_(?:not_configured|prompt_limit|moderation_rejected|unauthorized|rate_limited)|operator_reference_|invalid_)/.test(raw)
          ? raw.slice(0, 80) : provider === 'byteplus_modelark' ? 'modelark_submission_unknown' : 'monid_submission_unknown'
        await input.processor.markFailed(job.id, code).catch(() => undefined)
      } else if (input.processor.recordSyncError) {
        await input.processor.recordSyncError(job.id, raw.startsWith('operator_result_') ? 'operator_result_store_failed' : 'operator_poll_unavailable').catch(() => undefined)
      }
      await input.processor.releaseDelivery(job.id).catch(() => undefined)
      failed++
    }
  }
  return { claimed: jobs.length, completed, failed }
}
