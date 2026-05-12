/**
 * D1 multi-persona webhook push (2026-05-12): bundle-version-bump
 * broadcast handler.
 *
 * Triggered when a persona pack ships a new bundle version (typically
 * by an admin script running after `supabase functions deploy` +
 * Storage upload). Fans the version-bump out to every customer who:
 *
 *   1. Has tier-access to the bumped persona, AND
 *   2. Is on bundle_update_policy = 'latest' (skip 'pin', skip
 *      'staged' until the dashboard ships)
 *
 * For each affected customer the handler calls the provisioning
 * service's `/restart-hermes` route, which SSHes into the VPS +
 * runs `sudo systemctl restart hermes-gateway`. Hermes's
 * ExecStartPre=weuseai-bundle-pull fires on restart and pulls the
 * new version.
 *
 * Failure model: each customer is processed independently. One SSH
 * failure doesn't block the rest. The handler returns a summary
 * `{ matched, restarted, failed }` with per-customer detail for
 * admin observation.
 *
 * Auth: bearer token at the Deno entry (admin / service-role only —
 * never exposed to anon callers).
 *
 * Idempotency: not enforced server-side. Two parallel broadcasts of
 * the same agent_slug + version cause two unnecessary SSH restarts;
 * each is safe (systemctl restart is itself idempotent).
 */

import { personasForTier } from './tier-personas.ts'
import { KNOWN_PERSONA_SLUGS } from './manifest-validator.ts'

export type BroadcastInput = {
  /** Persona slug whose bundle just shipped. Must be in KNOWN_PERSONA_SLUGS. */
  agent_slug: string
  /** Optional semver of the new bundle — written into telemetry for audit
   *  trail. Not used for filtering. */
  new_version?: string
  /** Optional context label for telemetry, e.g. "manual" / "ci" / "publish". */
  reason?: string
}

export type AffectedCustomer = {
  id: string
  tier: 'starter' | 'pro' | 'studio'
}

export type BroadcastDeps = {
  /**
   * Returns every customer eligible to receive the bumped persona. The
   * production impl queries:
   *   SELECT c.id, s.tier
   *   FROM customers c
   *   JOIN subscriptions s ON s.customer_id = c.id
   *   WHERE c.bundle_update_policy = 'latest'
   *     AND s.status = 'active'
   *
   * The handler then filters by tier eligibility in-memory (cheaper
   * than encoding the tier-personas map in SQL).
   */
  findCustomersOnLatestPolicy: () => Promise<AffectedCustomer[]>
  /**
   * POST to provisioning service `/restart-hermes`. Production impl
   * uses fetch + the PROVISIONING_AUTH_TOKEN bearer. Tests mock it.
   */
  triggerRestart: (customerId: string, reason: string) => Promise<{ ok: boolean; status: number; error?: string }>
  /** Optional telemetry sink — production impl inserts into
   *  bundle_version_broadcasts. Tests collect the rows in-memory. */
  recordBroadcast?: (row: {
    agent_slug: string
    new_version: string | null
    customer_id: string
    status: 'restarted' | 'failed' | 'skipped_tier'
    detail: string | null
  }) => Promise<void>
}

export type BroadcastResult = {
  ok: true
  agent_slug: string
  new_version: string | null
  matched: number
  restarted: number
  failed: number
  skipped_tier: number
  per_customer: Array<{
    customer_id: string
    tier: string
    status: 'restarted' | 'failed' | 'skipped_tier'
    detail?: string
  }>
}

export type BroadcastError = {
  ok: false
  status: number
  error: string
  detail?: string
}

export async function handleBundleVersionBumpBroadcast(
  input: BroadcastInput,
  deps: BroadcastDeps,
): Promise<BroadcastResult | BroadcastError> {
  if (!input?.agent_slug || typeof input.agent_slug !== 'string') {
    return { ok: false, status: 400, error: 'invalid_agent_slug' }
  }
  if (!(KNOWN_PERSONA_SLUGS as readonly string[]).includes(input.agent_slug)) {
    return {
      ok: false,
      status: 400,
      error: 'unknown_agent_slug',
      detail: `agent_slug "${input.agent_slug}" not in KNOWN_PERSONA_SLUGS`,
    }
  }

  const customers = await deps.findCustomersOnLatestPolicy()

  const reason = `bundle-version-bump:${input.agent_slug}${
    input.new_version ? `@${input.new_version}` : ''
  }${input.reason ? `:${input.reason}` : ''}`

  const per_customer: BroadcastResult['per_customer'] = []
  let restarted = 0
  let failed = 0
  let skipped_tier = 0

  for (const customer of customers) {
    const personasAtTier = personasForTier(customer.tier)
    if (!personasAtTier.includes(input.agent_slug)) {
      skipped_tier++
      per_customer.push({
        customer_id: customer.id,
        tier: customer.tier,
        status: 'skipped_tier',
        detail: `tier="${customer.tier}" does not include "${input.agent_slug}"`,
      })
      await deps.recordBroadcast?.({
        agent_slug: input.agent_slug,
        new_version: input.new_version ?? null,
        customer_id: customer.id,
        status: 'skipped_tier',
        detail: `tier="${customer.tier}" does not include slug`,
      })
      continue
    }
    const result = await deps.triggerRestart(customer.id, reason)
    if (result.ok) {
      restarted++
      per_customer.push({
        customer_id: customer.id,
        tier: customer.tier,
        status: 'restarted',
      })
      await deps.recordBroadcast?.({
        agent_slug: input.agent_slug,
        new_version: input.new_version ?? null,
        customer_id: customer.id,
        status: 'restarted',
        detail: null,
      })
    } else {
      failed++
      per_customer.push({
        customer_id: customer.id,
        tier: customer.tier,
        status: 'failed',
        detail: `provisioning HTTP ${result.status}: ${result.error ?? '?'}`,
      })
      await deps.recordBroadcast?.({
        agent_slug: input.agent_slug,
        new_version: input.new_version ?? null,
        customer_id: customer.id,
        status: 'failed',
        detail: `provisioning HTTP ${result.status}: ${result.error ?? '?'}`,
      })
    }
  }

  return {
    ok: true,
    agent_slug: input.agent_slug,
    new_version: input.new_version ?? null,
    matched: customers.length,
    restarted,
    failed,
    skipped_tier,
    per_customer,
  }
}
