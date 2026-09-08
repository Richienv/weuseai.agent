import {
  AI_VIDEO_OPERATOR_INFLIGHT_CAP,
  MONID_SEEDANCE_PROMPT_MAX,
  AI_VIDEO_OPERATOR_MAX_REFS,
  AI_VIDEO_OPERATOR_NONTERMINAL,
  applyOperatorTransition,
  canCancelOperatorJob,
  canSubmitOperatorJob,
  isOperatorJobId,
  operatorGenerateReady,
  parseOperatorLibraryTitle,
  parseOperatorPromptSaveInput,
  parseOperatorStartInput,
  presentAiVideoOperatorJob,
  presentAiVideoOperatorLibrary,
  type AiVideoOperatorCharacter,
  type AiVideoOperatorJob,
  type AiVideoOperatorLibraryItem,
  type AiVideoOperatorPromptSaveInput,
  type AiVideoOperatorStartInput,
} from './ai-video-operator.ts'

export type AiVideoOperatorOrderLink = {
  id: string
  tid: string
  email: string
  idea: string | null
  photos: string[]
  paymentStatus?: string | null
  fulfillment?: string | null
}

export type AiVideoOperatorGenerateStore = {
  findByRequestId?(id: string): Promise<AiVideoOperatorJob | null>
  countInflight(): Promise<number>
  findOrderByTid(tid: string): Promise<AiVideoOperatorOrderLink | null>
  createQueued(input: AiVideoOperatorStartInput & { orderId: string | null }): Promise<AiVideoOperatorJob>
  submitQueued?(job: AiVideoOperatorJob): Promise<AiVideoOperatorJob>
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

export function readOperatorGenerateEnv(env: Record<string, string | undefined> = processEnv()) {
  return {
    OPERATOR_GENERATE_ENABLED: env.OPERATOR_GENERATE_ENABLED,
    MONID_API_KEY: env.MONID_API_KEY,
  }
}

export async function startAiVideoOperatorGenerate(
  body: Record<string, unknown>,
  store: AiVideoOperatorGenerateStore,
  env: ReturnType<typeof readOperatorGenerateEnv> = readOperatorGenerateEnv(),
) {
  if (!operatorGenerateReady(env)) return { error: 'operator_probe_required' as const, status: 409 }
  let input: AiVideoOperatorStartInput
  try {
    input = parseOperatorStartInput(body)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'invalid_input' as const, status: 400 }
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
  let orderId: string | null = null
  if (input.tid) {
    const order = await store.findOrderByTid(input.tid)
    if (!order) return { error: 'order_not_found' as const, status: 404 }
    orderId = order.id
  }
  const job = await store.createQueued({ ...input, orderId })
  let current = job
  if (store.submitQueued) {
    try {
      current = await store.submitQueued(job)
    } catch {
      current = job
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
  if (!updated) return { error: 'job_not_found' as const, status: 404 }
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
    if (typeof name !== 'string') return { error: 'invalid_input' as const, status: 400 }
    uploads.push(await store.signUpload(name))
  }
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
    return { error: error instanceof Error ? error.message : 'invalid_operator_title' as const, status: 400 }
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
    return { error: error instanceof Error ? error.message : 'invalid_input' as const, status: 400 }
  }
  const item = await store.savePrompt(input)
  return { ok: true as const, item: presentAiVideoOperatorLibrary(item) }
}

export function presentOperatorReady(env: ReturnType<typeof readOperatorGenerateEnv> = readOperatorGenerateEnv()) {
  return { enabled: operatorGenerateReady(env) }
}

export function canKickOperatorSubmit(job: AiVideoOperatorJob): boolean {
  return canSubmitOperatorJob(job)
}

export function hasInflightOperatorJobs(jobs: AiVideoOperatorJob[]): boolean {
  return jobs.some((job) => (AI_VIDEO_OPERATOR_NONTERMINAL as readonly string[]).includes(job.status))
}

function processEnv(): Record<string, string | undefined> {
  return typeof process !== 'undefined' ? process.env : {}
}
