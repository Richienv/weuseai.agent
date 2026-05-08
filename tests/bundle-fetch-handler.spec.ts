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
