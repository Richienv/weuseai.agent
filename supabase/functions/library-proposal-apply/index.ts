// Deno Edge Function entry — library-proposal-apply (Mission 3).
//
// Founder decision executor. Called server-to-server by the Vercel admin
// proxy (api/admin/library-proposal-decide.ts) AFTER founder cookie auth —
// this entry re-gates on service-role. approve = patch bundle + upload new
// version + broadcast; reject = mark rejected.
//
// Deploy: supabase functions deploy library-proposal-apply

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import {
  libraryProposalApply,
  type ApplyDeps,
  type LibraryProposalRow,
} from '../_shared/library-proposal-apply-handler.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'workflow-templates'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const deps: ApplyDeps = {
  async getProposal(id) {
    const { data } = await supabase
      .from('library_proposals')
      .select('id, kind, persona_slug, target_id, draft, status')
      .eq('id', id)
      .maybeSingle()
    return (data as LibraryProposalRow | null) ?? null
  },
  async setProposalStatus(id, status, extra) {
    const { error } = await supabase
      .from('library_proposals')
      .update({
        status,
        decided_at: new Date().toISOString(),
        ...(extra?.applied_version ? { applied_version: extra.applied_version } : {}),
        ...(extra?.error_detail ? { error_detail: extra.error_detail } : {}),
      })
      .eq('id', id)
    if (error) throw new Error(`proposal update: ${error.message}`)
  },
  async listBundleVersions(personaSlug) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(`bundles/${personaSlug}`, { limit: 100 })
    if (error) throw new Error(`storage list: ${error.message}`)
    return (data ?? []).map((o) => o.name)
  },
  async downloadBundle(personaSlug, version) {
    const { data } = await supabase.storage
      .from(BUCKET)
      .download(`bundles/${personaSlug}/${version}.tar.gz`)
    if (!data) return null
    return new Uint8Array(await data.arrayBuffer())
  },
  async uploadBundle(personaSlug, version, tarGz) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`bundles/${personaSlug}/${version}.tar.gz`, tarGz.buffer as ArrayBuffer, {
        contentType: 'application/gzip',
        upsert: false, // a version is immutable — never overwrite
      })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  },
  async broadcast(personaSlug, newVersion) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/bundle-version-bump-broadcast`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          agent_slug: personaSlug,
          new_version: newVersion,
          reason: 'library-proposal-approved',
        }),
      })
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` }
      return { ok: true }
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) }
    }
  },
}

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization') ?? ''
  let role: string | null = null
  try {
    role = (JSON.parse(atob(auth.slice(7).split('.')[1] ?? '')) as { role?: string }).role ?? null
  } catch { /* reject below */ }
  if (role !== 'service_role') {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }
  let body: { id?: string; decision?: 'approve' | 'reject' }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }
  const result = await libraryProposalApply(
    { id: body.id ?? '', decision: body.decision ?? 'reject' },
    deps,
  )
  const payload = result.ok ? { ok: true, ...result.body } : { ok: false, error: result.error, detail: result.detail }
  return new Response(JSON.stringify(payload), {
    status: result.status,
    headers: { 'content-type': 'application/json' },
  })
})
