/**
 * bundle-fetch — Persona Genesis custom-slug path.
 *
 * Isolation contract: `custom-<cid>` is fetchable ONLY by that exact
 * customer, only on genesis tiers, only when the row is active. The
 * curated-persona path stays byte-for-byte unchanged (existing suite
 * covers it; the last test here pins the tier-set mirror).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  bundleFetchHandler,
  type BundleFetchDeps,
  type CustomerInfo,
} from '../supabase/functions/_shared/bundle-fetch-handler.ts'
import { GENESIS_TIERS } from '../supabase/functions/_shared/persona-genesis-handler.ts'
import { readFileSync } from 'node:fs'

const OWNER = 'a1b2c3d4-0000-4000-8000-1234567890ab'
const SLUG = `custom-${OWNER}`

function makeDeps(opts: {
  tier?: string
  customRow?: { version: string; status: 'generating' | 'active' | 'failed' } | null
  wireCustomLookup?: boolean
} = {}): BundleFetchDeps {
  return {
    customerLookup: async (cid): Promise<CustomerInfo | null> => ({
      id: cid,
      tier: opts.tier ?? 'done-for-you',
      bundle_versions: {},
      bundle_update_policy: 'pin',
    }),
    listBundleVersions: async () => [],
    signUrl: async ({ path }) => ({
      url: `https://storage.test/signed/${path}`,
      expiresAt: '2026-06-10T12:05:00.000Z',
    }),
    ...(opts.wireCustomLookup === false
      ? {}
      : {
          customPersonaLookup: async () =>
            opts.customRow === undefined
              ? { version: '1.0.0', status: 'active' as const }
              : opts.customRow,
        }),
  }
}

test('owner with active custom persona on done-for-you → signed URL', async () => {
  const res = await bundleFetchHandler({ customer_id: OWNER, agent_slug: SLUG }, makeDeps())
  assert.equal(res.ok, true)
  if (!res.ok) return
  assert.equal(res.body.version, '1.0.0')
  assert.match(res.body.signed_url, new RegExp(`bundles/${SLUG}/1\\.0\\.0\\.tar\\.gz`))
})

test('TENANT ISOLATION: customer B requesting customer A bundle → 403, no lookup leak', async () => {
  const res = await bundleFetchHandler(
    { customer_id: 'attacker-cid', agent_slug: SLUG },
    makeDeps(),
  )
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.status, 403)
  assert.equal(res.error, 'custom_persona_not_owned')
})

test('non-genesis tier (library-full) → 403 tier_does_not_grant_persona', async () => {
  const res = await bundleFetchHandler(
    { customer_id: OWNER, agent_slug: SLUG },
    makeDeps({ tier: 'library-full' }),
  )
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.status, 403)
  assert.equal(res.error, 'tier_does_not_grant_persona')
})

test('legacy pro alias resolves to done-for-you → allowed', async () => {
  const res = await bundleFetchHandler(
    { customer_id: OWNER, agent_slug: SLUG },
    makeDeps({ tier: 'pro' }),
  )
  assert.equal(res.ok, true)
})

test('no custom persona row → 404 (the pull script treats this as normal)', async () => {
  const res = await bundleFetchHandler(
    { customer_id: OWNER, agent_slug: SLUG },
    makeDeps({ customRow: null }),
  )
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.status, 404)
})

test('failed/generating rows are NOT served', async () => {
  for (const status of ['failed', 'generating'] as const) {
    const res = await bundleFetchHandler(
      { customer_id: OWNER, agent_slug: SLUG },
      makeDeps({ customRow: { version: '1.0.0', status } }),
    )
    assert.equal(res.ok, false, `${status} must 404`)
  }
})

test('entry without customPersonaLookup wired → 404 (back-compat)', async () => {
  const res = await bundleFetchHandler(
    { customer_id: OWNER, agent_slug: SLUG },
    makeDeps({ wireCustomLookup: false }),
  )
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.status, 404)
})

test('regenerated version is the one served', async () => {
  const res = await bundleFetchHandler(
    { customer_id: OWNER, agent_slug: SLUG },
    makeDeps({ customRow: { version: '1.0.3', status: 'active' } }),
  )
  assert.equal(res.ok, true)
  if (!res.ok) return
  assert.equal(res.body.version, '1.0.3')
})

test('curated slugs still go through the unchanged known-slug path', async () => {
  const res = await bundleFetchHandler(
    { customer_id: OWNER, agent_slug: 'the-pro' },
    makeDeps(),
  )
  assert.equal(res.ok, true)
})

test('drift pin: bundle-fetch CUSTOM_BUNDLE_TIERS mirrors GENESIS_TIERS', () => {
  // bundle-fetch keeps its own literal set (avoids importing the genesis
  // handler into every fetch entry); this source-grep pins the two equal.
  const src = readFileSync(
    new URL('../supabase/functions/_shared/bundle-fetch-handler.ts', import.meta.url),
    'utf8',
  )
  const m = src.match(/CUSTOM_BUNDLE_TIERS[^=]*= new Set\(\[([^\]]+)\]\)/)
  assert.ok(m, 'CUSTOM_BUNDLE_TIERS literal not found')
  const inFetch = m![1].split(',').map((s) => s.trim().replace(/['"]/g, '')).sort()
  assert.deepEqual(inFetch, [...GENESIS_TIERS].sort())
})
