import { randomUUID } from 'node:crypto'

import { isAiVideoClaimCode } from './ai-video-claim-code.js'
import {
  inferOperatorRefRole,
  isAiVideoOperatorModel,
  isAiVideoOperatorProvider,
  isAiVideoOperatorResolution,
  isOperatorRefRole,
  isOperatorUploadName,
  operatorJobProvider,
  parseOperatorLibraryTitle,
  SEEDANCE_25_PROMPT_HINT,
  type AiVideoIdentityAssetLink,
  type AiVideoOperatorCharacter,
  type AiVideoOperatorJob,
  type AiVideoOperatorLibraryItem,
} from './ai-video-operator.js'
import { createMonidSeedanceRun, getMonidRun, resolveMonidConfig } from './monid-run.js'
import type { AiVideoOperatorGenerateStore, AiVideoOperatorOrderLink } from './admin-ai-video-generate-handler.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL ?? ''

// Warm-instance wallet cache. The balance only gates a pre-submit blocker, so a
// slightly stale value is fine and far cheaper than a third-party round trip on
// every 5s Studio poll.
const WALLET_TTL_MS = 60_000
let walletCache: { at: number; value: { value: number | null; currency: string; held: number | null } } | null = null

function supabaseHeaders(prefer?: string): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    accept: 'application/json',
    ...(prefer ? { prefer } : {}),
  }
}

function mapIdentityAssetLink(row: Record<string, unknown>): AiVideoIdentityAssetLink | null {
  const rawIdentity = row.ai_video_identities
  const identity = (Array.isArray(rawIdentity) ? rawIdentity[0] : rawIdentity) as Record<string, unknown> | null | undefined
  if (!row.asset_id || !identity?.id) return null
  const assetType = row.asset_type === 'Video' || row.asset_type === 'Audio' ? row.asset_type : 'Image'
  const status = row.status === 'active' || row.status === 'failed' ? row.status : 'processing'
  return {
    assetId: String(row.asset_id),
    assetType,
    status,
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    identity: {
      id: String(identity.id),
      ownerKind: identity.owner_kind === 'founder' ? 'founder' : 'customer',
      customerId: identity.customer_id ? String(identity.customer_id) : null,
      orderId: identity.order_id ? String(identity.order_id) : null,
      verificationStatus: String(identity.verification_status ?? ''),
      revokedAt: identity.revoked_at ? String(identity.revoked_at) : null,
    },
  }
}

function mapJob(row: Record<string, unknown>): AiVideoOperatorJob {
  const resolution = isAiVideoOperatorResolution(row.resolution) ? row.resolution : '720p'
  return {
    id: String(row.id),
    clientRequestId: row.client_request_id ? String(row.client_request_id) : null,
    orderId: row.order_id ? String(row.order_id) : null,
    exampleId: row.example_id ? String(row.example_id) : null,
    prompt: String(row.prompt ?? ''),
    lesson: row.lesson ? String(row.lesson) : null,
    libraryId: row.library_id ? String(row.library_id) : null,
    ratio: row.ratio as AiVideoOperatorJob['ratio'],
    durationSeconds: Number(row.duration_seconds) || 6,
    generateAudio: row.generate_audio === true,
    resolution,
    status: row.status as AiVideoOperatorJob['status'],
    provider: isAiVideoOperatorProvider(row.provider) ? row.provider : null,
    providerModelId: row.provider_model_id ? String(row.provider_model_id) : null,
    providerTaskId: row.provider_task_id ? String(row.provider_task_id) : null,
    providerVideoUrl: row.provider_video_url ? String(row.provider_video_url) : null,
    resultPath: row.result_path ? String(row.result_path) : null,
    attempt: Number(row.attempt) || 0,
    errorCode: row.error_code ? String(row.error_code) : null,
    usage: row.usage && typeof row.usage === 'object' ? row.usage as Record<string, unknown> : {},
    refPaths: Array.isArray(row.ref_paths) ? row.ref_paths.map(String) : [],
    refUrls: Array.isArray(row.ref_urls) ? row.ref_urls.map(String) : [],
    refRoles: Array.isArray(row.ref_roles) ? row.ref_roles.filter(isOperatorRefRole) : [],
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

function mapCharacter(row: Record<string, unknown>): AiVideoOperatorCharacter {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    sheetPath: row.sheet_path ? String(row.sheet_path) : null,
    sheetUrl: row.sheet_url ? String(row.sheet_url) : null,
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at ?? ''),
  }
}

function mapLibrary(row: Record<string, unknown>): AiVideoOperatorLibraryItem {
  const model = isAiVideoOperatorModel(row.model) ? row.model : 'seedance-2.5'
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    prompt: String(row.prompt ?? ''),
    lesson: row.lesson ? String(row.lesson) : null,
    ratio: row.ratio as AiVideoOperatorLibraryItem['ratio'],
    durationSeconds: Number(row.duration_seconds) || 6,
    model,
    resultPath: row.result_path ? String(row.result_path) : null,
    refPaths: Array.isArray(row.ref_paths) ? row.ref_paths.map(String) : [],
    sourceJobId: row.source_job_id ? String(row.source_job_id) : null,
    sourceOrderId: row.source_order_id ? String(row.source_order_id) : null,
    createdAt: String(row.created_at ?? ''),
  }
}

async function storageList(prefix: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/ai-video-inputs`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({
      prefix,
      limit: 80,
      offset: 0,
      sortBy: { column: 'created_at', order: 'desc' },
    }),
  })
  if (!response.ok) return []
  const rows = await response.json() as unknown
  return Array.isArray(rows) ? rows as Array<Record<string, unknown>> : []
}

async function patchOperatorJob(id: string, body: Record<string, unknown>): Promise<AiVideoOperatorJob | null> {
  // Bounded: this runs inside the Studio poll, which the browser aborts at 20s.
  // A stalled Supabase leg used to be able to consume that budget on its own.
  let response: Response
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/ai_video_operator_jobs?id=eq.${id}`, {
      method: 'PATCH',
      signal: AbortSignal.timeout(8_000),
      headers: { ...supabaseHeaders('return=representation'), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return null
  }
  if (!response.ok) return null
  const rows = await response.json() as Array<Record<string, unknown>>
  return rows[0] ? mapJob(rows[0]) : null
}

async function storeMonidResult(job: AiVideoOperatorJob, videoUrl: string): Promise<AiVideoOperatorJob | null> {
  try {
    const parsed = new URL(videoUrl)
    if (parsed.protocol !== 'https:') return null
    // 8s each was too tight for a 720p MP4 and the copy silently gave up, so
    // result_path never landed: the video played but "Simpan video" stayed
    // disabled and the heading sat on "Menyimpan video" forever. This runs on a
    // poll nothing is blocked on, inside maxDuration = 60, so it can afford more.
    const download = await fetch(videoUrl, { signal: AbortSignal.timeout(20_000) })
    if (!download.ok) return null
    const declaredSize = Number(download.headers.get('content-length'))
    if (declaredSize > 80 * 1024 * 1024) return null
    const bytes = new Uint8Array(await download.arrayBuffer())
    if (bytes.byteLength < 32 || bytes.byteLength > 80 * 1024 * 1024) return null
    if (String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp') return null
    const path = `operator/${job.id}/result.mp4`
    const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/ai-video-inputs/${path}`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders(),
        'content-type': 'video/mp4',
        'x-upsert': 'true',
      },
      body: bytes,
      signal: AbortSignal.timeout(20_000),
    })
    if (!upload.ok) return null
    const now = new Date().toISOString()
    return await patchOperatorJob(job.id, {
      status: 'succeeded',
      error_code: null,
      result_bucket: 'ai-video-inputs',
      result_path: path,
      provider_video_url: videoUrl,
      completed_at: now,
      lease_until: null,
      updated_at: now,
    })
  } catch {
    return null
  }
}

async function signPath(path: string): Promise<string | null> {
  const signed = await fetch(
    `${SUPABASE_URL}/storage/v1/object/sign/ai-video-inputs/${path}`,
    {
      method: 'POST',
      headers: { ...supabaseHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 }),
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!signed.ok) return null
  const body = await signed.json() as { signedURL?: string; signedUrl?: string }
  const rel = body.signedURL || body.signedUrl
  if (!rel) return null
  return rel.startsWith('http') ? rel : `${SUPABASE_URL}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`
}

export function createAiVideoOperatorGenerateStore(): AiVideoOperatorGenerateStore {
  return {
    async findByRequestId(id) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_video_operator_jobs?client_request_id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { headers: supabaseHeaders() })
      if (!response.ok) throw new Error('operator_request_lookup_failed')
      const rows = await response.json() as Array<Record<string, unknown>>
      return rows[0] ? mapJob(rows[0]) : null
    },
    async countInflight() {
      // Count unresolved jobs until the worker commits a terminal state.
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_operator_jobs?select=id&status=in.(queued,submitted,running)`,
        { headers: supabaseHeaders() },
      )
      if (!response.ok) throw new Error(`operator_inflight ${response.status}`)
      const rows = await response.json() as unknown[]
      return rows.length
    },
    async findOrderByTid(tid) {
      if (!isAiVideoClaimCode(tid)) return null
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_orders?select=id,claim_code,status,fulfillment_status,customer_id,customers(email)&claim_code=eq.${tid}&limit=1`,
        { headers: supabaseHeaders() },
      )
      if (!response.ok) throw new Error(`operator_order ${response.status}`)
      const rows = await response.json() as Array<{
        id?: string
        claim_code?: string
        status?: string
        fulfillment_status?: string | null
        customer_id?: string | null
        customers?: { email?: string } | { email?: string }[] | null
      }>
      const row = rows[0]
      if (!row?.id) return null
      const customers = row.customers
      const email = Array.isArray(customers) ? customers[0]?.email ?? '' : customers?.email ?? ''
      const factoryRes = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_factory_jobs?select=idea,photo_paths&order_id=eq.${row.id}&limit=1`,
        { headers: supabaseHeaders() },
      )
      let idea: string | null = null
      const photos: string[] = []
      if (factoryRes.ok) {
        const factory = await factoryRes.json() as Array<{ idea?: string; photo_paths?: string[] }>
        idea = factory[0]?.idea ? String(factory[0].idea) : null
        for (const path of factory[0]?.photo_paths ?? []) {
          const url = await signPath(path)
          if (url) photos.push(url)
        }
      }
      return {
        id: row.id,
        tid,
        email,
        idea,
        photos,
        paymentStatus: row.status ?? null,
        fulfillment: row.fulfillment_status ?? null,
        customerId: row.customer_id ? String(row.customer_id) : null,
      } satisfies AiVideoOperatorOrderLink
    },
    async findIdentityAssets(assetIds) {
      // Same shape the migration CHECKs on asset_id; anything else cannot exist.
      const ids = assetIds.filter((id) => /^[A-Za-z0-9._-]{1,120}$/.test(id))
      if (!ids.length) return []
      const select = 'asset_id,asset_type,status,deleted_at,ai_video_identities!inner(id,owner_kind,customer_id,order_id,verification_status,revoked_at)'
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_identity_assets?select=${select}&asset_id=in.(${ids.map((id) => `"${id}"`).join(',')})`,
        { headers: supabaseHeaders() },
      )
      if (!response.ok) throw new Error(`identity_assets ${response.status}`)
      const rows = await response.json() as Array<Record<string, unknown>>
      return rows.map(mapIdentityAssetLink).filter((link): link is AiVideoIdentityAssetLink => link !== null)
    },
    async createQueued(input) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_video_operator_jobs?on_conflict=client_request_id`, {
        method: 'POST',
        headers: { ...supabaseHeaders('return=representation,resolution=ignore-duplicates'), 'content-type': 'application/json' },
        body: JSON.stringify({
          client_request_id: input.clientRequestId ?? null,
          order_id: input.orderId,
          example_id: input.exampleId,
          library_id: input.libraryId,
          prompt: input.prompt,
          lesson: input.lesson,
          ratio: input.ratio,
          duration_seconds: input.durationSeconds,
          generate_audio: input.generateAudio,
          resolution: input.resolution,
          // asset:// refs force BytePlus; the DB CHECK rejects any other pairing.
          provider: input.provider ?? operatorJobProvider(input.refUrls),
          provider_model_id: input.model,
          usage: { reference_seconds: input.referenceSeconds ?? 0, reference_durations: input.refDurations ?? [], ...(input.sourcePrompt !== undefined ? { source_prompt: input.sourcePrompt, reference_tags: input.refTags ?? [] } : {}) },
          status: 'queued',
          ref_paths: input.refPaths,
          ref_urls: input.refUrls,
          ref_roles: input.refRoles,
        }),
      })
      if (!response.ok) throw new Error(`operator_create ${response.status}`)
      const rows = await response.json() as Array<Record<string, unknown>>
      const row = Array.isArray(rows) ? rows[0] : rows
      if (!row && input.clientRequestId) {
        const existing = await this.findByRequestId?.(input.clientRequestId)
        if (existing) return existing
      }
      if (!row) throw new Error('operator_create')
      for (const path of input.refPaths) {
        await fetch(`${SUPABASE_URL}/rest/v1/ai_video_operator_assets`, {
          method: 'POST',
          headers: { ...supabaseHeaders(), 'content-type': 'application/json' },
          body: JSON.stringify({ job_id: row.id, kind: 'ref', bucket: 'ai-video-inputs', path }),
        })
      }
      return mapJob(row as Record<string, unknown>)
    },
    async submitQueued(job) {
      if (job.status !== 'queued' || job.providerTaskId) return job
      // BytePlus jobs are dispatched only by the render worker, which holds the
      // merchant key and the asset:// passthrough; the fast path stays Monid.
      if ((job.provider ?? operatorJobProvider(job.refUrls)) === 'byteplus_modelark') return job
      const key = process.env.MONID_API_KEY ?? ''
      if (key.trim().length < 16) throw new Error('invalid_monid_api_key')
      if (job.prompt.trim().length > SEEDANCE_25_PROMPT_HINT) {
        const failedAt = new Date().toISOString()
        const patched = await fetch(
          `${SUPABASE_URL}/rest/v1/ai_video_operator_jobs?id=eq.${job.id}`,
          {
            method: 'PATCH',
            headers: { ...supabaseHeaders('return=representation'), 'content-type': 'application/json' },
            body: JSON.stringify({
              status: 'failed',
              error_code: 'monid_prompt_limit',
              lease_until: null,
              completed_at: failedAt,
              updated_at: failedAt,
            }),
          },
        ).catch(() => null)
        if (patched && patched.ok) {
          const rows = await patched.json() as Array<Record<string, unknown>>
          if (rows[0]) return mapJob(rows[0])
        }
        return { ...job, status: 'failed', errorCode: 'monid_prompt_limit' }
      }
      const now = new Date().toISOString()
      const lease = new Date(Date.now() + 180_000).toISOString()
      const lockUrl = new URL(`${SUPABASE_URL}/rest/v1/ai_video_operator_jobs`)
      lockUrl.searchParams.set('id', `eq.${job.id}`)
      lockUrl.searchParams.set('status', 'eq.queued')
      lockUrl.searchParams.set('attempt', 'eq.0')
      lockUrl.searchParams.set('provider_task_id', 'is.null')
      lockUrl.searchParams.set('or', `(lease_until.is.null,lease_until.lt.${now})`)
      const lock = await fetch(lockUrl, {
        method: 'PATCH',
        headers: { ...supabaseHeaders('return=representation'), 'content-type': 'application/json' },
        body: JSON.stringify({ lease_until: lease, attempt: 1, updated_at: now }),
      })
      if (!lock.ok) return job
      const lockedRows = await lock.json() as Array<Record<string, unknown>>
      if (!Array.isArray(lockedRows) || !lockedRows[0]) return job
      const lockedJob = mapJob(lockedRows[0])
      if (lockedJob.providerTaskId) return lockedJob
      job = lockedJob
      const urls: string[] = []
      const roles: string[] = []
      let createdTaskId: string | null = null
      try {
        job.refUrls.forEach((url, index) => {
          urls.push(url)
          roles.push(job.refRoles[index] ?? inferOperatorRefRole(url))
        })
        const signedPaths = await Promise.all(job.refPaths.map(signPath))
        for (let index = 0; index < job.refPaths.length; index++) {
          const signed = signedPaths[index]
          if (!signed) throw new Error('operator_reference_unavailable')
          urls.push(signed)
          roles.push(job.refRoles[job.refUrls.length + index] ?? inferOperatorRefRole(job.refPaths[index]))
        }
        const model = isAiVideoOperatorModel(job.providerModelId) ? job.providerModelId : 'seedance-2.5'
        const task = await createMonidSeedanceRun({
          plan: {
            prompt: job.prompt,
            ratio: job.ratio,
            durationSeconds: job.durationSeconds,
            generateAudio: job.generateAudio,
            model,
            resolution: job.resolution,
          },
          signedInputUrls: urls,
          refRoles: roles,
        }, key, resolveMonidConfig())
        createdTaskId = task.id
        const submittedAt = new Date().toISOString()
        const submitted = await fetch(
          `${SUPABASE_URL}/rest/v1/ai_video_operator_jobs?id=eq.${job.id}&status=eq.queued`,
          {
            method: 'PATCH',
            headers: { ...supabaseHeaders('return=representation'), 'content-type': 'application/json' },
            body: JSON.stringify({
              status: 'submitted',
              provider: 'monid',
              provider_model_id: model,
              provider_task_id: task.id,
              attempt: 1,
              submitted_at: submittedAt,
              lease_until: null,
              error_code: null,
              updated_at: submittedAt,
            }),
          },
        )
        if (!submitted.ok) throw new Error('operator_submission_save_failed')
        const rows = await submitted.json() as Array<Record<string, unknown>>
        if (!rows[0]) throw new Error('operator_submission_save_failed')
        return mapJob(rows[0])
      } catch (error) {
        const raw = error instanceof Error ? error.message : 'monid_unavailable'
        const code = createdTaskId ? 'operator_sync_timeout'
          : /^(monid_(?:unauthorized|rate_limited|rejected|blocked|prompt_limit)|invalid_|operator_reference_)/.test(raw)
            ? raw.slice(0, 80) : 'monid_submission_unknown'
        const nextAttempt = Math.max(1, Number(job.attempt) || 0)
        const failedAt = new Date().toISOString()
        const patched = await fetch(
          `${SUPABASE_URL}/rest/v1/ai_video_operator_jobs?id=eq.${job.id}`,
          {
            method: 'PATCH',
            headers: { ...supabaseHeaders('return=representation'), 'content-type': 'application/json' },
            body: JSON.stringify({
              lease_until: null,
              attempt: nextAttempt,
              error_code: code,
              status: 'failed',
              ...(createdTaskId ? { provider_task_id: createdTaskId } : {}),
              completed_at: failedAt,
              updated_at: failedAt,
            }),
          },
        ).catch(() => null)
        if (patched && patched.ok) {
          const rows = await patched.json() as Array<Record<string, unknown>>
          if (rows[0]) return mapJob(rows[0])
        }
        console.error(JSON.stringify({ event: 'operator_submission_save_failed', job_id: job.id, provider_task_id: createdTaskId, code }))
        // Preserve known provider identity in the response even if persistence is unavailable.
        return { ...job, status: 'failed', errorCode: code, providerTaskId: createdTaskId ?? job.providerTaskId }
      }
    },
    async syncMonidJob(job) {
      if (job.resultPath || !job.providerTaskId) return job
      if ((job.provider ?? operatorJobProvider(job.refUrls)) === 'byteplus_modelark') return job
      if (!['queued', 'submitted', 'running', 'succeeded'].includes(job.status)) return job
      const key = process.env.MONID_API_KEY ?? ''
      if (key.trim().length < 16) {
        // Silently returning the unchanged job here made a missing key look
        // identical to "still rendering" — a forever spinner with no error.
        // Surface it instead so Studio can say something actionable.
        return await patchOperatorJob(job.id, {
          status: 'failed',
          error_code: 'monid_key_missing',
          completed_at: new Date().toISOString(),
          lease_until: null,
          updated_at: new Date().toISOString(),
        }) ?? { ...job, status: 'failed' as const, errorCode: 'monid_key_missing' }
      }
      // A provider URL is already enough for the player, so the first poll that
      // sees success returns immediately and the video appears. The storage copy
      // is retried on a LATER poll: doing it inline on the success poll spent the
      // whole function budget (8s download + 8s upload) on the one request the
      // user is waiting for, and if it overran, result_path was never written and
      // "Simpan video" stayed disabled forever.
      if (job.status === 'succeeded' && job.providerVideoUrl) {
        const copied = await storeMonidResult(job, job.providerVideoUrl)
        return copied ?? job
      }
      const task = await getMonidRun(job.providerTaskId, key, resolveMonidConfig())
      const now = new Date().toISOString()
      if (task.status === 'queued' || task.status === 'running') {
        return await patchOperatorJob(job.id, {
          status: task.status === 'running' ? 'running' : 'submitted',
          error_code: null,
          updated_at: now,
        }) ?? job
      }
      if (task.status === 'cancelled' || task.status === 'failed') {
        return await patchOperatorJob(job.id, {
          status: task.status === 'cancelled' ? 'cancelled' : 'failed',
          error_code: task.failureCode ?? 'monid_failed',
          completed_at: now,
          lease_until: null,
          updated_at: now,
        }) ?? job
      }
      if (task.status !== 'succeeded' || !task.videoUrl) {
        return await patchOperatorJob(job.id, {
          status: 'failed',
          error_code: task.failureCode ?? 'monid_result_missing',
          completed_at: now,
          lease_until: null,
          updated_at: now,
        }) ?? job
      }
      const playable = await patchOperatorJob(job.id, {
        status: 'succeeded',
        provider_video_url: task.videoUrl,
        error_code: null,
        usage: { ...job.usage, ...task.usage },
        completed_at: now,
        lease_until: null,
        updated_at: now,
      }) ?? { ...job, status: 'succeeded' as const, providerVideoUrl: task.videoUrl }
      // Return as soon as the URL is persisted — the player only needs this.
      // The MP4 copy happens on the next poll (guard above), so the request the
      // user is actively waiting on never pays for the download+upload.
      return playable
    },
    async resumePolling(job) {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_operator_jobs?id=eq.${job.id}&status=eq.failed&provider_task_id=not.is.null&error_code=in.(operator_sync_timeout,operator_result_store_failed)`,
        {
          method: 'PATCH',
          headers: { ...supabaseHeaders('return=representation'), 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'submitted', poll_attempts: 0, error_code: null, completed_at: null, lease_until: null, updated_at: new Date().toISOString() }),
        },
      )
      if (!response.ok) throw new Error('operator_sync_unavailable')
      const rows = await response.json() as Array<Record<string, unknown>>
      return rows[0] ? mapJob(rows[0]) : job
    },
    async getJob(id) {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_operator_jobs?select=*&id=eq.${id}&limit=1`,
        { headers: supabaseHeaders() },
      )
      if (!response.ok) throw new Error(`operator_job ${response.status}`)
      const rows = await response.json() as Array<Record<string, unknown>>
      return rows[0] ? mapJob(rows[0]) : null
    },
    async listJobs() {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_operator_jobs?select=*&order=created_at.desc&limit=40`,
        { headers: supabaseHeaders(), signal: AbortSignal.timeout(8_000) },
      )
      if (!response.ok) throw new Error(`operator_list ${response.status}`)
      const rows = await response.json() as Array<Record<string, unknown>>
      return rows.map(mapJob)
    },
    async cancelJob(id) {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_operator_jobs?id=eq.${id}&status=eq.queued&provider_task_id=is.null&or=(lease_until.is.null,lease_until.lt.${new Date().toISOString()})`,
        {
          method: 'PATCH',
          headers: { ...supabaseHeaders('return=representation'), 'content-type': 'application/json' },
          body: JSON.stringify({
            status: 'cancelled',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        },
      )
      if (!response.ok) throw new Error(`operator_cancel ${response.status}`)
      const rows = await response.json() as Array<Record<string, unknown>>
      return rows[0] ? mapJob(rows[0]) : null
    },
    async signUpload(filename) {
      if (!isOperatorUploadName(filename)) throw new Error('invalid_operator_upload')
      const path = `operator/inbox/${randomUUID()}/${filename}`
      const response = await fetch(
        `${SUPABASE_URL}/storage/v1/object/upload/sign/ai-video-inputs/${path}`,
        {
          method: 'POST',
          headers: { ...supabaseHeaders(), 'content-type': 'application/json' },
          body: JSON.stringify({ expiresIn: 3600 }),
        },
      )
      if (!response.ok) throw new Error(`operator_sign ${response.status}`)
      const body = await response.json() as { url?: string; token?: string; signedURL?: string }
      const rel = body.url || body.signedURL || ''
      const signedUrl = rel.startsWith('http') ? rel : `${SUPABASE_URL}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`
      return { path, signedUrl, token: body.token ?? '' }
    },
    async kickWorker() {
      if (!SUPABASE_FUNCTIONS_URL || !SUPABASE_SERVICE_KEY) throw new Error('operator_worker_unconfigured')
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL.replace(/\/+$/, '')}/ai-video-render-worker`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ operator_only: true }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error('operator_worker_unavailable')
      const payload = await response.json() as { operator?: { error?: string; failed?: number } }
      if (payload.operator?.error || payload.operator?.failed) throw new Error('operator_worker_unavailable')
    },
    async signResult(path) {
      return signPath(path)
    },
    async listInbox() {
      const top = await storageList('operator/inbox')
      const folders = top.filter((row) => !row.metadata && row.name)
      const loose = top.filter((row) => row.metadata && typeof row.name === 'string')
      const nested = await Promise.all(folders.slice(0, 36).map(async (folder) => {
        const files = await storageList(`operator/inbox/${String(folder.name)}`)
        return files
          .filter((file) => typeof file.name === 'string' && /\.(jpe?g|png|webp|mp4|mov|webm|mp3|wav|m4a|aac)$/i.test(String(file.name)))
          .map((file) => ({
            path: `operator/inbox/${String(folder.name)}/${String(file.name)}`,
            name: String(file.name),
            kind: /\.(mp4|mov|webm)$/i.test(String(file.name)) ? 'video' : /\.(mp3|wav|m4a|aac)$/i.test(String(file.name)) ? 'audio' : 'image',
            createdAt: String(file.created_at || folder.created_at || ''),
          }))
      }))
      const items = nested.flat()
      for (const file of loose) {
        if (!/\.(jpe?g|png|webp|mp4|mov|webm|mp3|wav|m4a|aac)$/i.test(String(file.name))) continue
        items.push({
          path: `operator/inbox/${String(file.name)}`,
          name: String(file.name),
          kind: /\.(mp4|mov|webm)$/i.test(String(file.name)) ? 'video' : /\.(mp3|wav|m4a|aac)$/i.test(String(file.name)) ? 'audio' : 'image',
          createdAt: String(file.created_at || ''),
        })
      }
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      return Promise.all(items.slice(0, 48).map(async (item) => ({
        ...item,
        url: await signPath(item.path),
      })))
    },
    async listLibrary() {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_operator_library?select=*&order=created_at.desc&limit=40`,
        { headers: supabaseHeaders() },
      )
      if (!response.ok) throw new Error(`operator_library ${response.status}`)
      const rows = await response.json() as Array<Record<string, unknown>>
      return rows.map(mapLibrary)
    },
    async saveLibrary({ job, title }) {
      const safeTitle = parseOperatorLibraryTitle(title)
      const model = isAiVideoOperatorModel(job.providerModelId) ? job.providerModelId : 'seedance-2.5'
      const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_video_operator_library`, {
        method: 'POST',
        headers: { ...supabaseHeaders('return=representation'), 'content-type': 'application/json' },
        body: JSON.stringify({
          title: safeTitle,
          prompt: job.prompt,
          lesson: job.lesson,
          ratio: job.ratio,
          duration_seconds: job.durationSeconds,
          model,
          result_path: job.resultPath,
          ref_paths: job.refPaths,
          source_job_id: job.id,
          source_order_id: job.orderId,
        }),
      })
      if (!response.ok) throw new Error(`operator_library_save ${response.status}`)
      const rows = await response.json() as Array<Record<string, unknown>>
      const row = Array.isArray(rows) ? rows[0] : rows
      if (!row) throw new Error('operator_library_save')
      await fetch(`${SUPABASE_URL}/rest/v1/ai_video_operator_jobs?id=eq.${job.id}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ library_id: row.id, updated_at: new Date().toISOString() }),
      })
      return mapLibrary(row as Record<string, unknown>)
    },
    async savePrompt(input) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_video_operator_library`, {
        method: 'POST',
        headers: { ...supabaseHeaders('return=representation'), 'content-type': 'application/json' },
        body: JSON.stringify({
          title: input.title,
          prompt: input.prompt,
          ratio: input.ratio,
          duration_seconds: input.durationSeconds,
          model: input.model,
          result_path: input.coverPath,
          ref_paths: input.refPaths,
        }),
      })
      if (!response.ok) throw new Error(`operator_prompt_save ${response.status}`)
      const rows = await response.json() as Array<Record<string, unknown>>
      const row = Array.isArray(rows) ? rows[0] : rows
      if (!row) throw new Error('operator_prompt_save')
      return mapLibrary(row as Record<string, unknown>)
    },
    async listCharacters() {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_video_operator_characters?select=*&order=created_at.desc&limit=60`,
        { headers: supabaseHeaders() },
      )
      if (!response.ok) throw new Error(`operator_characters ${response.status}`)
      const rows = await response.json() as Array<Record<string, unknown>>
      return rows.map(mapCharacter)
    },
    async getWallet() {
      const key = process.env.MONID_API_KEY ?? ''
      if (key.trim().length < 16) return null
      // This is awaited on the Studio's 5s simple poll, which the browser aborts
      // at 20s. Unbounded, a slow or blackholed Monid burned the whole request:
      // the client saw "Koneksi terputus" and no player, even when the row
      // already had provider_video_url. The sibling run-status call was capped
      // for exactly this reason (monid-run.ts); this call site was missed.
      // Cached briefly so a warm instance does not re-pay per poll — the balance
      // only gates a pre-submit blocker, so slightly stale is fine.
      const now = Date.now()
      if (walletCache && now - walletCache.at < WALLET_TTL_MS) return walletCache.value
      let response: Response
      try {
        response = await fetch('https://api.monid.ai/v1/wallet/balance', {
          signal: AbortSignal.timeout(3_000),
          headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        })
      } catch {
        return null
      }
      if (!response.ok) return null
      const body = await response.json() as {
        balance?: { value?: unknown; currency?: unknown }
        held?: { value?: unknown }
      }
      const value = typeof body.balance?.value === 'number' && Number.isFinite(body.balance.value)
        ? body.balance.value
        : null
      const wallet = {
        value,
        currency: typeof body.balance?.currency === 'string' && body.balance.currency.trim()
          ? body.balance.currency
          : 'USD',
        held: typeof body.held?.value === 'number' && Number.isFinite(body.held.value)
          ? body.held.value
          : null,
      }
      walletCache = { at: now, value: wallet }
      return wallet
    },
    async saveCharacter({ name, sheetPath, notes }) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_video_operator_characters`, {
        method: 'POST',
        headers: { ...supabaseHeaders('return=representation'), 'content-type': 'application/json' },
        body: JSON.stringify({ name, sheet_path: sheetPath, notes }),
      })
      if (!response.ok) throw new Error(`operator_character_save ${response.status}`)
      const rows = await response.json() as Array<Record<string, unknown>>
      const row = Array.isArray(rows) ? rows[0] : rows
      if (!row) throw new Error('operator_character_save')
      return mapCharacter(row as Record<string, unknown>)
    },
  }
}

export const aiVideoOperatorConfigured = (): boolean => Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY)
