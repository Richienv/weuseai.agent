import { listAiVideoExamples } from './ai-video-example-catalog.js'
import {
  compileStudioPrompt,
  parseSkillCompileInput,
  presentCompileResult,
  presentStudioSkillStack,
} from './ai-video-skill-stack.js'
import {
  AI_VIDEO_OPERATOR_INFLIGHT_CAP,
  MONID_SEEDANCE_PROMPT_MAX,
  AI_VIDEO_OPERATOR_MAX_REFS,
  applyOperatorTransition,
  canCancelOperatorJob,
  identityAssetRefsError,
  isOperatorAssetRef,
  isOperatorJobId,
  isOperatorUploadName,
  operatorAssetIdFromRef,
  operatorGenerateReady,
  operatorPromptHasHeadings,
  operatorPromptIsReady,
  sanitizeOperatorPrompt,
  parseOperatorCharacterInput,
  parseOperatorLibraryTitle,
  parseOperatorPromptSaveInput,
  parseOperatorStartInput,
  presentAiVideoOperatorCharacter,
  presentAiVideoOperatorJob,
  presentAiVideoOperatorLibrary,
  type AiVideoIdentityAssetLink,
  type AiVideoOperatorCharacter,
  type AiVideoOperatorJob,
  type AiVideoOperatorLibraryItem,
  type AiVideoOperatorPromptSaveInput,
  type AiVideoOperatorStartInput,
} from './ai-video-operator.js'

export type AiVideoOperatorOrderLink = {
  id: string
  tid: string
  email: string
  idea: string | null
  photos: string[]
  paymentStatus?: string | null
  fulfillment?: string | null
  // Owner of the order; lets a customer identity registered on an earlier
  // order be reused on a later one from the same customer.
  customerId?: string | null
}

export type AiVideoOperatorGenerateStore = {
  findByRequestId?(id: string): Promise<AiVideoOperatorJob | null>
  countInflight(): Promise<number>
  findOrderByTid(tid: string): Promise<AiVideoOperatorOrderLink | null>
  // Identity assets by BytePlus asset id, joined to their identity. Absent
  // store method + asset:// ref = fail closed (identity_asset_not_active).
  findIdentityAssets?(assetIds: string[]): Promise<AiVideoIdentityAssetLink[]>
  createQueued(input: AiVideoOperatorStartInput & { orderId: string | null }): Promise<AiVideoOperatorJob>
  submitQueued?(job: AiVideoOperatorJob): Promise<AiVideoOperatorJob>
  resumePolling?(job: AiVideoOperatorJob): Promise<AiVideoOperatorJob>
  getJob(id: string): Promise<AiVideoOperatorJob | null>
  listJobs(): Promise<AiVideoOperatorJob[]>
  cancelJob(id: string): Promise<AiVideoOperatorJob | null>
  signUpload(filename: string): Promise<{ path: string; signedUrl: string; token: string }>
  kickWorker(): Promise<void>
  signResult?(path: string): Promise<string | null>
  listInbox?(): Promise<Array<{ path: string; name: string; url: string | null; createdAt: string }>>
  listLibrary?(): Promise<AiVideoOperatorLibraryItem[]>
  saveLibrary?(input: { job: AiVideoOperatorJob; title: string }): Promise<AiVideoOperatorLibraryItem>
  savePrompt?(input: AiVideoOperatorPromptSaveInput): Promise<AiVideoOperatorLibraryItem>
  listCharacters?(): Promise<AiVideoOperatorCharacter[]>
  saveCharacter?(input: { name: string; sheetPath: string; notes: string | null }): Promise<AiVideoOperatorCharacter>
  getWallet?(): Promise<{ value: number | null; currency: string; held: number | null } | null>
}

export function readOperatorGenerateEnv(env: NodeJS.ProcessEnv = process.env) {
  return {
    OPERATOR_GENERATE_ENABLED: env.OPERATOR_GENERATE_ENABLED,
    MONID_API_KEY: env.MONID_API_KEY,
  }
}

export function compileAiVideoOperatorPrompt(body: Record<string, unknown>) {
  try {
    const roles = Array.isArray(body.ref_roles) ? body.ref_roles : []
    const compiled = compileStudioPrompt(parseSkillCompileInput({
      ...body,
      has_still: body.has_still === true || roles.includes('first_frame'),
    }))
    return { ok: true as const, ...presentCompileResult(compiled) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'invalid_input', status: 400 }
  }
}

export async function startAiVideoOperatorGenerate(
  body: Record<string, unknown>,
  store: AiVideoOperatorGenerateStore,
  env: ReturnType<typeof readOperatorGenerateEnv> = readOperatorGenerateEnv(),
) {
  if (!isOperatorJobId(body.client_request_id)) {
    return { error: 'invalid_operator_request_id' as const, status: 400 }
  }
  const roles = Array.isArray(body.ref_roles) ? body.ref_roles : []
  const idea = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt : typeof body.idea === 'string' ? body.idea : ''
  const rawIdea = body.prompt_mode === 'simple' ? idea : sanitizeOperatorPrompt(idea)
  let compiled
  try {
    if (
      (body.prompt_mode === 'simple' || operatorPromptHasHeadings(rawIdea) || operatorPromptIsReady(rawIdea))
      && body.output_kind !== 'still'
    ) {
      compiled = {
        prompt: rawIdea,
        stillPrompt: null,
        mode: typeof body.skill_mode === 'string' && body.skill_mode ? body.skill_mode : 'one-take-locked',
        kind: 'video' as const,
        ratio: body.ratio,
        durationSeconds: body.duration_seconds,
        resolution: body.resolution,
        identity: null,
        warnings: [],
      }
    } else {
      compiled = compileStudioPrompt(parseSkillCompileInput({
        ...body,
        idea: rawIdea,
        has_still: body.has_still === true || roles.includes('first_frame'),
      }))
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'invalid_input', status: 400 }
  }
  if (compiled.kind === 'still') {
    return { ok: true as const, kind: 'still' as const, ...presentCompileResult(compiled) }
  }
  if (!operatorGenerateReady(env)) return { error: 'operator_probe_required' as const, status: 409 }
  let input: AiVideoOperatorStartInput
  try {
    input = parseOperatorStartInput({
      ...body,
      prompt: compiled.prompt,
      ratio: body.ratio ?? compiled.ratio,
      duration_seconds: body.duration_seconds ?? compiled.durationSeconds,
      resolution: body.resolution ?? compiled.resolution,
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'invalid_input', status: 400 }
  }
  if (input.prompt.length > MONID_SEEDANCE_PROMPT_MAX) {
    return { error: 'monid_prompt_limit' as const, status: 400 }
  }
  if (input.clientRequestId && store.findByRequestId) {
    const existing = await store.findByRequestId(input.clientRequestId)
    if (existing) return { ok: true as const, job: presentAiVideoOperatorJob(existing) }
  }
  const inflight = await store.countInflight()
  if (inflight >= AI_VIDEO_OPERATOR_INFLIGHT_CAP) return { error: 'operator_inflight_cap' as const, status: 429 }
  let order: AiVideoOperatorOrderLink | null = null
  if (input.tid) {
    order = await store.findOrderByTid(input.tid)
    if (!order) return { error: 'order_not_found' as const, status: 404 }
  }
  const ownership = await checkIdentityAssetRefs(input, store, order)
  if (ownership) return { error: ownership, status: 400 }
  const job = await store.createQueued({ ...input, orderId: order?.id ?? null })
  const workerWarning = await wakeOperatorWorker(store)
  return {
    worker_warning: workerWarning,
    ok: true as const,
    job: presentAiVideoOperatorJob(job),
    skill_mode: compiled.mode,
    skill_warnings: compiled.warnings,
  }
}

export async function submitAiVideoOperatorGenerate(
  body: Record<string, unknown>,
  store: AiVideoOperatorGenerateStore,
) {
  const id = typeof body.job_id === 'string' ? body.job_id : ''
  if (!isOperatorJobId(id)) return { error: 'invalid_input' as const, status: 400 }
  const job = await store.getJob(id)
  if (!job) return { error: 'job_not_found' as const, status: 404 }
  if (job.providerTaskId && ['operator_sync_timeout', 'operator_result_store_failed'].includes(job.errorCode ?? '') && store.resumePolling) {
    const current = await store.resumePolling(job)
    const workerWarning = await wakeOperatorWorker(store)
    return { ok: true as const, job: presentAiVideoOperatorJob(current), worker_warning: workerWarning }
  }
  if (job.status !== 'queued') {
    return { ok: true as const, job: presentAiVideoOperatorJob(job) }
  }
  let current = job
  if (store.submitQueued) {
    try {
      current = await store.submitQueued(job)
    } catch {
      current = await store.getJob(id) ?? job
    }
  }
  await store.kickWorker().catch(() => undefined)
  return { ok: true as const, job: presentAiVideoOperatorJob(current) }
}

export async function cancelAiVideoOperatorGenerate(
  body: Record<string, unknown>,
  store: AiVideoOperatorGenerateStore,
) {
  const id = typeof body.job_id === 'string' ? body.job_id : ''
  if (!isOperatorJobId(id)) return { error: 'invalid_input' as const, status: 400 }
  const current = await store.getJob(id)
  if (!current) return { error: 'job_not_found' as const, status: 404 }
  if (!canCancelOperatorJob(current)) return { error: 'invalid_operator_transition' as const, status: 409 }
  applyOperatorTransition(current.status, 'cancelled')
  const updated = await store.cancelJob(id)
  if (!updated) return { error: 'invalid_operator_transition' as const, status: 409 }
  return { ok: true as const, job: presentAiVideoOperatorJob(updated) }
}

export async function signAiVideoOperatorUpload(
  body: Record<string, unknown>,
  store: AiVideoOperatorGenerateStore,
) {
  const names = Array.isArray(body.filenames) ? body.filenames : []
  if (names.length === 0 || names.length > AI_VIDEO_OPERATOR_MAX_REFS) {
    return { error: 'invalid_input' as const, status: 400 }
  }
  const uploads = []
  for (const name of names) {
    if (!isOperatorUploadName(name)) return { error: 'invalid_input' as const, status: 400 }
    uploads.push(await store.signUpload(name))
  }
  return { ok: true as const, uploads }
}

export async function listAiVideoOperatorUploads(
  store: AiVideoOperatorGenerateStore,
) {
  if (!store.listInbox) return { ok: true as const, uploads: [] }
  const uploads = await store.listInbox()
  return { ok: true as const, uploads }
}

export async function saveAiVideoOperatorLibrary(
  body: Record<string, unknown>,
  store: AiVideoOperatorGenerateStore,
) {
  if (!store.saveLibrary) return { error: 'library_unavailable' as const, status: 501 }
  const id = typeof body.job_id === 'string' ? body.job_id : ''
  if (!isOperatorJobId(id)) return { error: 'invalid_input' as const, status: 400 }
  let title: string
  try {
    title = parseOperatorLibraryTitle(body.title)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'invalid_operator_title', status: 400 }
  }
  const job = await store.getJob(id)
  if (!job) return { error: 'job_not_found' as const, status: 404 }
  if (job.status !== 'succeeded' || !job.resultPath) return { error: 'library_job_not_ready' as const, status: 409 }
  const item = await store.saveLibrary({ job, title })
  return { ok: true as const, item: presentAiVideoOperatorLibrary(item) }
}

export async function saveAiVideoOperatorPrompt(
  body: Record<string, unknown>,
  store: AiVideoOperatorGenerateStore,
) {
  if (!store.savePrompt) return { error: 'library_unavailable' as const, status: 501 }
  let input: AiVideoOperatorPromptSaveInput
  try {
    input = parseOperatorPromptSaveInput(body)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'invalid_input', status: 400 }
  }
  const item = await store.savePrompt(input)
  return { ok: true as const, item: presentAiVideoOperatorLibrary(item) }
}

export async function saveAiVideoOperatorCharacter(
  body: Record<string, unknown>,
  store: AiVideoOperatorGenerateStore,
) {
  if (!store.saveCharacter) return { error: 'characters_unavailable' as const, status: 501 }
  let input: { name: string; sheetPath: string; notes: string | null }
  try {
    input = parseOperatorCharacterInput(body)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'invalid_input', status: 400 }
  }
  const item = await store.saveCharacter(input)
  const sheetUrl = item.sheetPath && store.signResult ? await store.signResult(item.sheetPath) : null
  return { ok: true as const, character: presentAiVideoOperatorCharacter(item, sheetUrl) }
}

export function presentOperatorReady(env: ReturnType<typeof readOperatorGenerateEnv> = readOperatorGenerateEnv()) {
  return { enabled: operatorGenerateReady(env) }
}

export async function listAiVideoOperatorGenerate(
  input: { tid?: string; jobId?: string; simple?: boolean; includeReferences?: boolean },
  store: AiVideoOperatorGenerateStore,
  env: ReturnType<typeof readOperatorGenerateEnv> = readOperatorGenerateEnv(),
) {
  const jobs = await store.listJobs()
  let order = null
  if (input.tid) order = await store.findOrderByTid(input.tid.trim().toUpperCase())
  let selected = null
  if (input.jobId && isOperatorJobId(input.jobId)) {
    const job = jobs.find((row) => row.id === input.jobId) ?? await store.getJob(input.jobId)
    if (job) {
      const signed = job.resultPath && store.signResult ? await store.signResult(job.resultPath) : null
      const resultUrl = signed || job.providerVideoUrl
      selected = {
        ...presentAiVideoOperatorJob(job), result_url: resultUrl,
        ...(input.includeReferences ? { reference_media: await Promise.all([
          // asset:// has no browser-loadable URL; the Studio shows its Karakter avatar.
          ...job.refUrls.map(async (url) => ({ path: url, url: isOperatorAssetRef(url) ? null : url })),
          ...job.refPaths.map(async (path) => ({ path, url: store.signResult ? await store.signResult(path) : null })),
        ]) } : {}),
      }
    }
  }
  const library = !input.simple && store.listLibrary ? await store.listLibrary() : []
  const presentedLibrary = []
  for (const item of library) {
    const resultUrl = item.resultPath && store.signResult ? await store.signResult(item.resultPath) : null
    presentedLibrary.push({ ...presentAiVideoOperatorLibrary(item), result_url: resultUrl })
  }
  const characters = !input.simple && store.listCharacters ? await store.listCharacters() : []
  const presentedCharacters = []
  for (const item of characters) {
    const sheetUrl = item.sheetPath && store.signResult ? await store.signResult(item.sheetPath) : null
    presentedCharacters.push(presentAiVideoOperatorCharacter(item, sheetUrl))
  }
  const lastCost = jobs.map((job) => presentAiVideoOperatorJob(job).cost_usd).find((value) => value != null) ?? null
  const presentedJobs = await Promise.all(jobs.map(async (job) => {
    // Only the selected video's URL is needed by the simple history list.
    const signed = input.simple ? (job.id === selected?.id ? selected.result_url : null)
      : job.resultPath && store.signResult ? await store.signResult(job.resultPath) : null
    return { ...presentAiVideoOperatorJob(job), result_url: signed || (input.simple ? null : job.providerVideoUrl) }
  }))
  const wallet = store.getWallet ? await store.getWallet().catch(() => null) : null
  return {
    ok: true as const,
    enabled: operatorGenerateReady(env),
    catalog: input.simple ? [] : listAiVideoExamples(),
    characters: presentedCharacters,
    library: presentedLibrary,
    jobs: presentedJobs,
    order,
    job: selected,
    last_cost_usd: lastCost,
    wallet,
    wallet_note: 'Saldo di wallet Monid. 720p 5s sekitar $1.16. Isi ulang di app.monid.ai/wallet.',
    skill_stack: input.simple ? undefined : presentStudioSkillStack(),
    poll_seconds: 5,
    synced_at: new Date().toISOString(),
    worker_warning: null,
    limits: { prompt_characters: MONID_SEEDANCE_PROMPT_MAX },
  }
}

async function wakeOperatorWorker(store: AiVideoOperatorGenerateStore): Promise<string | null> {
  try { await store.kickWorker(); return null }
  catch { return 'operator_worker_unavailable' }
}

// Mirrors checkIdentityAssetRefs in supabase/functions/_shared/ai-video-operator-generate.ts.
async function checkIdentityAssetRefs(
  input: AiVideoOperatorStartInput,
  store: AiVideoOperatorGenerateStore,
  order: AiVideoOperatorOrderLink | null,
): Promise<'identity_asset_not_active' | 'invalid_operator_ref_role' | null> {
  const assetRefs = input.refUrls.filter(isOperatorAssetRef)
  if (!assetRefs.length) return null
  if (!store.findIdentityAssets) return 'identity_asset_not_active'
  const assets = await store.findIdentityAssets(assetRefs.map(operatorAssetIdFromRef))
  return identityAssetRefsError(input, assets, order ? { id: order.id, customerId: order.customerId ?? null } : null)
}
