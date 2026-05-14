/**
 * e2e smoke against PRODUCTION — `https://weuseai-agent.vercel.app/`
 *
 * Source of truth for "does the customer flow actually work?".
 * Unit/integration tests cover pieces in isolation; THIS file is
 * the only thing that ever sees what a paying customer sees.
 *
 * Founder hotfix brief (2026-05-14):
 *   Customer hit "Pembayaran tidak bisa disiapkan saat ini" on
 *   /checkout. None of the 1577 existing tests caught it. The
 *   coverage gap is exactly this: end-to-end, HTTP-level, against
 *   the LIVE deployed system.
 *
 * Design choices:
 *
 *   - HTTP-only. No browser automation in this first cut. The
 *     critical failure modes founder cares about are HTTP-level:
 *     /create-invoice returns wrong status / wrong error code,
 *     /welcome doesn't render, banner missing. All observable
 *     via fetch + substring match.
 *
 *   - Excluded from the default `npm test` glob (`tests/*.spec.ts`
 *     vs this file's `tests/e2e/*.spec.ts`). Run via:
 *       npx tsx --test tests/e2e/smoke-production.spec.ts
 *     Reason: hitting prod from every dev CI run would create
 *     thousands of throwaway Xendit invoices.
 *
 *   - Fail-INDEPENDENT. Each step is its own `test()` block so a
 *     failure in Step 5 doesn't suppress the report for Steps 6-10.
 *     Founder gets the full picture in one run, not a peeled onion.
 *
 *   - Sentinel email `e2e-smoke-${ts}@weuseai.test` makes test
 *     customers/subscriptions identifiable for cleanup.
 *
 *   - Production URL is hard-coded to `https://weuseai-agent.vercel.app/`
 *     per MEMORY.md ("always verify deploys via weuseai-agent.vercel.app/,
 *     not the velorah-nu auto-alias"). DO NOT change to velorah-nu.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

// ─── Configuration ────────────────────────────────────────────────────

// Phase 4 (2026-05-14): CI override. GitHub Actions sets
// E2E_SMOKE_BASE so the workflow can target preview deployments, the
// auto-tracking sibling alias (velorah-nu.vercel.app), or other
// environments without editing this file. Default stays at the
// canonical production URL per CLAUDE.md.
const PROD_BASE = process.env.E2E_SMOKE_BASE ?? 'https://weuseai-agent.vercel.app'
const SMOKE_EMAIL = `e2e-smoke-${Date.now()}@weuseai.test`

// Lifted from a fresh fetch of the LIVE /checkout — these are the
// EXACT constants the deployed JS uses. If they drift, this gate
// catches it because the POST will fail.
const SUPABASE_FUNCTIONS_URL = 'https://gtjgsligllbjcisiyrah.supabase.co/functions/v1'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0amdzbGlnbGxiamNpc2l5cmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Njc2NjUsImV4cCI6MjA5MzA0MzY2NX0.krPAvB3kyxcqsBS5dyDahFMqCB_4MZKaz6FEB0RfjtY'

// Findings collected by step; flushed to a final report at end-of-suite.
type Finding = {
  step: number
  name: string
  status: 'pass' | 'fail'
  detail?: string
  request?: unknown
  response?: { status: number; body?: unknown; headers?: Record<string, string> }
}
const findings: Finding[] = []

function record(f: Finding) {
  findings.push(f)
  const icon = f.status === 'pass' ? '✓' : '✗'
  // eslint-disable-next-line no-console
  console.log(`${icon} Step ${f.step}: ${f.name}${f.detail ? '\n    ' + f.detail.replace(/\n/g, '\n    ') : ''}`)
}

// Capture state between dependent steps (e.g. cid extracted in step 7
// is needed by step 8). Plain object — node:test runs sequentially
// when there's no concurrency.
const ctx: {
  landingHtml?: string
  checkoutHtml?: string
  invoiceUrl?: string
  cid?: string
  welcomeHtml?: string
  failureCheckoutHtml?: string
} = {}

// ─── Helpers ──────────────────────────────────────────────────────────

async function getHtml(path: string): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const r = await fetch(`${PROD_BASE}${path}`, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'user-agent': 'weuseai-e2e-smoke/1.0' },
  })
  const body = await r.text()
  const headers: Record<string, string> = {}
  r.headers.forEach((v, k) => { headers[k] = v })
  return { status: r.status, body, headers }
}

function htmlContains(html: string, needle: string | RegExp): boolean {
  return typeof needle === 'string' ? html.includes(needle) : needle.test(html)
}

// ─── Step 1: Landing renders ──────────────────────────────────────────

test('Step 1: GET / renders landing without HTTP error', async () => {
  const r = await getHtml('/')
  ctx.landingHtml = r.body
  if (r.status !== 200) {
    record({ step: 1, name: 'Landing renders', status: 'fail', detail: `HTTP ${r.status}` })
    assert.fail(`landing returned HTTP ${r.status}`)
  }
  // Sanity: it's actually our landing (has expected hero text).
  const hasBrand = htmlContains(r.body, /weuseai/i)
  if (!hasBrand) {
    record({ step: 1, name: 'Landing renders', status: 'fail', detail: 'landing HTML missing "weuseai" brand marker' })
    assert.fail('landing missing brand marker')
  }
  record({ step: 1, name: 'Landing renders', status: 'pass', detail: `HTTP 200, ${r.body.length} bytes` })
})

// ─── Step 2: Checkout reachable ───────────────────────────────────────

test('Step 2: GET /checkout reaches checkout form', async () => {
  const r = await getHtml('/checkout')
  ctx.checkoutHtml = r.body
  if (r.status !== 200) {
    record({ step: 2, name: 'Checkout reached', status: 'fail', detail: `HTTP ${r.status}` })
    assert.fail(`/checkout returned HTTP ${r.status}`)
  }
  const hasForm = htmlContains(r.body, /id="payForm"/)
  if (!hasForm) {
    record({ step: 2, name: 'Checkout reached', status: 'fail', detail: 'checkout HTML missing `id="payForm"`' })
    assert.fail('checkout missing payForm')
  }
  // While we're here, capture critical state-of-deploy facts that
  // the next steps care about. If `tos_accepted_at` is NOT in the
  // deployed checkout.html, Step 5 will deterministically fail — and
  // this breadcrumb tells founder why.
  const hasTosBinding = /tos_accepted_at\s*:\s*tosAcceptedAt/.test(r.body)
  const hasA2Catalog = /CHECKOUT_ERROR_MAP/.test(r.body)
  const hasA2TosRequiredMapping = /tos_required[\s\S]{0,80}Centang dulu Syarat dan Ketentuan/i.test(r.body)
  const bytes = r.body.length
  record({
    step: 2,
    name: 'Checkout reached',
    status: 'pass',
    detail:
      `HTTP 200, ${bytes} bytes\n` +
      `tos_accepted_at in fetch body: ${hasTosBinding ? 'YES' : 'NO (PR #91 frontend missing → Step 5 will fail tos_required)'}\n` +
      `A2 catalog (CHECKOUT_ERROR_MAP) present: ${hasA2Catalog ? 'YES' : 'NO'}\n` +
      `A2 has tos_required → "Centang dulu..." mapping: ${hasA2TosRequiredMapping ? 'YES' : 'NO (PR #112 catalog cleanup missing)'}`,
  })
})

// ─── Step 3+4+5: Build a valid POST + verify Bayar succeeds ───────────

test('Step 5: POST /create-invoice with ToS checked → invoice_url or specific error', async () => {
  // Mirrors EXACTLY the body the live checkout.html submit handler
  // constructs (post-PR-#91). If the deployed frontend doesn't send
  // tos_accepted_at, that's caught at Step 2; here we always send a
  // valid body so we observe the SERVER's behaviour, not a stale-
  // deploy artifact.
  const tosAcceptedAt = new Date().toISOString()
  const reqBody = {
    email: SMOKE_EMAIL,
    plan: 'starter' as const,
    alwaysOn: false,
    methodId: 'qris' as const,
    country: 'ID',
    postal: '',
    tos_accepted_at: tosAcceptedAt,
    marketing_opt_in_at: null,
    policy_version: 'v1.0',
  }

  let r: Response
  let bodyText = ''
  try {
    r = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-invoice`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'user-agent': 'weuseai-e2e-smoke/1.0',
      },
      body: JSON.stringify(reqBody),
    })
    bodyText = await r.text()
  } catch (e) {
    record({
      step: 5,
      name: 'Bayar (POST /create-invoice)',
      status: 'fail',
      detail: 'fetch threw before response: ' + (e instanceof Error ? e.message : String(e)),
      request: { email: '[REDACTED]', plan: reqBody.plan, methodId: reqBody.methodId },
    })
    assert.fail('fetch threw')
    return
  }

  let bodyJson: any = null
  try { bodyJson = JSON.parse(bodyText) } catch { /* keep raw */ }

  if (r.status === 200 && bodyJson?.invoice_url) {
    ctx.invoiceUrl = bodyJson.invoice_url
    ctx.cid = bodyJson.customer_id
    record({
      step: 5,
      name: 'Bayar (POST /create-invoice)',
      status: 'pass',
      detail: `HTTP 200, invoice_url=${bodyJson.invoice_url}, customer_id=${bodyJson.customer_id?.slice(0, 8)}...`,
    })
    return
  }

  // Non-success — capture EVERYTHING so founder can triage.
  const serverErrorCode =
    typeof bodyJson?.error === 'string' ? bodyJson.error : '(no `error` field in body)'

  // What would A2 catalog map this code to? Mirror the production
  // catalog so the report says exactly what a customer would see.
  // Keep this in lockstep with the catalog in checkout.html.
  const A2_CATALOG: Record<string, string> = {
    invalid_email:           'Email belum benar. Cek lagi formatnya (mis. kamu@email.com).',
    invalid_methodId:        'Cara bayar yang dipilih sedang tidak tersedia. Pilih cara bayar lain dari daftar.',
    invalid_plan:            'Paket tidak dikenali. Refresh halaman dan coba lagi — kalau berlanjut, hubungi tim.',
    consent_persist_failed:  'Persetujuan tidak tersimpan. Centang ulang Syarat dan Ketentuan, lalu coba lagi.',
    tos_required:            'Centang dulu Syarat dan Ketentuan untuk lanjut ke pembayaran.',
    tos_stale:               'Sesi kamu sudah kadaluarsa. Centang ulang persetujuan untuk lanjut.',
  }
  const A2_FALLBACK = 'Pembayaran tidak bisa disiapkan saat ini. Coba lagi dalam 1 menit, atau hubungi tim via WhatsApp.'
  const customerWouldSee = A2_CATALOG[serverErrorCode] ?? A2_FALLBACK
  const a2Coverage = A2_CATALOG[serverErrorCode] ? 'COVERED' : 'MISSING (falls to generic fallback)'

  record({
    step: 5,
    name: 'Bayar (POST /create-invoice)',
    status: 'fail',
    detail:
      `HTTP ${r.status}\n` +
      `Server response body: ${bodyText.slice(0, 600)}\n` +
      `Server error code: ${serverErrorCode}\n` +
      `A2 catalog coverage: ${a2Coverage}\n` +
      `Customer would see: "${customerWouldSee}"`,
    request: {
      email: SMOKE_EMAIL,
      plan: reqBody.plan,
      alwaysOn: reqBody.alwaysOn,
      methodId: reqBody.methodId,
      country: reqBody.country,
      tos_accepted_at: '[stamped fresh — see body]',
      marketing_opt_in_at: null,
      policy_version: 'v1.0',
    },
    response: { status: r.status, body: bodyJson ?? bodyText.slice(0, 600) },
  })
  assert.fail(`/create-invoice returned ${r.status} ${serverErrorCode}`)
})

// ─── Step 7: Invoice URL well-formed (only runs if Step 5 succeeded) ─

test('Step 7: invoice_url is a well-formed Xendit URL', async () => {
  if (!ctx.invoiceUrl) {
    record({
      step: 7,
      name: 'Invoice URL well-formed',
      status: 'fail',
      detail: 'SKIPPED — Step 5 did not produce an invoice_url',
    })
    assert.fail('no invoice_url to validate (Step 5 failed)')
    return
  }
  let url: URL
  try {
    url = new URL(ctx.invoiceUrl)
  } catch (e) {
    record({
      step: 7,
      name: 'Invoice URL well-formed',
      status: 'fail',
      detail: `invoice_url is not a valid URL: ${ctx.invoiceUrl}`,
    })
    assert.fail('malformed invoice_url')
    return
  }
  const isXendit = /xendit\.co$/i.test(url.host) || /xendit\.co\./i.test(url.host)
  if (!isXendit) {
    record({
      step: 7,
      name: 'Invoice URL well-formed',
      status: 'fail',
      detail: `invoice_url host is not Xendit: ${url.host}`,
    })
    assert.fail('invoice_url not on Xendit domain')
    return
  }
  record({
    step: 7,
    name: 'Invoice URL well-formed',
    status: 'pass',
    detail: `host=${url.host}, path=${url.pathname}`,
  })
})

// ─── Step 8: /welcome reachable with cid (only runs if Step 5 succeeded) ─

test('Step 8: GET /welcome?cid=<cid> renders without 4xx/5xx', async () => {
  const cid = ctx.cid ?? 'unknown'
  if (!ctx.cid) {
    // Founder spec: hit it anyway with `&job=test` for the no-cid
    // legitimate-customer scenario. State E lost-cid recovery copy
    // should render.
    const r = await getHtml(`/welcome?cid=missing&job=test`)
    if (r.status !== 200) {
      record({ step: 8, name: 'Welcome page reachable', status: 'fail', detail: `HTTP ${r.status} on no-cid path` })
      assert.fail(`/welcome returned HTTP ${r.status}`)
      return
    }
    ctx.welcomeHtml = r.body
    record({
      step: 8,
      name: 'Welcome page reachable',
      status: 'pass',
      detail: `HTTP 200 with cid=missing (lost-cid recovery scenario), ${r.body.length} bytes`,
    })
    return
  }
  const r = await getHtml(`/welcome?cid=${encodeURIComponent(cid)}&job=test`)
  if (r.status !== 200) {
    record({ step: 8, name: 'Welcome page reachable', status: 'fail', detail: `HTTP ${r.status} with cid=${cid.slice(0, 8)}...` })
    assert.fail(`/welcome returned HTTP ${r.status}`)
    return
  }
  ctx.welcomeHtml = r.body
  record({
    step: 8,
    name: 'Welcome page reachable',
    status: 'pass',
    detail: `HTTP 200 with cid=${cid.slice(0, 8)}..., ${r.body.length} bytes`,
  })
})

// ─── Step 9: P3-CF-1 trust-signal accordion present in /welcome DOM ───

test('Step 9: /welcome contains P3-CF-1 "Apa yang sedang terjadi" accordion', async () => {
  if (!ctx.welcomeHtml) {
    record({ step: 9, name: 'P3 accordion in welcome DOM', status: 'fail', detail: 'SKIPPED — Step 8 did not load /welcome' })
    assert.fail('no welcome HTML to check')
    return
  }
  // PR #109 (Phase 3) added <details id="b-whats-happening">. Founder
  // spec calls this P3-CF-6 but the audit doc + PR ship it as P3-CF-1.
  // Both summary labels are acceptable — the audit-locked one is
  // "Apa yang sedang terjadi".
  const hasAccordionEl = /<details[^>]*id="b-whats-happening"/i.test(ctx.welcomeHtml)
  const hasSummaryText = /Apa yang sedang terjadi/i.test(ctx.welcomeHtml)
  if (!hasAccordionEl || !hasSummaryText) {
    record({
      step: 9,
      name: 'P3 accordion in welcome DOM',
      status: 'fail',
      detail:
        `<details id="b-whats-happening">: ${hasAccordionEl ? 'present' : 'MISSING'}\n` +
        `"Apa yang sedang terjadi" summary text: ${hasSummaryText ? 'present' : 'MISSING'}\n` +
        `(PR #109 Phase 3 may not be on the deployed alias)`,
    })
    assert.fail('P3 accordion missing from live /welcome')
    return
  }
  record({
    step: 9,
    name: 'P3 accordion in welcome DOM',
    status: 'pass',
    detail: 'Both <details id="b-whats-happening"> and "Apa yang sedang terjadi" summary present',
  })
})

// ─── Step 10: /checkout?error=failed reveals B2 failure banner ────────

test('Step 10: GET /checkout?plan=pro&error=failed reveals B2 failure banner', async () => {
  const r = await getHtml('/checkout?plan=pro&error=failed')
  ctx.failureCheckoutHtml = r.body
  if (r.status !== 200) {
    record({ step: 10, name: 'B2 failure banner reachable', status: 'fail', detail: `HTTP ${r.status}` })
    assert.fail(`/checkout?error=failed returned HTTP ${r.status}`)
    return
  }
  // Source-grep: the banner DIV always exists in the HTML; what
  // matters is the JS that flips `hidden=false` runs. Pure HTTP can't
  // see runtime DOM mutations, so we verify the markup + the trigger
  // function are both in the deployed source.
  const hasBannerEl = /id="xendit-failure-banner"/i.test(r.body)
  const hasRevealFn = /revealXenditFailureBannerIfNeeded/.test(r.body)
  const hasErrorFailedBranch = /errParam\s*!==\s*['"]failed['"]/.test(r.body)
  if (!hasBannerEl || !hasRevealFn || !hasErrorFailedBranch) {
    record({
      step: 10,
      name: 'B2 failure banner present',
      status: 'fail',
      detail:
        `<div id="xendit-failure-banner">: ${hasBannerEl ? 'present' : 'MISSING'}\n` +
        `revealXenditFailureBannerIfNeeded function: ${hasRevealFn ? 'present' : 'MISSING'}\n` +
        `if (errParam !== 'failed') return guard: ${hasErrorFailedBranch ? 'present' : 'MISSING'}\n` +
        `(PR #105 B2 may not be on the deployed alias)`,
    })
    assert.fail('B2 banner markup/JS missing on live deploy')
    return
  }
  record({
    step: 10,
    name: 'B2 failure banner present',
    status: 'pass',
    detail: 'Banner element, reveal fn, and ?error=failed branch all present in deployed source',
  })
})

// ─── Final summary block — always runs, even after fails ──────────────

test('SUMMARY', () => {
  const passed = findings.filter((f) => f.status === 'pass').length
  const failed = findings.filter((f) => f.status === 'fail').length
  // eslint-disable-next-line no-console
  console.log(`\n══════════════════════════════════════════════════`)
  // eslint-disable-next-line no-console
  console.log(`e2e smoke against ${PROD_BASE}`)
  // eslint-disable-next-line no-console
  console.log(`Sentinel email: ${SMOKE_EMAIL}`)
  // eslint-disable-next-line no-console
  console.log(`Passed: ${passed} / Failed: ${failed} / Total: ${findings.length}`)
  // eslint-disable-next-line no-console
  console.log(`══════════════════════════════════════════════════`)
})

// Export findings so a CI runner can read them off the harness.
export { findings, ctx, PROD_BASE, SMOKE_EMAIL }
