/**
 * Phase D (2026-05-14): SERVICE audit smoke.
 *
 * Scope: audit an EXISTING customer's service-side chain. Reports
 * which stage is broken so the founder + maintainer can act. Does
 * NOT provision, NOT tear down, NOT touch any customer data.
 *
 * Distinct from `smoke-production.spec.ts` (UI/HTTP-only smoke against
 * the public Vercel URL) and from the (forthcoming) Phase F
 * fresh-customer chain smoke. This file is the missing audit layer
 * the forensic doc (PR #118) called out.
 *
 * Driving customer: Renita (cid 42c024ce-a4d6-4374-8dcf-1e396ae9e750).
 * Override via env: AUDIT_CID=<uuid>.
 *
 * Required env (read from .env.local at repo root, or session env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY        — read customers/subscriptions/etc.
 *   AUDIT_SSH_KEY_PATH (optional)    — default ~/.ssh/weuseai-fleet
 *   AUDIT_CID (optional)             — default Renita's cid
 *
 * Stages (each is independent — one failing does NOT skip subsequent):
 *
 *   1. Payment        — customers row + active subscription + consent rows
 *   2. VPS            — vps_instances.status=running + TCP probe SSH+HTTP
 *   3. Hermes install — SSH in, check `setup-script COMPLETE` marker,
 *                       binary present, .env exists
 *   4. Hermes running — `systemctl is-active hermes-gateway` = active,
 *                       PID exists, TELEGRAM_BOT_TOKEN present in .env
 *   5. Allowlist      — TELEGRAM_ALLOWED_USERS contains the customer's
 *                       telegram_chat_id, OR GATEWAY_ALLOW_ALL_USERS=true.
 *                       Without this, /start from the customer hits an
 *                       "unauthorized" wall and they see silence.
 *
 * Output: structured per-stage YES/NO + evidence to stdout. Excluded
 * from default `npm test` glob — run via:
 *   npx tsx --test tests/e2e/smoke-service.spec.ts
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

// ─── Configuration ────────────────────────────────────────────────────

// Load .env.local from repo root if present (CI uses real env vars).
const ENV_LOCAL = resolve(process.cwd(), '.env.local')
if (existsSync(ENV_LOCAL)) {
  for (const line of readFileSync(ENV_LOCAL, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const AUDIT_CID = process.env.AUDIT_CID ?? '42c024ce-a4d6-4374-8dcf-1e396ae9e750'
const SSH_KEY = process.env.AUDIT_SSH_KEY_PATH ?? resolve(homedir(), '.ssh/weuseai-fleet')

if (!SUPABASE_URL || !SERVICE_KEY) {
  // eslint-disable-next-line no-console
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required (set in .env.local or env)')
  process.exit(2)
}

// ─── Finding tracker ──────────────────────────────────────────────────

type Finding = {
  stage: number
  name: string
  status: 'pass' | 'fail'
  detail?: string
}
const findings: Finding[] = []

function record(f: Finding) {
  findings.push(f)
  const icon = f.status === 'pass' ? '✓' : '✗'
  // eslint-disable-next-line no-console
  console.log(`${icon} Stage ${f.stage}: ${f.name}${f.detail ? '\n    ' + f.detail.replace(/\n/g, '\n    ') : ''}`)
}

// ─── Context shared across stages ─────────────────────────────────────

type Ctx = {
  customer?: any
  subscription?: any
  vps?: any
  vpsIp?: string
  sshOk?: boolean
}
const ctx: Ctx = {}

// ─── Helpers ──────────────────────────────────────────────────────────

async function pgSelect(table: string, query: string): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`
  const r = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY!,
      authorization: `Bearer ${SERVICE_KEY}`,
    },
  })
  if (!r.ok) {
    throw new Error(`PostgREST ${table}: HTTP ${r.status}: ${await r.text()}`)
  }
  return (await r.json()) as any[]
}

function ssh(host: string, cmd: string, timeoutSec = 10): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(
      'ssh',
      [
        '-i', SSH_KEY,
        '-o', 'StrictHostKeyChecking=no',
        '-o', `ConnectTimeout=${timeoutSec}`,
        '-o', 'BatchMode=yes',
        `weuseai@${host}`,
        cmd,
      ],
      { encoding: 'utf8', timeout: (timeoutSec + 5) * 1000 },
    )
    return { ok: true, stdout, stderr: '' }
  } catch (e: any) {
    return {
      ok: false,
      stdout: e?.stdout?.toString?.() ?? '',
      stderr: e?.stderr?.toString?.() ?? (e instanceof Error ? e.message : String(e)),
    }
  }
}

async function tcpProbe(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  // Use nc — present on macOS + ubuntu CI runners.
  try {
    execFileSync('nc', ['-w', String(Math.ceil(timeoutMs / 1000)), '-z', host, String(port)], {
      timeout: timeoutMs + 1000,
    })
    return true
  } catch {
    return false
  }
}

// ─── STAGE 1 · Payment ────────────────────────────────────────────────

test('Stage 1: Payment row, active subscription, consent events', async () => {
  // Customer
  const customers = await pgSelect('customers', `id=eq.${AUDIT_CID}&select=*`)
  if (customers.length === 0) {
    record({ stage: 1, name: 'Payment', status: 'fail', detail: `no customers row for cid ${AUDIT_CID}` })
    assert.fail('customer not found')
  }
  ctx.customer = customers[0]

  // Subscription (latest active OR any-active)
  const subs = await pgSelect(
    'subscriptions',
    `customer_id=eq.${AUDIT_CID}&select=id,tier,status,xendit_invoice_id,hosting_active,started_at,next_billing_at&status=eq.active`,
  )
  if (subs.length === 0) {
    record({ stage: 1, name: 'Payment', status: 'fail', detail: 'no ACTIVE subscription — customer is canceled/expired' })
    assert.fail('no active subscription')
  }
  ctx.subscription = subs[0]

  // Consent
  const tos = await pgSelect(
    'consent_events',
    `customer_id=eq.${AUDIT_CID}&consent_type=eq.tos&select=id,accepted_at,version`,
  )
  if (tos.length === 0) {
    record({ stage: 1, name: 'Payment', status: 'fail', detail: 'no ToS consent event' })
    assert.fail('missing ToS consent')
  }

  record({
    stage: 1,
    name: 'Payment',
    status: 'pass',
    detail:
      `customer=${ctx.customer.id} (${ctx.customer.display_name ?? 'no name'})\n` +
      `subscription=${ctx.subscription.id} status=${ctx.subscription.status} tier=${ctx.subscription.tier}\n` +
      `xendit_invoice=${ctx.subscription.xendit_invoice_id}\n` +
      `consent_events: ${tos.length} ToS row(s)`,
  })
})

// ─── STAGE 2 · VPS provisioning ───────────────────────────────────────

test('Stage 2: VPS row + reachability', async () => {
  // Get the most recent vps_instances row.
  const rows = await pgSelect(
    'vps_instances',
    `customer_id=eq.${AUDIT_CID}&select=id,vps_id,ip_address,provider,region,status,created_at&status=eq.running`,
  )
  if (rows.length === 0) {
    record({ stage: 2, name: 'VPS', status: 'fail', detail: 'no vps_instances row with status=running' })
    assert.fail('no running VPS')
  }
  // Most-recent first.
  rows.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  ctx.vps = rows[0]
  ctx.vpsIp = ctx.vps.ip_address as string

  if (!ctx.vpsIp) {
    record({ stage: 2, name: 'VPS', status: 'fail', detail: 'vps_instances row missing ip_address' })
    assert.fail('no IP')
  }

  // TCP probe — port 22 must be open for stages 3–5 to even attempt.
  const sshOpen = await tcpProbe(ctx.vpsIp, 22, 3000)
  if (!sshOpen) {
    record({
      stage: 2,
      name: 'VPS',
      status: 'fail',
      detail: `ip=${ctx.vpsIp} provider=${ctx.vps.provider} region=${ctx.vps.region} but port 22 NOT reachable`,
    })
    assert.fail('SSH port 22 unreachable')
  }

  record({
    stage: 2,
    name: 'VPS',
    status: 'pass',
    detail:
      `ip=${ctx.vpsIp} provider=${ctx.vps.provider} region=${ctx.vps.region}\n` +
      `vps_id=${ctx.vps.vps_id}\n` +
      `created_at=${ctx.vps.created_at}\n` +
      `port 22: open`,
  })
})

// ─── STAGE 3 · Hermes install ─────────────────────────────────────────

test('Stage 3: Hermes install marker, binary, .env', async () => {
  if (!ctx.vpsIp) {
    record({ stage: 3, name: 'Hermes install', status: 'fail', detail: 'SKIPPED — Stage 2 did not produce an IP' })
    assert.fail('no IP for SSH')
  }

  // Setup-script writes a completion marker as the very last line.
  // Without it: cloud-init/setup still running or aborted.
  const marker = ssh(ctx.vpsIp, "sudo tail -3 /var/log/weuseai-setup.log 2>&1 | tr -d '\\r'", 15)
  if (!marker.ok) {
    record({
      stage: 3,
      name: 'Hermes install',
      status: 'fail',
      detail: `SSH failed: ${marker.stderr.slice(0, 200)}`,
    })
    assert.fail('SSH unreachable')
  }
  const sawComplete = /weuseai setup COMPLETE/i.test(marker.stdout)

  // Binary + .env
  const checks = ssh(
    ctx.vpsIp,
    'test -f /home/weuseai/.local/bin/hermes && echo BIN=yes || echo BIN=no; ' +
      'test -f /home/weuseai/.hermes/.env && echo ENV=yes || echo ENV=no; ' +
      'test -f /home/weuseai/.hermes/SOUL.md && echo SOUL=yes || echo SOUL=no',
    10,
  )

  if (!sawComplete) {
    record({
      stage: 3,
      name: 'Hermes install',
      status: 'fail',
      detail:
        `setup-script COMPLETE marker NOT found in /var/log/weuseai-setup.log\n` +
        `last 3 lines: ${marker.stdout.slice(0, 400)}\n` +
        checks.stdout,
    })
    assert.fail('setup-script never reached COMPLETE')
  }

  const binOk = /BIN=yes/.test(checks.stdout)
  const envOk = /ENV=yes/.test(checks.stdout)
  const soulOk = /SOUL=yes/.test(checks.stdout)
  if (!binOk || !envOk || !soulOk) {
    record({
      stage: 3,
      name: 'Hermes install',
      status: 'fail',
      detail: `marker OK but files missing: BIN=${binOk} ENV=${envOk} SOUL=${soulOk}\n${checks.stdout}`,
    })
    assert.fail('install files missing')
  }

  record({
    stage: 3,
    name: 'Hermes install',
    status: 'pass',
    detail: 'setup-script COMPLETE marker present\nbinary, .env, SOUL.md all present',
  })
})

// ─── STAGE 4 · Hermes gateway running ─────────────────────────────────

test('Stage 4: hermes-gateway active + bot token in .env', async () => {
  if (!ctx.vpsIp) {
    record({ stage: 4, name: 'Hermes running', status: 'fail', detail: 'SKIPPED — no VPS IP' })
    assert.fail('no IP')
  }

  const r = ssh(
    ctx.vpsIp,
    'systemctl is-active hermes-gateway 2>&1; ' +
      'systemctl show hermes-gateway --property=MainPID,ActiveState,SubState 2>&1; ' +
      'grep -q "^TELEGRAM_BOT_TOKEN=" /home/weuseai/.hermes/.env && echo TOKEN=present || echo TOKEN=MISSING',
    15,
  )
  if (!r.ok) {
    record({ stage: 4, name: 'Hermes running', status: 'fail', detail: `SSH error: ${r.stderr.slice(0, 200)}` })
    assert.fail('SSH error')
  }

  const isActive = /(^|\n)active\b/.test(r.stdout)
  const subRunning = /SubState=running/.test(r.stdout)
  const tokenPresent = /TOKEN=present/.test(r.stdout)

  if (!isActive || !subRunning || !tokenPresent) {
    record({
      stage: 4,
      name: 'Hermes running',
      status: 'fail',
      detail:
        `is-active=${isActive} SubState=running=${subRunning} TELEGRAM_BOT_TOKEN=${tokenPresent ? 'present' : 'MISSING'}\n` +
        `raw:\n${r.stdout.trim()}`,
    })
    assert.fail('hermes-gateway not fully alive')
  }

  record({
    stage: 4,
    name: 'Hermes running',
    status: 'pass',
    detail: `systemctl is-active=active, SubState=running, TELEGRAM_BOT_TOKEN present\n${r.stdout.trim().split('\n').slice(0, 4).join('\n')}`,
  })
})

// ─── STAGE 5 · Telegram allowlist ─────────────────────────────────────

test('Stage 5: Telegram allowlist authorizes customer.telegram_chat_id', async () => {
  if (!ctx.vpsIp) {
    record({ stage: 5, name: 'Allowlist', status: 'fail', detail: 'SKIPPED — no VPS IP' })
    assert.fail('no IP')
  }
  if (!ctx.customer) {
    record({ stage: 5, name: 'Allowlist', status: 'fail', detail: 'SKIPPED — Stage 1 produced no customer' })
    assert.fail('no customer')
  }

  const expectedChatId: string = String(ctx.customer.telegram_chat_id ?? '')
  if (!expectedChatId) {
    record({
      stage: 5,
      name: 'Allowlist',
      status: 'fail',
      detail: 'customers.telegram_chat_id is null — customer never paired their Telegram chat',
    })
    assert.fail('customer.telegram_chat_id null')
  }

  // Read .env on VPS for TELEGRAM_ALLOWED_USERS / GATEWAY_ALLOW_ALL_USERS.
  const r = ssh(
    ctx.vpsIp,
    "grep -E '^(TELEGRAM_ALLOWED_USERS|GATEWAY_ALLOW_ALL_USERS|TELEGRAM_ALLOWED_USER_IDS)=' /home/weuseai/.hermes/.env 2>&1; echo ---end---",
    10,
  )
  if (!r.ok) {
    record({ stage: 5, name: 'Allowlist', status: 'fail', detail: `SSH error: ${r.stderr.slice(0, 200)}` })
    assert.fail('SSH error')
  }

  // Parse what's set.
  const allowedUsers = /TELEGRAM_ALLOWED_USERS=(.+)/.exec(r.stdout)?.[1]?.trim() ?? ''
  const allowedUserIds = /TELEGRAM_ALLOWED_USER_IDS=(.+)/.exec(r.stdout)?.[1]?.trim() ?? ''
  const allowAll = /GATEWAY_ALLOW_ALL_USERS=(.+)/.exec(r.stdout)?.[1]?.trim() ?? ''

  // Accept ANY of:
  //   GATEWAY_ALLOW_ALL_USERS=true / 1 / yes
  //   TELEGRAM_ALLOWED_USERS contains expectedChatId
  //   TELEGRAM_ALLOWED_USER_IDS contains expectedChatId
  // (Hermes upstream uses TELEGRAM_ALLOWED_USERS; we historically wrote
  // TELEGRAM_ALLOWED_USER_IDS at one point — accept both for safety.)
  const allowAllOk = /^(true|1|yes)$/i.test(allowAll)
  const idMatches = (list: string) =>
    list.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).includes(expectedChatId)
  const userListOk = allowedUsers && idMatches(allowedUsers)
  const userIdsListOk = allowedUserIds && idMatches(allowedUserIds)

  if (!allowAllOk && !userListOk && !userIdsListOk) {
    record({
      stage: 5,
      name: 'Allowlist',
      status: 'fail',
      detail:
        `customer.telegram_chat_id=${expectedChatId} NOT authorized by any allowlist mechanism\n` +
        `TELEGRAM_ALLOWED_USERS="${allowedUsers || '<unset>'}"\n` +
        `TELEGRAM_ALLOWED_USER_IDS="${allowedUserIds || '<unset>'}"\n` +
        `GATEWAY_ALLOW_ALL_USERS="${allowAll || '<unset>'}"\n` +
        `→ /start from this customer hits the unauthorized wall and they see silence.`,
    })
    assert.fail('Telegram allowlist gap')
  }

  record({
    stage: 5,
    name: 'Allowlist',
    status: 'pass',
    detail:
      `customer.telegram_chat_id=${expectedChatId} authorized via ` +
      (allowAllOk
        ? `GATEWAY_ALLOW_ALL_USERS=${allowAll}`
        : userListOk
          ? `TELEGRAM_ALLOWED_USERS="${allowedUsers}"`
          : `TELEGRAM_ALLOWED_USER_IDS="${allowedUserIds}"`),
  })
})

// ─── Final summary ────────────────────────────────────────────────────

test('SUMMARY', () => {
  const passed = findings.filter((f) => f.status === 'pass').length
  const failed = findings.filter((f) => f.status === 'fail').length
  // eslint-disable-next-line no-console
  console.log(`\n══════════════════════════════════════════════════`)
  // eslint-disable-next-line no-console
  console.log(`Service audit smoke — cid ${AUDIT_CID}`)
  // eslint-disable-next-line no-console
  console.log(`Passed: ${passed} / Failed: ${failed} / Total: ${findings.length}`)
  // eslint-disable-next-line no-console
  console.log(`══════════════════════════════════════════════════`)
})

export { findings, ctx, AUDIT_CID }
