// Deno Edge Function entry — integration-credentials.
//
// Sesi R Phase 1 (2026-05-13). Customer BYO credential storage for
// third-party integrations (Xendit / WhatsApp Cloud API / OnlinePajak).
//
// Deploy:
//   supabase functions deploy integration-credentials \
//     --project-ref gtjgsligllbjcisiyrah --use-api
//
// Required env (Supabase auto):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Required env (Supabase secret):
//   HERMES_INSTANCE_HMAC_KEY        — same secret used for hermes-instance-auth
//   INTEGRATION_ENCRYPTION_KEY      — 32-byte hex (`openssl rand -hex 32`)
//
// URL shape: /functions/v1/integration-credentials/<integration>
//   GET    → 200/404/410 status check (NEVER leaks ciphertext)
//   POST   → validate-against-upstream → encrypt → upsert
//   DELETE → soft-delete (revoked_at)

// @ts-ignore — Deno-only import; Node typecheck skips
import { createClient } from 'jsr:@supabase/supabase-js@2'

import {
  handleIntegrationCredential,
  type IntegrationCredentialDeps,
  type CredentialRow,
} from '../_shared/integration-credential-handler.ts'
import type { IntegrationName } from '../_shared/integration-error-mapper.ts'
import {
  logIntegrationCall,
  type IntegrationAuditDeps,
} from '../_shared/integration-audit-log.ts'
import { handleCors, withCors } from '../_shared/cors.ts'

// @ts-ignore — Deno global
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const HMAC_KEY = Deno.env.get('HERMES_INSTANCE_HMAC_KEY')!
const ENC_KEY = Deno.env.get('INTEGRATION_ENCRYPTION_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ─── Audit-log deps (service-role insert into audit_log) ──────────────

const auditDeps: IntegrationAuditDeps = {
  async insertAuditRow(row) {
    const { error } = await supabase
      .from('audit_log')
      .insert(row)
    if (error) throw new Error(`audit insert: ${error.message}`)
  },
}

// ─── Upstream validators per integration ──────────────────────────────

async function validateXendit(apiKey: string): Promise<{
  ok: boolean
  status?: number
  code?: string
  last_validated_at?: string
}> {
  // GET /balance — cheapest "is this key live" probe. 200 → valid.
  try {
    const r = await fetch('https://api.xendit.co/balance?account_type=CASH', {
      method: 'GET',
      headers: {
        Authorization: `Basic ${btoa(`${apiKey}:`)}`,
      },
    })
    if (r.ok) {
      return { ok: true, last_validated_at: new Date().toISOString() }
    }
    let code: string | undefined
    try {
      const body = (await r.json()) as { error_code?: string }
      code = body.error_code
    } catch {
      // ignore — body not JSON
    }
    return { ok: false, status: r.status, code }
  } catch {
    return { ok: false, status: 0, code: 'NETWORK_ERROR' }
  }
}

async function validateUpstream(
  integration: IntegrationName,
  apiKey: string,
): ReturnType<NonNullable<IntegrationCredentialDeps['validateUpstream']>> {
  switch (integration) {
    case 'xendit':
      return validateXendit(apiKey)
    case 'whatsapp_cloud_api':
    case 'onlinepajak':
      // Slot 2/3 not yet implemented — reject with a clear code so the
      // customer sees a Bahasa "belum tersedia" message via the error
      // mapper's fallback (config_set 400 with Bahasa from mapper).
      return { ok: false, status: 0, code: 'NETWORK_ERROR' }
  }
}

// ─── DB deps ───────────────────────────────────────────────────────────

const deps: IntegrationCredentialDeps = {
  hmacKey: HMAC_KEY,
  encryptionKey: ENC_KEY,

  async loadRow(customer_id, integration) {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('*')
      .eq('customer_id', customer_id)
      .eq('integration', integration)
      .maybeSingle()
    if (error) return null
    return (data as CredentialRow | null) ?? null
  },

  async upsertRow(row) {
    // Upsert on (customer_id, integration) unique. If a revoked row
    // exists, this REPLACES it — handler already clears revoked_at by
    // setting it to null on the inbound row.
    const { error } = await supabase
      .from('integration_credentials')
      .upsert(row, { onConflict: 'customer_id,integration' })
    if (error) throw new Error(`upsert: ${error.message}`)
  },

  async revokeRow(customer_id, integration) {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('integration_credentials')
      .update({ revoked_at: now })
      .eq('customer_id', customer_id)
      .eq('integration', integration)
      .is('revoked_at', null)
    if (error) {
      // Best-effort idempotency — already-revoked rows produce no error
      // (the .is('revoked_at', null) filter just skips them).
      console.error('[integration-credentials] revoke error:', error.message)
    }
  },

  validateUpstream,

  async logAuditCall(input) {
    await logIntegrationCall(auditDeps, input)
  },
}

// ─── Deno entrypoint ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  const res = await handleIntegrationCredential(deps, req)
  return withCors(res, req)
})
