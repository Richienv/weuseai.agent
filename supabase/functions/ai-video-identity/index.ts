// ai-video-identity — verified real-person identities on the BytePlus ModelArk
// private asset library (LivenessFace groups).
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   — service-role client (tables are RLS service-role only)
//   AI_VIDEO_CAPABILITY_HMAC_KEY              — same key ai-video-session signs customer capabilities with
//   INTEGRATION_ENCRYPTION_KEY                — AES-256-GCM key (hex) for the 30-minute BytedToken at rest
//   PUBLIC_BASE_URL                           — customer site origin for the liveness CallbackURL
//                                               (default https://www.weuseai.id, same as ai-video-session)
//   BYTEPLUS_ARK_ACCESS_KEY / BYTEPLUS_ARK_SECRET_KEY / MODELARK_ASSET_HOST — Ark Assets API (ark-asset-client)
//   AI_VIDEO_IDENTITY_LIVENESS_BILLING — kill switch (true/1/on/yes). Default off.
//                                        Rejects start/restart with liveness_billing_blocked
//                                        if BytePlus starts charging the liveness check.
//
// Callers: the customer page (x-ai-video-capability), the Vercel admin proxy
// and pg_cron gc (Bearer service_role), and the liveness callback page
// (`confirm`, nonce only). Storage bucket: ai-video-inputs, prefix identity/.

// @ts-ignore Deno-only module
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isServiceRoleCaller } from '../_shared/admin-auth.ts'
import { handleCors, withCors } from '../_shared/cors.ts'
import {
  createAiVideoIdentityArk,
  handleAiVideoIdentity,
  isAiVideoIdentityLivenessBillingBlocked,
} from '../_shared/ai-video-identity-handler.ts'
import { createAiVideoIdentitySupabaseStore } from '../_shared/ai-video-identity-store.ts'

// @ts-ignore Deno global
declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CAPABILITY_KEY = Deno.env.get('AI_VIDEO_CAPABILITY_HMAC_KEY') ?? ''
const ENCRYPTION_KEY = Deno.env.get('INTEGRATION_ENCRYPTION_KEY') ?? ''
const PUBLIC_BASE = Deno.env.get('PUBLIC_BASE_URL') ?? 'https://www.weuseai.id'
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const store = createAiVideoIdentitySupabaseStore(supabase)
const ark = createAiVideoIdentityArk(() => ({
  BYTEPLUS_ARK_ACCESS_KEY: Deno.env.get('BYTEPLUS_ARK_ACCESS_KEY'),
  BYTEPLUS_ARK_SECRET_KEY: Deno.env.get('BYTEPLUS_ARK_SECRET_KEY'),
  MODELARK_ASSET_HOST: Deno.env.get('MODELARK_ASSET_HOST'),
}))

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return allowCapabilityHeader(preflight)
  try {
    const response = await handleAiVideoIdentity(req, {
      capabilityKey: CAPABILITY_KEY,
      encryptionKey: ENCRYPTION_KEY,
      siteOrigin: PUBLIC_BASE,
      store,
      ark,
      isInternalCaller: isServiceRoleCaller,
      livenessBillingBlocked: isAiVideoIdentityLivenessBillingBlocked(
        Deno.env.get('AI_VIDEO_IDENTITY_LIVENESS_BILLING'),
      ),
    })
    return allowCapabilityHeader(withCors(response, req))
  } catch {
    console.error(JSON.stringify({ event: 'ai_video_identity_unhandled' }))
    return allowCapabilityHeader(withCors(
      new Response(JSON.stringify({ error: 'server_error' }), { status: 503, headers: { 'content-type': 'application/json' } }),
      req,
    ))
  }
})

// The customer page sends x-ai-video-capability cross-origin; make sure the
// preflight allows it even where the shared CORS list predates that header.
function allowCapabilityHeader(res: Response): Response {
  const headers = new Headers(res.headers)
  const allowed = headers.get('Access-Control-Allow-Headers') ?? ''
  if (!/x-ai-video-capability/i.test(allowed)) {
    headers.set('Access-Control-Allow-Headers', allowed ? `${allowed}, x-ai-video-capability` : 'x-ai-video-capability')
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}
