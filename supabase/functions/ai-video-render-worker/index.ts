// @ts-ignore Deno-only module
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isServiceRoleCaller } from '../_shared/admin-auth.ts'
import { handleCors, withCors } from '../_shared/cors.ts'
import { createAiVideoOperatorRuntime, runAiVideoOperatorWorker } from '../_shared/ai-video-operator-runtime.ts'
import { createAiVideoProviderRuntime } from '../_shared/ai-video-provider-runtime.ts'
import { runAiVideoRenderWorker } from '../_shared/ai-video-render-worker-handler.ts'
import { resolveModelArkConfig } from '../_shared/modelark-client.ts'

// @ts-ignore Deno global
declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void }
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const modelArk = resolveModelArkConfig({
  baseUrl: Deno.env.get('BYTEPLUS_MODELARK_API_BASE'), promptModelId: Deno.env.get('AI_VIDEO_PROMPT_MODEL_ID'),
  seedanceModelId: Deno.env.get('SEEDANCE_MODEL_ID'), callbackUrl: Deno.env.get('AI_VIDEO_PROVIDER_CALLBACK_URL'),
})
const runtime = createAiVideoProviderRuntime({
  supabase, modelArk, encryptionKey: Deno.env.get('INTEGRATION_ENCRYPTION_KEY') ?? '',
  botToken: Deno.env.get('AI_VIDEO_TELEGRAM_BOT_TOKEN') ?? '',
})
const operator = createAiVideoOperatorRuntime({
  supabase, apiKey: Deno.env.get('MONID_API_KEY') ?? '',
})

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return withCors(json({ error: 'method_not_allowed' }, 405), req)
  if (!isServiceRoleCaller(req)) return withCors(json({ error: 'unauthorized' }, 401), req)
  const options = await req.json().catch(() => ({})) as { operator_only?: boolean }
  async function processOperator() {
    let operatorResult: { claimed: number; completed: number; failed: number } | { error: string } = { error: 'operator_skipped' }
    try {
      operatorResult = await runAiVideoOperatorWorker({
        async claim(limit, leaseSeconds) {
          const { data, error } = await supabase.rpc('claim_due_ai_video_operator_jobs', { p_limit: limit, p_lease_seconds: leaseSeconds })
          if (error) throw error
          return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id),
            status: row.status as 'queued' | 'submitted' | 'running' | 'succeeded' | 'failed' | 'cancelled',
            prompt: String(row.prompt ?? ''),
            ratio: row.ratio as '9:16' | '16:9' | '21:9' | '1:1',
            durationSeconds: Number(row.duration_seconds) || 6,
            generateAudio: row.generate_audio === true,
            providerTaskId: row.provider_task_id ? String(row.provider_task_id) : null,
            providerModelId: row.provider_model_id ? String(row.provider_model_id) : null,
            resolution: row.resolution ? String(row.resolution) : '720p',
            refUrls: Array.isArray(row.ref_urls) ? row.ref_urls.map(String) : [],
            refRoles: Array.isArray(row.ref_roles) ? row.ref_roles.map(String) : [],
            resultPath: row.result_path ? String(row.result_path) : null,
            attempt: Number(row.attempt) || 0,
          }))
        },
        processor: operator,
      })
    } catch {
      console.error(JSON.stringify({ event: 'operator_worker_failed' }))
      operatorResult = { error: 'operator_worker_failed' }
    }
    return operatorResult
  }
  if (options.operator_only === true && typeof EdgeRuntime !== 'undefined') {
    EdgeRuntime.waitUntil(processOperator())
    return withCors(json({ ok: true, operator: { scheduled: true } }, 202), req)
  }
  const operatorResult = await processOperator()
  let customer: unknown = { error: 'customer_skipped' }
  try {
    if (options.operator_only !== true) customer = await runAiVideoRenderWorker({
      async claim(limit, leaseSeconds) {
        const { data, error } = await supabase.rpc('claim_due_ai_video_render_jobs', { p_limit: limit, p_lease_seconds: leaseSeconds })
        if (error) throw error
        const jobs = await Promise.all(((data ?? []) as Array<{ id: string }>).map((row) => runtime.findJobById(row.id)))
        return jobs.filter((job): job is NonNullable<typeof job> => job !== null)
      },
      processor: { ...runtime, claimDelivery: async () => true },
    })
  } catch {
    customer = { error: 'customer_worker_failed' }
  }
  return withCors(json({ ok: true, customer, operator: operatorResult }), req)
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
