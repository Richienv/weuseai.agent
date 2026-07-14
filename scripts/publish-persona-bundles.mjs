#!/usr/bin/env node
/**
 * Publish per-persona bundles to Supabase Storage.
 *
 * Spec context: docs/plans/2026-05-08-phase-2e-2-bundle-delivery-spec.md
 * Audit:        docs/audits/2026-05-16-persona-system-audit.md §3 (Fix B)
 *
 * THE GAP THIS CLOSES
 * -------------------
 * `bundle-publish-handler.ts` exists but has ZERO callers — no CI step,
 * no script, no provisioning step ever uploaded the per-persona bundles.
 * So `bundle-fetch` 404s on every non-bootstrap slug and Hermes' bundle
 * pull degrades to the inline bootstrap (The Pro only). This script wires
 * the missing publish path: it builds all 10 tier personas from
 * `agent-packs/<slug>/` and uploads each to Storage at
 * `bundles/<slug>/<version>.tar.gz` via the `bundle-publish` Edge
 * Function — the exact path `bundle-fetch` signs and `bundle-pull-script`
 * extracts.
 *
 * WHAT GETS PUBLISHED
 * -------------------
 * Driven by `supabase/functions/_shared/tier-personas.ts` — the union of
 * every tier list (== Studio == all 10). Never hand-maintained, so it
 * cannot drift from the canonical persona library.
 *
 * Each bundle tarball mirrors the bootstrap layout (relative paths, tar
 * root == pack root): SOUL.md, SKILL.md, manifest.json, skills/, and
 * templates/ when present. `version` is read from each pack's own
 * manifest.json (the-pro 1.0.0 … business-agent 3.0.0).
 *
 * IDEMPOTENCY
 * -----------
 * Tarballs are built deterministically (mtime/owner zeroed — same input
 * bytes every run). Before uploading, the script downloads the object
 * already at `bundles/<slug>/<version>.tar.gz` (service-role Storage
 * REST) and compares its SHA-256 against the freshly-built tar. Identical
 * → SKIP. Different or missing → PUBLISH. So re-running after a no-op
 * change uploads nothing; the underlying Edge Function also `upsert`s, so
 * a forced re-publish is safe too.
 *
 * ENV (never hardcode — read from process.env)
 * --------------------------------------------
 *   SUPABASE_URL               https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service-role key (server-to-server)
 *
 * USAGE
 * -----
 *   npm run publish:bundles              # build + publish changed bundles
 *   npm run publish:bundles -- --dry-run # build + hash-compare, no upload
 *
 * Operator runs this once per deploy, AFTER `agent-packs/` changes land
 * and AFTER the `bundle-publish` Edge Function is deployed. It is NOT
 * wired into CI automatically — there is no Supabase deploy workflow in
 * .github/workflows/ today, and publishing needs the service-role secret.
 * See the README block at the bottom of package.json's script comment.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import {
  mkdtempSync,
  cpSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const PACKS_DIR = resolve(REPO_ROOT, 'agent-packs')
const STORAGE_BUCKET = 'workflow-templates' // bundles live alongside template fixtures
const MAX_BUNDLE_BYTES = 50 * 1024 * 1024 // mirrors bundle-publish-handler ceiling

const DRY_RUN = process.argv.includes('--dry-run')

// ─── canonical persona list (driven by tier-personas.ts) ──────────────
//
// We parse tier-personas.ts rather than importing it: it is a Deno/Edge
// module (`.ts` import specifiers, no build step) so a plain `import`
// from Node would need a loader. A regex over the TIER_PERSONAS literal
// is robust for this flat string-array shape and keeps the script
// dependency-free. The union of all tier lists == the full library.

function readCanonicalSlugs() {
  const src = readFileSync(
    resolve(REPO_ROOT, 'supabase/functions/_shared/tier-personas.ts'),
    'utf8',
  )
  const block = src.match(/TIER_PERSONAS[^=]*=\s*{([\s\S]*?)\n}/)
  if (!block) {
    throw new Error('could not locate TIER_PERSONAS literal in tier-personas.ts')
  }
  const slugs = new Set()
  for (const m of block[1].matchAll(/'([a-z0-9-]+)'/g)) {
    slugs.add(m[1])
  }
  if (slugs.size === 0) {
    throw new Error('parsed zero slugs from TIER_PERSONAS — aborting')
  }
  return [...slugs]
}

// ─── deterministic per-persona tar build ──────────────────────────────
//
// Builds a hash-stable tar.gz so the idempotency probe can SKIP an
// unchanged bundle. Three sources of nondeterminism are pinned:
//   - tar entry owner/group  → --owner=0 --group=0
//   - tar entry mtime        → every staged file's mtime is normalised
//                              to a fixed epoch before tarring (bsdtar
//                              has no --mtime; GNU/bsd both honour the
//                              filesystem mtime, so we set it ourselves)
//   - gzip header timestamp  → Node's zlib.gzipSync writes no mtime/OS
//                              byte, unlike `tar -z` / `gzip` default.
// tar entry order is pinned by passing a sorted entry list. The recipe
// (`tar -cf` + zlib gzip) is portable across macOS bsdtar and GNU tar.

const FIXED_MTIME = new Date('2020-01-01T00:00:00Z')

/** Recursively normalise mtime/atime of every file + dir under root. */
function normaliseMtimes(root) {
  for (const name of readdirSync(root)) {
    const p = join(root, name)
    const st = statSync(p)
    if (st.isDirectory()) normaliseMtimes(p)
    utimesSync(p, FIXED_MTIME, FIXED_MTIME)
  }
  utimesSync(root, FIXED_MTIME, FIXED_MTIME)
}

function buildBundleTar(slug) {
  const packDir = join(PACKS_DIR, slug)
  const manifestPath = join(packDir, 'manifest.json')
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (e) {
    throw new Error(`${slug}: cannot read manifest.json — ${e.message}`)
  }
  const version = manifest.version
  if (!/^\d+\.\d+\.\d+$/.test(String(version ?? ''))) {
    throw new Error(`${slug}: manifest.version "${version}" is not semver`)
  }
  if (manifest.agent_slug !== slug) {
    throw new Error(
      `${slug}: manifest.agent_slug "${manifest.agent_slug}" != folder slug`,
    )
  }

  const stage = mkdtempSync(join(tmpdir(), `weuseai-bundle-${slug}-`))
  const packStage = join(stage, 'pack')
  const outTar = join(stage, `${slug}-${version}.tar`)
  try {
    // Copy the whole pack, excluding macOS resource-fork files (._*).
    cpSync(packDir, packStage, {
      recursive: true,
      filter: (src) => !/(^|\/)\._/.test(src) && !src.endsWith('/.DS_Store'),
    })
    const entries = readdirSync(packStage)
    if (!entries.includes('manifest.json')) {
      throw new Error(`${slug}: staged pack missing manifest.json`)
    }
    // Pin every staged entry's mtime so the tar bytes are reproducible.
    normaliseMtimes(packStage)

    // Uncompressed tar with relative paths anchored at the pack root
    // (-C). bundle-pull-script extracts into <slug>/<version>/ and
    // expects SOUL.md / SKILL.md / manifest.json / skills/ at that root.
    execFileSync(
      'tar',
      [
        '--no-xattrs',
        '--no-mac-metadata',
        '--owner=0',
        '--group=0',
        '-cf',
        outTar,
        '-C',
        packStage,
        ...entries.sort(), // sorted → deterministic entry order
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    )
    // gzip via Node zlib: no embedded mtime/OS byte → deterministic,
    // unlike `tar -z` or the `gzip` CLI default.
    const bytes = gzipSync(readFileSync(outTar), { level: 9 })
    if (bytes.length > MAX_BUNDLE_BYTES) {
      throw new Error(
        `${slug}: bundle ${bytes.length} bytes exceeds ${MAX_BUNDLE_BYTES} ceiling`,
      )
    }
    if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
      throw new Error(`${slug}: built tar is not gzip (bad magic bytes)`)
    }
    return { version, bytes }
  } finally {
    try {
      rmSync(stage, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
}

// ─── Storage idempotency probe ────────────────────────────────────────
//
// Download the object currently at bundles/<slug>/<version>.tar.gz via
// the Storage REST API (service-role auth) and SHA-256 it. Returns the
// hash, or null when the object does not exist (→ first publish).

async function fetchPublishedHash(supabaseUrl, serviceKey, objectPath) {
  const url = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${objectPath}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
  })
  if (res.status === 404 || res.status === 400) return null
  if (!res.ok) {
    throw new Error(
      `storage probe ${objectPath} failed: HTTP ${res.status} ${await res.text()}`,
    )
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return sha256(buf)
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

// ─── publish one bundle via the bundle-publish Edge Function ──────────

async function publishBundle(supabaseUrl, serviceKey, slug, version, bytes) {
  const res = await fetch(`${supabaseUrl}/functions/v1/bundle-publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_slug: slug,
      version,
      bundle_tar_base64: bytes.toString('base64'),
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`bundle-publish ${slug}@${version} → HTTP ${res.status}: ${text}`)
  }
  return text
}

// ─── main ──────────────────────────────────────────────────────────────

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!DRY_RUN && (!supabaseUrl || !serviceKey)) {
    console.error(
      '✗ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n' +
        '  Run with --dry-run to build + hash-compare without env / upload.',
    )
    process.exit(1)
  }

  const slugs = readCanonicalSlugs()
  console.log(
    `${DRY_RUN ? '[dry-run] ' : ''}Publishing ${slugs.length} persona bundles ` +
      `(driven by tier-personas.ts)\n`,
  )

  let published = 0
  let skipped = 0
  let failed = 0

  for (const slug of slugs) {
    try {
      const { version, bytes } = buildBundleTar(slug)
      const localHash = sha256(bytes)
      const objectPath = `bundles/${slug}/${version}.tar.gz`
      const sizeKb = (bytes.length / 1024).toFixed(1)

      if (DRY_RUN) {
        console.log(
          `  • ${slug}@${version}  built ${sizeKb} KB  sha256=${localHash.slice(0, 12)}…`,
        )
        skipped++
        continue
      }

      const remoteHash = await fetchPublishedHash(supabaseUrl, serviceKey, objectPath)
      if (remoteHash === localHash) {
        console.log(`  = ${slug}@${version}  unchanged — skip (${sizeKb} KB)`)
        skipped++
        continue
      }

      await publishBundle(supabaseUrl, serviceKey, slug, version, bytes)
      console.log(
        `  ✓ ${slug}@${version}  published → ${objectPath} (${sizeKb} KB` +
          `${remoteHash ? ', updated' : ', new'})`,
      )
      published++
    } catch (e) {
      console.error(`  ✗ ${slug}: ${e instanceof Error ? e.message : String(e)}`)
      failed++
    }
  }

  console.log(
    `\n${DRY_RUN ? '[dry-run] ' : ''}done — ` +
      `${published} published, ${skipped} ${DRY_RUN ? 'built' : 'unchanged'}, ` +
      `${failed} failed`,
  )
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(`✗ fatal: ${e instanceof Error ? e.stack : String(e)}`)
  process.exit(1)
})
