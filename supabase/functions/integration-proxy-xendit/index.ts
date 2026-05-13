// Deno Edge Function entry — integration-proxy-xendit.
//
// Sesi R Phase 1 (2026-05-13). Single proxy that dispatches by body
// .operation to Xendit's REST API on the customer's behalf.
//
// Deploy:
//   supabase functions deploy integration-proxy-xendit \
//     --project-ref gtjgsligllbjcisiyrah --use-api
//
// Required env (Supabase auto):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Required env (Supabase secret):
//   HERMES_INSTANCE_HMAC_KEY    — shared HMAC for X-CID auth
//   INTEGRATION_ENCRYPTION_KEY  — 32-byte hex for AES-GCM cred decrypt
//
// URL: /functions/v1/integration-proxy-xendit
// Method: POST
// Body: { "operation": "invoice.create" | "invoice.get" | "refund.create" | "balance.get",
//         "params": { ... } }

// @ts-ignore — Deno-only import
import { createClient } from 'jsr:@supabase/supabase-js@2'

import {
  handleXenditProxy,
  type XenditProxyDeps,
} from '../_shared/integration-proxy-xendit-handler.ts'
import type { CredentialRow } from '../_shared/integration-credential-handler.ts'
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

const auditDeps: IntegrationAuditDeps = {
  async insertAuditRow(row) {
    const { error } = await supabase
      .from('audit_log')
      .insert(row)
    if (error) throw new Error(`audit insert: ${error.message}`)
  },
}

const deps: XenditProxyDeps = {
  hmacKey: HMAC_KEY,
  encryptionKey: ENC_KEY,

  async loadCredential(customer_id) {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('*')
      .eq('customer_id', customer_id)
      .eq('integration', 'xendit')
      .maybeSingle()
    if (error) return null
    return (data as CredentialRow | null) ?? null
  },

  async xenditFetch(path, init) {
    return fetch(`https://api.xendit.co${path}`, init)
  },

  async logAuditCall(input) {
    await logIntegrationCall(auditDeps, input)
  },
}

Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  const res = await handleXenditProxy(deps, req)
  return withCors(res, req)
})
