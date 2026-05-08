// Unit tests for the provisioning service /tier-bump route handler.
//
// Reference: services/provisioning/src/routes/tier-bump.ts
//
// Covers:
//  - Input validation (customer_id, target_tier, vps_host)
//  - Fleet key not configured → error
//  - SSH command shape (sed + restart + echo)
//  - SSH failure propagated
//  - SSH success returns parsed restarted_at
//  - Tmpfile cleanup on success + failure paths

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  tierBump,
  buildRemoteCommand,
  type TierBumpDeps,
  type TierBumpRouteRequest,
} from '../services/provisioning/src/routes/tier-bump.ts'

// Long enough that the >=64-char check passes; PEM headers shouldn't
// matter at the unit-test level since runSsh is mocked.
const FAKE_KEY = '-----BEGIN OPENSSH PRIVATE KEY-----\n' + 'A'.repeat(256) + '\n-----END OPENSSH PRIVATE KEY-----\n'

const validReq: TierBumpRouteRequest = {
  customer_id: '550e8400-e29b-41d4-a716-446655440000',
  target_tier: 'pro',
  vps_host: '203.0.113.1',
}

// ─── buildRemoteCommand (pure) ─────────────────────────────────────────

describe('buildRemoteCommand', () => {
  test('embeds the target tier in the sed substitution', () => {
    const cmd = buildRemoteCommand('studio')
    assert.match(cmd, /WEUSEAI_TIER=studio/)
    assert.match(cmd, /sed -i/)
    assert.match(cmd, /sudo systemctl restart hermes-gateway/)
    // Echo at the end produces a parseable timestamp marker.
    assert.match(cmd, /echo "ok restarted=\$\(date/)
  })

  test('includes the missing-line fallback (append if grep fails)', () => {
    const cmd = buildRemoteCommand('pro')
    assert.match(cmd, /grep -qE/)
    assert.match(cmd, /tee -a/)
  })

  test('uses set -e so any failed step aborts before restart', () => {
    const cmd = buildRemoteCommand('pro')
    assert.match(cmd, /^set -e/m)
  })
})

// ─── tierBump — input validation ───────────────────────────────────────

describe('tierBump — input validation', () => {
  test('rejects missing customer_id', async () => {
    const r = await tierBump(
      { ...validReq, customer_id: '' },
      { fleetPrivateKey: FAKE_KEY, runSsh: async () => ({ ok: true, stdout: '' }) },
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.match(r.error, /customer_id/)
  })

  test('rejects bad target_tier', async () => {
    const r = await tierBump(
      // @ts-expect-error intentional
      { ...validReq, target_tier: 'enterprise' },
      { fleetPrivateKey: FAKE_KEY, runSsh: async () => ({ ok: true, stdout: '' }) },
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.match(r.error, /target_tier/)
  })

  test('rejects bad vps_host (non-hostname/non-IP chars)', async () => {
    const r = await tierBump(
      { ...validReq, vps_host: 'a host with spaces' },
      { fleetPrivateKey: FAKE_KEY, runSsh: async () => ({ ok: true, stdout: '' }) },
    )
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.match(r.error, /vps_host/)
  })

  test('accepts valid IP and DNS hostname formats', async () => {
    const ok1 = await tierBump(
      { ...validReq, vps_host: '203.0.113.1' },
      { fleetPrivateKey: FAKE_KEY, runSsh: async () => ({ ok: true, stdout: 'ok restarted=2026-05-08T10:00:00Z' }) },
    )
    assert.equal(ok1.ok, true)
    const ok2 = await tierBump(
      { ...validReq, vps_host: 'vps-1.weuseai.com' },
      { fleetPrivateKey: FAKE_KEY, runSsh: async () => ({ ok: true, stdout: 'ok restarted=2026-05-08T10:00:00Z' }) },
    )
    assert.equal(ok2.ok, true)
  })
})

// ─── tierBump — fleet key checks ───────────────────────────────────────

describe('tierBump — fleet key', () => {
  test('returns error when fleet key is empty', async () => {
    const r = await tierBump(validReq, { fleetPrivateKey: '' })
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.match(r.error, /fleet private key/)
  })

  test('returns error when fleet key is suspiciously short', async () => {
    const r = await tierBump(validReq, { fleetPrivateKey: 'too-short' })
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.match(r.error, /fleet private key/)
  })
})

// ─── tierBump — SSH path ───────────────────────────────────────────────

describe('tierBump — SSH path', () => {
  test('passes correct host, user, command to runSsh', async () => {
    type SshArgs = { host: string; user: string; privateKeyPath: string; command: string }
    let captured: SshArgs | null = null
    const r = await tierBump(validReq, {
      fleetPrivateKey: FAKE_KEY,
      async runSsh(args) {
        captured = args
        return { ok: true, stdout: 'ok restarted=2026-05-08T11:00:00Z' }
      },
    })
    assert.equal(r.ok, true)
    assert.ok(captured !== null)
    const c = captured as unknown as SshArgs
    assert.equal(c.host, '203.0.113.1')
    assert.equal(c.user, 'weuseai')
    assert.match(c.command, /WEUSEAI_TIER=pro/)
    // privateKeyPath should be a tmpfile in /tmp/weuseai-fleet-...
    assert.match(c.privateKeyPath, /weuseai-fleet-/)
  })

  test('parses restarted_at from stdout', async () => {
    const r = await tierBump(validReq, {
      fleetPrivateKey: FAKE_KEY,
      async runSsh() {
        return { ok: true, stdout: 'ok restarted=2026-05-08T12:34:56Z' }
      },
    })
    assert.equal(r.ok, true)
    assert.ok(r.ok === true)
    assert.equal(r.restarted_at, '2026-05-08T12:34:56Z')
  })

  test('falls back to current time when stdout has no restarted= marker', async () => {
    const r = await tierBump(validReq, {
      fleetPrivateKey: FAKE_KEY,
      async runSsh() {
        return { ok: true, stdout: 'unexpected output without marker' }
      },
    })
    assert.equal(r.ok, true)
    assert.ok(r.ok === true)
    // Just verify it's a valid ISO string.
    assert.match(r.restarted_at, /^\d{4}-\d{2}-\d{2}T/)
  })

  test('propagates SSH failure', async () => {
    const r = await tierBump(validReq, {
      fleetPrivateKey: FAKE_KEY,
      async runSsh() {
        return { ok: false, error: 'ssh exit=255: Permission denied (publickey)' }
      },
    })
    assert.equal(r.ok, false)
    assert.ok(r.ok === false)
    assert.match(r.error, /Permission denied/)
  })
})

// ─── tmpfile cleanup ────────────────────────────────────────────────────

describe('tierBump — tmpfile cleanup', () => {
  test('cleanup runs on SSH success path', async () => {
    let sshCalled = false
    let pathSeenAfterCall = ''
    const r = await tierBump(validReq, {
      fleetPrivateKey: FAKE_KEY,
      async runSsh(args) {
        sshCalled = true
        pathSeenAfterCall = args.privateKeyPath
        return { ok: true, stdout: 'ok restarted=2026-05-08T10:00:00Z' }
      },
    })
    assert.equal(r.ok, true)
    assert.equal(sshCalled, true)
    // After tierBump returns, the tmpfile must be gone.
    const { existsSync } = await import('node:fs')
    assert.equal(existsSync(pathSeenAfterCall), false)
  })

  test('cleanup runs on SSH failure path', async () => {
    let pathSeenAfterCall = ''
    const r = await tierBump(validReq, {
      fleetPrivateKey: FAKE_KEY,
      async runSsh(args) {
        pathSeenAfterCall = args.privateKeyPath
        return { ok: false, error: 'mock failure' }
      },
    })
    assert.equal(r.ok, false)
    const { existsSync } = await import('node:fs')
    assert.equal(existsSync(pathSeenAfterCall), false)
  })

  test('cleanup runs even if runSsh throws', async () => {
    let pathSeenAfterCall = ''
    let threw = false
    try {
      await tierBump(validReq, {
        fleetPrivateKey: FAKE_KEY,
        async runSsh(args) {
          pathSeenAfterCall = args.privateKeyPath
          throw new Error('runner exploded')
        },
      })
    } catch {
      threw = true
    }
    assert.equal(threw, true)
    const { existsSync } = await import('node:fs')
    assert.equal(existsSync(pathSeenAfterCall), false)
  })
})
