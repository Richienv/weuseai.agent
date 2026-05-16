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
 *   E2E_CHAIN_HOLD_VPS=1 (optional, deployed only)
 *     Skips Stage 11 teardown — leaves the VPS + bot UP so the founder
 *     can do the manual /start confirmation against the live agent.
 *     The held VPS MUST be torn down by hand afterwards (POST
 *     /tear-down with the customerId the run reports).
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
 *   PAIR_WEBHOOK_SECRET             — X-Telegram-Bot-Api-Secret-Token for
 *                                      pair-customer-bot-webhook; Stage
 *                                      5.7 POSTs a synthetic /pair update
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

// ─── Fast-customer-race variant (wait-page race fix, 2026-05-16) ──────
//
// E2E_CHAIN_FAST_CUSTOMER=1 exercises THE race that the wait-page stuck
// bug came from: a customer who finishes the onboarding form BEFORE
// their VPS setup-script finishes provisioning. In this mode the chain
// is re-ordered so complete-onboarding (Stage 5.8) runs while the VPS
// is still 'provisioning' — complete-onboarding must then DEFER
// refreshEnv (return waiting_for_vps:true) instead of SSHing a
// half-built VPS and tripping `exit 4`. The provisioning service's
// second-finisher (customer-flow.ts notifyVpsReady → admin-customer-vps-
// refresh) starts hermes-gateway once the setup-script completes; the
// new Stage 5.85 polls until the gateway comes up, proving the
// second-finisher closed the loop.
//
// Normal-order runs (flag unset) keep the original stage sequence and
// the strict auto-greet assertion — unchanged.
const FAST_CUSTOMER = process.env.E2E_CHAIN_FAST_CUSTOMER === '1'

const chainSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ─── Per-stage timing budgets (milliseconds) ──────────────────────────
//
// Budgets are the per-stage CEILING. A stage that exceeds its budget
// still completes (we don't kill it) but is flagged `over_budget` in
// the report. The unlock verdict sums actual elapsed for Stages 1-9.

// Budgets — RELAXED per founder priority reframe 2026-05-15: reliability
// over speed. ~20% slack on every stage vs §8.6 measured values. A clean
// 12-13 min run is a PASS; a fast run that fails a stage is a FAIL.
const STAGE_BUDGET_MS: Record<number, number> = {
  1: 5_000, // create Xendit test invoice
  2: 10_000, // synthetic webhook + synchronous spin-up kick (widened 6.5→10s)
  3: 5_000, // poll customers + subscriptions rows
  4: 120_000, // poll vps_instances for ip_address present (VM booted)
  5: 480_000, // poll vps_instances for status=running (setup-script done — widened 360→480s)
  5.5: 10_000, // validate-bot-token (getMe + setWebhook + persist)
  5.6: 5_000, // rotate-pairing-code
  5.7: 5_000, // synthetic /pair POST → telegram_chat_id set
  5.8: 60_000, // complete-onboarding → refreshEnv → gateway restart + bundle-pull
  5.85: 180_000, // FAST_CUSTOMER only — second-finisher SSH refresh starts gateway
  5.9: 10_000, // auto-greet — proactive greeting fired by complete-onboarding step 8c
  6: 60_000, // bundle-pull installed all tier personas (widened 30→60s)
  7: 60_000, // systemctl is-active hermes-gateway (widened 30→60s)
  8: 10_000, // Telegram getMe (widened 5→10s)
  9: 90_000, // /start → first response (widened 60→90s)
  10: 90_000, // /<persona> hi → persona-correct response (widened 60→90s)
  11: 30_000, // teardown
}
// Relaxed completion ceiling — Phase F passes a run that finishes the
// Stages 1-9 flow (payment → first /start response) under 15 min AND
// has every stage clean. Reliability over tightness.
const UNLOCK_BUDGET_MS = 15 * 60 * 1000

// ─── Finding tracker ──────────────────────────────────────────────────

type StageResult = {
  stage: number
  name: string
  // `manual` = a stage the harness deliberately does NOT automate (the
  // /start + persona replies need a real Telegram USER account, which a
  // bot token can't be). It is NOT a failure — the founder confirms it
  // by hand, exactly as the unlock criterion already requires.
  status: 'pass' | 'fail' | 'skipped' | 'over_budget' | 'manual'
  elapsedMs: number
  budgetMs: number
  detail?: string
}
const results: StageResult[] = []

function record(r: StageResult) {
  results.push(r)
  const icon =
    r.status === 'pass' ? '✓'
    : r.status === 'over_budget' ? '⚠'
    : r.status === 'skipped' ? '·'
    : r.status === 'manual' ? '⊙'
    : '✗'
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
  pairingCode?: string
  greetingOk?: boolean
  greetingSource?: string
  /** Wait-page race fix (2026-05-16): set by Stage 5.8 from the
   *  complete-onboarding response. true ⇒ refreshEnv was deferred
   *  because the VPS was still provisioning (the FAST_CUSTOMER race);
   *  the provisioning second-finisher will start the gateway. */
  waitingForVps?: boolean
}

// ─── External-system clients (mocked in local, real in deployed) ──────
//
// Each client is an interface. `makeLocalDeps()` returns canned
// in-process impls + a simulated clock; `makeDeployedDeps()` returns
// real network impls. The harness stage functions only see the
// interface, so the stage orchestration is identical in both modes.

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
  /** Stage 4: poll vps_instances until ip_address is set — i.e. the VM
   *  has booted and Vultr assigned an IP. (status='running' is NOT used
   *  here: the provisioning service only sets that after the whole
   *  setup-script finishes — that's Stage 5's signal.) */
  pollVpsHasIp(customerId: string): Promise<{ vpsId: string; vpsIp: string }>
  /** Stage 5: poll vps_instances until status='running' — the
   *  provisioning service sets that the moment the SSH setup-script
   *  exits 0 (customer-flow.ts). Bails immediately on status='failed'. */
  pollSetupComplete(customerId: string): Promise<void>
  /** Stage 5.5: validate-bot-token — Telegram getMe, set the bot's
   *  webhook, persist the encrypted token on the customer row. */
  validateBotToken(customerId: string, botToken: string): Promise<void>
  /** Stage 5.6: rotate-pairing-code — mint the 6-digit pairing code. */
  rotatePairingCode(customerId: string): Promise<string>
  /** Stage 5.7: POST a synthetic `/pair <code>` update to
   *  pair-customer-bot-webhook (real handler, real code match) — sets
   *  customers.telegram_chat_id. */
  submitPairingCode(customerId: string, code: string, chatId: string): Promise<void>
  /** Stage 5.8: complete-onboarding — renders SOUL.md + refreshEnv,
   *  which restarts hermes-gateway WITH the bot token; the gateway's
   *  ExecStartPre then runs bundle-pull. Returns the proactive-greeting
   *  outcome (step 8c) so Stage 5.9 can verify the auto-greet fired, and
   *  `waitingForVps` (wait-page race fix 2026-05-16) — true when
   *  refreshEnv was deferred because the VPS was still provisioning. */
  completeOnboarding(
    customerId: string,
  ): Promise<{ greetingOk: boolean; greetingSource: string; waitingForVps: boolean }>
  /** Stage 6: confirm bundle-pull installed all tier personas. */
  checkBundlePull(vpsIp: string, expectedPersonaCount: number): Promise<number>
  /** Stage 7: confirm hermes-gateway systemd unit is active. */
  checkGatewayActive(vpsIp: string): Promise<void>
  /** Stage 8: Telegram getMe with the customer's bot token. */
  telegramGetMe(botToken: string): Promise<{ username: string }>
  /** Stage 5.9 (FAST_CUSTOMER only — Bug-1 fix 2026-05-16): in the fast
   *  race the proactive greeting is delivered by the provisioning
   *  second-finisher, not by complete-onboarding's response. Confirm it
   *  landed by checking customers.greeting_sent_at is non-null. Polls
   *  internally so it tolerates the second-finisher finishing slightly
   *  after the gateway goes active. */
  checkGreetingSent(customerId: string): Promise<boolean>
  // Stages 9 + 10 (/start + /<persona> replies) are `manual` — not in
  // this interface. They need a real Telegram user account; the founder
  // confirms them by hand.
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
    payWebhook: 6_000, // synthetic webhook + synchronous spin-up kick
    customerRows: 3_000, // corrected two-query lookup — sub-second + poll slack
    vpsRunning: 95_000, // ~1.5 min — Vultr provisions fast
    setupComplete: 270_000, // ~4.5 min SSH-up→COMPLETE (within 6min budget)
    validateBotToken: 4_000,
    rotatePairingCode: 1_000,
    submitPairingCode: 1_000,
    completeOnboarding: 35_000, // refreshEnv SSH + gateway restart + bundle-pull
    bundlePull: 6_000,
    gatewayActive: 3_000,
    getMe: 800,
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
    async pollVpsHasIp() {
      simClock.nowMs += SIM_ADVANCE_MS.vpsRunning
      return { vpsId: 'vultr-local-chain-uuid', vpsIp: '203.0.113.77' }
    },
    async pollSetupComplete() {
      simClock.nowMs += SIM_ADVANCE_MS.setupComplete
    },
    async validateBotToken() {
      simClock.nowMs += SIM_ADVANCE_MS.validateBotToken
    },
    async rotatePairingCode() {
      simClock.nowMs += SIM_ADVANCE_MS.rotatePairingCode
      return '123456'
    },
    async submitPairingCode() {
      simClock.nowMs += SIM_ADVANCE_MS.submitPairingCode
    },
    async completeOnboarding() {
      simClock.nowMs += SIM_ADVANCE_MS.completeOnboarding
      // FAST_CUSTOMER local sim: the VPS is still 'provisioning' when
      // the form lands, so complete-onboarding defers refreshEnv +
      // the greeting (the provisioning second-finisher + /start skill
      // cover the customer). Normal order: refreshEnv runs, greeting
      // fires inline.
      if (FAST_CUSTOMER) {
        return { greetingOk: false, greetingSource: 'deferred_vps', waitingForVps: true }
      }
      return { greetingOk: true, greetingSource: 'template', waitingForVps: false }
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
    async checkGreetingSent() {
      // Local mock: the second-finisher always greets in the sim.
      return true
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
  // Pairing webhook shared secret — the `X-Telegram-Bot-Api-Secret-Token`
  // the pair-customer-bot-webhook function validates. Stage 5.7 POSTs a
  // synthetic `/pair` update with it.
  const PAIR_WEBHOOK_SECRET = () => requireEnv('PAIR_WEBHOOK_SECRET')

  async function pgSelect(table: string, query: string): Promise<any[]> {
    const r = await fetch(`${SUPABASE_URL()}/rest/v1/${table}?${query}`, {
      headers: { apikey: SERVICE_KEY(), authorization: `Bearer ${SERVICE_KEY()}` },
    })
    if (!r.ok) throw new Error(`PostgREST ${table}: HTTP ${r.status}: ${await r.text()}`)
    return (await r.json()) as any[]
  }
  function ssh(host: string, cmd: string, timeoutSec = 20): { ok: boolean; stdout: string; stderr: string } {
    try {
      // UserKnownHostsFile=/dev/null is REQUIRED, not optional: Vultr
      // recycles public IPs across runs (every run #1 attempt landed on
      // 45.77.43.11), and each fresh VPS has a different SSH host key.
      // With the shared ~/.ssh/known_hosts, run N+1 hits a CHANGED-key
      // mismatch — which StrictHostKeyChecking=no does NOT bypass: ssh
      // prints the MITM warning, disables some auth, and the connection
      // becomes flaky (run deployed-1778834122615: Stage 6 squeaked
      // through, Stage 7 got "Connection closed by host"). Pinning the
      // known-hosts file to /dev/null means every ephemeral VPS is
      // simply "new" and accepted cleanly — no shared-state conflict.
      const stdout = execFileSync(
        'ssh',
        [
          '-i', SSH_KEY,
          '-o', 'StrictHostKeyChecking=no',
          '-o', 'UserKnownHostsFile=/dev/null',
          '-o', 'LogLevel=ERROR',
          '-o', `ConnectTimeout=${timeoutSec}`,
          '-o', 'BatchMode=yes',
          `weuseai@${host}`, cmd,
        ],
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
    async pollVpsHasIp(customerId) {
      // Stage 4 = "VM booted, IP assigned". The provisioning service
      // writes the vps_instances row as status='provisioning' with
      // ip_address=null, then fills ip_address once Vultr reports the
      // instance (customer-flow.ts). status only flips to 'running'
      // AFTER the whole setup-script — that's Stage 5, not here.
      for (let i = 0; i < 60; i++) {
        const rows = await pgSelect(
          'vps_instances',
          `customer_id=eq.${customerId}&select=vps_id,ip_address,status&order=created_at.desc`,
        ).catch(() => [])
        const row = rows[0]
        if (row?.status === 'failed') {
          throw new Error('provisioning marked the VPS status=failed')
        }
        if (row?.ip_address) return { vpsId: row.vps_id, vpsIp: row.ip_address }
        await sleep(2000)
      }
      throw new Error('VPS did not get an ip_address within 120s')
    },
    async pollSetupComplete(customerId) {
      // Stage 5 = "setup-script done". The provisioning service sets
      // vps_instances.status='running' the moment the SSH setup-script
      // exits 0, and 'failed' on any error. We poll that — no SSH from
      // the harness (the 'weuseai' user only exists after setup anyway).
      for (let i = 0; i < 96; i++) {
        const rows = await pgSelect(
          'vps_instances',
          `customer_id=eq.${customerId}&select=status&order=created_at.desc`,
        ).catch(() => [])
        const status = rows[0]?.status
        if (status === 'running') return
        if (status === 'failed') {
          throw new Error('provisioning marked the VPS status=failed during setup')
        }
        await sleep(5000)
      }
      throw new Error('VPS did not reach status=running within 480s')
    },
    async validateBotToken(customerId, botToken) {
      // Real onboarding path: validate-bot-token does Telegram getMe,
      // sets the bot's webhook → pair-customer-bot-webhook, and persists
      // the encrypted token (server-side SQL encrypt_bot_token()).
      const r = await fetch(`${SUPABASE_URL()}/functions/v1/validate-bot-token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_KEY()}` },
        body: JSON.stringify({ customer_id: customerId, bot_token: botToken }),
      })
      const body = (await r.json().catch(() => ({}))) as { bot_username?: string }
      if (!r.ok || !body.bot_username) {
        throw new Error(`validate-bot-token failed: HTTP ${r.status} ${JSON.stringify(body).slice(0, 300)}`)
      }
    },
    async rotatePairingCode(customerId) {
      const r = await fetch(`${SUPABASE_URL()}/functions/v1/rotate-pairing-code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_KEY()}` },
        body: JSON.stringify({ customer_id: customerId }),
      })
      const body = (await r.json().catch(() => ({}))) as { code?: string }
      if (!r.ok || !body.code) {
        throw new Error(`rotate-pairing-code failed: HTTP ${r.status} ${JSON.stringify(body).slice(0, 300)}`)
      }
      return body.code
    },
    async submitPairingCode(customerId, code, chatId) {
      // Synthetic Telegram `/pair <code>` update — exercises the real
      // pair-customer-bot-webhook handler (real code match + chat-id
      // link). Same synthetic-webhook pattern as Stage 2's xendit-webhook.
      const r = await fetch(
        `${SUPABASE_URL()}/functions/v1/pair-customer-bot-webhook?cid=${encodeURIComponent(customerId)}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-telegram-bot-api-secret-token': PAIR_WEBHOOK_SECRET(),
          },
          body: JSON.stringify({
            update_id: Date.now(),
            message: {
              message_id: 1,
              date: Math.floor(Date.now() / 1000),
              text: `/pair ${code}`,
              chat: { id: Number(chatId), type: 'private' },
              from: { id: Number(chatId), is_bot: false, first_name: 'PhaseF' },
            },
          }),
        },
      )
      if (r.status === 401) {
        throw new Error('pair-customer-bot-webhook rejected the secret token (401)')
      }
      const body = (await r.json().catch(() => ({}))) as { replied?: string; ignored?: string }
      if (!r.ok || body.replied !== 'paired_silent') {
        throw new Error(
          `pairing did not link telegram_chat_id: HTTP ${r.status} ${JSON.stringify(body)}`,
        )
      }
    },
    async completeOnboarding(customerId) {
      // Renders SOUL.md + refreshEnv → restarts hermes-gateway WITH the
      // bot token; the gateway's ExecStartPre then runs bundle-pull.
      const r = await fetch(`${SUPABASE_URL()}/functions/v1/complete-onboarding`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_KEY()}` },
        body: JSON.stringify({
          customer_id: customerId,
          whatsapp: '081234567890',
          expectations_text:
            'Aku mau agen yang bantu balas pesan pelanggan toko online-ku di Telegram, ' +
            'kasih draft jawaban yang sopan dan cepat, plus rangkuman pesanan tiap pagi.',
        }),
      })
      const body = (await r.json().catch(() => ({}))) as {
        greeting?: { ok?: boolean; source?: string }
        waiting_for_vps?: boolean
      }
      if (!r.ok) {
        throw new Error(`complete-onboarding failed: HTTP ${r.status} ${JSON.stringify(body).slice(0, 300)}`)
      }
      // step 8c proactive-greeting outcome — Stage 5.9 verifies it.
      // waiting_for_vps (wait-page race fix 2026-05-16) — true when the
      // handler deferred refreshEnv because the VPS was still
      // provisioning; the provisioning second-finisher starts the
      // gateway and Stage 5.85 confirms it.
      return {
        greetingOk: body.greeting?.ok === true,
        greetingSource: body.greeting?.source ?? 'absent',
        waitingForVps: body.waiting_for_vps === true,
      }
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
    async checkGreetingSent(customerId) {
      // Bug-1 fix (2026-05-16): the second-finisher stamps
      // customers.greeting_sent_at the moment the proactive greeting is
      // delivered. Poll for it — the second-finisher's greeting send
      // can land a few seconds after the gateway goes active.
      for (let i = 0; i < 12; i++) {
        const rows = await pgSelect(
          'customers',
          `id=eq.${customerId}&select=greeting_sent_at`,
        ).catch(() => [])
        if (rows[0]?.greeting_sent_at) return true
        await sleep(5000)
      }
      return false
    },
    // Stages 9 + 10 are `manual` — no deps impl. A /start reply can only
    // be validated by a real Telegram user account; the founder confirms.
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
  /** A `manual` stage is recorded as status='manual' (not run, not a
   *  failure) — the founder confirms it by hand. `run` is ignored. */
  manual?: boolean
  /** Note shown for a manual stage. */
  manualNote?: string
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
    name: 'VPS provisioned (ip_address assigned)',
    async run(ctx, deps) {
      const { vpsId, vpsIp } = await deps.pollVpsHasIp(ctx.customerId!)
      ctx.vpsId = vpsId
      ctx.vpsIp = vpsIp
      return `vps=${vpsId} ip=${vpsIp}`
    },
  },
  {
    num: 5,
    name: 'setup-script COMPLETE (status=running)',
    async run(ctx, deps) {
      await deps.pollSetupComplete(ctx.customerId!)
      return 'vps_instances.status = running'
    },
  },
  {
    num: 5.5,
    name: 'Pair — validate bot token',
    async run(ctx, deps) {
      await deps.validateBotToken(ctx.customerId!, ctx.botToken!)
      return 'bot token validated + webhook set + token persisted'
    },
  },
  {
    num: 5.6,
    name: 'Pair — rotate pairing code',
    async run(ctx, deps) {
      const code = await deps.rotatePairingCode(ctx.customerId!)
      ctx.pairingCode = code
      return `pairing code minted`
    },
  },
  {
    num: 5.7,
    name: 'Pair — /pair message links telegram_chat_id',
    async run(ctx, deps) {
      await deps.submitPairingCode(ctx.customerId!, ctx.pairingCode!, ctx.botChatId!)
      return 'telegram_chat_id linked'
    },
  },
  {
    num: 5.8,
    name: 'complete-onboarding → hermes-gateway starts',
    async run(ctx, deps) {
      const { greetingOk, greetingSource, waitingForVps } =
        await deps.completeOnboarding(ctx.customerId!)
      ctx.greetingOk = greetingOk
      ctx.greetingSource = greetingSource
      ctx.waitingForVps = waitingForVps
      if (FAST_CUSTOMER) {
        // Wait-page race fix (2026-05-16): in the FAST_CUSTOMER order
        // this stage runs BEFORE Stage 5 — the VPS is still
        // provisioning. complete-onboarding MUST defer refreshEnv
        // (waiting_for_vps:true) instead of SSHing the half-built VPS.
        // If it did NOT defer, the race gate is broken.
        if (!waitingForVps) {
          throw new Error(
            'FAST_CUSTOMER: complete-onboarding did NOT defer refreshEnv ' +
              '(waiting_for_vps was false) while the VPS was still ' +
              'provisioning — the race gate is broken',
          )
        }
        return 'race gate held — refreshEnv deferred to the second-finisher'
      }
      return 'SOUL.md rendered + refreshEnv → gateway restarted'
    },
  },
  {
    // FAST_CUSTOMER-only stage. Stage 5.8 deferred refreshEnv; Stage 5
    // then waited for status='running', which fires the provisioning
    // service's second-finisher (customer-flow.ts notifyVpsReady →
    // admin-customer-vps-refresh) asynchronously. Poll the gateway
    // until that second-finisher has SSH-pushed the env + started it.
    num: 5.85,
    name: 'second-finisher → hermes-gateway started',
    async run(ctx, deps) {
      const deadline = Date.now() + STAGE_BUDGET_MS[5.85]
      let lastErr = 'never checked'
      while (Date.now() < deadline) {
        try {
          await deps.checkGatewayActive(ctx.vpsIp!)
          return 'second-finisher started the gateway after the deferred onboarding'
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e)
          await chainSleep(10_000)
        }
      }
      throw new Error(
        `second-finisher did not bring hermes-gateway up in time — ${lastErr}`,
      )
    },
  },
  {
    num: 5.9,
    name: 'auto-greet — proactive greeting delivered',
    async run(ctx, deps) {
      // The customer must NOT have to type /start. complete-onboarding
      // step 8c (sendProactiveGreeting) sends an in-character greeting to
      // the customer's chat the moment provisioning is wired. Stage 5.8
      // captured that outcome from the complete-onboarding response.
      //
      // FAST_CUSTOMER (Bug-1 fix 2026-05-16): complete-onboarding
      // deferred, so the greeting is delivered by the provisioning
      // second-finisher (admin-customer-vps-refresh), NOT by the
      // complete-onboarding response. Verify it actually landed by
      // checking customers.greeting_sent_at — the exactly-once stamp.
      // Pre-fix this stage accepted `deferred_vps` as a pass, which is
      // exactly how the missed auto-greet slipped through.
      if (FAST_CUSTOMER) {
        const sent = await deps.checkGreetingSent(ctx.customerId!)
        if (!sent) {
          throw new Error(
            'FAST_CUSTOMER: auto-greet did NOT fire — customers.greeting_sent_at ' +
              'is still null after the second-finisher. Bug-1 regression.',
          )
        }
        return 'auto-greet delivered by the second-finisher (greeting_sent_at set)'
      }
      if (!ctx.greetingOk) {
        throw new Error(
          `proactive greeting did NOT fire (source=${ctx.greetingSource ?? 'absent'}) — ` +
            `customer would land on a silent bot`,
        )
      }
      return `auto-greet delivered (source=${ctx.greetingSource})`
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
    // MANUAL: validating a /start reply needs a real Telegram USER
    // sending /start and reading the answer. The harness holds only a
    // bot token — it cannot be the user, and a bot's getUpdates poll
    // also conflicts with the hermes-gateway's own long-poll. The
    // founder confirms this by hand (already in the unlock criterion).
    manual: true,
    manualNote: 'founder sends /start to the bot on Telegram + confirms the agent replies',
    async run() {
      return
    },
  },
  {
    num: 10,
    name: '/<persona> → persona-correct response',
    manual: true,
    manualNote: 'founder sends /the-pro on Telegram + confirms a persona-correct reply',
    async run() {
      return
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

  // Every stage except teardown runs in sequence; first failure stops
  // the rest. Stage 11 (teardown) ALWAYS runs via the finally below.
  //
  // Wait-page race fix (2026-05-16): the stage ORDER is variant-aware.
  // Normal runs keep the original sequence and skip Stage 5.85. The
  // FAST_CUSTOMER variant re-orders so complete-onboarding (5.8) runs
  // BEFORE setup-script-complete (5) — the actual race — then adds 5.85
  // to confirm the provisioning second-finisher started the gateway.
  const byNum = (n: number) => STAGES.find((s) => s.num === n)!
  const NORMAL_ORDER = [1, 2, 3, 4, 5, 5.5, 5.6, 5.7, 5.8, 5.9, 6, 7, 8, 9, 10]
  const FAST_ORDER = [1, 2, 3, 4, 5.5, 5.6, 5.7, 5.8, 5, 5.85, 5.9, 6, 7, 8, 9, 10]
  const runStages = (FAST_CUSTOMER ? FAST_ORDER : NORMAL_ORDER).map(byNum)
  // Expected total stage count for the verdict (run stages + teardown).
  const expectedStageCount = runStages.length + 1
  const teardownStage = STAGES.find((s) => s.num === 11)!
  try {
    for (const s of runStages) {
      const budgetMs = STAGE_BUDGET_MS[s.num]
      if (firstFailedStage !== null) {
        record({ stage: s.num, name: s.name, status: 'skipped', elapsedMs: 0, budgetMs, detail: `skipped — Stage ${firstFailedStage} failed first` })
        continue
      }
      if (s.manual) {
        // Not automated — recorded as `manual`, not a failure. The
        // founder confirms it by hand (unlock criterion already requires
        // a personal Telegram check after a fresh payment).
        record({ stage: s.num, name: s.name, status: 'manual', elapsedMs: 0, budgetMs, detail: `manual — ${s.manualNote ?? 'founder confirms'}` })
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
    // Stage 11 — teardown. Runs no matter what the earlier stages did,
    // UNLESS E2E_CHAIN_HOLD_VPS=1 — a hold-VPS confirmation run that
    // deliberately leaves the VPS + bot up so the founder can do the
    // manual /start check on the live agent. The held VPS must then be
    // torn down by hand (POST /tear-down) once the check is done.
    const s = teardownStage
    const budgetMs = STAGE_BUDGET_MS[11]
    if (process.env.E2E_CHAIN_HOLD_VPS === '1') {
      record({
        stage: 11,
        name: s.name,
        status: 'manual',
        elapsedMs: 0,
        budgetMs,
        detail:
          `HELD — E2E_CHAIN_HOLD_VPS=1. VPS ${ctx.vpsId ?? '?'} (${ctx.vpsIp ?? '?'}) ` +
          `left UP for the founder /start test. customer=${ctx.customerId ?? '?'} ` +
          `sub=${ctx.subscriptionId ?? '?'} — tear down by hand after the check.`,
      })
    } else {
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
  }

  // ─── Verdict ──
  // Phase F criterion (founder reframe 2026-05-15): EVERY stage clean
  // (no fail, no skip) AND the Stages 1-9 flow finishes under the 15-min
  // ceiling. Reliability over speed — a clean 13-min run passes.
  const stages1to9 = results.filter((r) => r.stage >= 1 && r.stage <= 9)
  // Clean = every stage is pass / over_budget / manual — no fail, no
  // skip. `manual` stages (9, 10) are founder-confirmed, not failures.
  const allStagesClean = results.length === expectedStageCount &&
    results.every(
      (r) => r.status === 'pass' || r.status === 'over_budget' || r.status === 'manual',
    )
  const chainTimeMs = stages1to9.reduce((sum, r) => sum + r.elapsedMs, 0)
  const underBudget = chainTimeMs <= UNLOCK_BUDGET_MS
  const budgetMin = (UNLOCK_BUDGET_MS / 1000 / 60).toFixed(2)

  // eslint-disable-next-line no-console
  console.log(`\n══════════════════════════════════════════════════`)
  // eslint-disable-next-line no-console
  console.log(`Phase F chain — target=${TARGET} runId=${runId}`)
  // eslint-disable-next-line no-console
  console.log(`All ${expectedStageCount} stages clean (no fail/skip): ${allStagesClean ? 'YES' : 'NO'}`)
  // eslint-disable-next-line no-console
  console.log(`Chain time (Stages 1-9): ${(chainTimeMs / 1000 / 60).toFixed(2)} min  (budget ${budgetMin} min → ${underBudget ? 'UNDER' : 'OVER'})`)
  // eslint-disable-next-line no-console
  console.log(`Unlock-eligible run: ${allStagesClean && underBudget ? 'YES' : 'NO'}`)
  // eslint-disable-next-line no-console
  console.log(`══════════════════════════════════════════════════`)

  // Append to the cascade log (founder directive h) — DEPLOYED runs
  // only. Local runs are harness self-tests and must not pollute the
  // record of the 3 real unlock runs.
  if (TARGET === 'deployed') {
    try {
      appendRunToCascadeLog(runId, ctx, allStagesClean, chainTimeMs, underBudget)
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
    assert.ok(allStagesClean, 'local chain must pass every stage (harness self-test)')
    assert.ok(results.find((r) => r.stage === 11)?.status === 'pass', 'teardown must run + pass in local mode')
  } else {
    // Deployed: surface the verdict but don't hard-fail the process —
    // the cascade-close logic (3 consecutive clean under-budget runs) is
    // evaluated by the founder + the cascade log, not by a single
    // test exit code.
    if (!allStagesClean) {
      // eslint-disable-next-line no-console
      console.log(`\n⚠ Deployed run did NOT pass all stages. First failure: Stage ${firstFailedStage}.`)
    }
  }
})

// ─── Cascade log appender ─────────────────────────────────────────────

function appendRunToCascadeLog(
  runId: string,
  ctx: ChainCtx,
  allStagesClean: boolean,
  chainTimeMs: number,
  underBudget: boolean,
): void {
  const ts = new Date().toISOString()
  const budgetMin = (UNLOCK_BUDGET_MS / 1000 / 60).toFixed(2)
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
    `- all ${results.length} stages clean (no fail/skip): **${allStagesClean ? 'YES' : 'NO'}**`,
    `- chain time (Stages 1-9): **${(chainTimeMs / 1000 / 60).toFixed(2)} min** (budget ${budgetMin} min → ${underBudget ? 'UNDER' : 'OVER'})`,
    `- unlock-eligible: **${allStagesClean && underBudget ? 'YES' : 'NO'}**`,
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
