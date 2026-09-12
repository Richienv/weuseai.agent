// @ts-ignore Deno-only module
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleCors, webhookCorsHeaders, withCors } from '../_shared/cors.ts'
import { handleAiVideoProviderCallback } from '../_shared/ai-video-provider-callback-handler.ts'
import { createAiVideoOperatorRuntime } from '../_shared/ai-video-operator-runtime.ts'
import { createAiVideoProviderRuntime } from '../_shared/ai-video-provider-runtime.ts'
import { resolveModelArkConfig } from '../_shared/modelark-client.ts'

// @ts-ignore Deno global
declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void }
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
  const preflight = handleCors(req, webhookCorsHeaders)
  if (preflight) return preflight
  const response = await handleAiVideoProviderCallback(req, {
    findJobByTaskId: runtime.findJobByTaskId,
    processor: runtime,
    findOperatorJobByTaskId: operator.findJobByTaskId,
    operatorProcessor: operator,
  })
  return withCors(response, webhookCorsHeaders)
})
