// Customer onboarding observability — types
//
// A "Snapshot" is the raw rows from the DB for a single customer.
// A "StatusReport" is the derived stage-by-stage health view that the
// admin dashboard + diagnose CLI both render.
//
// Pure-logic derivation lives in `derive.ts`. PostgREST fetching in
// `fetch.ts`. Rendering in `render-text.ts` / `render-html.ts`.

export type StageKind =
  | 'payment'
  | 'provisioning'
  | 'hermes_persona'
  | 'bundle_pull'
  | 'telegram_pairing'
  | 'first_message'

export type StageState =
  // Customer hasn't entered this stage yet (upstream stage incomplete or
  // record absent). The dashboard renders this dim/grey.
  | 'pending'
  // Stage is in flight — VPS provisioning, bundle pulling, etc.
  | 'in_progress'
  // Stage completed successfully.
  | 'ok'
  // Stage failed and a retry is appropriate (transient).
  | 'failed_retryable'
  // Stage failed and needs human intervention (founder unsticks).
  | 'failed_hard'

export interface StageStatus {
  kind: StageKind
  state: StageState
  /**
   * Short one-line summary, customer-context-free.
   *  e.g. "Setup invoice paid 3h ago"
   *       "VPS running at 103.31.x.x, provisioned 12m ago"
   *       "Bundle pull failed: storage_unavailable"
   */
  summary: string
  /**
   * Optional structured details for the dashboard to render — small key
   * values only (no large blobs). Diagnostic CLI prints these on -v.
   */
  details?: Record<string, string | number | null>
  /**
   * ISO timestamp of the most recent signal that produced this status.
   * Lets the dashboard show "12m ago" / "3h ago" rather than absolute
   * times that need timezone-juggling.
   */
  asOf?: string
  /**
   * Suggested founder action when state is failed_*.
   *  e.g. "Re-trigger bundle pull from /admin/replay"
   *       "Customer hasn't pasted bot token yet — chase via Telegram"
   */
  suggestedAction?: string
}

export interface CustomerSnapshot {
  customer:
    | {
        id: string
        email: string
        display_name: string | null
        telegram_chat_id: string | null
        telegram_bot_token: string | null
        soul_md_text: string | null
        bundle_versions: Record<string, string>
        bundle_update_policy: 'pin' | 'latest' | 'staged'
        pairing_code: string | null
        pairing_code_expires_at: string | null
        created_at: string
      }
    | null
  subscription:
    | {
        id: string
        tier: 'starter' | 'pro' | 'studio' | null
        status: 'pending' | 'active' | 'paused' | 'canceled' | 'failed' | null
        always_on_enabled: boolean
        hosting_active: boolean
        started_at: string | null
        next_billing_at: string | null
      }
    | null
  setupInvoice:
    | {
        id: string
        status: 'pending' | 'paid' | 'expired' | 'failed' | null
        amount_idr: number
        paid_at: string | null
        created_at: string
      }
    | null
  vps:
    | {
        id: string
        status: 'provisioning' | 'running' | 'stopped' | 'failed' | null
        ip_address: string | null
        region: string | null
        created_at: string
      }
    | null
  bundlePulls: Array<{
    agent_slug: string
    version_requested: string | null
    version_installed: string | null
    status:
      | 'success'
      | 'failed'
      | 'timeout'
      | 'permission_denied'
      | 'storage_unavailable'
    error_detail: string | null
    attempted_at: string
  }>
  /**
   * Most recent usage_log row's created_at. Proves the customer's agent
   * actually answered at least one prompt. Null if zero rows.
   */
  firstMessageAt: string | null
  /**
   * Rough count of usage_log rows in the last 7 days. Optional context.
   */
  recentMessageCount: number
}

export interface StatusReport {
  customerId: string
  email: string | null
  displayName: string | null
  tier: 'starter' | 'pro' | 'studio' | null
  generatedAt: string
  /**
   * The 6 progressive stages in canonical order. UI renders them as a
   * vertical pipeline; CLI renders as a numbered list.
   */
  stages: StageStatus[]
  /**
   * Summary verdict: 'healthy' if all stages ok, 'in_flight' if any
   * stage in_progress and no failures, 'stuck' if any failed_* present.
   */
  overall: 'healthy' | 'in_flight' | 'stuck' | 'unknown'
  /**
   * Founder-facing top-level "next thing to do" — derived from first
   * non-ok stage. Empty string when overall === 'healthy'.
   */
  nextAction: string
}
