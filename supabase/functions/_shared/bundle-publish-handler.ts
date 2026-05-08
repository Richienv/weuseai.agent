// bundle-publish handler (Phase 2E-2).
//
// Spec: docs/plans/2026-05-08-phase-2e-2-bundle-delivery-spec.md
//
// Admin-only endpoint: uploads a per-agent bundle tarball to Supabase
// Storage at `bundles/<agent_slug>/<version>.tar.gz`. Called from:
//   1. customer-flow.ts at customer registration (uploads the bundle for
//      the customer's chosen persona)
//   2. CI/CD when shipping new bundle versions
//
// Auth: service-role JWT (caller is server-to-server). The handler does
// NOT recompute auth — that's the entrypoint's job. Handler trusts that
// it was invoked through a service-role-validated path.

import {
  KNOWN_PERSONA_SLUGS,
} from './manifest-validator.ts'

// ─── input + output ────────────────────────────────────────────────────

export type BundlePublishInput = {
  agent_slug: string
  version: string
  bundle_tar_base64: string
}

export type BundlePublishOk = {
  ok: true
  status: 200
  body: {
    path: string
    size_bytes: number
  }
}

export type BundlePublishErr = {
  ok: false
  status: 400 | 500
  error: string
  detail?: string
}

export type BundlePublishResult = BundlePublishOk | BundlePublishErr

// ─── injected dependency: storage uploader ─────────────────────────────

export type StorageUploader = (params: {
  path: string
  bytes: Uint8Array
  contentType: string
}) => Promise<{ ok: true; size: number } | { ok: false; error: string }>

// ─── validators ─────────────────────────────────────────────────────────

const SEMVER_RE = /^\d+\.\d+\.\d+$/
const MAX_BUNDLE_BYTES = 50 * 1024 * 1024  // 50MB hard ceiling — pilot bundles are <5MB

function isKnownPersona(slug: string): boolean {
  return (KNOWN_PERSONA_SLUGS as readonly string[]).includes(slug)
}

// ─── handler ────────────────────────────────────────────────────────────

export async function bundlePublishHandler(
  input: BundlePublishInput,
  uploader: StorageUploader,
): Promise<BundlePublishResult> {
  if (!input.agent_slug || typeof input.agent_slug !== 'string') {
    return { ok: false, status: 400, error: 'invalid_agent_slug' }
  }
  if (!isKnownPersona(input.agent_slug)) {
    return {
      ok: false,
      status: 400,
      error: 'unknown_agent_slug',
      detail: `must be one of ${KNOWN_PERSONA_SLUGS.join(', ')}`,
    }
  }
  if (!input.version || typeof input.version !== 'string') {
    return { ok: false, status: 400, error: 'invalid_version' }
  }
  if (!SEMVER_RE.test(input.version)) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_version',
      detail: 'must match semver (e.g. 1.0.0)',
    }
  }
  if (!input.bundle_tar_base64 || typeof input.bundle_tar_base64 !== 'string') {
    return { ok: false, status: 400, error: 'missing_bundle_tar_base64' }
  }

  // Decode base64 → bytes. Cap at MAX_BUNDLE_BYTES to avoid runaway
  // payloads. Decoded length ≈ base64.length × 3/4.
  let bytes: Uint8Array
  try {
    const binary = atob(input.bundle_tar_base64)
    if (binary.length > MAX_BUNDLE_BYTES) {
      return {
        ok: false,
        status: 400,
        error: 'bundle_too_large',
        detail: `${binary.length} bytes > limit ${MAX_BUNDLE_BYTES}`,
      }
    }
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
  } catch (e) {
    return {
      ok: false,
      status: 400,
      error: 'bundle_base64_decode_failed',
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  // Smoke check: tar.gz starts with gzip magic bytes (0x1F 0x8B). Catches
  // base64 of non-gzipped bytes early — clearer error than waiting for
  // Hermes to fail to extract.
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    return {
      ok: false,
      status: 400,
      error: 'bundle_not_gzip',
      detail: 'expected gzip magic bytes 0x1F 0x8B at offset 0',
    }
  }

  const path = `bundles/${input.agent_slug}/${input.version}.tar.gz`
  const result = await uploader({
    path,
    bytes,
    contentType: 'application/gzip',
  })

  if (!result.ok) {
    return {
      ok: false,
      status: 500,
      error: 'storage_upload_failed',
      detail: result.error,
    }
  }

  return {
    ok: true,
    status: 200,
    body: { path, size_bytes: result.size },
  }
}
