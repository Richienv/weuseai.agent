// invoice-generator-handler — Phase 2E-1 pilot 1.
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
//   "invoice-generator (Doc Expert) — template pattern"
//
// Renders an HTML invoice from validated parameters and returns the
// rendered string + metadata. PDF is deferred to Phase 2E-2 (separate
// renderer-choice spec).
//
// Output shape (matches `WorkflowOutputType: 'file'`):
//   { format: 'html', html: '<!DOCTYPE html>...', filename: 'invoice-...html',
//     totals: { subtotal, tax, total, currency } }
//
// The deno-serve entrypoint persists the HTML to Supabase Storage and
// returns a signed URL; the handler itself stays I/O-free so it's
// trivially testable.
//
// Source of truth for the HTML template:
//   /agent-packs/workflow-templates/invoice/v1/template.html
//
// Mirrored byte-for-byte as INVOICE_TEMPLATE_HTML below. A drift test
// asserts equality (same pattern as SOUL.md persona scaffolds).

// ─── input shape ────────────────────────────────────────────────────────
//
// Mirrors the workflow's parameters_schema after defaults are applied.
// Caller (workflow-execute) hands us already-validated params.

export type InvoiceItem = {
  description: string
  qty: number
  unit_price: number
}

export type InvoiceInput = {
  client_name: string
  client_address?: string
  items: InvoiceItem[]
  tax_rate?: number       // default 0.11 (Indonesian PPN 11%)
  due_date?: string       // ISO YYYY-MM-DD
  currency?: 'IDR' | 'USD'  // default IDR
  /** Optional override; deno-serve generates a stable id when absent. */
  invoice_number?: string
  /** Optional override; deno-serve uses today (Asia/Jakarta) when absent. */
  issue_date?: string
}

// ─── output shape ───────────────────────────────────────────────────────

export type InvoiceTotals = {
  subtotal: number
  tax: number
  total: number
  currency: 'IDR' | 'USD'
  tax_rate: number  // 0..1
}

export type InvoiceRenderResult = {
  format: 'html'
  html: string
  filename: string
  totals: InvoiceTotals
  invoice_number: string
  issue_date: string
}

// ─── inline template (mirrors agent-packs/workflow-templates/invoice/v1/template.html) ─

export const INVOICE_TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Invoice {invoice_number} — {client_name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #141413; background: #FAF9F5; padding: 48px; line-height: 1.5; }
  .invoice { max-width: 720px; margin: 0 auto; background: #fff; padding: 48px; border: 1px solid rgba(20, 20, 19, 0.08); }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid rgba(20, 20, 19, 0.08); }
  .brand { font-size: 14px; font-weight: 500; letter-spacing: 0.02em; color: rgba(20, 20, 19, 0.65); }
  .invoice-meta { text-align: right; font-size: 13px; color: rgba(20, 20, 19, 0.65); }
  .invoice-meta strong { color: #141413; font-weight: 500; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(20, 20, 19, 0.5); margin-bottom: 4px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 40px; }
  .party-name { font-size: 15px; font-weight: 500; }
  .party-detail { font-size: 13px; color: rgba(20, 20, 19, 0.65); margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(20, 20, 19, 0.5); padding: 12px 8px; border-bottom: 1px solid rgba(20, 20, 19, 0.12); font-weight: 500; }
  th.right, td.right { text-align: right; }
  td { font-size: 14px; padding: 14px 8px; border-bottom: 1px solid rgba(20, 20, 19, 0.06); }
  .totals { margin-left: auto; width: 280px; margin-top: 8px; }
  .total-row { display: flex; justify-content: space-between; padding: 8px 8px; font-size: 14px; }
  .total-row.subtotal { color: rgba(20, 20, 19, 0.65); }
  .total-row.tax { color: rgba(20, 20, 19, 0.65); }
  .total-row.grand { border-top: 1px solid rgba(20, 20, 19, 0.12); margin-top: 4px; padding-top: 14px; font-weight: 500; font-size: 15px; }
  .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid rgba(20, 20, 19, 0.08); font-size: 12px; color: rgba(20, 20, 19, 0.5); }
  .footer a { color: rgba(20, 20, 19, 0.65); text-decoration: none; }
</style>
</head>
<body>
<div class="invoice">
  <div class="header">
    <div>
      <div class="brand">weuseai.agent</div>
      <div class="party-detail" style="margin-top:6px;">Invoice yang dibuat oleh agent kamu</div>
    </div>
    <div class="invoice-meta">
      <div class="label">Invoice</div>
      <div><strong>{invoice_number}</strong></div>
      <div style="margin-top:8px;" class="label">Tanggal</div>
      <div><strong>{issue_date}</strong></div>
      <div style="margin-top:8px;" class="label">Jatuh tempo</div>
      <div><strong>{due_date}</strong></div>
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="label">Ditagihkan ke</div>
      <div class="party-name">{client_name}</div>
      <div class="party-detail">{client_address}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Deskripsi</th>
        <th class="right">Qty</th>
        <th class="right">Harga satuan</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      {items_rows}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row subtotal">
      <span>Subtotal</span>
      <span>{subtotal_formatted}</span>
    </div>
    <div class="total-row tax">
      <span>Pajak ({tax_rate_percent}%)</span>
      <span>{tax_formatted}</span>
    </div>
    <div class="total-row grand">
      <span>Total</span>
      <span>{total_formatted}</span>
    </div>
  </div>

  <div class="footer">
    Pembayaran ke nomor rekening yang disepakati. Pertanyaan: <a href="mailto:hello@weuseai.agent">hello@weuseai.agent</a>.
  </div>
</div>
</body>
</html>
`

// ─── currency formatters ────────────────────────────────────────────────
//
// IDR uses dot-separated thousands (Indonesian convention) and no
// fraction digits — Rupiah is rarely shown with decimals at this scale.
// USD uses comma-separated thousands and 2 decimal places.

export function formatCurrency(amount: number, currency: 'IDR' | 'USD'): string {
  if (currency === 'IDR') {
    const rounded = Math.round(amount)
    return 'Rp ' + groupBy3(String(rounded), '.')
  }
  // USD
  const fixed = amount.toFixed(2)
  const [intPart, decPart] = fixed.split('.')
  return '$' + groupBy3(intPart, ',') + '.' + decPart
}

function groupBy3(digits: string, sep: ',' | '.'): string {
  // Handles negative numbers with a leading '-' before the digits.
  let neg = ''
  let s = digits
  if (s.startsWith('-')) {
    neg = '-'
    s = s.slice(1)
  }
  const parts: string[] = []
  for (let i = s.length; i > 0; i -= 3) {
    const start = Math.max(0, i - 3)
    parts.unshift(s.slice(start, i))
  }
  return neg + parts.join(sep)
}

// ─── totals computation ─────────────────────────────────────────────────

export function computeTotals(
  items: InvoiceItem[],
  taxRate: number,
  currency: 'IDR' | 'USD',
): InvoiceTotals {
  let subtotal = 0
  for (const item of items) {
    subtotal += item.qty * item.unit_price
  }
  const tax = subtotal * taxRate
  const total = subtotal + tax
  // For IDR we round the cents away at totals computation (currency
  // formatter rounds again as a defense in depth).
  if (currency === 'IDR') {
    return {
      subtotal: Math.round(subtotal),
      tax: Math.round(tax),
      total: Math.round(total),
      currency,
      tax_rate: taxRate,
    }
  }
  return { subtotal, tax, total, currency, tax_rate: taxRate }
}

// ─── HTML escape (defense against client_name = '<script>...') ──────────

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── items rows builder ────────────────────────────────────────────────

function buildItemsRows(items: InvoiceItem[], currency: 'IDR' | 'USD'): string {
  return items
    .map((item) => {
      const lineTotal = item.qty * item.unit_price
      return (
        `      <tr>` +
        `<td>${escapeHtml(item.description)}</td>` +
        `<td class="right">${item.qty}</td>` +
        `<td class="right">${escapeHtml(formatCurrency(item.unit_price, currency))}</td>` +
        `<td class="right">${escapeHtml(formatCurrency(lineTotal, currency))}</td>` +
        `</tr>`
      )
    })
    .join('\n')
}

// ─── handler ────────────────────────────────────────────────────────────

const DEFAULT_TAX_RATE = 0.11
const DEFAULT_CURRENCY: 'IDR' | 'USD' = 'IDR'

export function renderInvoice(input: InvoiceInput): InvoiceRenderResult {
  const taxRate = input.tax_rate ?? DEFAULT_TAX_RATE
  const currency = input.currency ?? DEFAULT_CURRENCY
  const totals = computeTotals(input.items, taxRate, currency)
  const invoiceNumber = input.invoice_number ?? defaultInvoiceNumber()
  const issueDate = input.issue_date ?? defaultIssueDate()
  const dueDate = input.due_date ?? '—'
  const clientAddress = input.client_address ?? ''

  const taxRatePercent = Math.round(taxRate * 1000) / 10  // 0.11 → 11.0; 0.105 → 10.5

  const html = INVOICE_TEMPLATE_HTML
    .replaceAll('{invoice_number}', escapeHtml(invoiceNumber))
    .replaceAll('{client_name}', escapeHtml(input.client_name))
    .replaceAll('{client_address}', escapeHtml(clientAddress))
    .replaceAll('{issue_date}', escapeHtml(issueDate))
    .replaceAll('{due_date}', escapeHtml(dueDate))
    .replaceAll('{items_rows}', buildItemsRows(input.items, currency))
    .replaceAll('{subtotal_formatted}', escapeHtml(formatCurrency(totals.subtotal, currency)))
    .replaceAll('{tax_formatted}', escapeHtml(formatCurrency(totals.tax, currency)))
    .replaceAll('{total_formatted}', escapeHtml(formatCurrency(totals.total, currency)))
    .replaceAll('{tax_rate_percent}', String(taxRatePercent))

  // Filename: invoice-{slug-of-client}-{invoice_number}.html
  const slug = input.client_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
  const filename = `invoice-${slug || 'client'}-${invoiceNumber}.html`

  return {
    format: 'html',
    html,
    filename,
    totals,
    invoice_number: invoiceNumber,
    issue_date: issueDate,
  }
}

// ─── default helpers (overridable from entrypoint for determinism) ──────

function defaultInvoiceNumber(): string {
  // INV-YYYYMMDD-{random4}.  Deterministic enough to read; collision
  // rate negligible at pilot scale. Tests should pass invoice_number
  // explicitly to lock the output.
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  const r = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `INV-${y}${m}${d}-${r}`
}

function defaultIssueDate(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
