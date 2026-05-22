// template-no-match-log handler.
//
// When a persona's `template_fetch_required: true` skill cannot match
// the customer's request to any library template, the agent calls this
// to record the miss. Founder reviews via api/admin/observability/
// template-no-match.ts and decides which templates to author next.
//
// Pure module — persistence is dependency-injected. Auth (X-CID ==
// customer_id) is enforced here; the Edge Function entry forwards the
// header. Same gate posture as flow-state-handler.ts.

export type TemplateNoMatchInput = {
  customer_id: string
  /** Value of the request's X-CID header — must equal customer_id. */
  x_cid: string | null
  /** Which persona pack the agent is running. */
  persona_slug: string
  /** The skill that asked for a template (matches manifest skill id). */
  skill_id: string
  /** Short label for what the customer asked for. Max 500 chars. */
  requested_deliverable: string
  /** Optional context: keywords tried, variables extracted, etc. */
  match_context?: Record<string, unknown>
}

export type TemplateNoMatchRow = {
  id: string
  customer_id: string | null
  persona_slug: string
  skill_id: string
  requested_deliverable: string
  match_context: Record<string, unknown>
  created_at: string
}

export type TemplateNoMatchOk = { ok: true; status: 200; body: TemplateNoMatchRow }
export type TemplateNoMatchErr = {
  ok: false
  status: 400 | 403
  error: string
  detail?: string
}
export type TemplateNoMatchResult = TemplateNoMatchOk | TemplateNoMatchErr

export interface TemplateNoMatchStore {
  insert(input: {
    customer_id: string
    persona_slug: string
    skill_id: string
    requested_deliverable: string
    match_context: Record<string, unknown>
  }): Promise<TemplateNoMatchRow>
}

const DELIVERABLE_MAX = 500
const SLUG_RE = /^[a-z][a-z0-9-]+$/
const SKILL_ID_RE = /^[a-z][a-z0-9-]+$/

export async function handleTemplateNoMatchLog(
  input: TemplateNoMatchInput,
  store: TemplateNoMatchStore,
): Promise<TemplateNoMatchResult> {
  // ── Validation ──────────────────────────────────────────────────
  if (!input.customer_id) {
    return { ok: false, status: 400, error: 'missing_customer_id' }
  }
  if (!input.persona_slug || !SLUG_RE.test(input.persona_slug)) {
    return {
      ok: false,
      status: 400,
      error: 'bad_persona_slug',
      detail: 'persona_slug must be a kebab-case slug',
    }
  }
  if (!input.skill_id || !SKILL_ID_RE.test(input.skill_id)) {
    return {
      ok: false,
      status: 400,
      error: 'bad_skill_id',
      detail: 'skill_id must be a kebab-case identifier',
    }
  }
  if (!input.requested_deliverable || input.requested_deliverable.trim().length === 0) {
    return { ok: false, status: 400, error: 'missing_requested_deliverable' }
  }
  if (input.requested_deliverable.length > DELIVERABLE_MAX) {
    return {
      ok: false,
      status: 400,
      error: 'requested_deliverable_too_long',
      detail: `max ${DELIVERABLE_MAX} chars`,
    }
  }

  // ── Auth: X-CID must equal customer_id (no leak across customers) ──
  if (!input.x_cid || input.x_cid !== input.customer_id) {
    return {
      ok: false,
      status: 403,
      error: 'x_cid_mismatch',
      detail: 'X-CID header must equal customer_id',
    }
  }

  const row = await store.insert({
    customer_id: input.customer_id,
    persona_slug: input.persona_slug,
    skill_id: input.skill_id,
    requested_deliverable: input.requested_deliverable.trim(),
    match_context: input.match_context ?? {},
  })
  return { ok: true, status: 200, body: row }
}
