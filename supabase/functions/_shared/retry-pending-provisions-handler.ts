/**
 * Sesi A D1 (2026-05-13): retry-pending-provisions pure handler.
 *
 * Audit doc: docs/audit/2026-05-13-customer-flow-hardening.md §P1-CF-6 Phase 2.
 *
 * pg_cron-driven worker that makes good on A3's customer-facing
 * promise ("Agent kamu dijadwalkan ulang otomatis — kami coba lagi
 * setiap 3 menit. Kalau dalam 30 menit belum berhasil, tim kami
 * hubungi kamu via email").
 *
 * Cadence:
 *   - pg_cron invokes the Deno entry every 3 min.
 *   - Each invocation scans pending_provision subscriptions whose
 *     last retry attempt is > MIN_RETRY_INTERVAL_MS old.
 *   - For each candidate row, runs at most 1 spinUp attempt.
 *   - After MAX_ATTEMPTS attempts → marks the subscription exhausted
 *     (writes a final attempt row with outcome='exhausted'). Founder
 *     reconciles manually from there (Telegram alert + daily digest,
 *     wired up in Phase 4).
 *
 * Manual-override (founder DM bot command) is flagged for a future
 * cascade — not in D1 scope per founder brief.
 *
 * Design choices:
 *   - Each pure-function invocation is idempotent for re-runs WITHIN
 *     the same 3-min window. If two pg_cron ticks somehow run in
 *     parallel (shouldn't, but defense-in-depth), MIN_RETRY_INTERVAL_MS
 *     prevents double-spending an attempt.
 *   - SpinUp delegation reuses the existing IProvisioningClient
 *     interface — no protocol changes.
 *   - Subscription row's `status` is NOT mutated by this worker. The
 *     existing pending_provision → active transition stays driven by
 *     the customer-readiness / VPS-active path. Worker only writes
 *     audit rows + re-triggers spinUp.
 */

import type {
  IProvisioningClient,
  SpinUpInput,
  Tier,
} from './types.ts'

// ─── Tunable constants ───────────────────────────────────────────────

/**
 * How long a subscription must sit in pending_provision before the
 * worker considers retrying. Matches A3 customer copy: customers see
 * "Kami coba lagi setiap 3 menit." Implication: first retry fires
 * ~3 min after the row went pending_provision (the original failed
 * spinUp happened at that moment).
 */
export const PENDING_STALE_AGE_MS = 3 * 60_000 // 3 min

/**
 * Minimum gap between retries for a single subscription. Even if the
 * cron fires fast, we never spend two attempts on the same row in
 * under this window. Matches the customer-facing "setiap 3 menit"
 * cadence.
 */
export const MIN_RETRY_INTERVAL_MS = 3 * 60_000 // 3 min

/**
 * Maximum retry attempts before marking a row exhausted. With 3-min
 * cadence this gives ~18 min of automated retry — well within the
 * 30-min ceiling A3 copy promised. After exhaustion the founder gets
 * a Telegram alert (Phase 4) + sends the customer an email manually.
 */
export const MAX_ATTEMPTS = 6

// ─── Input + output types ────────────────────────────────────────────

export type PendingProvisionRow = {
  subscription_id: string
  customer_id: string
  tier: Tier
  always_on_enabled: boolean
  /** When the customer paid + the subscription was created. */
  subscription_started_at: string  // ISO8601
}

export type RetryAttempt = {
  subscription_id: string
  attempted_at: string  // ISO8601
  attempt_number: number
  outcome: 'in_flight' | 'spin_up_ok' | 'capacity_exhausted' | 'other_error' | 'exhausted'
}

export type RetryHandlerDeps = {
  /** Service-role SELECT — all subscriptions in pending_provision status
   *  that are at least PENDING_STALE_AGE_MS old. */
  findStalePendingProvisions(): Promise<PendingProvisionRow[]>
  /** Latest attempt for a given subscription, or null if no prior
   *  attempts. The worker uses this to compute the next attempt
   *  number + gate against MIN_RETRY_INTERVAL_MS. */
  findLatestAttempt(subscriptionId: string): Promise<RetryAttempt | null>
  /** Reconstruct the spin-up input from the subscription + customer
   *  rows (bot token, openrouter key, soul md). The handler doesn't
   *  decrypt — store impl does the heavy lifting. */
  buildSpinUpInput(row: PendingProvisionRow): Promise<SpinUpInput | null>
  /** Append-only audit log. Returns the inserted row's id (mostly
   *  useful for tracing in logs). */
  insertAttempt(input: {
    subscription_id: string
    customer_id: string
    attempt_number: number
    outcome: RetryAttempt['outcome']
    detail?: string
  }): Promise<{ id: string }>
  /** The existing IProvisioningClient (provisioning-service or mock
   *  in tests). Worker delegates spin-up unchanged. */
  provisioning: IProvisioningClient
  /** For deterministic tests. Defaults to () => new Date() in prod. */
  now?: () => Date
  /** Best-effort log sink (Vercel/Supabase logs surface this). */
  log?: (msg: string, extra?: Record<string, unknown>) => void
  /**
   * Phase 4 (audit §Telemetry, 2026-05-13): when a subscription hits
   * MAX_ATTEMPTS this tick, fire a founder-DM alert so manual reconcile
   * happens fast. Receives a pre-formatted text payload (CID + sub_id
   * + recognizable tag).
   *
   * Optional — handler must still ship cleanly when undefined
   * (back-compat for tests + local-stub Deno deploys that lack the
   * Telegram env vars). Throws are swallowed: telemetry failures must
   * never abort the worker tick. The append-only attempt row is the
   * source of truth; the founder DM is a nicety on top.
   */
  notifyFounder?: (text: string) => Promise<void>
}

export type RetryHandlerResult = {
  /** Total stale rows considered. */
  scanned: number
  /** Rows that triggered a spinUp this tick. */
  retried: number
  /** Rows that were too recently retried (gap < MIN_RETRY_INTERVAL_MS). */
  skipped_recent: number
  /** Rows where buildSpinUpInput returned null (missing customer data). */
  skipped_invalid: number
  /** Rows that hit MAX_ATTEMPTS this tick + got marked exhausted. */
  exhausted: number
  /** Per-row outcomes (small, useful for debugging in tests + logs). */
  outcomes: Array<{
    subscription_id: string
    outcome: RetryAttempt['outcome'] | 'skipped_recent' | 'skipped_invalid'
  }>
}

// ─── Handler ─────────────────────────────────────────────────────────

export async function retryPendingProvisionsHandler(
  deps: RetryHandlerDeps,
): Promise<RetryHandlerResult> {
  const now = deps.now ?? (() => new Date())
  const log = deps.log ?? ((msg, extra) => {
    // eslint-disable-next-line no-console
    console.log(msg, extra ?? '')
  })

  const stale = await deps.findStalePendingProvisions()
  const result: RetryHandlerResult = {
    scanned: stale.length,
    retried: 0,
    skipped_recent: 0,
    skipped_invalid: 0,
    exhausted: 0,
    outcomes: [],
  }

  for (const row of stale) {
    const subId = row.subscription_id
    const latest = await deps.findLatestAttempt(subId)

    // If we've already exhausted this row, don't re-enter. The exhausted
    // outcome is terminal — only manual override clears it.
    if (latest && latest.outcome === 'exhausted') {
      result.outcomes.push({ subscription_id: subId, outcome: 'exhausted' })
      continue
    }

    // Gate against MIN_RETRY_INTERVAL_MS so a sub doesn't get a second
    // spin-up before its previous attempt has had time to settle.
    if (latest) {
      const lastMs = Date.parse(latest.attempted_at)
      if (!Number.isNaN(lastMs) && now().getTime() - lastMs < MIN_RETRY_INTERVAL_MS) {
        result.skipped_recent += 1
        result.outcomes.push({ subscription_id: subId, outcome: 'skipped_recent' })
        continue
      }
    }

    const nextAttemptNumber = (latest?.attempt_number ?? 0) + 1

    // Cap at MAX_ATTEMPTS. The Nth attempt is the last spin-up call;
    // the (N+1)th invocation marks exhausted without calling spin-up.
    if (nextAttemptNumber > MAX_ATTEMPTS) {
      await deps.insertAttempt({
        subscription_id: subId,
        customer_id: row.customer_id,
        attempt_number: nextAttemptNumber,
        outcome: 'exhausted',
        detail: `Hit MAX_ATTEMPTS=${MAX_ATTEMPTS}; founder manual reconcile required.`,
      })
      result.exhausted += 1
      result.outcomes.push({ subscription_id: subId, outcome: 'exhausted' })
      log('[retry-pending-provisions] exhausted', {
        subscription_id: subId,
        customer_id: row.customer_id,
        attempt_number: nextAttemptNumber,
      })
      // Phase 4: founder DM alert. Best-effort — any throw is
      // swallowed so the next stale row still gets processed and the
      // audit log stays the source of truth.
      if (deps.notifyFounder) {
        const text =
          `[retry-worker] retry-exhausted for customer ${row.customer_id} ` +
          `(subscription ${subId}) — ${MAX_ATTEMPTS} attempts failed over ` +
          `~${(MAX_ATTEMPTS * MIN_RETRY_INTERVAL_MS) / 60_000} min. ` +
          `Manual reconcile required.`
        try {
          await deps.notifyFounder(text)
        } catch (e) {
          log('[retry-pending-provisions] notifyFounder threw (swallowed)', {
            subscription_id: subId,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }
      continue
    }

    // Build the spin-up input. May return null if customer row is
    // missing required fields (e.g. soulMdContent never written —
    // shouldn't happen if onboarding step 3 completed, but defensive).
    const input = await deps.buildSpinUpInput(row)
    if (!input) {
      result.skipped_invalid += 1
      result.outcomes.push({ subscription_id: subId, outcome: 'skipped_invalid' })
      // Record this as an attempt so we don't loop forever on a
      // permanently-broken row. Counts toward MAX_ATTEMPTS.
      await deps.insertAttempt({
        subscription_id: subId,
        customer_id: row.customer_id,
        attempt_number: nextAttemptNumber,
        outcome: 'other_error',
        detail: 'buildSpinUpInput returned null (customer row missing required fields)',
      })
      log('[retry-pending-provisions] skipped_invalid', {
        subscription_id: subId,
        attempt_number: nextAttemptNumber,
      })
      continue
    }

    // Write an in_flight row first so concurrent invocations see "this
    // attempt is in progress." Updated in-place is awkward in this
    // append-only model; we instead write a SECOND row with the
    // outcome. The pair (in_flight + result) is the attempt record.
    // For simplicity in v1 we just write the result row directly —
    // a second pg_cron tick within MIN_RETRY_INTERVAL_MS is gated
    // above. If a tick exceeds 3 min duration we have bigger problems
    // than double-attempts (the spin-up call itself takes < 30 s).
    const spinResult = await deps.provisioning.spinUp(input)
    const outcome = spinResult.ok
      ? 'spin_up_ok' as const
      : isCapacityError(spinResult.body)
        ? 'capacity_exhausted' as const
        : 'other_error' as const
    const detail = spinResult.ok
      ? `jobId=${spinResult.jobId}`
      : `status=${spinResult.status} body=${truncate(spinResult.body, 500)}`

    await deps.insertAttempt({
      subscription_id: subId,
      customer_id: row.customer_id,
      attempt_number: nextAttemptNumber,
      outcome,
      detail,
    })

    result.retried += 1
    result.outcomes.push({ subscription_id: subId, outcome })
    log('[retry-pending-provisions] attempt', {
      subscription_id: subId,
      customer_id: row.customer_id,
      attempt_number: nextAttemptNumber,
      outcome,
    })
  }

  return result
}

// ─── Helpers ────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s
  return s.slice(0, max) + '…'
}

/**
 * Mirror of supabase/functions/_shared/complete-onboarding-handler.ts
 * isProviderCapacityError — kept local so this handler has no
 * cross-handler import dependency. If a future pass-N audit wants
 * to consolidate, that's a small refactor.
 */
function isCapacityError(body: string): boolean {
  if (typeof body !== 'string' || body.length === 0) return false
  if (body.includes('Compute resources temporarily unavailable')) return true
  if (/out of stock/i.test(body)) return true
  if (/plan.*region.*unavailable|region.*plan.*unavailable/i.test(body)) return true
  if (/insufficient.*capacity/i.test(body)) return true
  if (/sold.*out/i.test(body)) return true
  if (/size.*not available/i.test(body)) return true
  if (/region.*not available/i.test(body)) return true
  return false
}
