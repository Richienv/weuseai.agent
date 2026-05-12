import { test } from 'node:test'
import assert from 'node:assert/strict'

import { graduate } from '../src/graduate/index.ts'
import { synthesize } from '../src/synthesize/index.ts'
import { tokopediaSearchSession } from './_helpers/fixtures.ts'

const SPEC = synthesize(
  [
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'a', productTitle: 'A', productPrice: 'X' }),
    tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'b', productTitle: 'B', productPrice: 'Y' }),
  ],
  { displayName: 'Tokopedia Product Search', triggerPhrases: ['cari produk'] },
)

test('graduate: emits target SKILL.md path under agent-packs/<bundle>/skills/<id>/', () => {
  const artifacts = graduate(SPEC, {
    targetBundleSlug: 'web-app-builder',
    enabledForTiers: ['pro', 'studio'],
    repoRoot: '/repo',
  })
  assert.equal(
    artifacts.skillMdPath,
    '/repo/agent-packs/web-app-builder/skills/tokopedia-product-search/SKILL.md',
  )
})

test('graduate: strips trailing slashes from repoRoot', () => {
  const artifacts = graduate(SPEC, {
    targetBundleSlug: 'web-app-builder',
    enabledForTiers: ['pro'],
    repoRoot: '/repo///',
  })
  assert.equal(artifacts.skillMdPath, '/repo/agent-packs/web-app-builder/skills/tokopedia-product-search/SKILL.md')
})

test('graduate: skillMdText starts with the skill heading', () => {
  const artifacts = graduate(SPEC, {
    targetBundleSlug: 'web-app-builder',
    enabledForTiers: ['pro', 'studio'],
    repoRoot: '/repo',
  })
  assert.match(artifacts.skillMdText, /^# tokopedia-product-search — Hermes skill/)
})

test('graduate: manifestSkillEntry has tier-correct enabled_for_tiers', () => {
  const artifacts = graduate(SPEC, {
    targetBundleSlug: 'web-app-builder',
    enabledForTiers: ['starter', 'pro', 'studio'],
    repoRoot: '/repo',
  })
  assert.deepEqual(artifacts.manifestSkillEntry.enabled_for_tiers, ['starter', 'pro', 'studio'])
})

test('graduate: empty templates list (Phase 4-1 v0)', () => {
  const artifacts = graduate(SPEC, {
    targetBundleSlug: 'web-app-builder',
    enabledForTiers: ['pro'],
    repoRoot: '/repo',
  })
  assert.deepEqual(artifacts.manifestTemplateEntries, [])
  assert.deepEqual(artifacts.manifestSkillEntry.templates_used, [])
})

test('graduate: custom handler_ref propagates through to manifest entry', () => {
  const artifacts = graduate(SPEC, {
    targetBundleSlug: 'web-app-builder',
    enabledForTiers: ['pro'],
    handlerRef: 'edge-fn:tokopedia-product-search-handler',
    repoRoot: '/repo',
  })
  assert.equal(artifacts.manifestSkillEntry.handler_ref, 'edge-fn:tokopedia-product-search-handler')
  assert.equal(artifacts.manifestSkillEntry.execution, 'edge-function')
})
