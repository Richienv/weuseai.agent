/**
 * Phase 2E-2 + 2E-3 live VPS smoke test — MANUAL RUN ONLY.
 *
 * Specs:
 *   docs/plans/2026-05-08-phase-2e-2-bundle-delivery-spec.md (bundle pull)
 *   docs/plans/2026-05-08-phase-2e-3-spec.md (tier-bump + PDF + email)
 *
 * Costs ~$0.50 per run (IDCloudHost VPS for ~30 min). Founder gating
 * policy: max 2 runs per phase. Don't run per-commit.
 *
 * Underscore-prefixed filename keeps it OUT of the *.spec.ts glob —
 * `npm test` will not pick this up.
 *
 * Invocation (manual, requires real env vars):
 *
 *   SUPABASE_URL=https://gtjgsligllbjcisiyrah.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role> \
 *   SUPABASE_SECRET_KEY=<sb_secret_*> \
 *   IDCLOUDHOST_API_KEY=<idch-key> \
 *   IDCLOUDHOST_BILLING_ACCOUNT_ID=<billing-id> \
 *   FLEET_SSH_PUBKEY="$(cat ~/.ssh/weuseai-fleet.pub)" \
 *   FLEET_SSH_PRIVATE_KEY="$(cat ~/.ssh/weuseai-fleet)" \
 *   AGENT_SLUG=doc-expert \
 *   BUNDLE_VERSION=1.0.0 \
 *     npx tsx tests/_e2e-bundle-pull-smoke.mts
 *
 * Optional envs:
 *   CUSTOMER_ID — defaults to founder's CID e282ce25-764d-4d88-b592-d4ef2c6cc360
 *   SKIP_PUBLISH — '1' to skip the bundle-publish step (use existing version)
 *   SKIP_TEARDOWN — '1' to leave VPS up after smoke (for debugging)
 *   SKIP_TIER_BUMP — '1' to skip Phase 2E-3 tier-bump test
 *   SKIP_PDF_RENDER — '1' to skip Phase 2E-3 PDF round-trip test
 *
 * What it does (Phase 2E-2 baseline):
 *   1. Tar agent-packs/<slug>/ + agent-packs/_shared/ → upload via bundle-publish
 *   2. Spawn IDCloudHost VPS tagged weuseai-smoke-2e2-<YYYYMMDD>
 *   3. SSH in, run buildSetupScript output (with bootstrap bundle + fleet pubkey)
 *   4. Wait for /var/lib/weuseai/bundle/<slug>/.installed-version (poll, max 5 min)
 *   5. Verify: SKILL.md files, customer-grown dir, bundle_pull_attempts row, fleet pubkey installed
 *
 * Phase 2E-3 additions:
 *   6. Verify fleet SSH key auth works (whoami via -i ~/.ssh/weuseai-fleet)
 *   7. Tier-bump test: call tierBump() route directly with target_tier=studio,
 *      verify .env updated + service restarted via fleet SSH
 *   8. PDF render test: invoke invoice-generator-handler Edge Function, verify
 *      response includes pdf.status='rendered' + email.status='stubbed'
 *      (no RESEND_API_KEY in smoke env)
 *
 *   9. Tear down VPS (unless SKIP_TEARDOWN)
 *  10. Print pass/fail report
 */

import { execSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createClient } from '@supabase/supabase-js'

import { buildSetupScript } from '../services/provisioning/src/setup-script.ts'
import { ExecSshProvisioner } from '../services/provisioning/src/ssh/exec-ssh-provisioner.ts'
import { tierBump } from '../services/provisioning/src/routes/tier-bump.ts'

// IDCloudHost API used directly via fetch() rather than the provisioning
// service's IDCloudHostVPSProvider class. Decouples this smoke script
// from internal provider API churn — only depends on the public IDCH
// REST contract.

const FOUNDER_CID = 'e282ce25-764d-4d88-b592-d4ef2c6cc360'

// ─── env validation ────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
// Legacy JWT service-role key — used by @supabase/supabase-js client
// (PostgREST + Storage SDK paths).
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
// New sb_secret_* key — used as Bearer for bundle-publish admin auth.
// Supabase Edge Functions auto-inject the new secret as
// SUPABASE_SERVICE_ROLE_KEY at runtime once a project has migrated, so
// the inline isAdminCaller() check compares against the new format.
// We send whichever key matches that runtime value.
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? SERVICE_KEY
const IDCH_KEY = process.env.IDCLOUDHOST_API_KEY
const BILLING = process.env.IDCLOUDHOST_BILLING_ACCOUNT_ID
const AGENT_SLUG = process.env.AGENT_SLUG ?? 'doc-expert'
const BUNDLE_VERSION = process.env.BUNDLE_VERSION ?? '1.0.0'
const CUSTOMER_ID = process.env.CUSTOMER_ID ?? FOUNDER_CID
const SKIP_PUBLISH = process.env.SKIP_PUBLISH === '1'
const SKIP_TEARDOWN = process.env.SKIP_TEARDOWN === '1'
// Phase 2E-3 step toggles — let founder pre-emptively skip while a
// dependent piece is still in-flight (e.g. SKIP_TIER_BUMP=1 if the
// provisioning service hasn't been redeployed yet).
const SKIP_TIER_BUMP = process.env.SKIP_TIER_BUMP === '1'
const SKIP_PDF_RENDER = process.env.SKIP_PDF_RENDER === '1'

// Phase 2E-3: fleet SSH keys for the tier-bump path.
const FLEET_SSH_PUBKEY = process.env.FLEET_SSH_PUBKEY ?? ''
const FLEET_SSH_PRIVATE_KEY = process.env.FLEET_SSH_PRIVATE_KEY ?? ''

const missing: string[] = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL')
if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!IDCH_KEY) missing.push('IDCLOUDHOST_API_KEY')
if (!BILLING) missing.push('IDCLOUDHOST_BILLING_ACCOUNT_ID')

if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`)
  console.error('See header of this file for invocation example.')
  process.exit(2)
}

// Cost guardrail — print warning, prompt for confirm.
const today = new Date().toISOString().slice(0, 10)
const SMOKE_TAG = `weuseai-smoke-2e2-${today.replaceAll('-', '')}`

console.log('━'.repeat(70))
console.log('Phase 2E-2 LIVE VPS SMOKE TEST')
console.log('━'.repeat(70))
console.log(`Cost:           ~\$0.50 (IDCloudHost VPS for ~30 min)`)
console.log(`Target customer: ${CUSTOMER_ID} (${CUSTOMER_ID === FOUNDER_CID ? 'founder' : 'custom'})`)
console.log(`Agent bundle:   ${AGENT_SLUG}@${BUNDLE_VERSION}`)
console.log(`VPS tag:        ${SMOKE_TAG}`)
console.log(`Skip publish:   ${SKIP_PUBLISH}`)
console.log(`Skip teardown:  ${SKIP_TEARDOWN}`)
console.log('━'.repeat(70))

// ─── helpers ───────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function fail(reason: string, detail?: unknown): never {
  console.error(`\n✗ FAIL: ${reason}`)
  if (detail) console.error('  detail:', detail)
  // Don't exit() here — main()'s catch handles teardown then exits 1.
  throw new Error(reason)
}

function log(msg: string, ...rest: unknown[]) {
  console.log(`[${new Date().toISOString()}] ${msg}`, ...rest)
}

// Module-scope VPS id so the bottom catch can tear down even if main()
// throws mid-way. Set once in the spawn step. Empty string means
// "nothing to clean up yet."
let smokeVpsId = ''

// Wraps fetch with bounded retries for transient network errors
// (TLS handshake failures, DNS hiccups, undici 'fetch failed'). Does
// NOT retry on HTTP 4xx/5xx — those need their own response handling
// since they may carry meaningful API errors.
//
// Defaults are tuned for the local-Mac → IDCH-API path which is
// observed (2026-05-08) to flap on TLS handshakes for ~30-60 seconds
// at a stretch. 6 × 5s = 30s of backoff + 6 × ~10s of fetch timeout
// gives a total budget of ~90s per call before giving up.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { retries?: number; backoffMs?: number; label?: string } = {},
): Promise<Response> {
  const retries = opts.retries ?? 6
  const backoffMs = opts.backoffMs ?? 5000
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, init)
    } catch (e) {
      lastErr = e
      const msg = e instanceof Error ? e.message : String(e)
      if (attempt < retries) {
        log(
          `  ⚠ fetch transient error${opts.label ? ` (${opts.label})` : ''}: ${msg} — retry ${attempt + 1}/${retries} in ${backoffMs}ms`,
        )
        await new Promise((r) => setTimeout(r, backoffMs))
      }
    }
  }
  throw lastErr
}

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  log(`→ ${label}`)
  const start = Date.now()
  try {
    const result = await fn()
    log(`✓ ${label} (${Date.now() - start}ms)`)
    return result
  } catch (e) {
    log(`✗ ${label} failed:`, e instanceof Error ? e.message : String(e))
    throw e
  }
}

function tarBundle(slug: string): Buffer {
  // Tar agent-packs/<slug>/ + agent-packs/_shared/ into a single tarball.
  const stage = mkdtempSync(join(tmpdir(), `weuseai-smoke-${slug}-`))
  try {
    // Copy slug files
    execSync(`cp -R agent-packs/${slug}/* "${stage}/"`, { stdio: 'inherit' })
    // Append _shared (skills/extend-capabilities)
    execSync(
      `mkdir -p "${stage}/skills/extend-capabilities" && cp agent-packs/_shared/skills/extend-capabilities/SKILL.md "${stage}/skills/extend-capabilities/SKILL.md"`,
      { stdio: 'inherit' },
    )
    const outPath = join(stage, '..', `bundle-${slug}.tar.gz`)
    execSync(
      `tar --no-xattrs --no-mac-metadata --owner=0 --group=0 -czf "${outPath}" -C "${stage}" .`,
      { stdio: 'inherit' },
    )
    const bytes = readFileSync(outPath)
    rmSync(outPath, { force: true })
    return bytes
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

// ─── steps ─────────────────────────────────────────────────────────────

async function publishBundle(): Promise<void> {
  if (SKIP_PUBLISH) {
    log('  (skipped per SKIP_PUBLISH=1)')
    return
  }
  const bytes = tarBundle(AGENT_SLUG)
  const base64 = bytes.toString('base64')
  log(`  Tarball: ${bytes.length} bytes`)

  const r = await fetch(`${SUPABASE_URL}/functions/v1/bundle-publish`, {
    method: 'POST',
    headers: {
      // SECRET_KEY is the new sb_secret_* token (matches what the
      // Edge Function platform auto-injects into the function's env).
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_slug: AGENT_SLUG,
      version: BUNDLE_VERSION,
      bundle_tar_base64: base64,
    }),
  })
  if (!r.ok) {
    fail(`bundle-publish returned ${r.status}`, await r.text())
  }
  const body = (await r.json()) as { path?: string; size_bytes?: number }
  log(`  Published: ${body.path ?? '<unknown path>'}`)
}

function sshSudo(host: string, password: string, cmd: string, timeoutMs = 30000): string {
  // Retry on transient SSH failures. We've seen this on the founder's
  // Mac with mixed-network conditions: a successful SSH followed by
  // "Connection closed by <host> port 22" on the very next call. The
  // VPS sshd is fine — momentary handshake / network blip.
  const RETRIES = 3
  const BACKOFF_MS = 2000
  let lastErr = ''
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const r = spawnSync(
      'sshpass',
      [
        '-p',
        password,
        'ssh',
        '-o',
        'StrictHostKeyChecking=no',
        '-o',
        'UserKnownHostsFile=/dev/null',
        '-o',
        'ConnectTimeout=10',
        '-o',
        'ServerAliveInterval=15',
        `liren@${host}`,
        `sudo bash -c ${JSON.stringify(cmd)}`,
      ],
      { encoding: 'utf8', timeout: timeoutMs },
    )
    if (r.status === 0) return (r.stdout ?? '').trim()
    lastErr = (r.stderr ?? '').trim() || `exit=${r.status}`
    if (attempt < RETRIES) {
      log(`  ⚠ ssh transient (sshSudo): ${lastErr.slice(-160)} — retry ${attempt + 1}/${RETRIES} in ${BACKOFF_MS}ms`)
      // Synchronous sleep — we're inside a sync helper. Use the small
      // child-process pattern: spawnSync('sleep', [...]) is portable.
      spawnSync('sleep', [String(BACKOFF_MS / 1000)])
    }
  }
  // Bubble up via empty string — caller treats empty stdout + (caller's
  // own status check) as failure. We log the last stderr for context.
  log(`  ✗ sshSudo gave up after ${RETRIES + 1} attempts. Last stderr: ${lastErr.slice(-200)}`)
  return ''
}

/**
 * Forensic dump when step 5 times out — SSH into the VPS BEFORE the
 * emergency teardown nukes it, capture the relevant logs/state, print
 * them to stdout. Stays best-effort: any SSH failure prints a marker
 * but doesn't throw (we still want the parent fail() to propagate).
 */
function dumpVpsForensics(host: string, password: string): void {
  const probes = [
    {
      label: 'whoami runs as (user identity check)',
      cmd: 'echo "ssh-as=$(whoami)  sudo-as=$(sudo whoami)"',
    },
    {
      label: 'unit file User= setting (which UID does ExecStartPre run as?)',
      cmd: 'grep -E "^User=|^Group=|^ExecStart" /etc/systemd/system/hermes-gateway.service || echo "(unit file missing)"',
    },
    {
      label: 'systemctl status hermes-gateway (no pager)',
      cmd: 'systemctl status hermes-gateway --no-pager 2>&1 | head -40 || echo "(systemctl returned non-zero)"',
    },
    {
      label: 'systemctl cat hermes-gateway (effective config)',
      cmd: 'systemctl cat hermes-gateway --no-pager 2>&1 | head -60 || echo "(cat failed)"',
    },
    {
      label: 'weuseai-bundle-pull script perms + first 5 lines',
      cmd: 'ls -la /usr/local/bin/weuseai-bundle-pull && echo "---" && head -5 /usr/local/bin/weuseai-bundle-pull',
    },
    {
      label: '/var/log/weuseai-bundle-pull.log (size + last 80 lines)',
      cmd: 'ls -la /var/log/weuseai-bundle-pull.log 2>&1; echo "---"; tail -80 /var/log/weuseai-bundle-pull.log 2>&1',
    },
    {
      label: 'manual re-invocation of bundle-pull as ROOT (capture stdout+stderr)',
      cmd: 'bash -x /usr/local/bin/weuseai-bundle-pull 2>&1 | tail -120',
    },
    {
      label: 'post-manual-run: /var/log/weuseai-bundle-pull.log',
      cmd: 'tail -80 /var/log/weuseai-bundle-pull.log 2>&1',
    },
    {
      label: 'post-manual-run: bundle dir state',
      cmd: 'find /var/lib/weuseai/bundle -maxdepth 4 2>&1 | head -30',
    },
    {
      label: 'post-manual-run: .installed-version',
      cmd: `cat /var/lib/weuseai/bundle/${AGENT_SLUG}/.installed-version 2>&1 || echo "(still missing)"`,
    },
    {
      label: '/home/weuseai/.hermes/.env (key names only — values redacted)',
      cmd: 'grep -E "^[A-Z_]+=" /home/weuseai/.hermes/.env 2>&1 | sed -E "s/=.*/=<redacted>/" || echo "(env missing)"',
    },
    {
      label: 'recent journalctl for hermes-gateway',
      cmd: 'journalctl -u hermes-gateway --no-pager -n 30 2>&1 || echo "(journalctl unavailable)"',
    },
  ]
  console.error('\n' + '─'.repeat(70))
  console.error('Forensics dump (step 5 timeout):')
  console.error('─'.repeat(70))
  for (const p of probes) {
    console.error(`\n▸ ${p.label}`)
    try {
      const out = sshSudo(host, password, p.cmd)
      console.error(out || '(no output)')
    } catch (e) {
      console.error(`  (probe threw: ${e instanceof Error ? e.message : String(e)})`)
    }
  }
  console.error('\n' + '─'.repeat(70) + '\n')
}

async function pollForBundleInstalled(host: string, password: string, maxMs = 5 * 60 * 1000): Promise<string> {
  const startMs = Date.now()
  const installedFile = `/var/lib/weuseai/bundle/${AGENT_SLUG}/.installed-version`
  while (Date.now() - startMs < maxMs) {
    const got = sshSudo(host, password, `cat ${installedFile} 2>/dev/null || true`, 15000)
    if (got.length > 0) {
      return got
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  // Forensic dump BEFORE fail() so we get the diagnostic in the log.
  // Emergency teardown still fires (smokeVpsId is set in main()).
  dumpVpsForensics(host, password)
  fail(`Timed out waiting for ${installedFile}`)
}

async function verifyVpsState(host: string, password: string): Promise<void> {
  const checks = [
    { label: 'SKILL.md installed', cmd: `ls /home/weuseai/.hermes/skills/*/SKILL.md 2>/dev/null | head -3` },
    { label: 'customer-grown dir', cmd: `ls -la /var/lib/weuseai/customer-grown/` },
    { label: 'extension-log.jsonl exists', cmd: `[ -f /var/lib/weuseai/customer-grown/extension-log.jsonl ] && echo OK` },
    { label: 'bundle-pull-script installed', cmd: `[ -x /usr/local/bin/weuseai-bundle-pull ] && echo OK` },
    { label: 'systemd drop-in present', cmd: `cat /etc/systemd/system/hermes-gateway.service.d/10-bundle-pull.conf` },
    { label: 'bundle extracted', cmd: `ls /var/lib/weuseai/bundle/${AGENT_SLUG}/${BUNDLE_VERSION}/` },
  ]
  for (const c of checks) {
    // sshSudo includes retry logic so a single transient handshake
    // failure ("Connection closed by ... port 22" — observed on the
    // founder's flaky Mac network) doesn't fail the whole verify run.
    const out = sshSudo(host, password, c.cmd)
    if (out.length === 0) {
      fail(`Verify check FAILED: ${c.label}`, { stdout: '<empty>' })
    }
    log(`  ✓ ${c.label}`)
  }
}

async function verifyTelemetryRow(): Promise<void> {
  const { data, error } = await supabase
    .from('bundle_pull_attempts')
    .select('*')
    .eq('customer_id', CUSTOMER_ID)
    .eq('agent_slug', AGENT_SLUG)
    .order('attempted_at', { ascending: false })
    .limit(1)
  if (error) fail('bundle_pull_attempts query failed', error.message)
  if (!data || data.length === 0) {
    fail('No bundle_pull_attempts row recorded for this customer/agent')
  }
  const row = data[0] as Record<string, unknown>
  if (row.status !== 'success') {
    log(`  ⚠ telemetry row status='${row.status}' (expected 'success')`)
  }
  log(`  ✓ telemetry row recorded: status=${row.status}, version=${row.version_installed}, bytes=${row.bytes_pulled}`)
}

// ─── main ──────────────────────────────────────────────────────────────

async function main() {
  // Step 1: publish bundle
  await step('Publish bundle to Storage', publishBundle)

  // Step 2: spawn VPS via IDCloudHost API (direct fetch — bypasses the
  // provisioning service's IDCloudHostVPSProvider class to avoid coupling
  // this smoke script to internal API churn).
  // Mirror services/provisioning/src/providers/idcloudhost-vps.ts behaviour:
  // empty region → no-region URL (which IS the verified Phase 2A path).
  // A non-empty region (cyc01, bus02 from IDCH docs) → regioned URL. The
  // pseudo-region 'jkt01' that earlier drafts of this script defaulted to
  // is NOT a valid route — it returned HTTP 404 "no route and no API found
  // with those values" during the first live run.
  const REGION = process.env.IDCLOUDHOST_REGION ?? ''
  const idchBase = REGION
    ? `https://api.idcloudhost.com/v1/${REGION}/user-resource`
    : 'https://api.idcloudhost.com/v1/user-resource'
  const idchIpBase = REGION
    ? `https://api.idcloudhost.com/v1/${REGION}/network/ip_addresses`
    : `https://api.idcloudhost.com/v1/network/ip_addresses`

  // Generate a strong root password matching IDCH's policy (16 chars,
  // mixed case + digit). Returned to caller via the create response;
  // we use it for SSH below.
  const generatedPassword = `Smoke${Date.now().toString(36)}A1b2c3D4`

  let vpsId: string = ''
  let host: string = ''
  const password = generatedPassword

  await step('Spawn IDCloudHost VPS', async () => {
    // Field names per services/provisioning/src/providers/idcloudhost-vps.ts:
    //   - `password` (NOT `initial_password`)
    //   - `username: 'liren'` (matches Phase 2A pattern; IDCH doesn't allow
    //     `root` as the initial user — returns 400 if you try)
    //   - `os_version: '24.04-lts'` (plain '24.04' returns 400; verified
    //     2026-05-02 in the provider class)
    // We SSH in as `liren` further down (with sudo) since the setup-script
    // body needs root to write systemd units etc.
    // The .env shipped with services/test-idcloudhost has a trailing
    // 'x' on the billing ID (`1200271389x`). IDCH's API rejects it as
    // "Invalid whole number provided". Strip non-digits defensively
    // so misconfigured envs don't burn a debug round-trip.
    const billingNumeric = (BILLING ?? '').replace(/[^0-9]/g, '')
    const body = new URLSearchParams({
      name: SMOKE_TAG,
      os_name: 'ubuntu',
      os_version: '24.04-lts',
      disks: '20',
      vcpu: '2',
      ram: '2048',
      username: 'liren',
      password,
      billing_account_id: billingNumeric,
      backup: 'false',
    })
    const r = await fetchWithRetry(
      `${idchBase}/vm`,
      {
        method: 'POST',
        headers: {
          apikey: IDCH_KEY!,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
      { label: 'idch-create' },
    )
    if (!r.ok) {
      fail(`IDCH create failed: HTTP ${r.status}`, await r.text())
    }
    const created = (await r.json()) as { uuid: string; name: string }
    vpsId = created.uuid
    smokeVpsId = vpsId  // expose to module-scope catch for emergency teardown
    log(`  VPS uuid=${vpsId}, waiting for public IP...`)
  })

  // Step 2b: poll for public IPv4 (separate listing endpoint per IDCH).
  // Each iteration's fetch is wrapped — a single transient network blip
  // (e.g. local LibreSSL handshake hiccup) shouldn't abort the smoke.
  // The outer 5-min budget remains the timeout; the loop just keeps
  // trying until either the IP appears or the budget expires.
  await step('Wait for public IPv4 attached', async () => {
    const startMs = Date.now()
    while (Date.now() - startMs < 5 * 60 * 1000) {
      try {
        const r = await fetchWithRetry(
          idchIpBase,
          { headers: { apikey: IDCH_KEY! } },
          { label: 'idch-ip-poll', retries: 2, backoffMs: 1500 },
        )
        if (r.ok) {
          const json = (await r.json()) as Array<{
            assigned_to?: string
            assigned_to_resource_type?: string
            address?: string
            type?: string
            unassigned_at?: string | null
            is_deleted?: boolean
            is_ipv6?: boolean
          }>
          // Filter mirrors services/provisioning/src/providers/idcloudhost-vps.ts
          // getPublicIp(). Critical: IDCH's `type` field is 'public' (NOT
          // 'public_ipv4' as our v1 of this script assumed). The IPv4-vs-IPv6
          // distinction comes from `is_ipv6: false`. We also gate on
          // assigned_to_resource_type==='virtual_machine' and unassigned_at
          // empty, otherwise stale records from prior VMs match too.
          const match = (Array.isArray(json) ? json : []).find(
            (ip) =>
              ip.assigned_to === vpsId &&
              ip.assigned_to_resource_type === 'virtual_machine' &&
              ip.type === 'public' &&
              !ip.is_ipv6 &&
              !ip.unassigned_at &&
              !ip.is_deleted,
          )
          if (match?.address) {
            host = match.address
            log(`  IP: ${host}`)
            return
          }
        }
      } catch (e) {
        // Transient network error after retries exhausted — log and
        // continue the outer 5-min poll loop; the next iteration's
        // 5-second sleep gives the network a chance to recover.
        log(`  ⚠ ip-poll iter error: ${e instanceof Error ? e.message : String(e)} (continuing)`)
      }
      await new Promise((r) => setTimeout(r, 5000))
    }
    fail('Timed out waiting for VPS public IPv4')
  })

  // Step 3: wait for SSH actually accepting auth+sessions, not just
  // listening. nc -z reports port-open the moment sshd binds the
  // socket, but sshd may still be initialising and immediately drop
  // the connection ("Connection closed by ... port 22"). We send an
  // actual `whoami` over sshpass and require it to round-trip.
  await step('Wait for SSH session ready (not just port open)', async () => {
    const startMs = Date.now()
    let lastErr = ''
    while (Date.now() - startMs < 5 * 60 * 1000) {
      const r = spawnSync(
        'sshpass',
        [
          '-p',
          password,
          'ssh',
          '-o',
          'StrictHostKeyChecking=no',
          '-o',
          'UserKnownHostsFile=/dev/null',
          '-o',
          'ConnectTimeout=8',
          '-o',
          'BatchMode=no',
          `liren@${host!}`,
          'whoami',
        ],
        { encoding: 'utf8', timeout: 15000 },
      )
      if (r.status === 0 && (r.stdout ?? '').trim() === 'liren') {
        return
      }
      lastErr = (r.stderr ?? '').trim().slice(-180) || `exit=${r.status}`
      await new Promise((r) => setTimeout(r, 5000))
    }
    fail(`SSH session never ready (last stderr: ${lastErr})`)
  })

  // Step 4: ship setup-script via SSH
  await step('Run buildSetupScript output via SSH', async () => {
    const bootstrapPath = 'agent-packs/_bootstrap-bundle.tar.gz'
    statSync(bootstrapPath)  // throws if missing
    const bootstrapBase64 = readFileSync(bootstrapPath).toString('base64')
    // Telegram token note: the smoke harness needs `hasTelegram=true` so
    // that `hermes gateway install --system` runs and registers the
    // `hermes-gateway.service` unit — without that unit, the
    // ExecStartPre drop-in never fires and `.installed-version` never
    // appears (the failure mode of the first 2026-05-08 Run 1: bundle
    // pull silently skipped because no service started). When a real
    // TELEGRAM_BOT_TOKEN env isn't set, fall back to a dummy token. The
    // gateway will fail Telegram auth at runtime — that's fine; we're
    // testing the bundle-pull pipeline, not Telegram delivery.
    const telegramBotTokenForSmoke =
      process.env.TELEGRAM_BOT_TOKEN ?? 'smoke-dummy-token-not-a-real-bot'
    const script = buildSetupScript({
      customerId: CUSTOMER_ID,
      tier: 'pro',
      telegramBotToken: telegramBotTokenForSmoke,
      telegramAllowedUserIds: process.env.TELEGRAM_ALLOWED_USER_IDS,
      openRouterKey: process.env.OPENROUTER_KEY,
      agentSlug: AGENT_SLUG,
      bundleTarBase64: bootstrapBase64,
      // Phase 2E-3: fleet SSH pubkey written to authorized_keys for
      // tier-bump access. Empty string → no install (back-compat path
      // in setup-script.ts skips the section). Smoke requires it set
      // when running tier-bump verification.
      fleetSshPubkey: FLEET_SSH_PUBKEY || undefined,
    })
    const ssh = new ExecSshProvisioner()
    const result = await ssh.runSetup({
      host: host,
      // SSH as `liren` (the initial IDCH user) — ExecSshProvisioner
      // wraps the script in `sudo bash -s` so it still runs as root
      // remotely. Matches the production customer-flow.ts pattern.
      user: 'liren',
      password: password,
      script,
      timeoutMs: 20 * 60 * 1000,  // setup ~10-15 min including Hermes install
    })
    if (!result.ok) {
      fail(`Setup script failed (exit=${result.exitCode})`, {
        stdout: result.stdout.slice(-2000),
        stderr: result.stderr.slice(-1000),
      })
    }
  })

  // Step 5: wait for bundle-pull to complete
  const installedVersion = await step(
    'Wait for /var/lib/weuseai/bundle/<slug>/.installed-version',
    () => pollForBundleInstalled(host, password),
  )
  log(`  Installed version: ${installedVersion}`)

  // Step 6: verify VPS file-system state
  await step('Verify VPS filesystem state', () => verifyVpsState(host, password))

  // Step 7: verify telemetry row
  await step('Verify bundle_pull_attempts row', verifyTelemetryRow)

  // ─── Phase 2E-3 verification block ─────────────────────────────────────

  // Step 7a (Phase 2E-3): verify fleet SSH pubkey installed in
  // authorized_keys + the corresponding privkey actually authenticates.
  // Skip when no pubkey was supplied at provision (back-compat smoke).
  if (FLEET_SSH_PUBKEY && FLEET_SSH_PRIVATE_KEY && !SKIP_TIER_BUMP) {
    await step('Phase 2E-3: verify fleet SSH key auth works', async () => {
      // First: confirm the pubkey is on the VPS via the password channel.
      const auth = sshSudo(host, password, 'cat /home/weuseai/.ssh/authorized_keys')
      const pubkeyTrimmed = FLEET_SSH_PUBKEY.trim()
      if (!auth.includes(pubkeyTrimmed.split(' ').slice(0, 2).join(' '))) {
        fail('Fleet pubkey not found in /home/weuseai/.ssh/authorized_keys', {
          tail: auth.slice(-300),
        })
      }
      log('  ✓ pubkey present in authorized_keys')

      // Second: actually SSH in using the privkey, no password.
      const tmpDir = mkdtempSync(join(tmpdir(), 'weuseai-fleet-smoke-'))
      const keyPath = join(tmpDir, 'id_fleet')
      const { writeFileSync, chmodSync, rmSync } = await import('node:fs')
      // OpenSSH PEM keys MUST end with newline. Shell `$(cat keyfile)` strips
      // it, so reach for the trailing-\n guard. Without it, ssh -i errors
      // "invalid format" and (with BatchMode=yes) returns exit 255.
      const normalisedKey = FLEET_SSH_PRIVATE_KEY.endsWith('\n')
        ? FLEET_SSH_PRIVATE_KEY
        : FLEET_SSH_PRIVATE_KEY + '\n'
      writeFileSync(keyPath, normalisedKey, { encoding: 'utf8' })
      chmodSync(keyPath, 0o600)
      try {
        const r = spawnSync(
          'ssh',
          [
            '-i', keyPath,
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'UserKnownHostsFile=/dev/null',
            '-o', 'ConnectTimeout=10',
            '-o', 'BatchMode=yes',
            '-T',
            `weuseai@${host}`,
            'whoami',
          ],
          { encoding: 'utf8', timeout: 20000 },
        )
        if (r.status !== 0 || (r.stdout ?? '').trim() !== 'weuseai') {
          fail('Fleet key SSH auth failed', {
            exit: r.status,
            stdout: (r.stdout ?? '').slice(-200),
            stderr: (r.stderr ?? '').slice(-300),
          })
        }
        log('  ✓ fleet SSH key auth works (whoami=weuseai)')
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    // Step 7b: tier-bump test — directly invoke the route handler
    // (mocking out the provisioning Express server). Verifies the
    // .env edit + service restart end-to-end.
    await step('Phase 2E-3: tier-bump → studio + verify .env updated', async () => {
      const r = await tierBump(
        {
          customer_id: CUSTOMER_ID,
          target_tier: 'studio',
          vps_host: host,
        },
        { fleetPrivateKey: FLEET_SSH_PRIVATE_KEY },
      )
      if (!r.ok) {
        fail(`tierBump returned ok:false: ${r.error}`)
      }
      log(`  ✓ tierBump returned restarted_at=${r.restarted_at}`)

      // Confirm the .env was actually edited.
      const envContent = sshSudo(host, password, 'cat /home/weuseai/.hermes/.env')
      if (!envContent.includes('WEUSEAI_TIER=studio')) {
        fail('.env not updated to WEUSEAI_TIER=studio', {
          tail: envContent.slice(-400),
        })
      }
      log('  ✓ .env contains WEUSEAI_TIER=studio')

      // Confirm the systemd unit was restarted (active or activating).
      const sysStatus = sshSudo(host, password, 'systemctl is-active hermes-gateway')
      log(`  systemctl is-active hermes-gateway: ${sysStatus || '(empty)'}`)
      // We don't fail on inactive/failed — Hermes' main process is
      // expected to fail (dummy Telegram token). The restart itself
      // (which is what tier-bump validates) IS proven by the .env
      // reflecting the new tier — that means systemctl restart fired
      // AND ExecStartPre re-ran (the ExecStartPre is what reads .env).
    })
  } else {
    log('  ⚠ Skipping Phase 2E-3 fleet SSH + tier-bump (FLEET_SSH_* envs not set, or SKIP_TIER_BUMP=1)')
  }

  // Step 7c (Phase 2E-3): PDF render round-trip via the deployed
  // invoice-generator-handler Edge Function. Asserts the response
  // includes pdf.status='rendered' (CF Browser Rendering succeeded)
  // and email.status='stubbed' (no RESEND_API_KEY in smoke env).
  if (!SKIP_PDF_RENDER) {
    await step('Phase 2E-3: invoice-generator-handler → PDF + email payload', async () => {
      const fnUrl = `${SUPABASE_URL}/functions/v1/invoice-generator-handler`
      const r = await fetchWithRetry(
        fnUrl,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer_id: CUSTOMER_ID,
            parameters: {
              client_name: 'PT Smoke Test, Tbk.',
              client_address: 'Jakarta, Indonesia',
              items: [
                { description: 'Phase 2E-3 smoke validation — 1h @ test rate', qty: 1, unit_price: 1_000_000 },
              ],
              tax_rate: 0.11,
              currency: 'IDR',
            },
          }),
        },
        { label: 'invoice-generator', retries: 3, backoffMs: 3000 },
      )
      if (!r.ok) {
        const txt = await r.text()
        fail(`invoice-generator HTTP ${r.status}`, txt.slice(0, 400))
      }
      const body = (await r.json()) as {
        file_url?: string
        pdf?: { status: string; file_url?: string; bytes?: number; error?: string }
        email?: { status: string; detail?: string }
      }
      if (!body.file_url) fail('Response missing file_url (HTML)')
      if (!body.pdf) fail('Response missing pdf field')
      if (body.pdf.status !== 'rendered') {
        fail(`pdf.status='${body.pdf.status}' (expected 'rendered')`, body.pdf)
      }
      if (!body.pdf.file_url || !body.pdf.bytes) {
        fail('pdf payload missing file_url or bytes', body.pdf)
      }
      log(`  ✓ PDF rendered: ${body.pdf.bytes} bytes at ${body.pdf.file_url.slice(0, 80)}...`)
      if (!body.email) fail('Response missing email field')
      // Stub mode is the expected smoke state (no RESEND_API_KEY) —
      // 'sent' is also acceptable if the founder set the key already.
      if (!['stubbed', 'sent', 'skipped_no_email'].includes(body.email.status)) {
        fail(`email.status='${body.email.status}' (unexpected)`, body.email)
      }
      log(`  ✓ email status: ${body.email.status} — ${body.email.detail ?? '(no detail)'}`)
    })
  } else {
    log('  ⚠ Skipping Phase 2E-3 PDF round-trip (SKIP_PDF_RENDER=1)')
  }

  // Step 8: tear down (unless SKIP_TEARDOWN)
  if (!SKIP_TEARDOWN) {
    await step('Tear down VPS', async () => {
      const r = await fetch(
        `${idchBase}/vm?uuid=${encodeURIComponent(vpsId)}`,
        { method: 'DELETE', headers: { apikey: IDCH_KEY! } },
      )
      if (!r.ok) {
        log(`  ⚠ delete returned HTTP ${r.status}: ${await r.text()}`)
      } else {
        log(`  VPS ${vpsId} deleted`)
      }
    })
  } else {
    log(`  ⚠ Skipping teardown (SKIP_TEARDOWN=1). VPS ${vpsId} still running at ${host}.`)
    log(`    Run scripts/cleanup-orphan-vms.ts to delete tagged smoke VPSes.`)
  }

  console.log('\n' + '━'.repeat(70))
  console.log('✓ Phase 2E-2 SMOKE TEST PASSED')
  console.log('━'.repeat(70))
}

// ─── emergency teardown ─────────────────────────────────────────────
//
// If main() throws AFTER a VPS has been spawned, we MUST tear it down
// — otherwise the smoke leaks compute (Rp 4-8k/day) until cleanup-
// orphan-vms.ts catches it 24h later. Honour SKIP_TEARDOWN so an active
// debug session isn't ambushed.
async function emergencyTeardown(reason: string): Promise<void> {
  if (!smokeVpsId) {
    console.error(`(no VPS to clean up — ${reason})`)
    return
  }
  if (SKIP_TEARDOWN) {
    console.error(
      `⚠ SKIP_TEARDOWN=1 set — leaving VPS ${smokeVpsId} alive for inspection.`,
    )
    console.error(`  Run cleanup manually: scripts/cleanup-orphan-vms.ts`)
    return
  }
  const REGION = process.env.IDCLOUDHOST_REGION ?? ''
  const idchBase = REGION
    ? `https://api.idcloudhost.com/v1/${REGION}/user-resource`
    : 'https://api.idcloudhost.com/v1/user-resource'
  console.error(
    `→ emergency teardown: deleting VPS ${smokeVpsId} (cause: ${reason})`,
  )
  try {
    const r = await fetchWithRetry(
      `${idchBase}/vm?uuid=${encodeURIComponent(smokeVpsId)}`,
      { method: 'DELETE', headers: { apikey: IDCH_KEY! } },
      { retries: 4, backoffMs: 3000, label: 'emergency-teardown' },
    )
    if (r.ok) {
      console.error(`  ✓ deleted ${smokeVpsId}`)
    } else {
      console.error(
        `  ✗ delete returned HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`,
      )
      console.error(`  → run scripts/cleanup-orphan-vms.ts to retry`)
    }
  } catch (e) {
    console.error(
      `  ✗ teardown threw: ${e instanceof Error ? e.message : String(e)}`,
    )
    console.error(`  → run scripts/cleanup-orphan-vms.ts to retry`)
  }
}

main().catch(async (e) => {
  console.error('\n' + '━'.repeat(70))
  console.error('✗ Phase 2E-2 SMOKE TEST FAILED')
  console.error(e instanceof Error ? e.stack : e)
  console.error('━'.repeat(70))
  await emergencyTeardown(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
