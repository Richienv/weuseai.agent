import { test } from 'node:test'
import assert from 'node:assert/strict'

import { renderSkillMd, buildManifestEntry } from '../src/lib/skill-md.ts'
import { synthesize } from '../src/synthesize/index.ts'
import { tokopediaSearchSession } from './_helpers/fixtures.ts'

const TOKOPEDIA_SPEC = synthesize(
  [
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'iphone', productTitle: 'iPhone 14', productPrice: 'Rp 15jt' }),
    tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'macbook', productTitle: 'MacBook Pro', productPrice: 'Rp 30jt' }),
  ],
  { displayName: 'Tokopedia Product Search', triggerPhrases: ['cari produk', 'lookup tokopedia'] },
)

const RENDER_OPTS = {
  bundleSlug: 'web-creator',
  enabledForTiers: ['pro', 'studio'] as const,
}

// ─── renderSkillMd ───────────────────────────────────────────────────

test('renderSkillMd: starts with skill heading + bundle metadata', () => {
  const md = renderSkillMd(TOKOPEDIA_SPEC, RENDER_OPTS)
  assert.match(md, /^# tokopedia-product-search — Hermes skill/)
  assert.match(md, /Bundle: web-creator/)
  assert.match(md, /Tier: pro\+/)
  assert.match(md, /Handler: `hermes-skill:autobrowse-replay`/)
})

test('renderSkillMd: tier label resolves to starter+ when starter included', () => {
  const md = renderSkillMd(TOKOPEDIA_SPEC, { ...RENDER_OPTS, enabledForTiers: ['starter', 'pro', 'studio'] })
  assert.match(md, /Tier: starter\+/)
})

test('renderSkillMd: tier label studio when only studio', () => {
  const md = renderSkillMd(TOKOPEDIA_SPEC, { ...RENDER_OPTS, enabledForTiers: ['studio'] })
  assert.match(md, /Tier: studio/)
})

test('renderSkillMd: includes Kapan dipakai with founder-supplied trigger phrases', () => {
  const md = renderSkillMd(TOKOPEDIA_SPEC, RENDER_OPTS)
  assert.match(md, /## Kapan dipakai/)
  assert.match(md, /- "cari produk"/)
  assert.match(md, /- "lookup tokopedia"/)
})

test('renderSkillMd: empty trigger phrases shows founder-edit placeholder', () => {
  const spec = synthesize([
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'a', productTitle: 'A', productPrice: 'X' }),
  ])
  const md = renderSkillMd(spec, RENDER_OPTS)
  assert.match(md, /trigger phrases not yet authored/)
})

test('renderSkillMd: parameter table includes search_query field', () => {
  const md = renderSkillMd(TOKOPEDIA_SPEC, RENDER_OPTS)
  assert.match(md, /## Yang harus diekstrak/)
  assert.match(md, /\| `search_query` \| string \| ya \|/)
})

test('renderSkillMd: Yang dilakukan numbered list of steps', () => {
  const md = renderSkillMd(TOKOPEDIA_SPEC, RENDER_OPTS)
  assert.match(md, /## Yang dilakukan/)
  assert.match(md, /^1\. Buka URL/m)
  // Step that types the parameter
  assert.match(md, /Ketik nilai parameter `search_query`/)
})

test('renderSkillMd: Output table lists product_title + product_price', () => {
  const md = renderSkillMd(TOKOPEDIA_SPEC, RENDER_OPTS)
  assert.match(md, /## Output/)
  assert.match(md, /\| `product_title` \|/)
  assert.match(md, /\| `product_price` \|/)
})

test('renderSkillMd: includes Decline + Failure handling sections', () => {
  const md = renderSkillMd(TOKOPEDIA_SPEC, RENDER_OPTS)
  assert.match(md, /## Decline/)
  assert.match(md, /## Failure handling/)
  assert.match(md, /auth-walls \/ captcha/)
  assert.match(md, /partial: true/)
})

test('renderSkillMd: provenance footer when notes present', () => {
  const md = renderSkillMd(TOKOPEDIA_SPEC, RENDER_OPTS)
  assert.match(md, /## Provenance/)
  assert.match(md, /Synthesized from 2 session/)
})

test('renderSkillMd: brand voice — no exclamation marks in body', () => {
  const md = renderSkillMd(TOKOPEDIA_SPEC, RENDER_OPTS)
  // Allow no exclamations at all (strict per CLAUDE.md voice rules).
  assert.doesNotMatch(md, /!/, 'SKILL.md must contain zero exclamation marks per CLAUDE.md voice rules')
})

test('renderSkillMd: brand voice — no banned words', () => {
  const md = renderSkillMd(TOKOPEDIA_SPEC, RENDER_OPTS).toLowerCase()
  const banned = ['basically', 'literally', 'honestly', 'revolutionary', 'disrupt', '10x', 'game-changer', 'next-level']
  for (const w of banned) {
    assert.equal(md.includes(w), false, `SKILL.md contains banned word: "${w}"`)
  }
})

// ─── buildManifestEntry ──────────────────────────────────────────────

test('buildManifestEntry: produces id + handler_ref + enabled_for_tiers', () => {
  const entry = buildManifestEntry(TOKOPEDIA_SPEC, RENDER_OPTS)
  assert.equal(entry.id, 'tokopedia-product-search')
  assert.equal(entry.handler_ref, 'hermes-skill:autobrowse-replay')
  assert.deepEqual(entry.enabled_for_tiers, ['pro', 'studio'])
  assert.equal(entry.execution, 'hermes-skill')
  assert.deepEqual(entry.templates_used, [])
})

test('buildManifestEntry: execution kind derived from handler_ref prefix', () => {
  const entry = buildManifestEntry(TOKOPEDIA_SPEC, {
    ...RENDER_OPTS,
    handlerRef: 'edge-fn:tokopedia-handler',
  })
  assert.equal(entry.execution, 'edge-function')
})

test('buildManifestEntry: external handler_ref → execution external', () => {
  const entry = buildManifestEntry(TOKOPEDIA_SPEC, {
    ...RENDER_OPTS,
    handlerRef: 'external:scrapy-cluster',
  })
  assert.equal(entry.execution, 'external')
})

test('buildManifestEntry: description_id includes step + param + output count', () => {
  const entry = buildManifestEntry(TOKOPEDIA_SPEC, RENDER_OPTS)
  assert.match(entry.description_id, /Skill Tokopedia Product Search/)
  assert.match(entry.description_id, /langkah/)
  assert.match(entry.description_id, /parameter/)
  assert.match(entry.description_id, /output/)
})

test('buildManifestEntry: description_en mirrors description_id structure', () => {
  const entry = buildManifestEntry(TOKOPEDIA_SPEC, RENDER_OPTS)
  assert.ok(entry.description_en)
  assert.match(entry.description_en!, /Tokopedia Product Search/)
  assert.match(entry.description_en!, /steps/)
  assert.match(entry.description_en!, /Autobrowse-graduated/)
})
