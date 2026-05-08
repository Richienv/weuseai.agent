#!/usr/bin/env tsx
/**
 * Phase 2E-3 verification gate: render the existing invoice template
 * via Cloudflare Browser Rendering API and write the resulting PDF to
 * stdout (so the caller can pipe to a file + `open` it for visual
 * inspection).
 *
 * Spec: docs/plans/2026-05-08-phase-2e-3-spec.md (Q1)
 * Sub-spec: docs/plans/2026-05-08-phase-2e-3-pdf-renderer-decision.md
 *
 * Time-boxed verification per founder direction (<2 hours).
 *
 * Usage:
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     npx tsx scripts/verify-cf-pdf-rendering.ts > /tmp/verification.pdf
 *   open /tmp/verification.pdf
 *
 * Then walk the visual checklist in
 * docs/plans/2026-05-08-phase-2e-3-pdf-renderer-decision.md.
 */

import { writeFileSync } from 'node:fs'
import { renderInvoice, type InvoiceInput } from '../supabase/functions/_shared/invoice-generator-handler.ts'

// ─── env ─────────────────────────────────────────────────────────────────

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const apiToken = process.env.CLOUDFLARE_API_TOKEN
if (!accountId || !apiToken) {
  process.stderr.write(
    'Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN.\n' +
      '  Get account ID from dashboard.cloudflare.com (top-right of the home page).\n' +
      '  Get API token from My Profile → API Tokens → Create Custom Token,\n' +
      '  with the "Workers Browser Rendering" permission.\n',
  )
  process.exit(2)
}

// ─── stress-test invoice fixture ─────────────────────────────────────────
//
// Picks values that exercise every Bahasa + Rupiah edge case from the
// verification checklist:
//   - "PT Maju, Tbk." — comma + "Tbk." abbreviation
//   - Long client_address with newlines (DKI Jakarta address style)
//   - Items with em-dashes + curly quotes
//   - Two items at non-round values to test Rupiah formatting
//     (Rp 3.330.000,00 has thousands sep "." and decimals ",")
//   - 11% PPN tax
//   - Currency: IDR

const fixture: InvoiceInput = {
  client_name: 'PT Maju, Tbk.',
  client_address:
    'Wisma Mulia, Lt. 23\nJl. Jenderal Gatot Subroto No. 42\nJakarta Selatan, DKI Jakarta 12710',
  items: [
    {
      description:
        'Konsultasi strategi konten — bulan Mei 2026 (8 jam @ "discovery" rate)',
      qty: 8,
      unit_price: 800_000,
    },
    {
      description: 'Setup OAuth integration — Google Workspace + Slack',
      qty: 1,
      unit_price: 2_500_000,
    },
  ],
  tax_rate: 0.11, // PPN
  due_date: '2026-06-08',
  currency: 'IDR',
  invoice_number: 'INV-2026-VERIFICATION-001',
  issue_date: '2026-05-08',
}

// ─── render the HTML ─────────────────────────────────────────────────────

const rendered = renderInvoice(fixture)
process.stderr.write(`Rendered HTML: ${rendered.html.length} bytes\n`)
process.stderr.write(`Subtotal: ${rendered.totals.subtotal}\n`)
process.stderr.write(`Tax (11%): ${rendered.totals.tax}\n`)
process.stderr.write(`Total: ${rendered.totals.total}\n\n`)

// ─── call CF Browser Rendering ───────────────────────────────────────────

const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/pdf`
// CF Browser Rendering /pdf endpoint accepts a narrow set of top-level
// keys: html, url, viewport, gotoOptions, screenshotOptions, etc. It
// does NOT accept format/margin/printBackground (those return HTTP 400
// "unrecognized_keys"). Default page format is A4. We pass html + a
// viewport hint (~A4 width at 96dpi = 794px) and let CF use its
// defaults for everything else.
const body = {
  html: rendered.html,
  viewport: { width: 794, height: 1123 },
}

process.stderr.write(`POST ${url}\n`)
const r = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
})

if (!r.ok) {
  const detail = await r.text()
  process.stderr.write(`✗ HTTP ${r.status}: ${detail.slice(0, 800)}\n`)
  process.exit(1)
}

// Response body is PDF bytes.
const buf = Buffer.from(await r.arrayBuffer())
process.stderr.write(`✓ Got ${buf.length} bytes of PDF\n`)
process.stderr.write(`  Magic: ${buf.subarray(0, 4).toString('ascii')} (expect "%PDF")\n`)

if (buf[0] !== 0x25 || buf[1] !== 0x50 || buf[2] !== 0x44 || buf[3] !== 0x46) {
  process.stderr.write('✗ Response does not start with %PDF magic. Aborting.\n')
  process.exit(1)
}

// Write to stdout (for piping) AND save a default path for convenience.
const defaultPath = '/tmp/cf-pdf-verification.pdf'
writeFileSync(defaultPath, buf)
process.stderr.write(`\n✓ Saved to ${defaultPath}\n`)
process.stderr.write(`  Open with: open ${defaultPath}\n`)
process.stderr.write(`\nVerification checklist:\n`)
process.stderr.write(`  docs/plans/2026-05-08-phase-2e-3-pdf-renderer-decision.md\n`)
process.stdout.write(buf)
