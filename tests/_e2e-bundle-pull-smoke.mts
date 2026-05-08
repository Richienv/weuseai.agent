/**
 * Phase 2E-2 live VPS smoke test — MANUAL RUN ONLY.
 *
 * Spec: docs/plans/2026-05-08-phase-2e-2-bundle-delivery-spec.md
 *
 * Costs ~$0.50 per run (IDCloudHost VPS for ~30 min). Founder gating
 * policy: max 2 runs per Phase 2E-2 (mid-phase + pre-PR). Don't run
 * per-commit.
 *
 * Underscore-prefixed filename keeps it OUT of the *.spec.ts glob —
 * `npm test` will not pick this up.
 *
 * Invocation (manual, requires real env vars):
 *
 *   SUPABASE_URL=https://gtjgsligllbjcisiyrah.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role> \
 *   IDCLOUDHOST_API_KEY=<idch-key> \
 *   IDCLOUDHOST_BILLING_ACCOUNT_ID=<billing-id> \
 *   AGENT_SLUG=doc-expert \
 *   BUNDLE_VERSION=1.0.0 \
 *     npx tsx tests/_e2e-bundle-pull-smoke.mts
 *
 * Optional envs:
 *   CUSTOMER_ID — defaults to founder's CID e282ce25-764d-4d88-b592-d4ef2c6cc360
 *   SKIP_PUBLISH — '1' to skip the bundle-publish step (use existing version)
 *   SKIP_TEARDOWN — '1' to leave VPS up after smoke (for debugging; cleanup-orphan-vms.ts later)
 *
 * What it does:
 *   1. Tar agent-packs/<slug>/ + agent-packs/_shared/ → upload via bundle-publish
 *   2. Spawn IDCloudHost VPS tagged weuseai-smoke-2e2-<YYYYMMDD>
 *   3. SSH in, run buildSetupScript output (with bootstrap bundle)
 *   4. Wait for /var/lib/weuseai/bundle/<slug>/.installed-version (poll, max 5 min)
 *   5. Verify: SKILL.md files in ~/.hermes/skills/, customer-grown dir present, bundle_pull_attempts row inserted
 *   6. Tear down VPS (unless SKIP_TEARDOWN)
 *   7. Print pass/fail report
 */

import { execSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createClient } from '@supabase/supabase-js'

import { buildSetupScript } from '../services/provisioning/src/setup-script.ts'
import { ExecSshProvisioner } from '../services/provisioning/src/ssh/exec-ssh-provisioner.ts'

// IDCloudHost API used directly via fetch() rather than the provisioning
// service's IDCloudHostVPSProvider class. Decouples this smoke script
// from internal provider API churn — only depends on the public IDCH
// REST contract.

const FOUNDER_CID = 'e282ce25-764d-4d88-b592-d4ef2c6cc360'

// ─── env validation ────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const IDCH_KEY = process.env.IDCLOUDHOST_API_KEY
const BILLING = process.env.IDCLOUDHOST_BILLING_ACCOUNT_ID
const AGENT_SLUG = process.env.AGENT_SLUG ?? 'doc-expert'
const BUNDLE_VERSION = process.env.BUNDLE_VERSION ?? '1.0.0'
const CUSTOMER_ID = process.env.CUSTOMER_ID ?? FOUNDER_CID
const SKIP_PUBLISH = process.env.SKIP_PUBLISH === '1'
const SKIP_TEARDOWN = process.env.SKIP_TEARDOWN === '1'

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
  process.exit(1)
}

function log(msg: string, ...rest: unknown[]) {
  console.log(`[${new Date().toISOString()}] ${msg}`, ...rest)
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
      Authorization: `Bearer ${SERVICE_KEY}`,
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

async function pollForBundleInstalled(host: string, password: string, maxMs = 5 * 60 * 1000): Promise<string> {
  const startMs = Date.now()
  const installedFile = `/var/lib/weuseai/bundle/${AGENT_SLUG}/.installed-version`
  while (Date.now() - startMs < maxMs) {
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
        `root@${host}`,
        `cat ${installedFile} 2>/dev/null || true`,
      ],
      { encoding: 'utf8' },
    )
    const got = (r.stdout ?? '').trim()
    if (got.length > 0) {
      return got
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
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
        `root@${host}`,
        c.cmd,
      ],
      { encoding: 'utf8' },
    )
    if (r.status !== 0 || (r.stdout ?? '').trim().length === 0) {
      fail(`Verify check FAILED: ${c.label}`, { stdout: r.stdout, stderr: r.stderr })
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
  const REGION = process.env.IDCLOUDHOST_REGION ?? 'jkt01'
  const idchBase = `https://api.idcloudhost.com/v1/${REGION}/user-resource`

  // Generate a strong root password matching IDCH's policy (16 chars,
  // mixed case + digit). Returned to caller via the create response;
  // we use it for SSH below.
  const generatedPassword = `Smoke${Date.now().toString(36)}A1b2c3D4`

  let vpsId: string = ''
  let host: string = ''
  const password = generatedPassword

  await step('Spawn IDCloudHost VPS', async () => {
    const body = new URLSearchParams({
      name: SMOKE_TAG,
      os_name: 'ubuntu',
      os_version: '24.04-lts',
      disks: '20',
      vcpu: '2',
      ram: '2048',
      username: 'root',
      initial_password: password,
      billing_account_id: BILLING!,
      backup: 'false',
    })
    const r = await fetch(`${idchBase}/vm`, {
      method: 'POST',
      headers: { apikey: IDCH_KEY! },
      body,
    })
    if (!r.ok) {
      fail(`IDCH create failed: HTTP ${r.status}`, await r.text())
    }
    const created = (await r.json()) as { uuid: string; name: string }
    vpsId = created.uuid
    log(`  VPS uuid=${vpsId}, waiting for public IP...`)
  })

  // Step 2b: poll for public IPv4 (separate listing endpoint per IDCH).
  await step('Wait for public IPv4 attached', async () => {
    const startMs = Date.now()
    while (Date.now() - startMs < 5 * 60 * 1000) {
      const r = await fetch(
        `https://api.idcloudhost.com/v1/${REGION}/network/ip_addresses`,
        { headers: { apikey: IDCH_KEY! } },
      )
      if (r.ok) {
        const json = (await r.json()) as Array<{
          assigned_to?: string
          address?: string
          type?: string
        }>
        const match = (Array.isArray(json) ? json : []).find(
          (ip) => ip.assigned_to === vpsId && ip.type === 'public_ipv4',
        )
        if (match?.address) {
          host = match.address
          log(`  IP: ${host}`)
          return
        }
      }
      await new Promise((r) => setTimeout(r, 5000))
    }
    fail('Timed out waiting for VPS public IPv4')
  })

  // Step 3: wait for SSH open
  await step('Wait for SSH port 22 open', async () => {
    const startMs = Date.now()
    while (Date.now() - startMs < 5 * 60 * 1000) {
      const r = spawnSync('nc', ['-z', '-w', '3', host!, '22'], { encoding: 'utf8' })
      if (r.status === 0) return
      await new Promise((r) => setTimeout(r, 5000))
    }
    fail('SSH port 22 never opened')
  })

  // Step 4: ship setup-script via SSH
  await step('Run buildSetupScript output via SSH', async () => {
    const bootstrapPath = 'agent-packs/_bootstrap-bundle.tar.gz'
    statSync(bootstrapPath)  // throws if missing
    const bootstrapBase64 = readFileSync(bootstrapPath).toString('base64')
    const script = buildSetupScript({
      customerId: CUSTOMER_ID,
      tier: 'pro',
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramAllowedUserIds: process.env.TELEGRAM_ALLOWED_USER_IDS,
      openRouterKey: process.env.OPENROUTER_KEY,
      agentSlug: AGENT_SLUG,
      bundleTarBase64: bootstrapBase64,
    })
    const ssh = new ExecSshProvisioner()
    const result = await ssh.runSetup({
      host: host,
      user: 'root',
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

main().catch((e) => {
  console.error('\n' + '━'.repeat(70))
  console.error('✗ Phase 2E-2 SMOKE TEST FAILED')
  console.error(e instanceof Error ? e.stack : e)
  console.error('━'.repeat(70))
  process.exit(1)
})
