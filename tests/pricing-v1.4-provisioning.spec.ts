/**
 * v1.4 provisioning: bare + solo tiers through the provisioning chain.
 *
 * Covers the three layers that had to learn the new canonical slugs:
 *   1. resolveTierToSpecClass — VPS spec/budget sizing (lossless collapse).
 *   2. buildSetupScript — bare = vanilla Hermes (empty slugs, neutral SOUL,
 *      no voice); solo = 3 personas, no voice.
 *   3. parseSpinUpRequest — /spin-up now accepts the canonical slugs that it
 *      previously rejected (the latent Phase-A gap).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildSetupScript } from '../services/provisioning/src/setup-script.ts'
import { resolveTierToSpecClass } from '../services/provisioning/src/customer-flow.ts'
import { parseSpinUpRequest } from '../services/provisioning/src/spin-up-helpers.ts'

const BASE = {
  customerId: 'cust-v14',
  telegramBotToken: '1:abc',
  telegramAllowedUserIds: '9',
  openRouterKey: 'sk-or-v1-x',
  bundleTarBase64: 'fake-bundle',
  fleetSshPubkey: 'ssh-ed25519 AAAA',
  hermesVersion: 'v0.13.0',
}

// ─── 1. spec-class resolver ──────────────────────────────────────────────

test('resolveTierToSpecClass: small tiers share the starter box', () => {
  for (const t of ['bare', 'solo', 'voice-starter', 'starter'] as const) {
    assert.equal(resolveTierToSpecClass(t), 'starter', t)
  }
})

test('resolveTierToSpecClass: done-for-you sizes as pro, library-full as studio', () => {
  assert.equal(resolveTierToSpecClass('done-for-you'), 'pro')
  assert.equal(resolveTierToSpecClass('pro'), 'pro')
  assert.equal(resolveTierToSpecClass('library-full'), 'studio')
  assert.equal(resolveTierToSpecClass('studio'), 'studio')
})

// ─── 2. setup-script bare/solo behaviour ─────────────────────────────────

test('bare = vanilla Hermes: empty agent slugs, no voice, neutral SOUL', () => {
  const s = buildSetupScript({ ...BASE, tier: 'bare', voiceSttKey: 'gsk_x' })
  // No persona skills installed — bundle-pull gets an empty list.
  assert.match(s, /WEUSEAI_AGENT_SLUGS=\n/, 'bare must emit an EMPTY WEUSEAI_AGENT_SLUGS')
  assert.doesNotMatch(s, /WEUSEAI_AGENT_SLUGS=the-pro/, 'bare must not install the-pro')
  // No voice config even with a key present (features.voice = false).
  assert.doesNotMatch(s, /^stt:$/m, 'bare must not write an stt block')
  assert.doesNotMatch(s, /GROQ_API_KEY=/, 'bare must not write an STT key')
  // Neutral vanilla SOUL, not a persona scaffold.
  assert.match(s, /asisten umum berbasis DeepSeek|versi dasar/, 'bare uses the neutral vanilla SOUL')
  // Model still pinned to DeepSeek (PR #223 guard intact).
  assert.match(s, /printf 'model:\\n {2}default: deepseek\/deepseek-v4-pro\\n'/, 'bare still pins DeepSeek')
  // Provision must still fully build.
  assert.match(s, /install\.sh/, 'Hermes install still runs')
})

test('solo = 3 personas, TEXT only (no voice)', () => {
  const s = buildSetupScript({
    ...BASE,
    tier: 'solo',
    agentSlug: 'the-pro',
    agentSlugs: ['the-pro', 'doc-expert', 'slide-master'],
    voiceSttKey: 'gsk_x',
  })
  assert.match(s, /WEUSEAI_AGENT_SLUGS=the-pro,doc-expert,slide-master/, 'solo installs its 3 personas')
  assert.doesNotMatch(s, /^stt:$/m, 'solo is TEXT only — no voice block')
  assert.doesNotMatch(s, /GROQ_API_KEY=/, 'solo writes no STT key')
})

test('voice-starter still gets voice (regression guard for the gate)', () => {
  const s = buildSetupScript({
    ...BASE,
    tier: 'voice-starter',
    agentSlug: 'the-pro',
    agentSlugs: ['the-pro', 'doc-expert', 'slide-master'],
    voiceSttKey: 'gsk_x',
  })
  assert.match(s, /^stt:$/m, 'voice-starter writes the stt block')
  assert.match(s, /GROQ_API_KEY=/, 'voice-starter writes the STT key')
})

// ─── 3. /spin-up accepts the canonical slugs ─────────────────────────────

test('parseSpinUpRequest accepts bare/solo + the existing canonical slugs', () => {
  for (const tier of ['bare', 'solo', 'voice-starter', 'library-full', 'done-for-you'] as const) {
    const r = parseSpinUpRequest({ customerId: 'c1', tier }, {})
    assert.equal(r.ok, true, `tier "${tier}" must be accepted by /spin-up`)
  }
})

test('parseSpinUpRequest still rejects enterprise + junk', () => {
  assert.equal(parseSpinUpRequest({ customerId: 'c1', tier: 'enterprise' }, {}).ok, false)
  assert.equal(parseSpinUpRequest({ customerId: 'c1', tier: 'nonsense' }, {}).ok, false)
})
