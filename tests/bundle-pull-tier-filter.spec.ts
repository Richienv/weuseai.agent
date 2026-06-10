/**
 * Bundle-pull tier filter — canonical v1.4 slug resolution (P0 fix
 * 2026-06-10) + custom-persona pull block.
 *
 * BUG this pins: setup-script emits WEUSEAI_TIER=<real slug>, which since
 * v1.4 (#226) can be canonical (done-for-you / library-full / solo /
 * voice-starter / bare). The pull script's python filter ranked only the
 * legacy spec-class slugs, so a canonical-tier VPS SKIPPED every skill at
 * install — persona shells with zero skills. The filter now resolves
 * canonical → spec-class, mirroring resolveTierToSpecClass().
 *
 * This test EXECUTES the embedded python block (extracted from the
 * generated script) against a fixture manifest for every slug, so the
 * filter's actual runtime behavior is what's asserted — not a substring.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildBundlePullScript } from '../services/provisioning/src/bundle-pull-script.ts'
import { resolveTierToSpecClass } from '../services/provisioning/src/customer-flow.ts'

const SCRIPT = buildBundlePullScript({ customerId: 'cid-test' })

/** Extract the python program between the PYEOF heredoc markers. */
function extractPython(): string {
  const m = SCRIPT.match(/<<'PYEOF'[^\n]*\n([\s\S]*?)\nPYEOF/)
  assert.ok(m, 'python block not found in generated script')
  return m![1]
}

const FIXTURE_MANIFEST = {
  agent_slug: 'the-pro',
  version: '1.0.0',
  description_id: 'fixture untuk tier filter test',
  self_extend: false,
  extension_dir: '/var/lib/weuseai/ext',
  skills: [
    { id: 'all-tiers', description_id: 'tersedia semua tier', execution: 'hermes-skill', handler_ref: 'hermes-skill:all-tiers', enabled_for_tiers: ['starter', 'pro', 'studio'] },
    { id: 'pro-up', description_id: 'pro dan studio saja', execution: 'hermes-skill', handler_ref: 'hermes-skill:pro-up', enabled_for_tiers: ['pro', 'studio'] },
    { id: 'studio-only', description_id: 'khusus studio', execution: 'hermes-skill', handler_ref: 'hermes-skill:studio-only', enabled_for_tiers: ['studio'] },
  ],
  templates: [],
}

function runFilter(tier: string): Map<string, 'INSTALL' | 'SKIP'> {
  const dir = mkdtempSync(join(tmpdir(), 'weuseai-filter-'))
  try {
    const manifestPath = join(dir, 'manifest.json')
    writeFileSync(manifestPath, JSON.stringify(FIXTURE_MANIFEST))
    const py = extractPython()
    const out = execFileSync('python3', ['-c', py, manifestPath, tier], { encoding: 'utf8' })
    const decisions = new Map<string, 'INSTALL' | 'SKIP'>()
    for (const line of out.trim().split('\n')) {
      const [action, id] = line.split('\t')
      decisions.set(id, action as 'INSTALL' | 'SKIP')
    }
    return decisions
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Expected behavior per slug, derived from the SAME source the provisioner
// uses (resolveTierToSpecClass) — true drift pin, not duplicated literals.
const CANONICAL = ['bare', 'solo', 'voice-starter', 'done-for-you', 'library-full'] as const
const LEGACY = ['starter', 'pro', 'studio'] as const

for (const slug of [...CANONICAL, ...LEGACY]) {
  test(`tier filter: "${slug}" behaves as its spec-class (${resolveTierToSpecClass(slug)})`, () => {
    const decisions = runFilter(slug)
    const specClass = resolveTierToSpecClass(slug)
    const expect = {
      starter: { 'all-tiers': 'INSTALL', 'pro-up': 'SKIP', 'studio-only': 'SKIP' },
      pro: { 'all-tiers': 'INSTALL', 'pro-up': 'INSTALL', 'studio-only': 'SKIP' },
      studio: { 'all-tiers': 'INSTALL', 'pro-up': 'INSTALL', 'studio-only': 'INSTALL' },
    }[specClass]
    assert.deepEqual(Object.fromEntries(decisions), expect)
  })
}

test('REGRESSION: done-for-you must NOT skip every skill (the #226 P0)', () => {
  const decisions = runFilter('done-for-you')
  assert.equal(decisions.get('all-tiers'), 'INSTALL')
  assert.equal(decisions.get('pro-up'), 'INSTALL')
})

test('unknown tier degrades to most-restrictive behavior, not a crash', () => {
  const decisions = runFilter('mystery-tier')
  // rank 0 → efl = all tiers ≥ 0 — translation only applies to legacy
  // `tier` fields; explicit enabled_for_tiers without the slug → SKIP all.
  assert.equal(decisions.get('studio-only'), 'SKIP')
})

// ─── custom-persona pull block ────────────────────────────────────────

test('script contains the custom-persona pull (slug custom-<cid>, silent-skip on 403/404)', () => {
  assert.match(SCRIPT, /pull_custom_persona\(\)/)
  assert.match(SCRIPT, /custom-\$CID/)
  assert.match(SCRIPT, /403\|404\|400/)
  // It runs AFTER the tier-slug loop.
  const loopIdx = SCRIPT.indexOf('Main loop')
  const callIdx = SCRIPT.lastIndexOf('pull_custom_persona')
  assert.ok(callIdx > loopIdx, 'custom pull must run after the main loop')
})

test('generated script stays bash-clean (bash -n)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weuseai-bash-'))
  try {
    const file = join(dir, 'pull.sh')
    writeFileSync(file, SCRIPT)
    execFileSync('bash', ['-n', file])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
