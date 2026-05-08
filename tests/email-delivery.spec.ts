// Unit tests for email-delivery.ts (Phase 2E-3 Resend integration).
//
// Reference: supabase/functions/_shared/email-delivery.ts
//
// Covers:
//  - Input validation (to, subject, text)
//  - Stub mode when RESEND_API_KEY missing → ok:true, stub:true
//  - Real send path: correct request body shape, attachment encoding,
//    response parsing, error handling
//  - Bahasa email body generator: voice rules (no exclamation, no banned
//    words, "kamu" form, calm-premium register)

import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  sendEmail,
  setEmailEnvOverride,
  buildInvoiceEmailBody,
} from '../supabase/functions/_shared/email-delivery.ts'

// ─── stub mode ──────────────────────────────────────────────────────────

describe('sendEmail — stub mode (RESEND_API_KEY missing)', () => {
  beforeEach(() => setEmailEnvOverride({}))
  afterEach(() => setEmailEnvOverride(null))

  test('returns ok:true with stub:true when key missing', async () => {
    const r = await sendEmail({
      to: 'customer@example.com',
      subject: 'Test',
      text: 'Body',
    })
    assert.equal(r.ok, true)
    assert.ok(r.ok === true)
    assert.equal((r as { stub?: boolean }).stub, true)
  })

  test('does NOT call any network in stub mode', async () => {
    // Wedge: stub the global fetch to ensure we don't reach network.
    const originalFetch = globalThis.fetch
    let fetchCalled = false
    globalThis.fetch = async () => {
      fetchCalled = true
      return new Response('should-not-be-called', { status: 500 })
    }
    try {
      await sendEmail({ to: 'x@y.com', subject: 's', text: 't' })
      assert.equal(fetchCalled, false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('still validates inputs before stubbing', async () => {
    const r = await sendEmail({ to: 'not-an-email', subject: 's', text: 't' })
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.equal(r.error, 'invalid_to')
  })
})

// ─── input validation ───────────────────────────────────────────────────

describe('sendEmail — input validation', () => {
  beforeEach(() => setEmailEnvOverride({ RESEND_API_KEY: 'fake-key' }))
  afterEach(() => setEmailEnvOverride(null))

  test('rejects missing/invalid `to`', async () => {
    const r1 = await sendEmail({ to: '', subject: 's', text: 't' })
    assert.equal(r1.ok, false)
    const r2 = await sendEmail({ to: 'no-at-sign', subject: 's', text: 't' })
    assert.equal(r2.ok, false)
  })

  test('rejects missing subject', async () => {
    const r = await sendEmail({ to: 'x@y.com', subject: '', text: 't' })
    assert.equal(r.ok, false)
  })

  test('rejects non-string text', async () => {
    const r = await sendEmail({
      to: 'x@y.com',
      subject: 's',
      // @ts-expect-error intentional invalid
      text: 42,
    })
    assert.equal(r.ok, false)
  })
})

// ─── real send path ─────────────────────────────────────────────────────

describe('sendEmail — real send path', () => {
  beforeEach(() => setEmailEnvOverride({ RESEND_API_KEY: 'fake-key' }))
  afterEach(() => setEmailEnvOverride(null))

  test('POSTs to Resend API with correct shape on success', async () => {
    let captured: { url: string; init: RequestInit } | null = null
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url, init) => {
      captured = { url: String(url), init: init ?? {} }
      return new Response(JSON.stringify({ id: 'resend-id-abc' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    try {
      const r = await sendEmail({
        to: 'customer@example.com',
        subject: 'Invoice INV-1',
        text: 'Body text',
        from: 'support@weuseai.agent',
      })
      assert.equal(r.ok, true)
      assert.ok(r.ok === true)
      assert.equal(
        (r as { resend_id?: string }).resend_id,
        'resend-id-abc',
      )
      assert.ok(captured !== null)
      const c = captured as unknown as { url: string; init: RequestInit }
      assert.equal(c.url, 'https://api.resend.com/emails')
      assert.equal(c.init.method, 'POST')
      const headers = c.init.headers as Record<string, string>
      assert.equal(headers.Authorization, 'Bearer fake-key')
      const body = JSON.parse(String(c.init.body))
      assert.equal(body.from, 'support@weuseai.agent')
      assert.deepEqual(body.to, ['customer@example.com'])
      assert.equal(body.subject, 'Invoice INV-1')
      assert.equal(body.text, 'Body text')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('default from = noreply@weuseai.agent when not specified', async () => {
    let bodyJson: Record<string, unknown> | null = null
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (_url, init) => {
      bodyJson = JSON.parse(String((init as { body?: string })?.body ?? '{}'))
      return new Response(JSON.stringify({ id: 'r-1' }), { status: 200 })
    }
    try {
      await sendEmail({ to: 'x@y.com', subject: 's', text: 't' })
      const b = bodyJson as unknown as { from: string }
      assert.equal(b.from, 'noreply@weuseai.agent')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('encodes attachment as base64 in attachments array', async () => {
    let bodyJson: { attachments?: Array<{ filename: string; content: string; type: string }> } = {}
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (_url, init) => {
      bodyJson = JSON.parse(String((init as { body?: string })?.body ?? '{}'))
      return new Response(JSON.stringify({ id: 'r-1' }), { status: 200 })
    }
    try {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x20, 0x68, 0x69]) // %PDF hi
      await sendEmail({
        to: 'x@y.com',
        subject: 's',
        text: 't',
        attachment: {
          filename: 'invoice.pdf',
          content: pdfBytes,
          contentType: 'application/pdf',
        },
      })
      assert.ok(bodyJson.attachments !== undefined)
      assert.equal(bodyJson.attachments!.length, 1)
      assert.equal(bodyJson.attachments![0].filename, 'invoice.pdf')
      assert.equal(bodyJson.attachments![0].type, 'application/pdf')
      // Verify base64 round-trip recovers the original bytes.
      const decoded = Buffer.from(bodyJson.attachments![0].content, 'base64')
      assert.deepEqual(Array.from(decoded), Array.from(pdfBytes))
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('returns ok:false on Resend HTTP error', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response('quota exceeded', { status: 429 })
    try {
      const r = await sendEmail({ to: 'x@y.com', subject: 's', text: 't' })
      assert.equal(r.ok, false)
      assert.ok(r.ok === false)
      assert.equal(r.error, 'resend_http_error')
      assert.match(r.detail!, /HTTP 429.*quota exceeded/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('returns ok:false on network error', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      throw new Error('DNS unreachable')
    }
    try {
      const r = await sendEmail({ to: 'x@y.com', subject: 's', text: 't' })
      assert.equal(r.ok, false)
      assert.ok(r.ok === false)
      assert.equal(r.error, 'resend_fetch_failed')
      assert.match(r.detail!, /DNS unreachable/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('returns ok:false when Resend response has no id field', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ status: 'queued', no_id_here: true }), { status: 200 })
    try {
      const r = await sendEmail({ to: 'x@y.com', subject: 's', text: 't' })
      assert.equal(r.ok, false)
      assert.ok(r.ok === false)
      assert.equal(r.error, 'resend_response_missing_id')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

// ─── invoice email body voice rules ─────────────────────────────────────

describe('buildInvoiceEmailBody — Bahasa voice rules', () => {
  const sample = buildInvoiceEmailBody({
    invoice_number: 'INV-2026-001',
    client_name: 'PT Maju, Tbk.',
    total_idr: 9_879_000,
  })

  test('subject embeds invoice number + client name', () => {
    assert.equal(sample.subject, 'Invoice INV-2026-001 — PT Maju, Tbk.')
  })

  test('uses Indonesian thousands separator in total', () => {
    assert.match(sample.text, /Rp 9\.879\.000/)
  })

  test('uses kamu (not Anda or lo/gue)', () => {
    assert.match(sample.text, /\bkamu\b/i)
    assert.doesNotMatch(sample.text, /\bAnda\b/)
    assert.doesNotMatch(sample.text, /\bgue\b/i)
    assert.doesNotMatch(sample.text, /\blo\b/i)
  })

  test('contains zero exclamation marks (CLAUDE.md voice rule)', () => {
    assert.equal((sample.text.match(/!/g) ?? []).length, 0)
  })

  test('contains none of the banned words', () => {
    const banned = [
      'basically',
      'just',
      'literally',
      'honestly',
      'kind of',
      'pretty much',
      'revolutionary',
      'disrupt',
      '10x',
      'game-changer',
      'next-level',
    ]
    for (const word of banned) {
      assert.doesNotMatch(
        sample.text,
        new RegExp(`\\b${word}\\b`, 'i'),
        `email body contains banned word "${word}"`,
      )
    }
  })

  test('greeting + signoff present', () => {
    assert.match(sample.text, /^Halo,/)
    assert.match(sample.text, /weuseai\.agent$/)
  })
})
