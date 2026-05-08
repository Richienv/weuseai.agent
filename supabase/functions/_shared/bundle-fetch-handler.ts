// bundle-fetch handler (Phase 2E-2).
//
// Spec: docs/plans/2026-05-08-phase-2e-2-bundle-delivery-spec.md
//
// Customer-side endpoint: returns a 5-minute signed URL pointing at the
// bundle tarball in Storage. Hermes' bundle-pull script POSTs here at
// boot, downloads via the signed URL, extracts to /var/lib/weuseai/.
//
// Auth: customer_id UUID validated against active subscription. Same
// model as workflow-execute. Phase 2E-3 may swap to per-customer signed
// JWT (parallel to welcome.html → Phase 2B JWT plan).

import {
  KNOWN_PERSONA_SLUGS,
} from './manifest-validator.ts'
import { TIER_ORDINAL, type WorkflowTier } from './workflow-types.ts'

// ─── input + output ────────────────────────────────────────────────────

export type BundleFetchInput = {
  customer_id: string
  agent_slug: string
}

export type BundleFetchOk = {
  ok: true
  status: 200
  body: {
    version: string
    signed_url: string
    expires_at: string  // ISO8601
    sha256?: string     // optional, populated when available
  }
}

export type BundleFetchErr = {
  ok: false
  status: 400 | 403 | 404 | 500
  error: string
  detail?: string
}

export type BundleFetchResult = BundleFetchOk | BundleFetchErr

// ─── injected dependencies ─────────────────────────────────────────────

export type CustomerInfo = {
  id: string
  tier: WorkflowTier
  bundle_versions: Record<string, string>
  bundle_update_policy: 'pin' | 'latest' | 'staged'
}

export type BundleFetchDeps = {
  customerLookup: (customerId: string) => Promise<CustomerInfo | null>
  /**
   * List object names under `bundles/<slug>/`. Used for `latest` policy
   * resolution. Returns array of filenames (e.g. ['1.0.0.tar.gz', '1.1.0.tar.gz']).
   * Empty array when the agent has no published bundles.
   */
  listBundleVersions: (agentSlug: string) => Promise<string[]>
  /**
   * Mint a signed URL for the path. Phase 2E-2 uses 5-min expiry.
   */
  signUrl: (params: {
    path: string
    expirySeconds: number
  }) => Promise<{ url: string; expiresAt: string } | { error: string }>
}

// ─── version resolver ──────────────────────────────────────────────────

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/

/**
 * Pick the highest-semver version from a list of `<version>.tar.gz`
 * filenames. Returns null when the list is empty or has no valid semvers.
 */
export function pickLatestSemver(filenames: string[]): string | null {
  let best: { v: string; nums: [number, number, number] } | null = null
  for (const fn of filenames) {
    const stripped = fn.endsWith('.tar.gz') ? fn.slice(0, -7) : fn
    const m = SEMVER_RE.exec(stripped)
    if (!m) continue
    const nums: [number, number, number] = [
      parseInt(m[1], 10),
      parseInt(m[2], 10),
      parseInt(m[3], 10),
    ]
    if (
      !best ||
      nums[0] > best.nums[0] ||
      (nums[0] === best.nums[0] && nums[1] > best.nums[1]) ||
      (nums[0] === best.nums[0] && nums[1] === best.nums[1] && nums[2] > best.nums[2])
    ) {
      best = { v: stripped, nums }
    }
  }
  return best?.v ?? null
}

// ─── handler ────────────────────────────────────────────────────────────

const PHASE_2E2_FALLBACK_VERSION = '1.0.0'
const SIGNED_URL_EXPIRY_SECONDS = 5 * 60

export async function bundleFetchHandler(
  input: BundleFetchInput,
  deps: BundleFetchDeps,
): Promise<BundleFetchResult> {
  if (!input.customer_id || typeof input.customer_id !== 'string') {
    return { ok: false, status: 400, error: 'invalid_customer_id' }
  }
  if (!input.agent_slug || typeof input.agent_slug !== 'string') {
    return { ok: false, status: 400, error: 'invalid_agent_slug' }
  }
  if (!(KNOWN_PERSONA_SLUGS as readonly string[]).includes(input.agent_slug)) {
    return {
      ok: false,
      status: 400,
      error: 'unknown_agent_slug',
      detail: `must be one of ${KNOWN_PERSONA_SLUGS.join(', ')}`,
    }
  }

  const customer = await deps.customerLookup(input.customer_id)
  if (!customer) {
    return { ok: false, status: 404, error: 'customer_not_found' }
  }
  // Tier sanity (defense in depth — every paid customer should have a tier).
  if (!TIER_ORDINAL[customer.tier]) {
    return {
      ok: false,
      status: 403,
      error: 'invalid_customer_tier',
      detail: customer.tier,
    }
  }

  // Resolve target version per policy.
  let targetVersion: string
  const pinnedVersion = customer.bundle_versions[input.agent_slug]

  if (customer.bundle_update_policy === 'pin' || customer.bundle_update_policy === 'staged') {
    // Pin or staged: always use the explicit pin. If none set, fall back
    // to the Phase 2E-2 default. (Staged behaves like pin until dashboard
    // ships in Phase 3+.)
    targetVersion = pinnedVersion ?? PHASE_2E2_FALLBACK_VERSION
  } else {
    // 'latest': probe Storage for highest-semver version.
    let versions: string[]
    try {
      versions = await deps.listBundleVersions(input.agent_slug)
    } catch (e) {
      return {
        ok: false,
        status: 500,
        error: 'bundle_list_failed',
        detail: e instanceof Error ? e.message : String(e),
      }
    }
    const latest = pickLatestSemver(versions)
    if (!latest) {
      // No published bundle for this agent yet. Fall back to the pinned
      // version (or the Phase 2E-2 default) — degrades gracefully.
      targetVersion = pinnedVersion ?? PHASE_2E2_FALLBACK_VERSION
    } else {
      targetVersion = latest
    }
  }

  const path = `bundles/${input.agent_slug}/${targetVersion}.tar.gz`
  const signResult = await deps.signUrl({
    path,
    expirySeconds: SIGNED_URL_EXPIRY_SECONDS,
  })

  if ('error' in signResult) {
    return {
      ok: false,
      status: 500,
      error: 'sign_url_failed',
      detail: signResult.error,
    }
  }

  return {
    ok: true,
    status: 200,
    body: {
      version: targetVersion,
      signed_url: signResult.url,
      expires_at: signResult.expiresAt,
    },
  }
}
