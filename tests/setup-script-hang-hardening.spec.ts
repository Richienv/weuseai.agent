/**
 * HF-2 (2026-05-12 founder Q3+Q4 lock): setup-script hardening.
 * - Hermes install wrapped in `timeout 600` (10 min)
 * - apt-get update / install run via the apt_retry helper — each
 *   attempt keeps its per-op timeout (90s / 180s), 3x retry on flake
 *   (added 2026-05-16, Phase F run #2 — flaky Ubuntu apt mirror)
 * - Post-install `hermes --version` verification (30 sec cap)
 * - 30-sec heartbeat background loop writing
 *   /var/log/hermes-install.heartbeat
 * - Gateway install/start errors NO LONGER hidden as "non-fatal"
 *
 * Generator-level tests pin the produced bash structure — they don't
 * run the script, but they catch drift if a future edit removes a
 * hardening element.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildSetupScript } from '../services/provisioning/src/setup-script.ts'

const baseParams = {
  customerId: 'cust-hf2-test',
  tier: 'pro' as const,
  telegramBotToken: '12345:fake',
  telegramAllowedUserIds: '987',
  openRouterKey: 'sk-or-v1-test',
  bundleTarBase64: 'fake-bundle-b64',
  fleetSshPubkey: 'ssh-ed25519 AAAA',
  hermesVersion: 'v0.13.0',
}

// ─── timeouts ──────────────────────────────────────────────────────────

test('Hermes install: wrapped in `timeout 600` (10 min hard cap)', () => {
  const s = buildSetupScript(baseParams)
  // The Hermes install line should use the timeout binary with 600 sec
  // before the su -c block.
  assert.match(
    s,
    /timeout\s+600\s+(\\\n\s+)?su - weuseai -c .* curl -fsSL --max-time \d+ https:\/\/raw\.githubusercontent\.com\/NousResearch\/hermes-agent/,
    'Hermes install must be wrapped in timeout 600',
  )
})

test('Hermes install: curl uses --max-time 30 (network-level)', () => {
  const s = buildSetupScript(baseParams)
  // The inner curl that fetches install.sh should also have a max-time
  // so a stuck TCP connection fails fast (network-level), not just at
  // the outer timeout.
  assert.match(
    s,
    /curl -fsSL --max-time 30 https:\/\/raw\.githubusercontent\.com\/NousResearch\/hermes-agent/,
    'curl in Hermes install needs --max-time 30',
  )
})

test('apt_retry helper passes each attempt through `timeout "$tmo"`', () => {
  const s = buildSetupScript(baseParams)
  // The retry helper (2026-05-16) preserves the HF-2 hang-hardening
  // property: every apt attempt is still wrapped in timeout(1). The
  // per-op timeout is passed as the helper's 3rd arg.
  assert.match(s, /apt_retry\(\) \{/, 'apt_retry helper must be defined')
  assert.match(s, /timeout "\$tmo" "\$@"/, 'apt_retry must wrap each attempt in timeout')
})

test('apt-get update: run via apt_retry with a 90s per-attempt timeout', () => {
  const s = buildSetupScript(baseParams)
  // HF-2b regression guard (2026-05-12): the env-var MUST be inside an
  // `env VAR=val` clause. Here `env` follows the timeout value (90) in
  // the apt_retry call; inside the helper it becomes `timeout 90 env …`.
  assert.match(
    s,
    /apt_retry "apt-get update" \d+ 90 env DEBIAN_FRONTEND=noninteractive apt-get update/,
  )
})

test('apt-get install: run via apt_retry with a 180s per-attempt timeout', () => {
  const s = buildSetupScript(baseParams)
  assert.match(
    s,
    /apt_retry "apt-get install base packages" \d+ 180 env DEBIAN_FRONTEND=noninteractive apt-get install/,
  )
})

test('HF-2b regression: env-var prefix never directly follows `timeout N`', () => {
  const s = buildSetupScript(baseParams)
  // Catches the exact shape that broke prod on the customer VPS at
  // 08:22 (e282ce25 / 4268f02b on Vultr SGP):
  //   timeout 90 DEBIAN_FRONTEND=noninteractive apt-get update
  //              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  // timeout(1) parses VAR=val as its command name. Fix is the `env`
  // wrapper. This negative-match keeps drift caught at PR time.
  assert.equal(
    /timeout\s+\d+\s+[A-Z_]+=/.test(s),
    false,
    'setup-script has a "timeout N VAR=val ..." pattern — timeout(1) treats VAR=val as its command name. Use "timeout N env VAR=val ..." instead.',
  )
})

// ─── post-install verification ─────────────────────────────────────────

test('post-install verify: `hermes --version` must succeed (within 30 sec)', () => {
  const s = buildSetupScript(baseParams)
  // The verification line should run hermes --version with a 30-sec
  // timeout, and exit non-zero if it fails. Looks for the explicit
  // exit code 8 we wire when the binary is missing/broken.
  assert.match(s, /timeout\s+30\s+su - weuseai -c '~\/\.local\/bin\/hermes --version'/)
  assert.match(s, /exit 8/, 'must exit with a distinct code when verification fails')
})

// ─── heartbeat ─────────────────────────────────────────────────────────

test('heartbeat: spawned BEFORE Hermes install, every 30 sec', () => {
  const s = buildSetupScript(baseParams)
  // Heartbeat function defined
  assert.match(s, /heartbeat\s*\(\s*\)\s*\{/)
  // Writes to the canonical file (parent customer-flow can SSH-tail this)
  assert.match(s, /\/var\/log\/hermes-install\.heartbeat/)
  // Cadence pinned
  assert.match(s, /sleep\s+30/)
  // Spawned as background + PID captured
  assert.match(s, /heartbeat &/)
  assert.match(s, /HEARTBEAT_PID=\$!/)
})

test('heartbeat: cleaned up on script exit (trap)', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /trap "kill \$HEARTBEAT_PID 2>\/dev\/null" EXIT/)
})

test('heartbeat: lives BEFORE the Hermes install block (so it covers it)', () => {
  const s = buildSetupScript(baseParams)
  const heartbeatStart = s.indexOf('HEARTBEAT_PID=$!')
  const hermesInstall = s.indexOf('NousResearch/hermes-agent/main/scripts/install.sh')
  assert.ok(heartbeatStart > 0, 'heartbeat spawn must be present')
  assert.ok(hermesInstall > 0, 'Hermes install must be present')
  assert.ok(
    heartbeatStart < hermesInstall,
    'heartbeat must be spawned before Hermes install starts',
  )
})

// ─── no more "non-fatal" short-circuits on gateway ─────────────────────

test('gateway install: failure is FATAL (no `|| log non-fatal`)', () => {
  const s = buildSetupScript(baseParams)
  // The pre-HF-2 pattern was:
  //   ${HERMES} gateway install --system --run-as-user weuseai >> "$LOG" 2>&1 || log "✗ gateway install failed (non-fatal)"
  // HF-2 removes the `|| log "(non-fatal)"` short-circuit and treats
  // gateway failure as fatal with a distinct exit code.
  assert.equal(
    /gateway install --system --run-as-user weuseai .*\|\| log .*non-fatal/.test(s),
    false,
    'gateway install must NOT be tagged non-fatal',
  )
  // Affirmative check: explicit exit on gateway install failure
  assert.match(s, /gateway install --system --run-as-user weuseai/)
  assert.match(s, /gateway install FAILED/i)
})

test('gateway start: failure is FATAL (no `|| log non-fatal`)', () => {
  const s = buildSetupScript(baseParams)
  assert.equal(
    /gateway start --system .*\|\| log .*non-fatal/.test(s),
    false,
    'gateway start must NOT be tagged non-fatal',
  )
})

// ─── overall structure preserved ───────────────────────────────────────

test('script: still ends cleanly with ready marker', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /\/opt\/weuseai\/ready/)
  assert.match(s, /=== weuseai setup COMPLETE ===/)
})

test('script: heartbeat does NOT bleed into the parent SSH session output (background)', () => {
  const s = buildSetupScript(baseParams)
  // Heartbeat writes to a FILE (/var/log/hermes-install.heartbeat),
  // not stdout/stderr. Confirms parent SSH session output remains
  // clean — heartbeats only visible via SSH tail of the file.
  const heartbeatBlock = s.match(/heartbeat\s*\(\s*\)\s*\{[\s\S]*?\}/)?.[0] ?? ''
  assert.ok(heartbeatBlock.length > 0, 'heartbeat function must be present')
  assert.ok(
    !heartbeatBlock.includes('echo'),
    'heartbeat must not echo to stdout (would pollute SSH stream)',
  )
})
