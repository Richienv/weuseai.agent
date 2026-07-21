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
import { personasForTier, resolveTier } from './tier-personas.ts'

// ─── input + output ────────────────────────────────────────────────────

export type BundleFetchInput = {
  customer_id: string
  agent_slug: string
  /**
   * Per-customer HMAC instance token (Phase 5-3.c) presented as
   * `Authorization: Bearer <HERMES_INSTANCE_TOKEN>`. The VPS holds this in
   * /home/weuseai/.hermes/.env; an attacker who only knows the customer_id
   * cannot forge it (it is HMAC(customer_id, server-secret)). Verified by
   * `deps.verifyToken` when configured — see the security note on the gate
   * below. Optional on the wire for back-compat with VPSes provisioned
   * before bundle-pull-script started sending it.
   */
  bearer_token?: string | null
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
  status: 400 | 401 | 403 | 404 | 500
  error: string
  detail?: string
}

export type BundleFetchResult = BundleFetchOk | BundleFetchErr

// ─── injected dependencies ─────────────────────────────────────────────

export type CustomerInfo = {
  id: string
  /**
   * Tier slug as stored on the subscription. Accepts both the canonical
   * Phase A slugs (voice-starter / library-full / done-for-you /
   * enterprise) AND the deprecated count-based slugs (starter / pro /
   * studio) — resolveTier() normalizes either via the alias map.
   */
  tier: string
  bundle_versions: Record<string, string>
  bundle_update_policy: 'pin' | 'latest' | 'staged'
}

export type BundleFetchDeps = {
  /**
   * HMAC instance-token verifier (Phase 5-3.c, security finding H2/H3
   * 2026-06-14). When provided, the handler REQUIRES a valid token bound to
   * the requesting customer_id — closing the IDOR where anyone who knew a
   * victim's customer_id could mint a signed URL to that victim's private
   * persona bundle (custom-<cid>) or a higher-tier persona. Mirrors the gate
   * on approval-queue / hermes-kanban-proxy. OPTIONAL for back-compat:
   * undefined (server has no HERMES_INSTANCE_HMAC_KEY) → fail-open, identical
   * to the prior behaviour, so an unconfigured deploy is never WORSE than
   * before. Returns true on a valid token.
   */
  verifyToken?: (customerId: string, token: string) => Promise<boolean>
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
  /**
   * Persona Genesis (2026-06-10): the customer's generated persona, when
   * one exists AND is active. Optional — entries that don't wire it simply
   * 404 every custom-slug request (back-compat).
   */
  customPersonaLookup?: (customerId: string) => Promise<{
    version: string
    status: 'generating' | 'active' | 'failed'
  } | null>
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
  // ─── Auth gate (H2/H3, 2026-06-14) ────────────────────────────────────
  // Bind the request to the customer's per-customer HMAC instance token so a
  // bare customer_id (which travels in browser URLs/referrers) is NOT enough
  // to fetch that customer's bundle. The token is HMAC(customer_id, secret),
  // held only on that customer's VPS — unforgeable from the UUID alone. When
  // verifyToken is unset (no HERMES_INSTANCE_HMAC_KEY configured) we fall back
  // to the prior tier/ownership-only behaviour (fail-open), so this can never
  // be WORSE than before. Mirrors approval-queue / hermes-kanban-proxy.
  if (deps.verifyToken) {
    const ok = await deps.verifyToken(input.customer_id, input.bearer_token ?? '')
    if (!ok) {
      return { ok: false, status: 401, error: 'unauthorized' }
    }
  }
  // Persona Genesis (2026-06-10): `custom-<customer_id>` slugs take a
  // dedicated path with STRICTER isolation than the curated library — the
  // slug must name the requesting customer exactly, so customer A can never
  // mint a URL for customer B's generated persona.
  if (input.agent_slug.startsWith('custom-')) {
    return await fetchCustomPersonaBundle(input, deps)
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
  // Tier sanity (defense in depth — every paid customer should have a tier
  // slug that resolves to a known tier). resolveTier() accepts both the
  // canonical Phase A slugs and the deprecated count-based aliases; an
  // unrecognized slug throws → 403.
  let canonicalTier: ReturnType<typeof resolveTier>
  try {
    canonicalTier = resolveTier(customer.tier)
  } catch {
    return {
      ok: false,
      status: 403,
      error: 'invalid_customer_tier',
      detail: customer.tier,
    }
  }

  // Sesi D pass-3 P1-1 (2026-05-13): tier-personas enforcement.
  //
  // Source: docs/audit/2026-05-13-pass-3-multi-persona-and-progress.md §P1-PASS3-1
  //
  // Pre-fix: handler only checked agent_slug ∈ KNOWN_PERSONA_SLUGS (typo
  // catch) and never compared against the customer's tier — so a lower
  // tier customer with an active subscription could mint a signed URL for
  // any higher-tier-only persona bundle (web-app-builder, business-agent)
  // and download the prompt-IP. tier-personas.ts is the single source of
  // truth used by setup-script + bundle-pull; mirroring it here closes the
  // privilege-escalation gap.
  //
  // Phase A: `enterprise` has a CUSTOM persona set (no fixed roster), so
  // the persona-membership gate is skipped for enterprise — the agent_slug
  // ∈ KNOWN_PERSONA_SLUGS check above still bounds it to the real library,
  // so this never widens beyond the 10 known personas.
  if (canonicalTier !== 'enterprise') {
    const allowedSlugs = personasForTier(customer.tier)
    if (!allowedSlugs.includes(input.agent_slug)) {
      return {
        ok: false,
        status: 403,
        error: 'tier_does_not_grant_persona',
        detail: `agent_slug "${input.agent_slug}" not available on tier "${customer.tier}"`,
      }
    }
  }

  // Resolve target version per policy.
  let targetVersion: string
  const pinnedVersion = customer.bundle_versions[input.agent_slug]

  if (pinnedVersion && (customer.bundle_update_policy === 'pin' || customer.bundle_update_policy === 'staged')) {
    // Explicit pin (or staged with a chosen version): honor it exactly.
    targetVersion = pinnedVersion
  } else {
    // 'latest' — OR pin/staged with NO explicit pin. The latter is the DEFAULT
    // for a freshly-provisioned customer: migration 20260508140000 defaults
    // bundle_update_policy='pin' + bundle_versions='{}', and nothing in the
    // activation/provisioning path writes an explicit pin (the Phase-3
    // subscription-activation policy step was never built). The old behaviour
    // fell straight to a hardcoded '1.0.0', so every newly-published pack (e.g.
    // the-pro@1.7.0) was INERT until a manual psql re-pin — the ship never
    // reached customers. Probe Storage for the highest-semver bundle instead so
    // a default customer tracks the current pack.
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
    // No published bundle at all → degrade to the pin (if any) or the Phase 2E-2
    // default, so this can never be worse than the prior behaviour.
    targetVersion = pickLatestSemver(versions) ?? pinnedVersion ?? PHASE_2E2_FALLBACK_VERSION
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

// ─── Persona Genesis custom-bundle path ──────────────────────────────────

// Mirrors GENESIS_TIERS in persona-genesis-handler.ts (import would be
// circular-ish for entries that only wire bundle-fetch; the drift test
// tests/bundle-fetch-custom-persona.spec.ts pins the two sets equal).
const CUSTOM_BUNDLE_TIERS: ReadonlySet<string> = new Set(['done-for-you', 'enterprise'])

async function fetchCustomPersonaBundle(
  input: BundleFetchInput,
  deps: BundleFetchDeps,
): Promise<BundleFetchResult> {
  // Ownership: the ONLY custom slug a customer may fetch is their own.
  if (input.agent_slug !== `custom-${input.customer_id}`) {
    return {
      ok: false,
      status: 403,
      error: 'custom_persona_not_owned',
      detail: 'custom personas are fetchable only by their owner',
    }
  }

  const customer = await deps.customerLookup(input.customer_id)
  if (!customer) {
    return { ok: false, status: 404, error: 'customer_not_found' }
  }
  let canonicalTier: ReturnType<typeof resolveTier>
  try {
    canonicalTier = resolveTier(customer.tier)
  } catch {
    return { ok: false, status: 403, error: 'invalid_customer_tier', detail: customer.tier }
  }
  if (!CUSTOM_BUNDLE_TIERS.has(canonicalTier)) {
    return {
      ok: false,
      status: 403,
      error: 'tier_does_not_grant_persona',
      detail: `custom personas not available on tier "${customer.tier}"`,
    }
  }

  if (!deps.customPersonaLookup) {
    return { ok: false, status: 404, error: 'custom_persona_not_found' }
  }
  const custom = await deps.customPersonaLookup(input.customer_id)
  if (!custom || custom.status !== 'active') {
    return { ok: false, status: 404, error: 'custom_persona_not_found' }
  }

  const path = `bundles/${input.agent_slug}/${custom.version}.tar.gz`
  const signResult = await deps.signUrl({ path, expirySeconds: SIGNED_URL_EXPIRY_SECONDS })
  if ('error' in signResult) {
    return { ok: false, status: 500, error: 'sign_url_failed', detail: signResult.error }
  }
  return {
    ok: true,
    status: 200,
    body: {
      version: custom.version,
      signed_url: signResult.url,
      expires_at: signResult.expiresAt,
    },
  }
}
