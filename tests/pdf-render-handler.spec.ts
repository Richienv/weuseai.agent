// Unit tests for the pure pdf-render-handler.
//
// Reference: supabase/functions/_shared/pdf-render-handler.ts
//
// Covers:
//  - Input validation (html missing, html too large, invalid format)
//  - Renderer error path (renderer returns ok:false)
//  - Renderer-returns-non-PDF path (no PDF magic bytes)
//  - Uploader throws path
//  - Happy path (bytes round-trip, signed URL returned, default storage path)

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pdfRenderHandler,
  type PdfRenderer,
  type PdfUploader,
} from '../supabase/functions/_shared/pdf-render-handler.ts'

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF

function makePdfBytes(extraSize = 100): Uint8Array {
  // Realistic-ish PDF stub: magic bytes + filler. Big enough to look
  // legitimate, small enough to test fast.
  const buf = new Uint8Array(4 + extraSize)
  buf.set(PDF_MAGIC, 0)
  for (let i = 4; i < buf.length; i++) buf[i] = 0x20 + (i % 64)
  return buf
}

const successRenderer: PdfRenderer = async () => ({
  ok: true,
  bytes: makePdfBytes(),
})

const failingRenderer: PdfRenderer = async () => ({
  ok: false,
  error: 'cloudflare_http_error',
  detail: 'HTTP 503: upstream busy',
})

const nonPdfRenderer: PdfRenderer = async () => ({
  ok: true,
  // Wrong magic bytes — looks like HTML
  bytes: new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e]),
})

const noopUploader: PdfUploader = async ({ path }) => ({
  signed_url: `https://storage.example.com/${path}?token=abc`,
  expires_at: '2026-06-08T00:00:00Z',
})

const throwingUploader: PdfUploader = async () => {
  throw new Error('storage backend offline')
}

// ─── happy path ─────────────────────────────────────────────────────────

describe('pdfRenderHandler — happy path', () => {
  test('returns ok=true with signed URL, path, byte count', async () => {
    const r = await pdfRenderHandler(
      { html: '<html>hi</html>' },
      successRenderer,
      noopUploader,
    )
    assert.equal(r.ok, true)
    assert.ok(r.ok === true)
    assert.match(r.body.signed_url, /^https:\/\//)
    assert.match(r.body.path, /^pdf-renders\/\d{8}\/[a-z0-9]+\.pdf$/)
    assert.equal(r.body.bytes, 104) // 4 magic + 100 filler
    assert.equal(r.body.expires_at, '2026-06-08T00:00:00Z')
  })

  test('honours caller-supplied storage_path', async () => {
    const r = await pdfRenderHandler(
      { html: '<html>x</html>', storage_path: 'custom/path/test.pdf' },
      successRenderer,
      noopUploader,
    )
    assert.ok(r.ok === true)
    assert.equal(r.body.path, 'custom/path/test.pdf')
  })

  test('passes format + margin through to the renderer', async () => {
    let captured: { format: string; margin: string } | null = null
    const recordingRenderer: PdfRenderer = async (_html, opts) => {
      captured = { format: opts.format, margin: opts.margin }
      return { ok: true, bytes: makePdfBytes() }
    }
    await pdfRenderHandler(
      { html: '<x/>', format: 'Letter', margin: '20mm' },
      recordingRenderer,
      noopUploader,
    )
    assert.deepEqual(captured, { format: 'Letter', margin: '20mm' })
  })

  test('default format is A4, default margin is 15mm', async () => {
    let captured: { format: string; margin: string } | null = null
    const recordingRenderer: PdfRenderer = async (_html, opts) => {
      captured = { format: opts.format, margin: opts.margin }
      return { ok: true, bytes: makePdfBytes() }
    }
    await pdfRenderHandler({ html: '<x/>' }, recordingRenderer, noopUploader)
    assert.deepEqual(captured, { format: 'A4', margin: '15mm' })
  })
})

// ─── input validation ───────────────────────────────────────────────────

describe('pdfRenderHandler — input validation', () => {
  test('rejects missing html field', async () => {
    const r = await pdfRenderHandler(
      // @ts-expect-error intentional: testing runtime guard
      {},
      successRenderer,
      noopUploader,
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.equal(r.status, 400)
    assert.equal(r.error, 'invalid_html')
  })

  test('rejects empty html', async () => {
    const r = await pdfRenderHandler(
      { html: '' },
      successRenderer,
      noopUploader,
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.equal(r.error, 'invalid_html')
  })

  test('rejects html >5MB', async () => {
    const huge = 'a'.repeat(5_000_001)
    const r = await pdfRenderHandler(
      { html: huge },
      successRenderer,
      noopUploader,
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.equal(r.status, 413)
    assert.equal(r.error, 'html_too_large')
  })

  test('rejects unknown format', async () => {
    const r = await pdfRenderHandler(
      // @ts-expect-error intentional: testing runtime guard
      { html: '<x/>', format: 'A3' },
      successRenderer,
      noopUploader,
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.equal(r.error, 'invalid_format')
  })
})

// ─── error paths ────────────────────────────────────────────────────────

describe('pdfRenderHandler — error paths', () => {
  test('propagates renderer failure as ok=false, error=render_failed', async () => {
    const r = await pdfRenderHandler(
      { html: '<x/>' },
      failingRenderer,
      noopUploader,
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.equal(r.status, 502)
    assert.equal(r.error, 'render_failed')
    assert.match(r.detail!, /HTTP 503/)
  })

  test('rejects renderer that returns non-PDF bytes (no magic bytes)', async () => {
    const r = await pdfRenderHandler(
      { html: '<x/>' },
      nonPdfRenderer,
      noopUploader,
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.equal(r.error, 'render_returned_non_pdf')
  })

  test('catches uploader exceptions as ok=false, error=storage_upload_failed', async () => {
    const r = await pdfRenderHandler(
      { html: '<x/>' },
      successRenderer,
      throwingUploader,
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.equal(r.status, 500)
    assert.equal(r.error, 'storage_upload_failed')
    assert.match(r.detail!, /storage backend offline/)
  })
})
