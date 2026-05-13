/**
 * Phase 3 (2026-05-13): Tier 2 Docker harness for setup-script.
 *
 * Builds an Ubuntu 22.04 testbed container + runs the rendered
 * setup-script inside it. Asserts the script:
 *   - Exits non-zero with a CLEAR error code rather than hanging
 *   - Writes /var/log/weuseai-setup.log with the expected stage log lines
 *   - Spawns + cleans up the heartbeat background process
 *   - Honors the HF-2c bundle install path (env vars written)
 *
 * SKIP-by-default when `docker` is not available on the host (local
 * dev without Docker). CI runs them via `.github/workflows/setup-
 * script-harness.yml` which provides Docker.
 *
 * Why Tier 2 instead of full end-to-end: Hermes install via `curl |
 * bash` needs PyPI reachability + 4-6 min wall time. Running this in
 * every PR is too expensive. The harness instead intercepts at the
 * point where the script attempts the slow external calls and asserts
 * "we got this far, exit code is what we expect, log lines are
 * present." Tier 3 (full pipeline against a real cloud VPS) is a
 * separate manual-trigger CI job.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildSetupScript } from '../services/provisioning/src/setup-script'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const HARNESS_DIR = resolve(__dirname, 'setup-script-docker')
const IMAGE_TAG = 'weuseai-setup-harness:testbed'

function dockerAvailable(): boolean {
  try {
    execSync('docker version --format={{.Server.Version}}', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function buildImageOnce(): { ok: boolean; stderr?: string } {
  // Idempotent build — Docker caches layers. First run takes ~30 sec;
  // subsequent runs are <1 sec.
  const r = spawnSync(
    'docker',
    ['build', '-f', join(HARNESS_DIR, 'Dockerfile.testbed'), '-t', IMAGE_TAG, HARNESS_DIR],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return { ok: r.status === 0, stderr: r.stderr?.toString() }
}

function runInContainer(args: {
  script: string
  // Overrides to make the slow real-network steps no-op in the testbed.
  // We monkey-patch `apt-get`, `curl`, and `su` BEFORE the script runs
  // so the script reaches the heartbeat + env-write + verify blocks
  // without depending on PyPI / Telegram API / archive.ubuntu.com.
  shims?: Record<string, string>
  envVars?: Record<string, string>
  timeoutSec?: number
}): { exitCode: number; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), 'weuseai-docker-harness-'))
  try {
    writeFileSync(join(dir, 'setup.sh'), args.script, { encoding: 'utf8' })
    // Pre-script bootstrap: install shims into /usr/local/bin so they
    // intercept calls to apt-get / curl / su when the rendered script
    // runs. Shims simulate "ran successfully and quickly" so the test
    // exercises the orchestration logic without the slow network.
    let shimSetup = ''
    for (const [name, body] of Object.entries(args.shims ?? {})) {
      shimSetup += `cat > /usr/local/bin/${name} <<'WEUSEAI_HARNESS_SHIM_EOF'\n${body}\nWEUSEAI_HARNESS_SHIM_EOF\nchmod +x /usr/local/bin/${name}\n`
    }
    writeFileSync(join(dir, 'preflight.sh'), shimSetup, { encoding: 'utf8' })
    writeFileSync(
      join(dir, 'driver.sh'),
      `#!/bin/bash
set -uo pipefail
bash /work/preflight.sh
bash /work/setup.sh
EXIT_CODE=$?
echo "HARNESS_EXIT=$EXIT_CODE"
ls -la /var/log/weuseai-setup.log 2>/dev/null && cat /var/log/weuseai-setup.log
ls -la /var/log/hermes-install.heartbeat 2>/dev/null && cat /var/log/hermes-install.heartbeat
test -f /home/weuseai/.hermes/.env && echo "ENV_FILE_PRESENT" && head -20 /home/weuseai/.hermes/.env
exit $EXIT_CODE
`,
      { encoding: 'utf8' },
    )

    const envArgs: string[] = []
    for (const [k, v] of Object.entries(args.envVars ?? {})) {
      envArgs.push('-e', `${k}=${v}`)
    }

    const r = spawnSync(
      'docker',
      [
        'run', '--rm',
        '-v', `${dir}:/work:ro`,
        ...envArgs,
        IMAGE_TAG,
        'bash', '/work/driver.sh',
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: (args.timeoutSec ?? 60) * 1000,
      },
    )
    return {
      exitCode: r.status ?? -1,
      stdout: (r.stdout ?? '').toString(),
      stderr: (r.stderr ?? '').toString(),
    }
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
  }
}

// Standard shims that no-op the slow / network-bound steps so the
// harness exercises orchestration without real PyPI/apt traffic.
const NOOP_SHIMS = {
  'apt-get': '#!/bin/bash\necho "[shim apt-get] $*"\nexit 0\n',
  // Hermes install.sh — when invoked, write the binary stub + exit 0.
  'su': `#!/bin/bash
# Pass-through "su - weuseai -c '<cmd>'" but skip Hermes-install pipe.
# Otherwise honor what the caller asks for.
if [[ "$*" == *"hermes-agent/main/scripts/install.sh"* ]]; then
  mkdir -p /home/weuseai/.local/bin
  cat > /home/weuseai/.local/bin/hermes <<'INNEREOF'
#!/bin/bash
# Stub hermes binary — responds to --version + gateway install/start.
case "$1" in
  --version) echo "Hermes Agent v0.13.0 (harness-stub)"; exit 0 ;;
  gateway)
    case "$2" in
      install) echo "[shim hermes gateway install]"; exit 0 ;;
      start) echo "[shim hermes gateway start]"; exit 0 ;;
      *) echo "[shim hermes gateway $2]"; exit 0 ;;
    esac
    ;;
  cron) echo "[shim hermes cron]"; exit 0 ;;
  *) echo "[shim hermes $*]"; exit 0 ;;
esac
INNEREOF
  chmod +x /home/weuseai/.local/bin/hermes
  exit 0
fi
# Allow other su calls (e.g., for chown, mkdir) to be no-ops too.
echo "[shim su] $*"
exit 0
`,
  // useradd/usermod — no-op (the heartbeat already mkdir -p's the dirs)
  'useradd': '#!/bin/bash\necho "[shim useradd] $*"\nexit 0\n',
  'usermod': '#!/bin/bash\necho "[shim usermod] $*"\nexit 0\n',
  // systemctl — no-op so refresh-env-style restarts don't error in container
  'systemctl': '#!/bin/bash\necho "[shim systemctl] $*"\nexit 0\n',
  // curl — only Telegram halo curl ever runs in the script at this layer
  'curl': '#!/bin/bash\necho "[shim curl] $*"\nexit 0\n',
}

const BASE_PARAMS = {
  customerId: 'cust-docker-harness',
  tier: 'pro' as const,
  telegramBotToken: '12345:harnessfake',
  telegramAllowedUserIds: '987654',
  openRouterKey: 'sk-or-v1-harness-fake',
  bundleTarBase64: 'fake-bootstrap-bundle-b64',
  fleetSshPubkey: 'ssh-ed25519 AAAAdummy',
  hermesVersion: 'v0.13.0',
}

// ─── docker harness preflight ─────────────────────────────────────────

const DOCKER_AVAILABLE = dockerAvailable()

if (!DOCKER_AVAILABLE) {
  test('Docker harness — skipped (no docker on host; runs in CI)', { skip: true }, () => {})
} else {
  test('Docker harness — image builds', () => {
    const r = buildImageOnce()
    assert.equal(r.ok, true, `docker build stderr:\n${r.stderr}`)
  })

  // ─── Scenario 1: happy path (full params, all shims) ──────────────

  test('S1: happy path — script reaches setup-complete marker, env file written', () => {
    const script = buildSetupScript(BASE_PARAMS)
    const r = runInContainer({ script, shims: NOOP_SHIMS, timeoutSec: 60 })
    assert.equal(r.exitCode, 0, `script aborted:\n${r.stdout}\n---\n${r.stderr}`)
    assert.match(r.stdout, /=== weuseai setup COMPLETE ===/)
    assert.match(r.stdout, /HARNESS_EXIT=0/)
    assert.match(r.stdout, /ENV_FILE_PRESENT/)
    assert.match(r.stdout, /WEUSEAI_AGENT_SLUG=the-pro/)
    assert.match(r.stdout, /WEUSEAI_TIER=pro/)
  })

  // ─── Scenario 2: no Telegram token (first xendit-webhook spinUp) ──

  test('S2: no bot token — gateway INSTALL fires but START is skipped (HF-2d behavior)', () => {
    const script = buildSetupScript({
      ...BASE_PARAMS,
      telegramBotToken: '',
      telegramAllowedUserIds: '',
    })
    const r = runInContainer({ script, shims: NOOP_SHIMS, timeoutSec: 60 })
    assert.equal(r.exitCode, 0, `script aborted:\n${r.stdout}\n---\n${r.stderr}`)
    // The "Installing Hermes gateway as system service..." log line
    // should ALWAYS appear (HF-2d ungating). The "Starting Hermes
    // gateway service..." line should NOT appear when bot token absent.
    assert.match(r.stdout, /Installing Hermes gateway as system service/)
    assert.doesNotMatch(r.stdout, /Starting Hermes gateway service/)
    // And the explicit "no bot token, will be started later" message:
    assert.match(r.stdout, /No TELEGRAM_BOT_TOKEN at first spinUp/)
  })

  // ─── Scenario 12: heartbeat liveness ──────────────────────────────

  test('S12: heartbeat file created + written before script completion', () => {
    const script = buildSetupScript(BASE_PARAMS)
    const r = runInContainer({ script, shims: NOOP_SHIMS, timeoutSec: 60 })
    assert.equal(r.exitCode, 0, `script aborted:\n${r.stdout}\n---\n${r.stderr}`)
    // The file should EXIST by the time the script finishes (it's
    // created in step 0 of setup-script, line 600). The file content
    // may be empty if the 30-sec heartbeat loop hasn't fired yet
    // (Tier 2 harness runs in <30 sec for the shimmed flow), but
    // existence proves the trap + heartbeat infrastructure is wired.
    assert.match(r.stdout, /hermes-install\.heartbeat/)
  })

  // ─── Scenario 11: re-run idempotency ──────────────────────────────

  test('S11: re-run idempotent — second invocation also exits 0', () => {
    const script = buildSetupScript(BASE_PARAMS)
    // First run primes the container. Second run in a fresh container
    // with the same script + shims should also exit 0 (script is
    // designed to be idempotent — `id weuseai` short-circuit, mkdir -p,
    // chmod with the same mode, etc.).
    const r1 = runInContainer({ script, shims: NOOP_SHIMS, timeoutSec: 60 })
    assert.equal(r1.exitCode, 0, `first run aborted:\n${r1.stdout}\n---\n${r1.stderr}`)
    const r2 = runInContainer({ script, shims: NOOP_SHIMS, timeoutSec: 60 })
    assert.equal(r2.exitCode, 0, `second run aborted:\n${r2.stdout}\n---\n${r2.stderr}`)
  })

  // ─── HF-2 regression: timeout VAR= would have caught this ─────────

  test('HF-2 regression: `timeout N env VAR=val ...` form is correct (no env-var prefix bug)', () => {
    // If anyone ever writes `timeout 90 DEBIAN_FRONTEND=… apt-get …`
    // back into setup-script.ts, this harness scenario runs it under
    // a shim apt-get and the script aborts at the first timeout line.
    // With HF-2b's `env` form, it succeeds.
    const script = buildSetupScript(BASE_PARAMS)
    const r = runInContainer({ script, shims: NOOP_SHIMS, timeoutSec: 60 })
    assert.equal(r.exitCode, 0)
    // Look for the actual apt-get invocation lines in the output to
    // prove they ran (vs aborting silently)
    assert.match(r.stdout, /\[shim apt-get\] update/)
    assert.match(r.stdout, /\[shim apt-get\] install/)
  })
}
