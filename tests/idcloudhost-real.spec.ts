/**
 * Real IDCloudHost integration — costs ~Rp 100 per run.
 *
 * Skipped unless IDCH_INTEGRATION=1 AND the three required creds are set:
 *   - IDCLOUDHOST_API_KEY
 *   - IDCLOUDHOST_REGION
 *   - IDCLOUDHOST_BILLING_ACCOUNT_ID
 *
 * What it does:
 *   1. Create the smallest possible VPS with a no-op cloud-init
 *   2. Verify the create response shape (uuid present, status pending/building)
 *   3. Immediately call delete to stop billing
 *   4. Verify delete returns without throwing
 *
 * Run locally with:
 *   IDCH_INTEGRATION=1 \
 *   IDCLOUDHOST_API_KEY=… \
 *   IDCLOUDHOST_REGION=jakarta \
 *   IDCLOUDHOST_BILLING_ACCOUNT_ID=… \
 *   npx tsx --test tests/idcloudhost-real.spec.ts
 *
 * NEVER add IDCH_INTEGRATION=1 to CI without a budget cap — every run
 * costs real IDR even though the VPS lives <1 minute.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { IDCloudHostVPSProvider } from '../services/provisioning/src/providers/idcloudhost-vps.ts'

const SHOULD_RUN =
  process.env.IDCH_INTEGRATION === '1' &&
  Boolean(process.env.IDCLOUDHOST_API_KEY) &&
  Boolean(process.env.IDCLOUDHOST_REGION) &&
  Boolean(process.env.IDCLOUDHOST_BILLING_ACCOUNT_ID)

test('REAL: create + delete one VPS (costs ~Rp 100)', { skip: !SHOULD_RUN }, async () => {
  const p = new IDCloudHostVPSProvider()
  const name = `phase1-test-${Date.now().toString().slice(-8)}`
  const billingAccountId = process.env.IDCLOUDHOST_BILLING_ACCOUNT_ID!

  let createdUuid: string | undefined

  try {
    const vps = await p.create({
      name,
      // Smallest spec IDCH jkt01 accepts (2 vCPU minimum, verified 2026-05-02).
      spec: { vcpu: 2, ram: 2048, disk: 20 },
      password: cryptoRandomPassword(),
      // Empty cloud-init — we're testing API plumbing, not Hermes.
      cloudInit: '#cloud-config\nruncmd:\n  - echo "phase1-integration-test"\n',
      billingAccountId,
    })

    assert.ok(vps.uuid, 'create response includes uuid')
    assert.match(
      vps.status,
      /^(pending|building|provisioning|running)$/,
      `status is recognisable lifecycle state, got: ${vps.status}`,
    )
    createdUuid = vps.uuid

    // Don't wait for running — delete immediately to minimise cost.
    await p.delete(createdUuid)
    createdUuid = undefined
  } finally {
    // Best-effort cleanup if assertion failed mid-test.
    if (createdUuid) {
      try {
        await p.delete(createdUuid)
      } catch {
        // Surface in test output via console; assertion already failed.
        console.error(`[idch-integration] FAILED TO CLEAN UP VPS ${createdUuid} — DELETE MANUALLY`)
      }
    }
  }
})

function cryptoRandomPassword(): string {
  // 32-char URL-safe random; meets IDCloudHost's >8-char requirement.
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/[+/=]/g, '')
    .slice(0, 32)
}
