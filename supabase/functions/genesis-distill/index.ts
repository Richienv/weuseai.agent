// Deno Edge Function entry — genesis-distill (Genesis Onboarding, 2026-06-13).
//
// Spec:    docs/plans/2026-06-13-genesis-onboarding.md
// Handler: ../_shared/genesis-distill-handler.ts (pure, fully tested)
//
// Deploy:
//   supabase functions deploy genesis-distill --project-ref gtjgsligllbjcisiyrah
//
// Called during onboarding with an X-CID-bound POST { customer_id, tier,
// samples }. Distills the customer's forwarded/pasted work samples into a
// DRAFT (inferred profile + recommended persona + sanitized expectations +
// an honest summary) that the customer confirms before complete-onboarding
// provisions. No side effects here — this function only reads + reasons.
//
// Required env (auto): none (no DB access — pure inference).
// Required env (manual — founder sets once):
//   DEEPSEEK_API_KEY — the SAME business key persona-genesis uses; a new
//                      LOCATION, not a new credential. Without it every call
//                      502s with llm_unconfigured (fail-closed).
// Optional env:
//   DEEPSEEK_BASE — default https://api.deepseek.com

import { handleCors, withCors } from '../_shared/cors.ts'
import {
  handleGenesisDistill,
  type GenesisDistillDeps,
} from '../_shared/genesis-distill-handler.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') ?? ''
const DEEPSEEK_BASE = Deno.env.get('DEEPSEEK_BASE') ?? 'https://api.deepseek.com'

const deps: GenesisDistillDeps = {
  distill: async ({ system, user }) => {
    if (!DEEPSEEK_API_KEY) {
      throw new Error('llm_unconfigured: DEEPSEEK_API_KEY secret is not set')
    }
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
        max_tokens: 1200,
        temperature: 0.4,
      }),
    })
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      throw new Error(`deepseek distill HTTP ${r.status}: ${text.slice(0, 300)}`)
    }
    const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('deepseek distill: empty completion')
    return content
  },
}

// ─── HTTP entry ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  const res = await handleGenesisDistill(req, deps)
  return withCors(res, req)
})
