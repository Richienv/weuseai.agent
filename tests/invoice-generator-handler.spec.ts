/**
 * Tests for invoice-generator-handler — Phase 2E-1 pilot 1.
 *
 * Covers:
 *   - currency formatting (IDR + USD, rounding behavior)
 *   - totals computation (subtotal + tax + total, IDR rounding)
 *   - HTML escape (XSS defense)
 *   - render: variable substitution, branding, items rows, totals
 *   - drift check: agent-packs/.../template.html ≡ INVOICE_TEMPLATE_HTML
 *   - golden output: known input renders to expected structure
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  computeTotals,
  escapeHtml,
  formatCurrency,
  INVOICE_TEMPLATE_HTML,
  renderInvoice,
} from '../supabase/functions/_shared/invoice-generator-handler.ts'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(TEST_DIR, '..')

// ─── currency formatting ──────────────────────────────────────────────

test('formatCurrency: IDR uses dot-separated thousands, no decimals', () => {
  assert.equal(formatCurrency(1500000, 'IDR'), 'Rp 1.500.000')
  assert.equal(formatCurrency(0, 'IDR'), 'Rp 0')
  assert.equal(formatCurrency(99, 'IDR'), 'Rp 99')
  assert.equal(formatCurrency(1000, 'IDR'), 'Rp 1.000')
  assert.equal(formatCurrency(1000000000, 'IDR'), 'Rp 1.000.000.000')
})

test('formatCurrency: IDR rounds to nearest integer', () => {
  assert.equal(formatCurrency(1500.4, 'IDR'), 'Rp 1.500')
  assert.equal(formatCurrency(1500.6, 'IDR'), 'Rp 1.501')
})

test('formatCurrency: USD uses comma-separated thousands + 2 decimals', () => {
  assert.equal(formatCurrency(1500.00, 'USD'), '$1,500.00')
  assert.equal(formatCurrency(0.99, 'USD'), '$0.99')
  assert.equal(formatCurrency(1000000, 'USD'), '$1,000,000.00')
})

// ─── totals computation ───────────────────────────────────────────────

test('computeTotals: subtotal + tax + total for IDR', () => {
  const totals = computeTotals(
    [
      { description: 'A', qty: 2, unit_price: 1_000_000 },
      { description: 'B', qty: 1, unit_price: 500_000 },
    ],
    0.11,
    'IDR',
  )
  // subtotal = 2_500_000; tax = 11% = 275_000; total = 2_775_000
  assert.equal(totals.subtotal, 2_500_000)
  assert.equal(totals.tax, 275_000)
  assert.equal(totals.total, 2_775_000)
  assert.equal(totals.currency, 'IDR')
  assert.equal(totals.tax_rate, 0.11)
})

test('computeTotals: zero items → all zeros', () => {
  const totals = computeTotals([], 0.11, 'IDR')
  assert.equal(totals.subtotal, 0)
  assert.equal(totals.tax, 0)
  assert.equal(totals.total, 0)
})

test('computeTotals: zero tax rate → tax=0, total=subtotal', () => {
  const totals = computeTotals(
    [{ description: 'A', qty: 1, unit_price: 1000 }],
    0,
    'IDR',
  )
  assert.equal(totals.tax, 0)
  assert.equal(totals.total, 1000)
})

test('computeTotals: USD preserves fractional cents', () => {
  const totals = computeTotals(
    [{ description: 'A', qty: 3, unit_price: 9.99 }],
    0.10,
    'USD',
  )
  // subtotal = 29.97; tax = 2.997; total = 32.967
  assert.ok(Math.abs(totals.subtotal - 29.97) < 0.001)
  assert.ok(Math.abs(totals.tax - 2.997) < 0.001)
})

// ─── HTML escape (XSS defense) ────────────────────────────────────────

test('escapeHtml: escapes the 5 dangerous chars', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;')
  assert.equal(escapeHtml('"hello"'), '&quot;hello&quot;')
  assert.equal(escapeHtml("it's"), 'it&#39;s')
  assert.equal(escapeHtml('a & b'), 'a &amp; b')
})

test('escapeHtml: ampersand escaped first (no double-escape)', () => {
  // Must be: & → &amp;  THEN < → &lt;.  Order matters.
  assert.equal(escapeHtml('<&>'), '&lt;&amp;&gt;')
})

test('escapeHtml: leaves safe chars untouched', () => {
  assert.equal(escapeHtml('Halo dunia 123'), 'Halo dunia 123')
})

// ─── renderInvoice: variable substitution + branding ──────────────────

test('renderInvoice: substitutes all variables, no leftover {tokens}', () => {
  const r = renderInvoice({
    client_name: 'PT Acme Indonesia',
    items: [{ description: 'Konsultasi 10 jam', qty: 10, unit_price: 500_000 }],
    invoice_number: 'INV-20260507-0001',
    issue_date: '2026-05-07',
    due_date: '2026-05-21',
  })
  // Variables substituted
  assert.match(r.html, /PT Acme Indonesia/)
  assert.match(r.html, /INV-20260507-0001/)
  assert.match(r.html, /2026-05-07/)
  assert.match(r.html, /2026-05-21/)
  // No leftover placeholders
  assert.equal(r.html.includes('{client_name}'), false)
  assert.equal(r.html.includes('{invoice_number}'), false)
  assert.equal(r.html.includes('{items_rows}'), false)
  assert.equal(r.html.includes('{subtotal_formatted}'), false)
  assert.equal(r.html.includes('{tax_formatted}'), false)
  assert.equal(r.html.includes('{total_formatted}'), false)
  assert.equal(r.html.includes('{tax_rate_percent}'), false)
})

test('renderInvoice: weuseai.agent branding present', () => {
  const r = renderInvoice({
    client_name: 'X',
    items: [{ description: 'A', qty: 1, unit_price: 1000 }],
    invoice_number: 'INV-X',
    issue_date: '2026-05-07',
  })
  assert.match(r.html, /weuseai\.agent/)
})

test('renderInvoice: items_rows produces one tr per item with totals', () => {
  const r = renderInvoice({
    client_name: 'X',
    items: [
      { description: 'Konsultasi', qty: 10, unit_price: 500_000 },
      { description: 'Implementasi', qty: 1, unit_price: 2_000_000 },
    ],
    invoice_number: 'INV-X',
    issue_date: '2026-05-07',
  })
  // Two rows present
  const trCount = (r.html.match(/<tr>[\s\S]*?<\/tr>/g) ?? []).length
  // 1 header tr + 2 body trs = 3
  assert.equal(trCount, 3)
  // Line totals rendered
  assert.match(r.html, /Rp 5\.000\.000/)  // 10 × 500k = 5M
  assert.match(r.html, /Rp 2\.000\.000/)  // 1 × 2M
})

test('renderInvoice: tax rate percent displayed (0.11 → 11)', () => {
  const r = renderInvoice({
    client_name: 'X',
    items: [{ description: 'A', qty: 1, unit_price: 1_000_000 }],
    invoice_number: 'INV-X',
    issue_date: '2026-05-07',
  })
  assert.match(r.html, /Pajak \(11%\)/)
})

test('renderInvoice: custom tax rate displayed correctly', () => {
  const r = renderInvoice({
    client_name: 'X',
    items: [{ description: 'A', qty: 1, unit_price: 1_000_000 }],
    tax_rate: 0.105,
    invoice_number: 'INV-X',
    issue_date: '2026-05-07',
  })
  assert.match(r.html, /Pajak \(10\.5%\)/)
})

test('renderInvoice: defaults applied for missing optional fields', () => {
  const r = renderInvoice({
    client_name: 'X',
    items: [{ description: 'A', qty: 1, unit_price: 1_000_000 }],
    invoice_number: 'INV-X',
    issue_date: '2026-05-07',
  })
  // Default tax_rate = 0.11
  assert.equal(r.totals.tax_rate, 0.11)
  // Default currency = IDR
  assert.equal(r.totals.currency, 'IDR')
  // Default due_date = '—'
  assert.match(r.html, /<div><strong>—<\/strong><\/div>/)
})

test('renderInvoice: USD currency uses dollar formatting', () => {
  const r = renderInvoice({
    client_name: 'X',
    items: [{ description: 'A', qty: 1, unit_price: 100 }],
    currency: 'USD',
    tax_rate: 0.10,
    invoice_number: 'INV-X',
    issue_date: '2026-05-07',
  })
  assert.match(r.html, /\$100\.00/)
  assert.match(r.html, /\$10\.00/)   // tax
  assert.match(r.html, /\$110\.00/)  // total
})

// ─── XSS defense ──────────────────────────────────────────────────────

test('renderInvoice: client_name with HTML is escaped (no XSS)', () => {
  const r = renderInvoice({
    client_name: '<script>alert(1)</script>',
    items: [{ description: 'A', qty: 1, unit_price: 1000 }],
    invoice_number: 'INV-X',
    issue_date: '2026-05-07',
  })
  // Raw <script> must NOT appear; escaped form must.
  assert.equal(r.html.includes('<script>alert(1)</script>'), false)
  assert.match(r.html, /&lt;script&gt;/)
})

test('renderInvoice: item description with HTML is escaped', () => {
  const r = renderInvoice({
    client_name: 'X',
    items: [{ description: '<img src=x onerror=alert(1)>', qty: 1, unit_price: 1000 }],
    invoice_number: 'INV-X',
    issue_date: '2026-05-07',
  })
  assert.equal(r.html.includes('<img src=x onerror=alert(1)>'), false)
  assert.match(r.html, /&lt;img/)
})

// ─── filename ─────────────────────────────────────────────────────────

test('renderInvoice: filename slugifies client name', () => {
  const r = renderInvoice({
    client_name: 'PT Acme Indonesia',
    items: [{ description: 'A', qty: 1, unit_price: 1000 }],
    invoice_number: 'INV-001',
    issue_date: '2026-05-07',
  })
  assert.equal(r.filename, 'invoice-pt-acme-indonesia-INV-001.html')
})

test('renderInvoice: filename handles edge cases (special chars, all-symbols name)', () => {
  const r = renderInvoice({
    client_name: '!@#$%',
    items: [{ description: 'A', qty: 1, unit_price: 1000 }],
    invoice_number: 'INV-X',
    issue_date: '2026-05-07',
  })
  // All-symbol name slugifies to '' → fallback 'client'
  assert.equal(r.filename, 'invoice-client-INV-X.html')
})

// ─── result envelope ──────────────────────────────────────────────────

test('renderInvoice: result includes totals breakdown', () => {
  const r = renderInvoice({
    client_name: 'X',
    items: [{ description: 'A', qty: 2, unit_price: 1_000_000 }],
    invoice_number: 'INV-X',
    issue_date: '2026-05-07',
  })
  assert.equal(r.totals.subtotal, 2_000_000)
  assert.equal(r.totals.tax, 220_000)
  assert.equal(r.totals.total, 2_220_000)
  assert.equal(r.format, 'html')
  assert.equal(r.invoice_number, 'INV-X')
  assert.equal(r.issue_date, '2026-05-07')
})

// ─── drift check ──────────────────────────────────────────────────────

test('drift: agent-packs/workflow-templates/invoice/v1/template.html matches inlined constant', () => {
  const onDisk = readFileSync(
    resolve(REPO_ROOT, 'agent-packs/workflow-templates/invoice/v1/template.html'),
    'utf8',
  )
  assert.equal(
    onDisk,
    INVOICE_TEMPLATE_HTML,
    'template.html on disk drifted from INVOICE_TEMPLATE_HTML constant in invoice-generator-handler.ts. Sync them.',
  )
})

// ─── golden output (regression baseline) ──────────────────────────────

test('golden: deterministic input renders expected structural elements', () => {
  const r = renderInvoice({
    client_name: 'PT Studio Aman',
    client_address: 'Jl. Kemang Raya No. 12, Jakarta Selatan',
    items: [
      { description: 'Konsultasi UI/UX 8 jam', qty: 8, unit_price: 800_000 },
      { description: 'Revisi desain (round 2)', qty: 1, unit_price: 1_500_000 },
    ],
    tax_rate: 0.11,
    due_date: '2026-05-21',
    currency: 'IDR',
    invoice_number: 'INV-20260507-0001',
    issue_date: '2026-05-07',
  })

  // Structural fingerprints — drift here means template structure changed.
  assert.match(r.html, /<title>Invoice INV-20260507-0001 — PT Studio Aman<\/title>/)
  assert.match(r.html, /<div class="brand">weuseai\.agent<\/div>/)
  assert.match(r.html, /Jl\. Kemang Raya No\. 12, Jakarta Selatan/)
  assert.match(r.html, /Konsultasi UI\/UX 8 jam/)
  assert.match(r.html, /Revisi desain \(round 2\)/)
  // Subtotal: 8 × 800k = 6.4M; + 1 × 1.5M = 7.9M; tax 11% = 869k; total 8.769M
  assert.match(r.html, /Rp 7\.900\.000/)  // subtotal
  assert.match(r.html, /Rp 869\.000/)     // tax
  assert.match(r.html, /Rp 8\.769\.000/)  // total
  // Totals object also exposes these for callers that don't parse HTML.
  assert.equal(r.totals.subtotal, 7_900_000)
  assert.equal(r.totals.tax, 869_000)
  assert.equal(r.totals.total, 8_769_000)
})
