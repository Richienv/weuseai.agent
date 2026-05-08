#!/usr/bin/env tsx
/**
 * Build the bootstrap bundle (Phase 2E-2).
 *
 * Spec: docs/plans/2026-05-08-phase-2e-2-bundle-delivery-spec.md
 *
 * Creates `agent-packs/_bootstrap-bundle.tar.gz` containing only:
 *   - SOUL.md            (The Pro persona scaffold, ~3.5KB)
 *   - skills/extend-capabilities/SKILL.md  (self-extension, ~5.5KB)
 *   - manifest.json      (constructed inline; advertises extend-capabilities only)
 *
 * Total < 100KB. This is the SLA-floor bundle: customer can chat from
 * second 1 even if Storage is unreachable. Full per-agent bundles get
 * pulled by Hermes' bundle-pull script after boot.
 *
 * Drift test in tests/bootstrap-bundle.spec.ts asserts:
 *   - Output is a valid gzipped tar (gzip magic bytes)
 *   - Tar contains exactly the 3 expected entries
 *   - SOUL.md inside tar matches agent-packs/the-pro/SOUL.md byte-for-byte
 *   - SKILL.md inside tar matches agent-packs/_shared/skills/extend-capabilities/SKILL.md
 *   - Total size < 100KB
 *
 * Run from repo root:
 *   tsx scripts/build-bootstrap-bundle.ts
 */

import { execSync } from 'node:child_process'
import {
  mkdtempSync,
  copyFileSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  realpathSync,
  statSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')

const SRC_SOUL = resolve(REPO_ROOT, 'agent-packs/the-pro/SOUL.md')
const SRC_SKILL = resolve(REPO_ROOT, 'agent-packs/_shared/skills/extend-capabilities/SKILL.md')
const OUT = resolve(REPO_ROOT, 'agent-packs/_bootstrap-bundle.tar.gz')

const BOOTSTRAP_MANIFEST = {
  agent_slug: 'the-pro',  // bootstrap default; overridden by full bundle pull
  version: '1.0.0',
  description_id:
    'Bootstrap bundle — minimum guaranteed capability. Hermes loads this from inline tarball at provision; full per-agent bundle pulled from Storage at boot.',
  skills: [
    {
      id: 'extend-capabilities',
      description_id:
        'Generate skill atau template baru saat customer minta sesuatu yang belum ada di inventory. Pakai LLM customer (BYOK), simpan ke /var/lib/weuseai/customer-grown/.',
      execution: 'hermes-skill',
      handler_ref: 'hermes-skill:extend-capabilities',
      // Phase 2E-2 canonical: enabled_for_tiers (legacy `tier` deprecated).
      // SLA-floor skill is available to every paid tier — bootstrap is
      // the no-Storage fallback for all customers.
      enabled_for_tiers: ['starter', 'pro', 'studio'],
    },
  ],
  templates: [],
  self_extend: true,
  extension_dir: '/var/lib/weuseai/customer-grown/',
}

function build(): void {
  // Sanity: source files must exist
  for (const p of [SRC_SOUL, SRC_SKILL]) {
    try {
      statSync(p)
    } catch {
      console.error(`✗ Missing source file: ${p}`)
      process.exit(1)
    }
  }

  // Stage in a tmpdir so the tar entries don't include the absolute path
  const stage = mkdtempSync(join(tmpdir(), 'weuseai-bootstrap-'))
  try {
    mkdirSync(join(stage, 'skills/extend-capabilities'), { recursive: true })
    copyFileSync(SRC_SOUL, join(stage, 'SOUL.md'))
    copyFileSync(SRC_SKILL, join(stage, 'skills/extend-capabilities/SKILL.md'))
    writeFileSync(
      join(stage, 'manifest.json'),
      JSON.stringify(BOOTSTRAP_MANIFEST, null, 2) + '\n',
    )

    // tar.gz with relative paths; -C anchors to the staging dir.
    // --no-xattrs + --no-mac-metadata strip macOS resource forks (._*).
    // Determinism: avoid mtime / owner from filesystem, use 0.
    execSync(
      `tar --no-xattrs --no-mac-metadata --owner=0 --group=0 ` +
        `-czf "${OUT}" -C "${stage}" SOUL.md manifest.json skills`,
      { stdio: 'inherit' },
    )

    const size = statSync(OUT).size
    console.log(`✓ Bootstrap bundle built: ${OUT}`)
    console.log(`  size: ${size} bytes (${(size / 1024).toFixed(1)} KB)`)
    if (size > 100_000) {
      console.error(`✗ Size exceeds 100KB limit (${size} bytes). Aborting.`)
      process.exit(1)
    }
  } finally {
    try {
      rmSync(stage, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  }
}

// Detect "this script is the entrypoint" (vs imported by tests).
// Use realpathSync to dereference macOS /tmp → /private/tmp symlinks so
// the comparison works across platforms.
function isEntrypoint(): boolean {
  if (!process.argv[1]) return false
  try {
    const argvReal = realpathSync(process.argv[1])
    const metaReal = realpathSync(fileURLToPath(import.meta.url))
    return argvReal === metaReal
  } catch {
    return false
  }
}

if (isEntrypoint()) {
  build()
}

// Exports for tests
export { build, BOOTSTRAP_MANIFEST, OUT, SRC_SOUL, SRC_SKILL }
