/**
 * Tests for bootstrap bundle build script (Phase 2E-2 Day 2).
 *
 * Drift checks the SLA-floor bundle:
 *   1. Output is valid gzipped tar (gzip magic bytes 0x1F 0x8B)
 *   2. Tar entries are EXACTLY [SOUL.md, manifest.json, skills/extend-capabilities/SKILL.md]
 *      (plus the parent directory entries — order-tolerant)
 *   3. SOUL.md inside tar matches agent-packs/the-pro/SOUL.md byte-for-byte
 *   4. SKILL.md inside tar matches agent-packs/_shared/skills/extend-capabilities/SKILL.md byte-for-byte
 *   5. Total size < 100KB (sanity bound)
 *   6. The bundled manifest.json validates against MANIFEST_SCHEMA
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { readFileSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { build, OUT, SRC_SOUL, SRC_SKILL } from '../scripts/build-bootstrap-bundle.ts'
import { validateManifest } from '../supabase/functions/_shared/manifest-validator.ts'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(TEST_DIR, '..')

// Pre-flight: build the bundle if it doesn't exist (so tests are
// idempotent on a fresh clone).
function ensureBuilt(): void {
  if (!existsSync(OUT)) {
    build()
  }
}

// ─── existence + format ────────────────────────────────────────────────

test('bootstrap: output file exists at agent-packs/_bootstrap-bundle.tar.gz', () => {
  ensureBuilt()
  assert.ok(existsSync(OUT))
})

test('bootstrap: starts with gzip magic bytes 0x1F 0x8B', () => {
  ensureBuilt()
  const bytes = readFileSync(OUT)
  assert.equal(bytes[0], 0x1f)
  assert.equal(bytes[1], 0x8b)
})

test('bootstrap: total size < 100KB sanity bound', () => {
  ensureBuilt()
  const size = statSync(OUT).size
  assert.ok(size < 100_000, `bootstrap exceeds 100KB (${size} bytes)`)
})

// ─── tar contents ──────────────────────────────────────────────────────

function listTarEntries(): string[] {
  return execSync(`tar -tzf "${OUT}"`, { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((s) => s.length > 0 && !s.endsWith('/'))  // skip parent-dir entries
}

test('bootstrap: contains exactly 3 file entries (SOUL, manifest, SKILL)', () => {
  ensureBuilt()
  const entries = listTarEntries().sort()
  assert.deepEqual(entries, [
    'SOUL.md',
    'manifest.json',
    'skills/extend-capabilities/SKILL.md',
  ])
})

// ─── byte-for-byte drift checks ────────────────────────────────────────

function readTarEntry(path: string): string {
  // tar -xOf extracts to stdout; tsx's execSync handles binary fine via utf8
  return execSync(`tar -xzOf "${OUT}" "${path}"`, { encoding: 'utf8' })
}

test('bootstrap: SOUL.md matches agent-packs/the-pro/SOUL.md byte-for-byte', () => {
  ensureBuilt()
  const inTar = readTarEntry('SOUL.md')
  const onDisk = readFileSync(SRC_SOUL, 'utf8')
  assert.equal(
    inTar,
    onDisk,
    'bootstrap SOUL.md drifted from agent-packs/the-pro/SOUL.md',
  )
})

test('bootstrap: SKILL.md matches agent-packs/_shared/.../extend-capabilities byte-for-byte', () => {
  ensureBuilt()
  const inTar = readTarEntry('skills/extend-capabilities/SKILL.md')
  const onDisk = readFileSync(SRC_SKILL, 'utf8')
  assert.equal(
    inTar,
    onDisk,
    'bootstrap extend-capabilities SKILL.md drifted from agent-packs/_shared/...',
  )
})

// ─── bundled manifest validates ────────────────────────────────────────

test('bootstrap: bundled manifest.json validates against MANIFEST_SCHEMA', () => {
  ensureBuilt()
  const manifestText = readTarEntry('manifest.json')
  const manifest = JSON.parse(manifestText)
  const result = validateManifest(manifest)
  if (!result.ok) {
    assert.fail(`bootstrap manifest.json invalid: ${result.errors.join('; ')}`)
  }
})

test('bootstrap: bundled manifest declares self_extend=true + extension_dir', () => {
  ensureBuilt()
  const manifest = JSON.parse(readTarEntry('manifest.json'))
  assert.equal(manifest.self_extend, true)
  assert.equal(manifest.extension_dir, '/var/lib/weuseai/customer-grown/')
})

test('bootstrap: bundled manifest skills[] = [extend-capabilities] only (SLA floor)', () => {
  ensureBuilt()
  const manifest = JSON.parse(readTarEntry('manifest.json'))
  assert.equal(manifest.skills.length, 1)
  assert.equal(manifest.skills[0].id, 'extend-capabilities')
  assert.equal(manifest.skills[0].handler_ref, 'hermes-skill:extend-capabilities')
})
