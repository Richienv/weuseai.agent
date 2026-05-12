/**
 * D1 lock (2026-05-12 multi-persona MVP) — setup-script.ts emits
 * WEUSEAI_AGENT_SLUGS=<csv> so bundle-pull-script can iterate the
 * customer's full tier-granted persona list at every Hermes boot.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildSetupScript } from '../services/provisioning/src/setup-script'

const baseParams = {
  customerId: 'cust-multi-persona',
  tier: 'pro' as const,
  telegramBotToken: '12345:abc',
  telegramAllowedUserIds: '987654',
  openRouterKey: 'sk-or-v1-test',
  bundleTarBase64: 'fake-bootstrap-bundle-b64',
}

test('script: writes WEUSEAI_AGENT_SLUGS=<csv> when agentSlugs is supplied', () => {
  const script = buildSetupScript({
    ...baseParams,
    agentSlug: 'the-pro',
    agentSlugs: ['the-pro', 'doc-expert', 'slide-master', 'deep-researcher'],
  })
  assert.match(script, /WEUSEAI_AGENT_SLUGS=the-pro,doc-expert,slide-master,deep-researcher/)
})

test('script: keeps WEUSEAI_AGENT_SLUG=<first> for back-compat with single-slug consumers', () => {
  const script = buildSetupScript({
    ...baseParams,
    agentSlug: 'the-pro',
    agentSlugs: ['the-pro', 'doc-expert'],
  })
  // The legacy single-slug env still gets emitted (matches agentSlug
  // arg, not the entire list).
  assert.match(script, /WEUSEAI_AGENT_SLUG=the-pro\b/)
})

test('script: emits WEUSEAI_TIER for tier-aware boot scripts', () => {
  const script = buildSetupScript({
    ...baseParams,
    agentSlug: 'the-pro',
    agentSlugs: ['the-pro', 'doc-expert'],
  })
  assert.match(script, /WEUSEAI_TIER=pro/)
})

test('script: falls back to [agentSlug] when agentSlugs missing (back-compat)', () => {
  const script = buildSetupScript({
    ...baseParams,
    agentSlug: 'the-pro',
    // agentSlugs intentionally omitted
  })
  assert.match(script, /WEUSEAI_AGENT_SLUGS=the-pro\b/)
})

test('script: falls back to "the-pro" when both agentSlug and agentSlugs missing', () => {
  const script = buildSetupScript({
    ...baseParams,
    // agentSlug + agentSlugs both omitted
  })
  assert.match(script, /WEUSEAI_AGENT_SLUGS=the-pro\b/)
  assert.match(script, /WEUSEAI_AGENT_SLUG=the-pro\b/)
})
