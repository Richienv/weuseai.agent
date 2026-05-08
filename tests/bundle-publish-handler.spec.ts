/**
 * Tests for bundle-publish-handler (Phase 2E-2 Day 1).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  bundlePublishHandler,
  type StorageUploader,
} from '../supabase/functions/_shared/bundle-publish-handler.ts'

// ─── helpers ──────────────────────────────────────────────────────────

const GZIP_MAGIC_BYTES = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0xfa, 0xfa, 0xfa, 0xfa])
const GZIP_MAGIC_BASE64 = btoa(
  String.fromCharCode(...GZIP_MAGIC_BYTES),
)

const recordingUploader = (): {
  uploader: StorageUploader
  log: Array<{ path: string; bytes: number; contentType: string }>
} => {
  const log: Array<{ path: string; bytes: number; contentType: string }> = []
  const uploader: StorageUploader = async ({ path, bytes, contentType }) => {
    log.push({ path, bytes: bytes.length, contentType })
    return { ok: true, size: bytes.length }
  }
  return { uploader, log }
}

const failingUploader: StorageUploader = async () => ({
  ok: false,
  error: 'simulated storage failure',
})

const baseInput = {
  agent_slug: 'doc-expert',
  version: '1.0.0',
  bundle_tar_base64: GZIP_MAGIC_BASE64,
}

// ─── happy path ────────────────────────────────────────────────────────

test('publish: valid input uploads to bundles/<slug>/<version>.tar.gz', async () => {
  const { uploader, log } = recordingUploader()
  const r = await bundlePublishHandler(baseInput, uploader)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.body.path, 'bundles/doc-expert/1.0.0.tar.gz')
    assert.equal(r.body.size_bytes, GZIP_MAGIC_BYTES.length)
  }
  assert.equal(log.length, 1)
  assert.equal(log[0].path, 'bundles/doc-expert/1.0.0.tar.gz')
  assert.equal(log[0].contentType, 'application/gzip')
})

// ─── input validation ─────────────────────────────────────────────────

test('publish: rejects unknown agent_slug', async () => {
  const { uploader } = recordingUploader()
  const r = await bundlePublishHandler(
    { ...baseInput, agent_slug: 'fictional-persona' },
    uploader,
  )
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 400)
    assert.equal(r.error, 'unknown_agent_slug')
  }
})

test('publish: every PERSONA_SLUG accepted', async () => {
  for (const slug of ['the-pro', 'doc-expert', 'video-producer', 'trade-pro']) {
    const { uploader } = recordingUploader()
    const r = await bundlePublishHandler({ ...baseInput, agent_slug: slug }, uploader)
    assert.equal(r.ok, true, `${slug} should be accepted`)
  }
})

test('publish: rejects non-semver version', async () => {
  const { uploader } = recordingUploader()
  for (const bad of ['1.0', '1.0.0-rc', 'latest', 'v1.0.0', '1.0.0.0']) {
    const r = await bundlePublishHandler({ ...baseInput, version: bad }, uploader)
    assert.equal(r.ok, false, `${bad} should fail`)
    if (!r.ok) assert.equal(r.error, 'invalid_version')
  }
})

test('publish: accepts standard semver', async () => {
  const { uploader } = recordingUploader()
  for (const v of ['1.0.0', '0.0.1', '99.99.99', '1.2.3']) {
    const r = await bundlePublishHandler({ ...baseInput, version: v }, uploader)
    assert.equal(r.ok, true, `${v} should pass`)
  }
})

test('publish: rejects missing bundle_tar_base64', async () => {
  const { uploader } = recordingUploader()
  const r = await bundlePublishHandler(
    // @ts-expect-error testing missing required field
    { ...baseInput, bundle_tar_base64: undefined },
    uploader,
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'missing_bundle_tar_base64')
})

test('publish: rejects malformed base64', async () => {
  const { uploader } = recordingUploader()
  const r = await bundlePublishHandler(
    { ...baseInput, bundle_tar_base64: 'NOT VALID BASE64 !!!@#$%' },
    uploader,
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'bundle_base64_decode_failed')
})

// ─── gzip magic byte validation ───────────────────────────────────────

test('publish: rejects bytes that lack gzip magic header', async () => {
  const { uploader } = recordingUploader()
  // Plain text, base64-encoded — valid base64 but not gzip
  const plainText = btoa('this is not gzip')
  const r = await bundlePublishHandler(
    { ...baseInput, bundle_tar_base64: plainText },
    uploader,
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'bundle_not_gzip')
})

test('publish: rejects very short payload (< 2 bytes, no room for magic)', async () => {
  const { uploader } = recordingUploader()
  const r = await bundlePublishHandler(
    { ...baseInput, bundle_tar_base64: btoa('a') },
    uploader,
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'bundle_not_gzip')
})

// ─── upload failure ───────────────────────────────────────────────────

test('publish: upload failure returns 500 with detail', async () => {
  const r = await bundlePublishHandler(baseInput, failingUploader)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 500)
    assert.equal(r.error, 'storage_upload_failed')
    assert.match(r.detail!, /simulated storage failure/)
  }
})
