/**
 * Tests for manifest-validator.ts (Phase 2E-1.5).
 *
 * Coverage:
 *   - Schema-level validation (required fields, type checks, enum)
 *   - Cross-field invariants (known persona slug, templates_used FK,
 *     duplicate ids)
 *   - Drift checks: each pilot manifest passes validation
 *   - Drift check: agent-packs/_manifest.schema.json on disk has the same
 *     required fields the inlined MANIFEST_SCHEMA constant declares
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  KNOWN_PERSONA_SLUGS,
  MANIFEST_SCHEMA,
  resolveEnabledForTiers,
  tierToEnabledForTiers,
  validateManifest,
  type Manifest,
  type ManifestSkill,
} from '../supabase/functions/_shared/manifest-validator.ts'

// Suppress deprecation warnings during tests so output stays clean.
// We test the warning behavior explicitly elsewhere.
const origConsoleWarn = console.warn
const silenceConsoleWarn = () => {
  const captured: string[] = []
  console.warn = (...args: unknown[]) => {
    captured.push(args.map(String).join(' '))
  }
  return {
    captured,
    restore: () => {
      console.warn = origConsoleWarn
    },
  }
}

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(TEST_DIR, '..')

// ─── helpers ──────────────────────────────────────────────────────────

function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, rel), 'utf8'))
}

const VALID_BASE: Manifest = {
  agent_slug: 'doc-expert',
  version: '1.0.0',
  description_id: 'Bundle Doc Expert untuk testing.',
  skills: [
    {
      id: 'invoice-generator',
      description_id: 'Bikin invoice profesional dengan template tersedia.',
      templates_used: ['invoice-pro.html'],
      execution: 'edge-function',
      handler_ref: 'edge-fn:invoice-generator-handler',
      tier: 'starter',
    },
  ],
  templates: [
    {
      id: 'invoice-pro.html',
      kind: 'invoice',
      description_id: 'Invoice profesional dengan PPN, NPWP, dan footer brand.',
    },
  ],
  self_extend: true,
  extension_dir: '/var/lib/weuseai/customer-grown/',
}

// ─── happy path ────────────────────────────────────────────────────────

test('valid manifest with all required fields passes', () => {
  const r = validateManifest(VALID_BASE)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.manifest.agent_slug, 'doc-expert')
  }
})

test('manifest with $schema field stripped silently', () => {
  const r = validateManifest({ $schema: '../_manifest.schema.json', ...VALID_BASE })
  assert.equal(r.ok, true)
})

// ─── skill_kind discriminator (Phase 1 Week 2) ─────────────────────────

test('skill with skill_kind "playbook" validates', () => {
  const m: Manifest = {
    ...VALID_BASE,
    skills: [{ ...VALID_BASE.skills[0], skill_kind: 'playbook' }],
  }
  assert.equal(validateManifest(m).ok, true)
})

test('skill with an unknown skill_kind is rejected', () => {
  const m = {
    ...VALID_BASE,
    skills: [{ ...VALID_BASE.skills[0], skill_kind: 'bogus' }],
  }
  assert.equal(validateManifest(m).ok, false)
})

test('skill_kind is optional — absent still validates (legacy default)', () => {
  assert.equal(validateManifest(VALID_BASE).ok, true)
})

// ─── schema-level errors ───────────────────────────────────────────────

test('rejects missing agent_slug', () => {
  const { agent_slug: _ignored, ...bad } = VALID_BASE
  void _ignored
  const r = validateManifest(bad)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.errors.join(' '), /agent_slug/)
})

test('rejects bad version format (non-semver)', () => {
  const r = validateManifest({ ...VALID_BASE, version: '1.0' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.errors.join(' '), /version/)
})

test('rejects empty skills[]', () => {
  const r = validateManifest({ ...VALID_BASE, skills: [] })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.errors.join(' '), /minItems/)
})

test('rejects skill with bad id format (uppercase)', () => {
  const r = validateManifest({
    ...VALID_BASE,
    skills: [{ ...VALID_BASE.skills[0], id: 'InvoiceGenerator' }],
    templates: [{ id: 'x.html', kind: 'x', description_id: 'aaaaaaaaaa' }],
  })
  assert.equal(r.ok, false)
})

test('rejects malformed handler_ref', () => {
  const r = validateManifest({
    ...VALID_BASE,
    skills: [
      {
        ...VALID_BASE.skills[0],
        handler_ref: 'not-namespaced',
      },
    ],
    templates: [{ id: 'invoice-pro.html', kind: 'invoice', description_id: 'aaaaaaaaaa' }],
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.errors.join(' '), /handler_ref/)
})

test('rejects unknown execution type', () => {
  const r = validateManifest({
    ...VALID_BASE,
    skills: [{ ...VALID_BASE.skills[0], execution: 'magic' as never }],
  })
  assert.equal(r.ok, false)
})

test('rejects relative extension_dir', () => {
  const r = validateManifest({ ...VALID_BASE, extension_dir: 'relative/path/' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.errors.join(' '), /extension_dir/)
})

test('rejects bad tier', () => {
  const r = validateManifest({
    ...VALID_BASE,
    skills: [{ ...VALID_BASE.skills[0], tier: 'free' as never }],
  })
  assert.equal(r.ok, false)
})

// ─── cross-field invariants ────────────────────────────────────────────

test('rejects unknown agent_slug', () => {
  const r = validateManifest({ ...VALID_BASE, agent_slug: 'random-persona' })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.match(r.errors.join(' '), /not a known persona/)
  }
})

test('every PERSONA_SLUG is accepted', () => {
  for (const slug of KNOWN_PERSONA_SLUGS) {
    const r = validateManifest({ ...VALID_BASE, agent_slug: slug })
    assert.equal(r.ok, true, `${slug} should be a valid agent_slug`)
  }
})

test('rejects skill referencing template not in templates[]', () => {
  const r = validateManifest({
    ...VALID_BASE,
    skills: [{ ...VALID_BASE.skills[0], templates_used: ['nonexistent.html'] }],
  })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.match(r.errors.join(' '), /unknown template "nonexistent\.html"/)
  }
})

test('rejects duplicate skill ids', () => {
  const r = validateManifest({
    ...VALID_BASE,
    skills: [VALID_BASE.skills[0], VALID_BASE.skills[0]],
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.errors.join(' '), /duplicate id/)
})

test('rejects duplicate template ids', () => {
  const r = validateManifest({
    ...VALID_BASE,
    templates: [VALID_BASE.templates[0], VALID_BASE.templates[0]],
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.errors.join(' '), /duplicate id/)
})

// ─── pilot manifest drift checks ───────────────────────────────────────

test('drift: agent-packs/doc-expert/manifest.json passes validation', () => {
  const m = readJson('agent-packs/doc-expert/manifest.json')
  const r = validateManifest(m)
  if (!r.ok) {
    assert.fail(`doc-expert manifest invalid: ${r.errors.join('; ')}`)
  }
})

test('drift: agent-packs/the-pro/manifest.json passes validation', () => {
  const m = readJson('agent-packs/the-pro/manifest.json')
  const r = validateManifest(m)
  if (!r.ok) {
    assert.fail(`the-pro manifest invalid: ${r.errors.join('; ')}`)
  }
})

test('drift: agent-packs/video-producer/manifest.json passes validation', () => {
  const m = readJson('agent-packs/video-producer/manifest.json')
  const r = validateManifest(m)
  if (!r.ok) {
    assert.fail(`video-producer manifest invalid: ${r.errors.join('; ')}`)
  }
})

// ─── schema file drift ────────────────────────────────────────────────

test('drift: agent-packs/_manifest.schema.json required fields match MANIFEST_SCHEMA', () => {
  const onDisk = readJson('agent-packs/_manifest.schema.json') as { required: string[] }
  const inlined = MANIFEST_SCHEMA as { required: readonly string[] }
  assert.deepEqual(
    [...onDisk.required].sort(),
    [...inlined.required].sort(),
    'required fields drifted between agent-packs/_manifest.schema.json and MANIFEST_SCHEMA constant',
  )
})

// ─── enabled_for_tiers migration (Phase 2E-2) ──────────────────────────

test('tierToEnabledForTiers: starter → all 3', () => {
  assert.deepEqual(tierToEnabledForTiers('starter'), ['starter', 'pro', 'studio'])
})

test('tierToEnabledForTiers: pro → pro + studio', () => {
  assert.deepEqual(tierToEnabledForTiers('pro'), ['pro', 'studio'])
})

test('tierToEnabledForTiers: studio → studio only', () => {
  assert.deepEqual(tierToEnabledForTiers('studio'), ['studio'])
})

test('resolveEnabledForTiers: prefers enabled_for_tiers when both present', () => {
  const skill: ManifestSkill = {
    id: 'x',
    description_id: 'aaaaaaaaaa',
    execution: 'edge-function',
    handler_ref: 'edge-fn:x',
    tier: 'starter',
    enabled_for_tiers: ['pro', 'studio'],
  }
  assert.deepEqual(resolveEnabledForTiers(skill), ['pro', 'studio'])
})

test('resolveEnabledForTiers: falls back to legacy tier translation', () => {
  const skill: ManifestSkill = {
    id: 'x',
    description_id: 'aaaaaaaaaa',
    execution: 'edge-function',
    handler_ref: 'edge-fn:x',
    tier: 'pro',
  }
  assert.deepEqual(resolveEnabledForTiers(skill), ['pro', 'studio'])
})

test('resolveEnabledForTiers: returns null when neither present', () => {
  const skill: ManifestSkill = {
    id: 'x',
    description_id: 'aaaaaaaaaa',
    execution: 'edge-function',
    handler_ref: 'edge-fn:x',
  }
  assert.equal(resolveEnabledForTiers(skill), null)
})

test('validate: skill with enabled_for_tiers (canonical) passes without warning', () => {
  const sw = silenceConsoleWarn()
  const r = validateManifest({
    ...VALID_BASE,
    skills: [
      {
        ...VALID_BASE.skills[0],
        tier: undefined,
        enabled_for_tiers: ['starter', 'pro', 'studio'],
      },
    ],
  })
  sw.restore()
  assert.equal(r.ok, true)
  // No deprecation warnings for canonical-only manifests
  assert.equal(
    sw.captured.filter((s) => s.includes('DEPRECATED')).length,
    0,
  )
})

test('validate: legacy tier-only skill passes WITH deprecation warning', () => {
  const sw = silenceConsoleWarn()
  const r = validateManifest(VALID_BASE)  // VALID_BASE still uses legacy tier
  sw.restore()
  assert.equal(r.ok, true)
  // One deprecation warning per legacy skill
  assert.equal(
    sw.captured.filter((s) => s.includes('DEPRECATED')).length,
    1,
    `expected 1 DEPRECATED warning, got: ${JSON.stringify(sw.captured)}`,
  )
})

test('validate: both fields present → enabled_for_tiers wins, warning emitted for spurious tier', () => {
  const sw = silenceConsoleWarn()
  const r = validateManifest({
    ...VALID_BASE,
    skills: [
      {
        ...VALID_BASE.skills[0],
        tier: 'starter',
        enabled_for_tiers: ['pro', 'studio'],
      },
    ],
  })
  sw.restore()
  assert.equal(r.ok, true)
  assert.equal(
    sw.captured.filter((s) => s.includes('BOTH')).length,
    1,
  )
})

test('validate: skill with NEITHER tier nor enabled_for_tiers fails', () => {
  const sw = silenceConsoleWarn()
  const r = validateManifest({
    ...VALID_BASE,
    skills: [
      {
        ...VALID_BASE.skills[0],
        tier: undefined,
      },
    ],
  })
  sw.restore()
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.match(r.errors.join(' '), /must declare tier eligibility/)
  }
})

test('validate: enabled_for_tiers with invalid tier value rejected', () => {
  const r = validateManifest({
    ...VALID_BASE,
    skills: [
      {
        ...VALID_BASE.skills[0],
        tier: undefined,
        enabled_for_tiers: ['starter', 'free' as never],
      },
    ],
  })
  assert.equal(r.ok, false)
})

test('validate: enabled_for_tiers as empty array rejected (minItems 1)', () => {
  const r = validateManifest({
    ...VALID_BASE,
    skills: [
      {
        ...VALID_BASE.skills[0],
        tier: undefined,
        enabled_for_tiers: [],
      },
    ],
  })
  assert.equal(r.ok, false)
})

// ─── manifest references real handlers (sanity) ────────────────────────

test('every pilot manifest skill handler_ref points to a known edge function, hermes-skill, or external endpoint', () => {
  const knownEdgeFns = new Set([
    'invoice-generator-handler',
    'daily-briefing-handler',
    'tiktok-script-handler',
    'workflow-execute',
    'workflow-list',
    // Phase 4-2 (2026-05-10): HyperFrames render Edge Function.
    'hyperframes-render',
  ])
  // Persona v2 (2026-05-09): added the per-persona Hermes skills
  // shipped under each agent's skills/<id>/SKILL.md. Drift between
  // manifest declarations and on-disk SKILL.md files is caught by a
  // separate drift test.
  const knownHermesSkills = new Set([
    'extend-capabilities',
    // The Pro (playbook)
    'customer-reply',
    // Web Creator (v2)
    'landing-page-builder',
    'multi-page-site-builder',
    'blog-post-creator',
    'domain-advisory',
    // Doc Expert (v2)
    'academic-doc-builder',
    // Slide Master (v2)
    'narrative-arc-deck-builder',
    'template-deck-builder',
    'pitch-deck',
    // Trade Pro (v2)
    'market-briefing',
    'alert-watcher',
    'earnings-summarizer',
    'idr-bi-rate-watcher',
    // Trade Pro (v2.2 — playbook)
    'bitget-onboarding',
    // Project Conductor (v2 — REPLACE+RENAME from macro-strategist)
    'kanban-orchestrator',
    'task-decomposer',
    'multi-agent-router',
    'progress-monitor',
    // Business Director (v2.1 — Phase 5-2 dept packs replace department-task-spawner)
    'business-roadmap-tracker',
    'incorporation-advisor',
    'compliance-checker',
    'sales-dispatch',
    'marketing-dispatch',
    'engineering-dispatch',
    'legal-dispatch',
    'finance-dispatch',
    // Video Producer (v2 EXPAND — HyperFrames + sound + hashtag + caption)
    'hyperframes-storyboard',
    'sound-trend-tracker',
    'hashtag-research',
    'caption-optimizer',
    // Social Conductor (v2 EXPAND — Option B, no scraping)
    'voice-locker',
    'content-calendar-builder',
    'post-drafter',
    'engagement-log-tracker',
    'voice-consistency-checker',
    'campaign-planner',
    // Phase 4-3 seed skills (DRAFT) — single shared handler-ref;
    // Hermes routes by skill_id from the customer message.
    'autobrowse-replay',
  ])
  // External (third-party REST APIs called from Hermes on the VPS).
  const knownExternal = new Set([
    'vercel-deploy',
    'bitget-readonly',
  ])

  // Pilot manifests covered by the live-smoke test path. v2 added
  // web-master (Web Creator), slide-master, trade-pro, project-conductor
  // (renamed from macro-strategist).
  for (const slug of [
    'doc-expert',
    'the-pro',
    'video-producer',
    'web-app-builder',
    'slide-master',
    'trade-pro',
    'project-conductor',
    'business-agent',
    'social-conductor',
  ]) {
    const m = readJson(`agent-packs/${slug}/manifest.json`) as Manifest
    for (const skill of m.skills) {
      const colonIdx = skill.handler_ref.indexOf(':')
      const kind = skill.handler_ref.slice(0, colonIdx)
      const name = skill.handler_ref.slice(colonIdx + 1)
      if (kind === 'edge-fn') {
        assert.ok(
          knownEdgeFns.has(name),
          `${slug}/${skill.id}: handler_ref edge-fn:${name} not in known set`,
        )
      } else if (kind === 'hermes-skill') {
        assert.ok(
          knownHermesSkills.has(name),
          `${slug}/${skill.id}: handler_ref hermes-skill:${name} not in known set`,
        )
      } else if (kind === 'external') {
        assert.ok(
          knownExternal.has(name),
          `${slug}/${skill.id}: handler_ref external:${name} not in known set`,
        )
      }
    }
  }
})
