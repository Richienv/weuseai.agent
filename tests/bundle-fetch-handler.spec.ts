/**
 * Tests for bundle-fetch-handler (Phase 2E-2 Day 1).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  bundleFetchHandler,
  pickLatestSemver,
  type BundleFetchDeps,
  type CustomerInfo,
} from '../supabase/functions/_shared/bundle-fetch-handler.ts'

// ─── pickLatestSemver ─────────────────────────────────────────────────

test('pickLatestSemver: empty list → null', () => {
  assert.equal(pickLatestSemver([]), null)
})

test('pickLatestSemver: single → that one', () => {
  assert.equal(pickLatestSemver(['1.0.0.tar.gz']), '1.0.0')
})

test('pickLatestSemver: picks max patch', () => {
  assert.equal(pickLatestSemver(['1.0.0.tar.gz', '1.0.5.tar.gz', '1.0.2.tar.gz']), '1.0.5')
})

test('pickLatestSemver: picks max minor over patch', () => {
  assert.equal(pickLatestSemver(['1.0.99.tar.gz', '1.1.0.tar.gz']), '1.1.0')
})

test('pickLatestSemver: picks max major over minor/patch', () => {
  assert.equal(pickLatestSemver(['1.99.99.tar.gz', '2.0.0.tar.gz']), '2.0.0')
})

test('pickLatestSemver: ignores non-semver entries', () => {
  assert.equal(pickLatestSemver(['1.0.0.tar.gz', 'latest.tar.gz', '2.0.0.tar.gz']), '2.0.0')
})

test('pickLatestSemver: all-non-semver returns null', () => {
  assert.equal(pickLatestSemver(['latest', 'rc-1', 'beta']), null)
})

test('pickLatestSemver: handles entries without .tar.gz suffix too', () => {
  assert.equal(pickLatestSemver(['1.0.0', '2.3.4']), '2.3.4')
})

// ─── handler scaffolding ──────────────────────────────────────────────

const customer = (overrides: Partial<CustomerInfo> = {}): CustomerInfo => ({
  id: 'cust-1',
  tier: 'pro',
  bundle_versions: {},
  bundle_update_policy: 'pin',
  ...overrides,
})

const buildDeps = (opts: {
  customer?: CustomerInfo | null
  versions?: string[]
  versionsThrows?: Error
  signOk?: boolean
  signError?: string
}): BundleFetchDeps => ({
  customerLookup: async () => opts.customer === undefined ? customer() : opts.customer,
  listBundleVersions: async () => {
    if (opts.versionsThrows) throw opts.versionsThrows
    return opts.versions ?? []
  },
  signUrl: async ({ path, expirySeconds }) => {
    if (opts.signOk === false) {
      return { error: opts.signError ?? 'simulated sign failure' }
    }
    return {
      url: `https://example.com/${path}?token=abc&exp=${expirySeconds}`,
      expiresAt: '2026-05-08T05:00:00Z',
    }
  },
})

const baseInput = { customer_id: 'cust-1', agent_slug: 'doc-expert' }

// ─── input validation ─────────────────────────────────────────────────

test('fetch: rejects missing customer_id', async () => {
  const r = await bundleFetchHandler({ ...baseInput, customer_id: '' }, buildDeps({}))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.status, 400)
})

test('fetch: rejects unknown agent_slug', async () => {
  const r = await bundleFetchHandler({ ...baseInput, agent_slug: 'fictional' }, buildDeps({}))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'unknown_agent_slug')
})

test('fetch: 404 when customer not found', async () => {
  const r = await bundleFetchHandler(baseInput, buildDeps({ customer: null }))
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 404)
    assert.equal(r.error, 'customer_not_found')
  }
})

// ─── policy: pin ──────────────────────────────────────────────────────

test('fetch: pin policy returns explicit pin', async () => {
  const r = await bundleFetchHandler(
    baseInput,
    buildDeps({
      customer: customer({
        bundle_update_policy: 'pin',
        bundle_versions: { 'doc-expert': '1.0.0' },
      }),
    }),
  )
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.body.version, '1.0.0')
    assert.match(r.body.signed_url, /bundles\/doc-expert\/1\.0\.0\.tar\.gz/)
  }
})

test('fetch: pin policy with no pin → fallback default 1.0.0', async () => {
  const r = await bundleFetchHandler(
    baseInput,
    buildDeps({
      customer: customer({ bundle_update_policy: 'pin', bundle_versions: {} }),
    }),
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.body.version, '1.0.0')
})

// ─── policy: latest ───────────────────────────────────────────────────

test('fetch: latest policy probes Storage and picks highest semver', async () => {
  const r = await bundleFetchHandler(
    baseInput,
    buildDeps({
      customer: customer({ bundle_update_policy: 'latest' }),
      versions: ['1.0.0.tar.gz', '1.2.0.tar.gz', '1.1.5.tar.gz'],
    }),
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.body.version, '1.2.0')
})

test('fetch: latest policy with no published bundle → falls back to default', async () => {
  const r = await bundleFetchHandler(
    baseInput,
    buildDeps({
      customer: customer({ bundle_update_policy: 'latest' }),
      versions: [],
    }),
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.body.version, '1.0.0')
})

test('fetch: latest policy storage error → 500', async () => {
  const r = await bundleFetchHandler(
    baseInput,
    buildDeps({
      customer: customer({ bundle_update_policy: 'latest' }),
      versionsThrows: new Error('Storage timeout'),
    }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 500)
    assert.equal(r.error, 'bundle_list_failed')
  }
})

// ─── policy: staged ───────────────────────────────────────────────────

test('fetch: staged policy behaves like pin (uses pinned version)', async () => {
  const r = await bundleFetchHandler(
    baseInput,
    buildDeps({
      customer: customer({
        bundle_update_policy: 'staged',
        bundle_versions: { 'doc-expert': '0.9.0' },
      }),
    }),
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.body.version, '0.9.0')
})

// ─── sign URL failure ─────────────────────────────────────────────────

test('fetch: sign URL failure returns 500', async () => {
  const r = await bundleFetchHandler(
    baseInput,
    buildDeps({
      customer: customer({ bundle_update_policy: 'pin' }),
      signOk: false,
      signError: 'permission denied',
    }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 500)
    assert.equal(r.error, 'sign_url_failed')
  }
})

// ─── signed URL shape ─────────────────────────────────────────────────

test('fetch: signed URL response includes version + url + expires_at', async () => {
  const r = await bundleFetchHandler(baseInput, buildDeps({}))
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.ok(r.body.version)
    assert.ok(r.body.signed_url)
    assert.ok(r.body.expires_at)
  }
})

// ─── Sesi D pass-3 P1-1: tier-personas enforcement ────────────────────
//
// Source: docs/audit/2026-05-13-pass-3-multi-persona-and-progress.md §P1-PASS3-1
//
// Pre-fix: any tier could request any persona bundle. Test matrix below
// pins the tier → persona invariants from supabase/functions/_shared/
// tier-personas.ts (D1 lock 2026-05-12) so a future tier-personas
// edit can't silently re-open the gap.

test('Starter + trade-pro → 403 tier_does_not_grant_persona (Pro-tier persona)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'trade-pro' },
    buildDeps({ customer: customer({ tier: 'starter' }) }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 403)
    assert.equal(r.error, 'tier_does_not_grant_persona')
  }
})

test('Starter + web-app-builder → 403 (Studio-only persona)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'web-app-builder' },
    buildDeps({ customer: customer({ tier: 'starter' }) }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 403)
    assert.equal(r.error, 'tier_does_not_grant_persona')
  }
})

test('Pro + trade-pro → 200 (in-tier persona)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'trade-pro' },
    buildDeps({ customer: customer({ tier: 'pro' }) }),
  )
  assert.equal(r.ok, true)
})

test('Pro + web-app-builder → 403 (Studio-only, even on Pro)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'web-app-builder' },
    buildDeps({ customer: customer({ tier: 'pro' }) }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 403)
    assert.equal(r.error, 'tier_does_not_grant_persona')
  }
})

test('Pro + business-agent → 403 (Studio-only)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'business-agent' },
    buildDeps({ customer: customer({ tier: 'pro' }) }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'tier_does_not_grant_persona')
})

test('Studio + web-app-builder → 200 (top tier gets all)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'web-app-builder' },
    buildDeps({ customer: customer({ tier: 'studio' }) }),
  )
  assert.equal(r.ok, true)
})

test('Studio + business-agent → 200', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'business-agent' },
    buildDeps({ customer: customer({ tier: 'studio' }) }),
  )
  assert.equal(r.ok, true)
})

test('Studio + the-pro → 200 (default persona, in every tier)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'the-pro' },
    buildDeps({ customer: customer({ tier: 'studio' }) }),
  )
  assert.equal(r.ok, true)
})

test('Starter + the-pro → 200 (default persona in all tiers)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'the-pro' },
    buildDeps({ customer: customer({ tier: 'starter' }) }),
  )
  assert.equal(r.ok, true)
})

test('error message names the slug + tier (audit-friendly)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'business-agent' },
    buildDeps({ customer: customer({ tier: 'starter' }) }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.match(r.detail ?? '', /business-agent/)
    assert.match(r.detail ?? '', /starter/)
  }
})

// ─── Phase A: new canonical tier slugs + enterprise skip ────────────────

test('voice-starter + slide-master → 200 (new slug, in-tier persona)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'slide-master' },
    buildDeps({ customer: customer({ tier: 'voice-starter' }) }),
  )
  assert.equal(r.ok, true)
})

test('voice-starter + trade-pro → 403 (new slug, higher-tier persona blocked)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'trade-pro' },
    buildDeps({ customer: customer({ tier: 'voice-starter' }) }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'tier_does_not_grant_persona')
})

test('voice-starter + web-app-builder → 403 (lower tier cannot reach library-only persona)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'web-app-builder' },
    buildDeps({ customer: customer({ tier: 'voice-starter' }) }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'tier_does_not_grant_persona')
})

test('done-for-you + social-conductor → 200 (8-persona Pro set)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'social-conductor' },
    buildDeps({ customer: customer({ tier: 'done-for-you' }) }),
  )
  assert.equal(r.ok, true)
})

test('done-for-you + web-app-builder → 403 (web-app-builder persona not in the 8-set)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'web-app-builder' },
    buildDeps({ customer: customer({ tier: 'done-for-you' }) }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'tier_does_not_grant_persona')
})

test('library-full + business-agent → 200 (full 10-persona library)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'business-agent' },
    buildDeps({ customer: customer({ tier: 'library-full' }) }),
  )
  assert.equal(r.ok, true)
})

test('enterprise + any KNOWN persona → 200 (custom set — persona gate skipped)', async () => {
  for (const slug of ['the-pro', 'web-app-builder', 'business-agent']) {
    const r = await bundleFetchHandler(
      { customer_id: 'cust-1', agent_slug: slug },
      buildDeps({ customer: customer({ tier: 'enterprise' }) }),
    )
    assert.equal(r.ok, true, `enterprise should allow "${slug}"`)
  }
})

test('enterprise + unknown agent_slug → 400 (still bounded to KNOWN_PERSONA_SLUGS)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'fictional-persona' },
    buildDeps({ customer: customer({ tier: 'enterprise' }) }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'unknown_agent_slug')
})

test('unrecognized tier slug → 403 invalid_customer_tier (defense in depth)', async () => {
  const r = await bundleFetchHandler(
    { customer_id: 'cust-1', agent_slug: 'the-pro' },
    buildDeps({ customer: customer({ tier: 'platinum-deluxe' }) }),
  )
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 403)
    assert.equal(r.error, 'invalid_customer_tier')
  }
})
