// Deno Edge Function entry — library-refine (Mission 3, 2026-06-11).
//
// Weekly cron (see migration 20260611000000): aggregates real usage
// signals, drafts library improvements with DeepSeek, gates them, and
// queues survivors as PENDING founder proposals. Ships nothing itself.
//
// Deploy: supabase functions deploy library-refine
// Env (auto): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Env (manual): DEEPSEEK_API_KEY (same secret persona-genesis uses)
// Optional: DEEPSEEK_BASE, LIBRARY_REFINE_WINDOW_DAYS, LIBRARY_REFINE_MAX_DRAFTS

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import {
  libraryRefineHandler,
  type LibraryRefineDeps,
} from '../_shared/library-refine-handler.ts'
import { parseTar, gunzipBytes } from '../_shared/tar-gz.ts'
import { pickLatestSemver } from '../_shared/bundle-fetch-handler.ts'
import { KNOWN_PERSONA_SLUGS, type Manifest } from '../_shared/manifest-validator.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') ?? ''
const DEEPSEEK_BASE = Deno.env.get('DEEPSEEK_BASE') ?? 'https://api.deepseek.com'
const BUCKET = 'workflow-templates'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Per-invocation bundle cache (a weekly cron touches ≤10 personas).
type BundleCtx = { templateIds: string[]; skillIds: string[]; skills: Map<string, string> }
const bundleCache = new Map<string, BundleCtx | null>()

async function loadBundle(personaSlug: string): Promise<BundleCtx | null> {
  if (bundleCache.has(personaSlug)) return bundleCache.get(personaSlug)!
  let ctx: BundleCtx | null = null
  try {
    const { data: objects } = await supabase.storage
      .from(BUCKET)
      .list(`bundles/${personaSlug}`, { limit: 100 })
    const latest = pickLatestSemver((objects ?? []).map((o) => o.name))
    if (latest) {
      const { data: blob } = await supabase.storage
        .from(BUCKET)
        .download(`bundles/${personaSlug}/${latest}.tar.gz`)
      if (blob) {
        const entries = parseTar(await gunzipBytes(new Uint8Array(await blob.arrayBuffer())))
        const manifestEntry = entries.find((e) => e.path === 'manifest.json')
        if (manifestEntry) {
          const manifest = JSON.parse(manifestEntry.content) as Manifest
          const skills = new Map<string, string>()
          for (const e of entries) {
            const m = /^skills\/([a-z0-9-]+)\/SKILL\.md$/.exec(e.path)
            if (m) skills.set(m[1], e.content)
          }
          ctx = {
            templateIds: manifest.templates.map((t) => t.id),
            skillIds: manifest.skills.map((s) => s.id),
            skills,
          }
        }
      }
    }
  } catch (e) {
    console.error(`[library-refine] bundle load failed for ${personaSlug}:`, e instanceof Error ? e.message : String(e))
  }
  bundleCache.set(personaSlug, ctx)
  return ctx
}

function numEnv(key: string, fallback: number): number {
  const n = Number(Deno.env.get(key))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const deps: LibraryRefineDeps = {
  async readNoMatches(windowDays) {
    const cutoff = new Date(Date.now() - windowDays * 86_400_000).toISOString()
    const { data } = await supabase
      .from('template_no_match_log')
      .select('customer_id, persona_slug, skill_id, requested_deliverable, created_at')
      .gte('created_at', cutoff)
      .limit(2000)
    return (data ?? []) as Awaited<ReturnType<LibraryRefineDeps['readNoMatches']>>
  },
  async readAbortedFlows(windowDays) {
    const cutoff = new Date(Date.now() - windowDays * 86_400_000).toISOString()
    // Aggregate-shaped read only — state_data (conversation-adjacent) is
    // intentionally NOT selected (privacy contract).
    const { data } = await supabase
      .from('customer_flow_state')
      .select('customer_id, playbook_id, current_step, total_steps, updated_at')
      .eq('status', 'aborted')
      .gte('updated_at', cutoff)
      .limit(2000)
    return (data ?? []) as Awaited<ReturnType<LibraryRefineDeps['readAbortedFlows']>>
  },
  async openProposalKeys() {
    const { data } = await supabase
      .from('library_proposals')
      .select('dedup_key')
      .in('status', ['pending', 'approved', 'applied'])
    return new Set(((data ?? []) as Array<{ dedup_key: string }>).map((r) => r.dedup_key))
  },
  async bundleContext(personaSlug) {
    const ctx = await loadBundle(personaSlug)
    if (!ctx) return null
    return {
      templateIds: ctx.templateIds,
      skillIds: ctx.skillIds,
      skillMd: (skillId: string) => ctx.skills.get(skillId) ?? null,
    }
  },
  async resolvePlaybookPersona(playbookId) {
    for (const slug of KNOWN_PERSONA_SLUGS) {
      const ctx = await loadBundle(slug)
      if (ctx?.skillIds.includes(playbookId)) return slug
    }
    return null
  },
  llm: async ({ system, user, stage }) => {
    if (!DEEPSEEK_API_KEY) throw new Error('llm_unconfigured: DEEPSEEK_API_KEY secret is not set')
    const r = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 6000,
        temperature: 0.5,
      }),
    })
    if (!r.ok) throw new Error(`deepseek ${stage} HTTP ${r.status}`)
    const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error(`deepseek ${stage}: empty completion`)
    return content
  },
  async insertProposal(p) {
    const { error } = await supabase.from('library_proposals').insert({
      kind: p.kind,
      persona_slug: p.persona_slug,
      target_id: p.target_id,
      draft: p.draft,
      evidence: p.evidence,
      dedup_key: p.dedup_key,
      status: 'pending',
    })
    // 23505 = the open-dedup unique index raced another run — benign.
    if (error && !`${error.code}`.includes('23505')) {
      throw new Error(`proposal insert: ${error.message}`)
    }
  },
  log: (msg) => console.log(msg),
  windowDays: numEnv('LIBRARY_REFINE_WINDOW_DAYS', 30),
  maxDraftsPerRun: numEnv('LIBRARY_REFINE_MAX_DRAFTS', 5),
}

Deno.serve(async (req) => {
  // Service-role gate — same pattern as fleet-sentinel/retry-pending.
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
  try {
    const result = await libraryRefineHandler(deps)
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'internal', detail: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
})
