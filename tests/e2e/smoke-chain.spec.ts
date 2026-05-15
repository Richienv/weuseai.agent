/**
 * Phase F — fresh-customer chain smoke (8-min flow validation).
 *
 * Spec: docs/consulting/2026-05-14-handoff-to-new-agent.md §11.2.
 * Priority lock: feedback_8min_flow_priority_lock.md — "real Xendit
 * payment → fresh Vultr provision → Hermes install → BotFather
 * register → first /start response under 8 min, 3 consecutive runs."
 *
 * This harness walks the WHOLE post-payment chain end-to-end and
 * records per-stage wall-clock timing. Unlike the Phase D service
 * smoke (audits an EXISTING customer), Phase F provisions a FRESH
 * customer from a fresh Xendit invoice and tears it down at the end.
 *
 * ── TARGET MODES (founder local-first directive 2026-05-14) ──
 *
 *   E2E_CHAIN_TARGET=local (default)
 *     All five external systems mocked in-process. No network, no
 *     Docker, no real VPS. Simulated clock advances per stage so the
 *     timing-budget math is verifiable. This is the loop the harness
 *     CODE is developed against — `npm test` territory.
 *
 *   E2E_CHAIN_TARGET=deployed
 *     Real Xendit (TEST mode), real Vultr, real Supabase Edge
 *     Functions, real Fly provisioning, real Telegram Bot API, real
 *     SSH. This is what the 3 cascade-close runs use. Costs ~1 Vultr
 *     partial-hour per run (≈$0.01). Requires deployed-mode env (see
 *     below). Founder amended lock 2026-05-14: all 3 runs on Xendit
 *     test mode, spend 0.
 *
 * ── DEPLOYED-MODE ENV (only for E2E_CHAIN_TARGET=deployed) ──
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   XENDIT_WEBHOOK_TOKEN             — the x-callback-token shared
 *                                      secret; Stage 2 POSTs a
 *                                      synthetic invoice.paid event
 *                                      with it (Xendit has no
 *                                      server-side invoice-pay API)
 *   PROVISIONING_AUTH_TOKEN          — bearer for the Fly provisioning
 *                                      service /tear-down route (Stage 11)
 *   PROVISIONING_URL (optional)      — default weuseai-provisioning.fly.dev
 *   CHAIN_BOT_TOKEN                  — a fresh BotFather token for this
 *                                      run's customer (per §13.4 pool;
 *                                      one token per run, tear-down
 *                                      frees it for the next)
 *   CHAIN_BOT_CHAT_ID                — the Telegram chat that will
 *                                      send /start (founder's own
 *                                      chat works for the test)
 *   AUDIT_SSH_KEY_PATH (optional)    — default ~/.ssh/weuseai-fleet
 *
 *   NOTE: Vultr API is NOT called directly by the harness. VPS status
 *   (Stage 4) reads the vps_instances table; VPS-delete (Stage 11)
 *   goes through the provisioning service. The Vultr key is
 *   IP-allowlisted to the Fly machine, unreachable from dev/CI.
 *
 * ── THREE PRE-CODING ADJUSTMENTS (cascade brief 2026-05-15) ──
 *   1. Stage 5 budget reconciled vs handoff §8.6's measured 7:30
 *      setup-script wall-clock: bumped 4min → 6min (SSH-up → COMPLETE).
 *   2. Stages 9 + 10 budgets widened 30s → 60s for Telegram long-poll
 *      warm-up (getUpdates can lag on a freshly-started gateway).
 *   3. Orphan-VPS hygiene lives in scripts/orphan-vps-cleanup.mjs —
 *      a daily safety net for any run whose Stage 11 teardown didn't
 *      fire. Not part of this harness; referenced here for traceability.
 *
 * ── THE 8-MIN UNLOCK CRITERION ──
 *   The lock measures "first /start response" — that's the END of
 *   Stage 9. Stage 10 (persona-correct response) and Stage 11
 *   (teardown) are verification + cleanup BEYOND the 8-min budget.
 *   `unlockBudgetMs` below sums Stages 1–9 only.
 *
 * Run: npx tsx --test tests/e2e/smoke-chain.spec.ts
 *      (or `npm run smoke:chain:local` / `:deployed` once wired)
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

// ─── Configuration ────────────────────────────────────────────────────

const ENV_LOCAL = resolve(process.cwd(), '.env.local')
if (existsSync(ENV_LOCAL)) {
  for (const line of readFileSync(ENV_LOCAL, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const TARGET = (process.env.E2E_CHAIN_TARGET ?? 'local') as 'local' | 'deployed'
if (TARGET !== 'local' && TARGET !== 'deployed') {
  // eslint-disable-next-line no-console
  console.error(`FATAL: E2E_CHAIN_TARGET must be 'local' or 'deployed', got '${TARGET}'`)
  process.exit(2)
}

const SSH_KEY = process.env.AUDIT_SSH_KEY_PATH ?? resolve(homedir(), '.ssh/weuseai-fleet')
const CASCADE_LOG = resolve(process.cwd(), 'docs/cascades/2026-05-14-8min-flow-validation.md')

// ─── Per-stage timing budgets (milliseconds) ──────────────────────────
//
// Budgets are the per-stage CEILING. A stage that exceeds its budget
// still completes (we don't kill it) but is flagged `over_budget` in
// the report. The unlock verdict sums actual elapsed for Stages 1-9.

const STAGE_BUDGET_MS: Record<number, number> = {
  1: 5_000, // create Xendit test invoice
  2: 2_000, // simulate/observe paid webhook
  3: 30_000, // poll customers + subscriptions rows
  4: 120_000, // poll Vultr for VPS status=running
  5: 360_000, // SSH-up → setup-script COMPLETE (bumped 4→6min per §8.6)
  6: 30_000, // bundle-pull installed all tier personas
  7: 30_000, // systemctl is-active hermes-gateway
  8: 5_000, // Telegram getMe
  9: 60_000, // /start → first response (widened 30→60s)
  10: 60_000, // /<persona> hi → persona-correct response (widened 30→60s)
  11: 30_000, // teardown
}
// Stages 1-9 sum = the 8-min unlock budget.
const UNLOCK_BUDGET_MS = 8 * 60 * 1000

// ─── Finding tracker ──────────────────────────────────────────────────

type StageResult = {
  stage: number
  name: string
  status: 'pass' | 'fail' | 'skipped' | 'over_budget'
  elapsedMs: number
  budgetMs: number
  detail?: string
}
const results: StageResult[] = []

function record(r: StageResult) {
  results.push(r)
  const icon = r.status === 'pass' ? '✓' : r.status === 'over_budget' ? '⚠' : r.status === 'skipped' ? '·' : '✗'
  const t = `${(r.elapsedMs / 1000).toFixed(1)}s/${(r.budgetMs / 1000).toFixed(0)}s`
  // eslint-disable-next-line no-console
  console.log(`${icon} Stage ${r.stage} [${t}]: ${r.name}${r.detail ? '\n    ' + r.detail.replace(/\n/g, '\n    ') : ''}`)
}

// ─── Chain context (shared across stages) ─────────────────────────────

type ChainCtx = {
  runId: string
  email: string
  invoiceUrl?: string
  customerId?: string
  subscriptionId?: string
  vpsId?: string
  vpsIp?: string
  botToken?: string
  botChatId?: string
  startResponseText?: string
  personaResponseText?: string
}

// ─── External-system clients (mocked in local, real in deployed) ──────
//
// Each client is an interface. `makeLocalDeps()` returns canned
// in-process impls + a simulated clock; `makeDeployedDeps()` returns
// real network impls. The harness stage functions only see the
// interface, so the 11-stage orchestration is identical in both modes.

type ChainDeps = {
  /** Stage 1: create a (test-mode) Xendit invoice. create-invoice also
   *  creates the customer + (pending) subscription rows server-side, so
   *  it returns their ids — captured into ctx immediately so teardown
   *  can always reach them even if a later stage fails. */
  createInvoice(
    email: string,
  ): Promise<{ invoiceUrl: string; customerId: string; subscriptionId: string }>
  /** Stage 2: mark the test-mode invoice paid (deployed: POST a
   *  synthetic invoice.paid event to the xendit-webhook function) +
   *  return once that webhook has processed it. The arg is the
   *  subscription row id Stage 1 produced. */
  payInvoiceAndAwaitWebhook(subscriptionId: string): Promise<void>
  /** Stage 3: poll Supabase until the customer + subscription rows are
   *  committed + queryable. */
  pollCustomerRows(email: string): Promise<{ customerId: string; subscriptionId: string }>
  /** Stage 4: poll Vultr for the customer's VPS reaching status=running. */
  pollVpsRunning(customerId: string): Promise<{ vpsId: string; vpsIp: string }>
  /** Stage 5: SSH-poll until /var/log/weuseai-setup.log has the
   *  COMPLETE marker. */
  pollSetupComplete(vpsIp: string): Promise<void>
  /** Stage 6: confirm bundle-pull installed all tier personas. */
  checkBundlePull(vpsIp: string, expectedPersonaCount: number): Promise<number>
  /** Stage 7: confirm hermes-gateway systemd unit is active. */
  checkGatewayActive(vpsIp: string): Promise<void>
  /** Stage 8: Telegram getMe with the customer's bot token. */
  telegramGetMe(botToken: string): Promise<{ username: string }>
  /** Stage 9: send /start as the customer, poll for the bot's first reply. */
  sendStartAndAwaitReply(botToken: string, chatId: string): Promise<string>
  /** Stage 10: send /<persona> hi, poll for a persona-correct reply. */
  sendPersonaAndAwaitReply(botToken: string, chatId: string, slug: string): Promise<string>
  /** Stage 11: tear down — delete VPS, cancel subscription. Returns a
   *  human summary of what was actually torn down. */
  teardown(ctx: ChainCtx): Promise<string>
}

// ─── Local (mock) deps ────────────────────────────────────────────────
//
// Canned successes. A simulated-clock advances per stage so the
// reported timings are realistic-but-instant: the harness logic +
// budget math is exercised without burning real seconds.

function makeLocalDeps(simClock: { nowMs: number }): ChainDeps {
  // Simulated wall-clock advances: realistic durations the deployed
  // chain would take, so the local run produces a plausible timing
  // table for harness-shape verification.
  const SIM_ADVANCE_MS: Record<string, number> = {
    createInvoice: 1_200,
    payWebhook: 1_500,
    customerRows: 8_000,
    vpsRunning: 95_000, // ~1.5 min — Vultr provisions fast
    setupComplete: 270_000, // ~4.5 min SSH-up→COMPLETE (within 6min budget)
    bundlePull: 6_000,
    gatewayActive: 3_000,
    getMe: 800,
    startReply: 12_000,
    personaReply: 9_000,
    teardown: 7_000,
  }
  // Deterministic local ids from email so Stage 1 and Stage 3 agree.
  const localSlug = (email: string) => email.replace(/[^a-z0-9]/gi, '').slice(0, 12)
  return {
    async createInvoice(email) {
      simClock.nowMs += SIM_ADVANCE_MS.createInvoice
      const slug = localSlug(email)
      return {
        invoiceUrl: `https://checkout-staging.xendit.co/web/inv_local_${slug}`,
        customerId: `cust_local_${slug}`,
        subscriptionId: `sub_local_${slug}`,
      }
    },
    async payInvoiceAndAwaitWebhook() {
      simClock.nowMs += SIM_ADVANCE_MS.payWebhook
    },
    async pollCustomerRows(email) {
      simClock.nowMs += SIM_ADVANCE_MS.customerRows
      const slug = localSlug(email)
      return { customerId: `cust_local_${slug}`, subscriptionId: `sub_local_${slug}` }
    },
    async pollVpsRunning() {
      simClock.nowMs += SIM_ADVANCE_MS.vpsRunning
      return { vpsId: 'vultr-local-chain-uuid', vpsIp: '203.0.113.77' }
    },
    async pollSetupComplete() {
      simClock.nowMs += SIM_ADVANCE_MS.setupComplete
    },
    async checkBundlePull(_ip, expected) {
      simClock.nowMs += SIM_ADVANCE_MS.bundlePull
      return expected // local mock: all personas "installed"
    },
    async checkGatewayActive() {
      simClock.nowMs += SIM_ADVANCE_MS.gatewayActive
    },
    async telegramGetMe() {
      simClock.nowMs += SIM_ADVANCE_MS.getMe
      return { username: 'local_chain_bot' }
    },
    async sendStartAndAwaitReply() {
      simClock.nowMs += SIM_ADVANCE_MS.startReply
      return 'Pagi. Aku The Pro, pendamping kerja harian kamu. Beberapa yang bisa kita mulai sekarang: ...'
    },
    async sendPersonaAndAwaitReply() {
      simClock.nowMs += SIM_ADVANCE_MS.personaReply
      return 'The Pro di sini. Mau mulai dari mana hari ini?'
    },
    async teardown() {
      simClock.nowMs += SIM_ADVANCE_MS.teardown
      return 'local mock: VPS + subscription torn down'
    },
  }
}

// ─── Deployed (real) deps ─────────────────────────────────────────────
//
// Real network impls. Each throws a clear "MISSING DEPLOYED ENV"
// error if its required credential is absent, so a deployed run that
// can't actually run fails loudly at the first stage that needs the
// missing piece — not silently.

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    throw new Error(
      `MISSING DEPLOYED ENV: ${name} is required for E2E_CHAIN_TARGET=deployed. ` +
        `See the deployed-mode env list at the top of this file.`,
    )
  }
  return v
}

// ─── Stage 2 synthetic invoice.paid template (fidelity-locked) ────────
//
// Synthetic-payload-fidelity gate (Cowork consult 2026-05-15): Stage 2's
// synthetic POST must be shaped from a REAL Xendit body, NOT
// hand-fabricated from docs. This object is the verbatim field set +
// types captured 2026-05-15 from a real Xendit API response —
// `GET /v2/invoices/6a0570080168694c2c2d0ceb`, the founder's actual
// test-mode payment of 2026-05-14 (the `checkout-staging.xendit.co`
// invoice host confirms test mode). It caught a real bug: the earlier
// placeholder used `payment_method: 'QRIS'` — the real value is
// `QR_CODE` (QRIS is the `payment_channel`).
//
// Run-specific / PII fields (id, external_id, amounts, timestamps,
// email, metadata, redirect URLs) are placeholders here and overwritten
// per run in payInvoiceAndAwaitWebhook. Static non-PII fields keep their
// real captured values so the shape stays faithful.
const XENDIT_INVOICE_PAID_TEMPLATE = {
  id: '__OVERRIDDEN__',
  external_id: '__OVERRIDDEN__',
  user_id: '66e17f9406ff03bbe4dd4de1',
  payment_method: 'QR_CODE',
  status: 'PAID',
  merchant_name: 'Korean Rookies',
  merchant_profile_picture_url: 'https://du8nwjtfkinx.cloudfront.net/xendit.png',
  amount: 0,
  paid_amount: 0,
  paid_at: '__OVERRIDDEN__',
  payer_email: '__OVERRIDDEN__',
  description: 'weuseai.agent · Pro setup + bulan-1 hosting',
  expiry_date: '__OVERRIDDEN__',
  invoice_url: '__OVERRIDDEN__',
  available_banks: [] as unknown[],
  available_retail_outlets: [] as unknown[],
  available_ewallets: [] as unknown[],
  available_qr_codes: [{ qr_code_type: 'QRIS' }],
  available_direct_debits: [] as unknown[],
  available_paylaters: [] as unknown[],
  should_exclude_credit_card: true,
  should_send_email: false,
  success_redirect_url: '__OVERRIDDEN__',
  failure_redirect_url: '__OVERRIDDEN__',
  created: '__OVERRIDDEN__',
  updated: '__OVERRIDDEN__',
  currency: 'IDR',
  payment_channel: 'QRIS',
  fees: [{ type: 'ADMIN', value: 0 }],
  metadata: {} as Record<string, unknown>,
}

function makeDeployedDeps(): ChainDeps {
  const SUPABASE_URL = () => requireEnv('SUPABASE_URL')
  const SERVICE_KEY = () => requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  // Provisioning service — Stage 11 teardown routes VPS-delete through
  // POST /tear-down here, NOT a direct Vultr API call. Reason: the
  // Vultr API key is IP-allowlisted to the Fly machine, so the harness
  // (dev machine / CI) cannot call api.vultr.com directly. /tear-down
  // runs on Fly where the key IS allowlisted, and it both deletes the
  // VPS and updates the DB rows.
  const PROVISIONING_URL = () =>
    (process.env.PROVISIONING_URL ?? 'https://weuseai-provisioning.fly.dev').replace(/\/$/, '')
  const PROVISIONING_AUTH_TOKEN = () => requireEnv('PROVISIONING_AUTH_TOKEN')
  // Webhook shared secret — the same value Xendit puts in the
  // `x-callback-token` header and the xendit-webhook Edge Function
  // checks against. Stage 2 POSTs a synthetic invoice.paid event with
  // this token (see payInvoiceAndAwaitWebhook for why synthetic).
  const XENDIT_WEBHOOK_TOKEN = () => requireEnv('XENDIT_WEBHOOK_TOKEN')

  async function pgSelect(table: string, query: string): Promise<any[]> {
    const r = await fetch(`${SUPABASE_URL()}/rest/v1/${table}?${query}`, {
      headers: { apikey: SERVICE_KEY(), authorization: `Bearer ${SERVICE_KEY()}` },
    })
    if (!r.ok) throw new Error(`PostgREST ${table}: HTTP ${r.status}: ${await r.text()}`)
    return (await r.json()) as any[]
  }
  function ssh(host: string, cmd: string, timeoutSec = 20): { ok: boolean; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync(
        'ssh',
        ['-i', SSH_KEY, '-o', 'StrictHostKeyChecking=no', '-o', `ConnectTimeout=${timeoutSec}`, '-o', 'BatchMode=yes', `weuseai@${host}`, cmd],
        { encoding: 'utf8', timeout: (timeoutSec + 5) * 1000 },
      )
      return { ok: true, stdout, stderr: '' }
    } catch (e: any) {
      return { ok: false, stdout: e?.stdout?.toString?.() ?? '', stderr: e?.stderr?.toString?.() ?? String(e) }
    }
  }
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  return {
    async createInvoice(email) {
      // Xendit create-invoice via OUR Edge Function (exercises the real
      // path a customer hits): POST /functions/v1/create-invoice.
      const r = await fetch(`${SUPABASE_URL()}/functions/v1/create-invoice`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_KEY()}` },
        body: JSON.stringify({
          email,
          plan: 'pro',
          alwaysOn: false,
          methodId: 'qris',
          country: 'ID',
          postal: '',
          tos_accepted_at: new Date().toISOString(),
          marketing_opt_in_at: null,
          policy_version: 'v1.0',
        }),
      })
      const body = (await r.json().catch(() => ({}))) as {
        invoice_url?: string
        customer_id?: string
        subscription_id?: string
      }
      if (!r.ok || !body.invoice_url || !body.customer_id || !body.subscription_id) {
        throw new Error(`create-invoice failed: HTTP ${r.status} ${JSON.stringify(body).slice(0, 300)}`)
      }
      // create-invoice creates the customer + pending subscription rows
      // server-side; return their ids so Stage 1 can park them on ctx
      // (teardown then works even if a later stage fails).
      return {
        invoiceUrl: body.invoice_url,
        customerId: body.customer_id,
        subscriptionId: body.subscription_id,
      }
    },
    async payInvoiceAndAwaitWebhook(subscriptionId) {
      // Stage 2: mark the test-mode invoice paid + drive the
      // xendit-webhook Edge Function exactly as a real payment would.
      //
      // WHY SYNTHETIC (founder decision 2026-05-15): Xendit's v2 Invoice
      // API has NO server-side payment-simulation path — an invoice
      // never materializes a payable instrument until a human picks a
      // method on the hosted checkout page (probe proved it: invoice
      // `available_banks` carry only bank codes, no VA number;
      // pool_virtual_accounts/simulate_payment 400s for lack of a
      // `fullPaymentCode`). So Stage 2 POSTs a synthetic invoice.paid
      // event straight to our xendit-webhook function, with the real
      // `x-callback-token`. The ONLY thing this skips is Xendit's own
      // delivery hop — already the deferred gate the first real paying
      // customer validates (docs/consulting/2026-05-15-xendit-test-mode-
      // signature.md + CLAUDE.md). Everything downstream (provision →
      // install → Telegram) stays fully real.
      //
      // `subscriptionId` is the subscription row id Stage 1 produced.
      let xenditInvoiceId = ''
      let amountIdr = 0
      for (let i = 0; i < 8; i++) {
        const rows = await pgSelect(
          'subscription_invoices',
          `subscription_id=eq.${subscriptionId}&select=xendit_invoice_id,amount_idr&order=created_at.desc`,
        ).catch(() => [])
        if (rows[0]?.xendit_invoice_id) {
          xenditInvoiceId = rows[0].xendit_invoice_id
          amountIdr = Number(rows[0].amount_idr) || 0
          break
        }
        await sleep(1000)
      }
      if (!xenditInvoiceId) {
        throw new Error(`subscription ${subscriptionId} has no xendit_invoice_id yet`)
      }

      // Build the synthetic invoice.paid body from the fidelity-locked
      // real-capture template (XENDIT_INVOICE_PAID_TEMPLATE), overriding
      // only this run's id / amounts / timestamps / PII.
      const nowIso = new Date().toISOString()
      const syntheticEvent = {
        ...XENDIT_INVOICE_PAID_TEMPLATE,
        id: xenditInvoiceId,
        external_id: `sub_${subscriptionId}_smoke`,
        amount: amountIdr,
        paid_amount: amountIdr,
        paid_at: nowIso,
        created: nowIso,
        updated: nowIso,
        expiry_date: nowIso,
        payer_email: 'phasef-smoke@weuseai.test',
        invoice_url: `https://checkout-staging.xendit.co/web/${xenditInvoiceId}`,
        success_redirect_url: 'https://weuseai-agent.vercel.app/welcome',
        failure_redirect_url: 'https://weuseai-agent.vercel.app/checkout.html',
        metadata: {
          subscription_id: subscriptionId,
          plan: 'pro',
          always_on: false,
          kind: 'setup_first_month',
        },
      }

      // POST the synthetic invoice.paid event. The handler verifies the
      // x-callback-token, looks the subscription up by event.id, flips
      // it active, and (synchronously) kicks spin-up — so by the time
      // this returns 200 the DB row is already off 'pending'.
      const wr = await fetch(`${SUPABASE_URL()}/functions/v1/xendit-webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-callback-token': XENDIT_WEBHOOK_TOKEN(),
        },
        body: JSON.stringify(syntheticEvent),
      })
      const wbody = (await wr.json().catch(() => ({}))) as { ok?: boolean; ignored?: string }
      if (!wr.ok) {
        throw new Error(`xendit-webhook rejected synthetic event: HTTP ${wr.status} ${JSON.stringify(wbody)}`)
      }
      if (wbody.ignored === 'unknown_invoice') {
        throw new Error(
          `xendit-webhook could not match invoice ${xenditInvoiceId} to a subscription ` +
            `(ignored:unknown_invoice) — the synthetic event id is wrong`,
        )
      }

      // Confirm the row left 'pending' (→ 'active', or 'pending_provision'
      // if spin-up later fails). That transition is our processed proof.
      for (let i = 0; i < 15; i++) {
        const rows = await pgSelect(
          'subscriptions',
          `id=eq.${subscriptionId}&select=status`,
        ).catch(() => [])
        const status = rows[0]?.status
        if (status && status !== 'pending') return
        await sleep(2000)
      }
      throw new Error('xendit-webhook did not flip the subscription off "pending" within 30s')
    },
    async pollCustomerRows(email) {
      // Two sequential queries — PostgREST `in.()` does NOT accept a SQL
      // subquery (it takes a literal value list), so look the customer
      // up first, then filter subscriptions by customer_id=eq.
      for (let i = 0; i < 15; i++) {
        const customers = await pgSelect(
          'customers',
          `email=eq.${encodeURIComponent(email)}&select=id`,
        ).catch(() => [])
        const customerId = customers[0]?.id
        if (customerId) {
          const subs = await pgSelect(
            'subscriptions',
            `customer_id=eq.${customerId}&select=id,status&order=started_at.desc`,
          ).catch(() => [])
          if (subs.length) {
            return { customerId, subscriptionId: subs[0].id }
          }
        }
        await sleep(2000)
      }
      throw new Error('customer/subscription rows did not appear within 30s')
    },
    async pollVpsRunning(customerId) {
      for (let i = 0; i < 60; i++) {
        const rows = await pgSelect(
          'vps_instances',
          `customer_id=eq.${customerId}&select=vps_id,ip_address,status&order=created_at.desc`,
        ).catch(() => [])
        const running = rows.find((r) => r.status === 'running' && r.ip_address)
        if (running) return { vpsId: running.vps_id, vpsIp: running.ip_address }
        await sleep(2000)
      }
      // VPS status is read from the vps_instances table (written by the
      // provisioning service). We do NOT cross-check Vultr directly —
      // the Vultr API key is IP-allowlisted to the Fly machine and the
      // harness cannot reach it. The DB row IS the provisioning
      // service's source of truth for status.
      throw new Error('VPS did not reach status=running within 120s')
    },
    async pollSetupComplete(vpsIp) {
      for (let i = 0; i < 72; i++) {
        const r = ssh(vpsIp, "sudo tail -3 /var/log/weuseai-setup.log 2>&1 | tr -d '\\r'")
        if (r.ok && /weuseai setup COMPLETE/i.test(r.stdout)) return
        await sleep(5000)
      }
      throw new Error('setup-script COMPLETE marker not found within 6min')
    },
    async checkBundlePull(vpsIp, expected) {
      const r = ssh(vpsIp, "sudo grep -c 'Bundle install complete' /var/log/weuseai-bundle-pull.log 2>&1 || echo 0")
      const n = parseInt((r.stdout || '0').trim(), 10) || 0
      if (n < expected) {
        throw new Error(`bundle-pull installed ${n}/${expected} personas`)
      }
      return n
    },
    async checkGatewayActive(vpsIp) {
      const r = ssh(vpsIp, 'systemctl is-active hermes-gateway 2>&1')
      if (!/(^|\n)active\b/.test(r.stdout)) {
        throw new Error(`hermes-gateway not active: ${r.stdout.trim().slice(0, 200)}`)
      }
    },
    async telegramGetMe(botToken) {
      const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
      const body = (await r.json().catch(() => ({}))) as any
      if (!r.ok || !body.ok) throw new Error(`getMe failed: ${JSON.stringify(body).slice(0, 200)}`)
      return { username: body.result?.username ?? 'unknown' }
    },
    async sendStartAndAwaitReply(botToken, chatId) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: '/start' }),
      })
      for (let i = 0; i < 30; i++) {
        await sleep(2000)
        const r = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=-1`)
        const body = (await r.json().catch(() => ({}))) as any
        const msg = body.result?.[body.result.length - 1]?.message
        if (msg && String(msg.chat?.id) === String(chatId) && msg.text && !/^\//.test(msg.text)) {
          return msg.text as string
        }
      }
      throw new Error('no bot reply to /start within 60s')
    },
    async sendPersonaAndAwaitReply(botToken, chatId, slug) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `/${slug} hi` }),
      })
      for (let i = 0; i < 30; i++) {
        await sleep(2000)
        const r = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=-1`)
        const body = (await r.json().catch(() => ({}))) as any
        const msg = body.result?.[body.result.length - 1]?.message
        if (msg && String(msg.chat?.id) === String(chatId) && msg.text && !/^\//.test(msg.text)) {
          return msg.text as string
        }
      }
      throw new Error(`no bot reply to /${slug} within 60s`)
    },
    async teardown(ctx) {
      // Best-effort cleanup. Each step independent — a failure in one
      // doesn't block the others. If something here leaks, the daily
      // scripts/orphan-vps-cleanup.mjs is the catch-all.
      const errors: string[] = []
      const done: string[] = []
      // VPS-delete routes through the provisioning service's /tear-down
      // (Fly has the IP-allowlisted Vultr key; the harness does not).
      // /tear-down also updates the vps_instances row.
      if (ctx.customerId) {
        try {
          const r = await fetch(`${PROVISIONING_URL()}/tear-down`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${PROVISIONING_AUTH_TOKEN()}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ customerId: ctx.customerId }),
          })
          if (!r.ok) errors.push(`tear-down: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
          else done.push('VPS torn down')
        } catch (e) {
          errors.push(`tear-down: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      // Mark the subscription canceled so the test customer doesn't
      // linger as "active" (tear-down handles the VPS, not billing state).
      if (ctx.subscriptionId) {
        try {
          const r = await fetch(`${SUPABASE_URL()}/rest/v1/subscriptions?id=eq.${ctx.subscriptionId}`, {
            method: 'PATCH',
            headers: {
              apikey: SERVICE_KEY(),
              authorization: `Bearer ${SERVICE_KEY()}`,
              'content-type': 'application/json',
              prefer: 'return=minimal',
            },
            body: JSON.stringify({ status: 'canceled', hosting_active: false }),
          })
          if (!r.ok) errors.push(`sub cancel: HTTP ${r.status}`)
          else done.push('subscription canceled')
        } catch (e) {
          errors.push(`sub cancel: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      if (errors.length) throw new Error(errors.join('; '))
      return done.length ? done.join(' + ') : 'nothing to tear down (no customer/subscription id on ctx)'
    },
  }
}

// ─── Stage definitions ────────────────────────────────────────────────

type Stage = {
  num: number
  name: string
  run: (ctx: ChainCtx, deps: ChainDeps) => Promise<string | void>
}

const STAGES: Stage[] = [
  {
    num: 1,
    name: 'Create Xendit test invoice',
    async run(ctx, deps) {
      const { invoiceUrl, customerId, subscriptionId } = await deps.createInvoice(ctx.email)
      ctx.invoiceUrl = invoiceUrl
      // Park the ids on ctx NOW — teardown then has a customerId even if
      // a stage between here and Stage 3 fails (run #1 leaked a VPS
      // exactly because customerId was only set in Stage 3).
      ctx.customerId = customerId
      ctx.subscriptionId = subscriptionId
      return `customer=${customerId} subscription=${subscriptionId} url=${invoiceUrl}`
    },
  },
  {
    num: 2,
    name: 'Pay invoice + webhook delivered',
    async run(ctx, deps) {
      await deps.payInvoiceAndAwaitWebhook(ctx.subscriptionId!)
      return 'xendit-webhook processed PAID'
    },
  },
  {
    num: 3,
    name: 'Customer + subscription rows created',
    async run(ctx, deps) {
      const { customerId, subscriptionId } = await deps.pollCustomerRows(ctx.email)
      ctx.customerId = customerId
      ctx.subscriptionId = subscriptionId
      return `customer=${customerId} subscription=${subscriptionId}`
    },
  },
  {
    num: 4,
    name: 'VPS provisioned (status=running)',
    async run(ctx, deps) {
      const { vpsId, vpsIp } = await deps.pollVpsRunning(ctx.customerId!)
      ctx.vpsId = vpsId
      ctx.vpsIp = vpsIp
      return `vps=${vpsId} ip=${vpsIp}`
    },
  },
  {
    num: 5,
    name: 'setup-script COMPLETE marker',
    async run(ctx, deps) {
      await deps.pollSetupComplete(ctx.vpsIp!)
      return 'weuseai-setup.log shows COMPLETE'
    },
  },
  {
    num: 6,
    name: 'bundle-pull installed all tier personas',
    async run(ctx, deps) {
      // Pro tier = 8 personas.
      const n = await deps.checkBundlePull(ctx.vpsIp!, 8)
      return `${n}/8 personas installed`
    },
  },
  {
    num: 7,
    name: 'hermes-gateway active',
    async run(ctx, deps) {
      await deps.checkGatewayActive(ctx.vpsIp!)
      return 'systemctl is-active = active'
    },
  },
  {
    num: 8,
    name: 'Telegram getMe',
    async run(ctx, deps) {
      const { username } = await deps.telegramGetMe(ctx.botToken!)
      return `bot @${username} reachable`
    },
  },
  {
    num: 9,
    name: '/start → first response',
    async run(ctx, deps) {
      const reply = await deps.sendStartAndAwaitReply(ctx.botToken!, ctx.botChatId!)
      ctx.startResponseText = reply
      return `reply: "${reply.slice(0, 80)}..."`
    },
  },
  {
    num: 10,
    name: '/<persona> → persona-correct response',
    async run(ctx, deps) {
      const reply = await deps.sendPersonaAndAwaitReply(ctx.botToken!, ctx.botChatId!, 'the-pro')
      ctx.personaResponseText = reply
      return `reply: "${reply.slice(0, 80)}..."`
    },
  },
  {
    num: 11,
    name: 'Teardown (delete VPS, cancel sub)',
    async run(ctx, deps) {
      return await deps.teardown(ctx)
    },
  },
]

// ─── The chain run ────────────────────────────────────────────────────

test('Phase F: fresh-customer chain', async () => {
  const runId = `${TARGET}-${Date.now()}`
  const ctx: ChainCtx = {
    runId,
    email: `e2e-chain-${Date.now()}@weuseai.test`,
    botToken: process.env.CHAIN_BOT_TOKEN,
    botChatId: process.env.CHAIN_BOT_CHAT_ID,
  }

  const simClock = { nowMs: 0 }
  const deps = TARGET === 'local' ? makeLocalDeps(simClock) : makeDeployedDeps()
  const now = () => (TARGET === 'local' ? simClock.nowMs : Date.now())

  // eslint-disable-next-line no-console
  console.log(`\n══ Phase F chain — target=${TARGET} runId=${runId} ══`)
  // eslint-disable-next-line no-console
  console.log(`email=${ctx.email}\n`)

  let firstFailedStage: number | null = null

  // Stages 1-10 run in sequence; first failure stops the rest.
  // Stage 11 (teardown) ALWAYS runs via the finally below.
  try {
    for (const s of STAGES.slice(0, 10)) {
      const budgetMs = STAGE_BUDGET_MS[s.num]
      if (firstFailedStage !== null) {
        record({ stage: s.num, name: s.name, status: 'skipped', elapsedMs: 0, budgetMs, detail: `skipped — Stage ${firstFailedStage} failed first` })
        continue
      }
      const startMs = now()
      try {
        const detail = await s.run(ctx, deps)
        const elapsedMs = now() - startMs
        record({
          stage: s.num,
          name: s.name,
          status: elapsedMs > budgetMs ? 'over_budget' : 'pass',
          elapsedMs,
          budgetMs,
          detail: typeof detail === 'string' ? detail : undefined,
        })
      } catch (e) {
        const elapsedMs = now() - startMs
        firstFailedStage = s.num
        record({
          stage: s.num,
          name: s.name,
          status: 'fail',
          elapsedMs,
          budgetMs,
          detail: e instanceof Error ? e.message : String(e),
        })
      }
    }
  } finally {
    // Stage 11 — teardown. Runs no matter what stages 1-10 did.
    const s = STAGES[10]
    const budgetMs = STAGE_BUDGET_MS[11]
    const startMs = now()
    try {
      const detail = await s.run(ctx, deps)
      const elapsedMs = now() - startMs
      record({ stage: 11, name: s.name, status: elapsedMs > budgetMs ? 'over_budget' : 'pass', elapsedMs, budgetMs, detail: typeof detail === 'string' ? detail : undefined })
    } catch (e) {
      const elapsedMs = now() - startMs
      record({ stage: 11, name: s.name, status: 'fail', elapsedMs, budgetMs, detail: e instanceof Error ? e.message : String(e) })
    }
  }

  // ─── Verdict ──
  // Unlock criterion: Stages 1-9 all pass AND their summed elapsed
  // time is under the 8-min budget.
  const stages1to9 = results.filter((r) => r.stage >= 1 && r.stage <= 9)
  const all1to9Pass = stages1to9.length === 9 && stages1to9.every((r) => r.status === 'pass' || r.status === 'over_budget')
  const chainTimeMs = stages1to9.reduce((sum, r) => sum + r.elapsedMs, 0)
  const underBudget = chainTimeMs <= UNLOCK_BUDGET_MS

  // eslint-disable-next-line no-console
  console.log(`\n══════════════════════════════════════════════════`)
  // eslint-disable-next-line no-console
  console.log(`Phase F chain — target=${TARGET} runId=${runId}`)
  // eslint-disable-next-line no-console
  console.log(`Stages 1-9 all pass: ${all1to9Pass ? 'YES' : 'NO'}`)
  // eslint-disable-next-line no-console
  console.log(`Chain time (Stages 1-9): ${(chainTimeMs / 1000 / 60).toFixed(2)} min  (budget 8.00 min → ${underBudget ? 'UNDER' : 'OVER'})`)
  // eslint-disable-next-line no-console
  console.log(`Unlock-eligible run: ${all1to9Pass && underBudget ? 'YES' : 'NO'}`)
  // eslint-disable-next-line no-console
  console.log(`══════════════════════════════════════════════════`)

  // Append to the cascade log (founder directive h) — DEPLOYED runs
  // only. Local runs are harness self-tests and must not pollute the
  // record of the 3 real unlock runs.
  if (TARGET === 'deployed') {
    try {
      appendRunToCascadeLog(runId, ctx, all1to9Pass, chainTimeMs, underBudget)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`(cascade-log append skipped: ${e instanceof Error ? e.message : String(e)})`)
    }
  }

  // The test ASSERTION: in local mode the chain must be structurally
  // sound (all stages pass — proves the harness orchestration). In
  // deployed mode we still assert, but the founder reviews the timing
  // breakdown regardless of pass/fail (run #1 is a data point).
  if (TARGET === 'local') {
    assert.ok(all1to9Pass, 'local chain must pass all stages 1-9 (harness self-test)')
    assert.ok(results.find((r) => r.stage === 11)?.status === 'pass', 'teardown must run + pass in local mode')
  } else {
    // Deployed: surface the verdict but don't hard-fail the process —
    // the cascade-close logic (3 consecutive under-budget runs) is
    // evaluated by the founder + the cascade log, not by a single
    // test exit code.
    if (!all1to9Pass) {
      // eslint-disable-next-line no-console
      console.log(`\n⚠ Deployed run did NOT pass all stages. First failure: Stage ${firstFailedStage}.`)
    }
  }
})

// ─── Cascade log appender ─────────────────────────────────────────────

function appendRunToCascadeLog(
  runId: string,
  ctx: ChainCtx,
  allPass: boolean,
  chainTimeMs: number,
  underBudget: boolean,
): void {
  const ts = new Date().toISOString()
  const rows = results
    .map((r) => `| ${r.stage} | ${r.name} | ${(r.elapsedMs / 1000).toFixed(1)}s | ${(r.budgetMs / 1000).toFixed(0)}s | ${r.status} |`)
    .join('\n')
  const block = [
    ``,
    `### Run \`${runId}\` — ${ts}`,
    ``,
    `- target: \`${TARGET}\``,
    `- email: \`${ctx.email}\``,
    `- customer: \`${ctx.customerId ?? '—'}\` · subscription: \`${ctx.subscriptionId ?? '—'}\` · vps: \`${ctx.vpsId ?? '—'}\``,
    `- Stages 1-9 all pass: **${allPass ? 'YES' : 'NO'}**`,
    `- chain time (Stages 1-9): **${(chainTimeMs / 1000 / 60).toFixed(2)} min** (budget 8.00 min → ${underBudget ? 'UNDER' : 'OVER'})`,
    `- unlock-eligible: **${allPass && underBudget ? 'YES' : 'NO'}**`,
    ``,
    `| Stage | Name | Elapsed | Budget | Status |`,
    `|---|---|---|---|---|`,
    rows,
    ``,
  ].join('\n')
  if (existsSync(CASCADE_LOG)) {
    appendFileSync(CASCADE_LOG, block)
  }
}

export { STAGES, STAGE_BUDGET_MS, UNLOCK_BUDGET_MS }
