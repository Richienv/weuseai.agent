/**
 * Real-browser e2e for the checkout payment popup — the revenue funnel that
 * the 2026-06-14 audit flagged as UNTESTED. The existing
 * `checkout-calm-popup.spec.ts` is a pure source-grep gate; it can confirm the
 * #payModal markup EXISTS but cannot prove the popup actually OPENS, that
 * Enter-in-email does NOT silently fire create-invoice, that ArrowDown switches
 * method + keeps focus trapped, or that Confirm fires exactly ONE invoice call.
 * This file drives a headless Chrome through the full flow against the real
 * checkout.html, intercepting the network so no real Xendit invoice is ever
 * created.
 *
 * Design notes:
 *  - Playwright is resolved from the GLOBAL install at
 *    /opt/homebrew/lib/node_modules/playwright/index.mjs (the same path the
 *    orchestrator used) via a dynamic import() of the absolute file: URL —
 *    it is intentionally NOT a repo dependency (CLAUDE.md: "Don't add new
 *    packages without confirming with founder").
 *  - A tiny static http server serves the repo root so checkout.html loads
 *    over http:// (file:// would break the create-invoice fetch + history API).
 *  - Chrome is launched headless via channel 'chrome'.
 *  - The whole suite SKIPs cleanly (console.log a note + return) when Chrome /
 *    Playwright is unavailable, so CI without a browser never goes red.
 *
 * Runs under `tsx --test` (matches the repo's `npm test` runner).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { extname, normalize, join } from 'node:path'
import type { AddressInfo } from 'node:net'

// ── Repo root (this file lives in <root>/tests/) ──
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

// ── Resolve Playwright from the GLOBAL install (not a repo dep) ──
const GLOBAL_PLAYWRIGHT = 'file:///opt/homebrew/lib/node_modules/playwright/index.mjs'

// The Supabase Edge Function the checkout POSTs to. We never let this reach
// the network — it is intercepted + stubbed so no real invoice is created.
const CREATE_INVOICE_FRAGMENT = '/functions/v1/create-invoice'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
}

// Minimal, path-traversal-safe static file server rooted at the repo.
function startStaticServer(): Promise<{ server: Server; origin: string }> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      let pathname = decodeURIComponent(url.pathname)
      if (pathname === '/') pathname = '/index.html'
      // Block traversal outside the repo root.
      const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
      const filePath = join(REPO_ROOT, safe)
      if (!filePath.startsWith(REPO_ROOT)) {
        res.writeHead(403).end('forbidden')
        return
      }
      const body = await readFile(filePath)
      res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({ server, origin: `http://127.0.0.1:${port}` })
    })
  })
}

test('checkout payment popup — full flow in a real browser', async (t) => {
  // ── Resolve + launch the browser; SKIP cleanly if unavailable ──
  // Typed loosely (`any`) on purpose: playwright-core is a GLOBAL install, not
  // a repo dependency, so its type declarations aren't resolvable under the
  // project's `tsc` (and adding it as a dep is founder-locked per CLAUDE.md).
  // tsx strips types at runtime; the assertions below carry the real contract.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pw: any
  try {
    pw = await import(GLOBAL_PLAYWRIGHT)
  } catch (err) {
    console.log(
      `[checkout-popup.e2e] SKIP — Playwright not importable from ${GLOBAL_PLAYWRIGHT}: ` +
        `${(err as Error).message.split('\n')[0]}`,
    )
    t.skip('Playwright unavailable')
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any
  try {
    browser = await pw.chromium.launch({ headless: true, channel: 'chrome' })
  } catch (err) {
    console.log(
      `[checkout-popup.e2e] SKIP — headless Chrome could not launch ` +
        `(channel 'chrome'): ${(err as Error).message.split('\n')[0]}`,
    )
    t.skip('Chrome unavailable')
    return
  }

  const { server, origin } = await startStaticServer()

  // create-invoice interception bookkeeping (proves: zero fires on Enter,
  // exactly one fire on Confirm — and never a real invoice).
  let createInvoiceCalls = 0
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    // Collect console errors + uncaught page errors. Tailwind's CDN prints a
    // production WARNING (console.warn) — we deliberately only fail on
    // console.error + uncaught exceptions, so that benign warning is ignored.
    page.on('console', (msg: { type: () => string; text: () => string }) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err: Error) => {
      pageErrors.push(err.message)
    })

    // ── Network interception ──
    // 1. create-invoice → stub a success so confirm "succeeds" WITHOUT a real
    //    Xendit invoice. invoice_url points back at our static server so the
    //    post-confirm `window.location.href = data.invoice_url` redirect lands
    //    somewhere harmless instead of a real payment page.
    // 2. Any other off-origin request (Tailwind CDN, Google Fonts) → fulfilled
    //    with a benign empty 200 so the test is hermetic AND console-clean.
    //    (route.abort() would itself log "Failed to load resource: ERR_FAILED"
    //    console errors, defeating the zero-console-errors assertion — a
    //    stubbed empty success is what keeps the browser quiet.) Same-origin
    //    (our static server: checkout.html, assets/*) passes through.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await context.route('**/*', async (route: any) => {
      const reqUrl = route.request().url()
      if (reqUrl.includes(CREATE_INVOICE_FRAGMENT)) {
        createInvoiceCalls += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ invoice_url: `${origin}/checkout.html?paid=stub` }),
        })
        return
      }
      if (reqUrl.startsWith(origin)) {
        await route.continue()
        return
      }
      // Off-origin (fonts, tailwind cdn, analytics, favicons via abs URL):
      // fulfill with an empty 200 so nothing real is fetched and no
      // failed-load console error is emitted.
      await route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
    })

    await page.goto(`${origin}/checkout.html?plan=done-for-you`, { waitUntil: 'domcontentloaded' })
    // Let the DOMContentLoaded renderAll() settle. The method rows live inside
    // the hidden #payModal, so they are ATTACHED but not yet visible — wait on
    // attachment, not visibility (which only happens once the modal opens).
    await page.waitForSelector('#methodList .method-row-trigger', { state: 'attached' })

    // ───────────────────────────────────────────────────────────────────
    // (1) Correct package + a SINGLE "Total hari ini"
    // ───────────────────────────────────────────────────────────────────
    await t.test('renders the done-for-you package with one clean total', async () => {
      const planTitle = (await page.textContent('#planTitle'))?.trim()
      assert.equal(planTitle, 'Siap Pakai · setup', 'plan title reflects ?plan=done-for-you')

      const planSub = (await page.textContent('#planSub'))?.trim()
      assert.match(planSub || '', /8 persona/, 'plan sub describes the 8-persona done-for-you set')

      // Exactly one "Total hari ini" label on the page.
      const totalLabels = await page.locator('text=Total hari ini').count()
      assert.equal(totalLabels, 1, 'exactly one "Total hari ini" label')

      // Grand total is a real, non-empty Rupiah amount.
      const grand = (await page.textContent('#grandTotal'))?.trim() || ''
      assert.match(grand, /^Rp\s[\d.]+$/, `grand total is a formatted Rupiah amount (got "${grand}")`)
      // done-for-you: setup 1.299.000 + hosting 99.000 + QRIS 0.7% fee.
      assert.equal(grand, 'Rp 1.407.786', 'grand total = QRIS-default total for done-for-you')

      // No "Cicilan"/"BNPL" anywhere in the rendered page (founder lock).
      const bodyText = (await page.textContent('body')) || ''
      assert.equal(/cicilan|bnpl/i.test(bodyText), false, 'no Cicilan/BNPL in rendered page')
    })

    // ───────────────────────────────────────────────────────────────────
    // (2) Enter in email OPENS #payModal and does NOT fire create-invoice
    // ───────────────────────────────────────────────────────────────────
    await t.test('Enter in email opens the modal without firing create-invoice', async () => {
      // Fill the gating fields so validateBeforePay() passes (otherwise Enter
      // only surfaces a field error and never reaches the modal).
      await page.fill('#email', 'buyer@example.com')
      await page.check('#acceptTos')

      assert.equal(createInvoiceCalls, 0, 'no invoice call before any interaction')

      // Modal starts hidden.
      assert.equal(await page.locator('#payModal').isHidden(), true, '#payModal hidden initially')

      // Press Enter while focused in the lone email text field. This fires the
      // form's implicit-submission 'submit' event — the guard must open the
      // modal, NOT POST create-invoice.
      await page.focus('#email')
      await page.keyboard.press('Enter')

      await page.waitForSelector('#payModal:not([hidden])', { timeout: 3000 })
      assert.equal(await page.locator('#payModal').isVisible(), true, 'Enter opened #payModal')

      // The crux of the payment-integrity guard: Enter must NOT have fired the
      // create-invoice network call.
      assert.equal(createInvoiceCalls, 0, 'Enter in email must NOT fire create-invoice')
    })

    // ───────────────────────────────────────────────────────────────────
    // (3) Modal shows exactly QRIS / E-wallet / VA / Card (no cicilan/bnpl)
    // ───────────────────────────────────────────────────────────────────
    await t.test('modal lists exactly QRIS / E-wallet / VA / Card', async () => {
      const names: string[] = await page.locator('#methodList .method-name').allTextContents()
      const trimmed = names.map((n: string) => n.trim())
      assert.equal(trimmed.length, 4, 'exactly four payment methods')
      assert.deepEqual(
        trimmed,
        ['QRIS', 'E-wallet', 'Bank Transfer (VA)', 'Credit / Debit Card'],
        'methods are QRIS, E-wallet, VA, Card in order',
      )

      // role=radiogroup with 4 radios — accessibility scaffolding intact.
      assert.equal(
        await page.locator('#methodList[role="radiogroup"] [role="radio"]').count(),
        4,
        'radiogroup with four radios',
      )

      // No cicilan / bnpl / paylater anywhere in the modal.
      const modalText = (await page.textContent('#payModal')) || ''
      assert.equal(
        /cicilan|bnpl|paylater|pay later|kredivo|akulaku/i.test(modalText),
        false,
        'no installment / BNPL methods in the modal',
      )
    })

    // ───────────────────────────────────────────────────────────────────
    // (4) ArrowDown switches method + updates confirm total + keeps focus in modal
    // ───────────────────────────────────────────────────────────────────
    await t.test('ArrowDown switches method, updates confirm total, keeps focus trapped', async () => {
      // Default selected method is QRIS — confirm reflects it.
      const confirmBefore = (await page.textContent('#payModalConfirm'))?.trim() || ''
      assert.match(confirmBefore, /· QRIS$/, 'confirm button starts on QRIS')

      // Focus the selected (QRIS) radio, then ArrowDown → next method (E-wallet).
      await page.focus('#methodList .method-row.is-selected .method-row-trigger')
      await page.keyboard.press('ArrowDown')

      // The selected row updates to E-wallet.
      const selectedName = (
        await page.textContent('#methodList .method-row.is-selected .method-name')
      )?.trim()
      assert.equal(selectedName, 'E-wallet', 'ArrowDown moved selection QRIS → E-wallet')

      // Confirm total + method label updated.
      const confirmAfter = (await page.textContent('#payModalConfirm'))?.trim() || ''
      assert.match(confirmAfter, /· E-wallet$/, 'confirm button now reads E-wallet')
      assert.notEqual(confirmAfter, confirmBefore, 'confirm total changed with the method (QRIS 0.7% → E-wallet 2%)')

      // Focus stayed INSIDE the modal (on the newly-selected trigger) — the
      // re-render must not drop focus to <body>. Passed as a STRING body so the
      // project's tsc (no `dom` lib) never type-checks the browser globals.
      const focusInModal = await page.evaluate(
        `(() => {
          const modal = document.getElementById('payModal');
          return !!(modal && !modal.hidden && document.activeElement && modal.contains(document.activeElement));
        })()`,
      )
      assert.equal(focusInModal, true, 'focus remains inside the modal after ArrowDown re-render')

      // Still zero invoice calls — switching methods never bills.
      assert.equal(createInvoiceCalls, 0, 'switching method must not fire create-invoice')

      // Reset selection back to QRIS for a deterministic confirm assertion below.
      await page.keyboard.press('ArrowUp')
      const reset = (await page.textContent('#methodList .method-row.is-selected .method-name'))?.trim()
      assert.equal(reset, 'QRIS', 'ArrowUp wrapped selection back to QRIS')
    })

    // ───────────────────────────────────────────────────────────────────
    // (5) Confirm fires EXACTLY ONE create-invoice call (stubbed)
    // ───────────────────────────────────────────────────────────────────
    await t.test('clicking #payModalConfirm fires exactly one create-invoice call', async () => {
      assert.equal(createInvoiceCalls, 0, 'precondition: no invoice fired yet')

      // Capture the POST body so we can prove the chosen method/plan are sent —
      // and that it is a genuine create-invoice POST, not an accidental GET.
      const [invoiceRequest] = await Promise.all([
        page.waitForRequest((r: { url: () => string }) => r.url().includes(CREATE_INVOICE_FRAGMENT), {
          timeout: 5000,
        }),
        page.click('#payModalConfirm'),
      ])

      assert.equal(invoiceRequest.method(), 'POST', 'create-invoice is a POST')
      const payload = invoiceRequest.postDataJSON() as Record<string, unknown>
      assert.equal(payload.plan, 'done-for-you', 'POST carries the selected plan')
      assert.equal(payload.methodId, 'qris', 'POST carries the selected method (QRIS)')
      assert.equal(payload.email, 'buyer@example.com', 'POST carries the entered email')
      assert.ok(typeof payload.tos_accepted_at === 'string', 'POST carries a ToS-accepted timestamp')

      // The stub redirects to our harmless invoice_url. Wait for that nav so
      // any late duplicate POST would still be counted before we assert.
      await page.waitForURL(/paid=stub/, { timeout: 5000 })

      assert.equal(createInvoiceCalls, 1, 'EXACTLY one create-invoice call total')
    })

    // ───────────────────────────────────────────────────────────────────
    // (6) Zero console errors across the whole flow
    // ───────────────────────────────────────────────────────────────────
    await t.test('no console errors or uncaught page errors during the flow', () => {
      assert.deepEqual(
        consoleErrors,
        [],
        `expected zero console.error messages, got: ${JSON.stringify(consoleErrors)}`,
      )
      assert.deepEqual(
        pageErrors,
        [],
        `expected zero uncaught page errors, got: ${JSON.stringify(pageErrors)}`,
      )
    })
  } finally {
    await browser.close().catch(() => {})
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
