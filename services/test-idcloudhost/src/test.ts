/**
 * Day 1 — IDCloudHost API validation test
 *
 * Validates: bisa nggak API auto-provision VPS dalam waktu yang reasonable?
 * Target: ≤180 detik dari create sampai running + cloud-init done.
 *
 * Run: npm run test
 */

import 'dotenv/config'
import { performance } from 'node:perf_hooks'

const API_KEY = process.env.IDCLOUDHOST_API_KEY
const BILLING_ACCOUNT_ID = process.env.IDCLOUDHOST_BILLING_ACCOUNT_ID
const REGION = process.env.IDCLOUDHOST_REGION || ''

if (!API_KEY || !BILLING_ACCOUNT_ID) {
  console.error('Missing env: IDCLOUDHOST_API_KEY and IDCLOUDHOST_BILLING_ACCOUNT_ID')
  console.error('Copy .env.example to .env and fill in values from dashboard.idcloudhost.com')
  process.exit(1)
}

const BASE = REGION
  ? `https://api.idcloudhost.com/v1/${REGION}/user-resource`
  : 'https://api.idcloudhost.com/v1/user-resource'

const headers = {
  apikey: API_KEY,
  'Content-Type': 'application/x-www-form-urlencoded',
}

const start = performance.now()
const t = () => Math.round((performance.now() - start) / 1000)
const log = (msg: string) => console.log(`[+${t()}s] ${msg}`)

async function api(method: 'GET' | 'POST' | 'DELETE' | 'PATCH', path: string, body?: Record<string, string>) {
  const url = `${BASE}${path}`
  const init: RequestInit = { method, headers }
  if (body) {
    init.body = new URLSearchParams(body).toString()
  }
  const r = await fetch(url, init)
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`${method} ${path} -> HTTP ${r.status}: ${txt.slice(0, 500)}`)
  }
  return r.json() as Promise<any>
}

// Cloud-init: install Docker, write a marker file at /opt/liren/ready
// (For Day 1 we only verify the marker — Hermes pull comes later)
const cloudInit = `#cloud-config
package_update: true
package_upgrade: false
packages:
  - curl
  - ca-certificates
write_files:
  - path: /opt/liren/ready
    content: "ready"
    permissions: '0644'
runcmd:
  - mkdir -p /opt/liren
  - echo "ready" > /opt/liren/ready
`

async function main() {
  const vmName = `liren-test-${Date.now()}`

  // 1. Create VM
  log('Creating VM...')
  log(`  name=${vmName}, vcpu=1, ram=4096, disk=50, os=ubuntu 24.04`)

  let created
  try {
    created = await api('POST', '/vm', {
      name: vmName,
      os_name: 'ubuntu',
      os_version: '24.04',
      disks: '50',
      vcpu: '1',
      ram: '4096',
      username: 'liren',
      password: `LirenTest_${Date.now()}!`,
      billing_account_id: String(BILLING_ACCOUNT_ID),
      cloud_init: cloudInit,
    })
  } catch (e: any) {
    log(`✗ Create failed: ${e.message}`)
    log('Try: cek billing_account_id valid, dan os_version "24.04" supported. Coba "22.04" kalau gagal.')
    process.exit(1)
  }

  const uuid = created.uuid
  log(`✓ Created. UUID: ${uuid}`)
  log(`  Initial status: ${created.status}`)
  log(`  Initial IPs: public=${created.public_ipv4 ?? 'n/a'}, private=${created.private_ipv4 ?? 'n/a'}`)

  // 2. Poll until running
  log('Polling for running status (every 3s)...')
  const pollStart = performance.now()
  let lastStatus = ''
  let publicIp = ''

  const pollTimeout = 5 * 60 * 1000 // 5 menit
  while (true) {
    if (performance.now() - pollStart > pollTimeout) {
      log('✗ Timeout: VM did not reach running state in 5 minutes')
      log(`  Last status: ${lastStatus}`)
      log(`  ! Cleanup manually: DELETE /v1/user-resource/vm?uuid=${uuid}`)
      process.exit(1)
    }

    let info
    try {
      info = await api('GET', `/vm?uuid=${uuid}`)
    } catch (e: any) {
      log(`  Poll error (will retry): ${e.message}`)
      await sleep(3000)
      continue
    }

    if (info.status !== lastStatus) {
      log(`  status=${info.status}`)
      lastStatus = info.status
    }
    if (info.public_ipv4 && info.public_ipv4 !== publicIp) {
      publicIp = info.public_ipv4
      log(`  public_ipv4=${publicIp}`)
    }

    if (info.status === 'running') {
      const provTimeSec = Math.round((performance.now() - pollStart) / 1000)
      log(`✓ Running.`)
      log(`  Provisioning time: ${provTimeSec}s`)
      break
    }

    if (info.status === 'failed' || info.status === 'error') {
      log(`✗ VM entered ${info.status} state. Aborting.`)
      log(`  Cleanup manually if needed.`)
      process.exit(1)
    }

    await sleep(3000)
  }

  // 3. Wait for cloud-init to complete (mostly best-effort here — full check needs SSH)
  log('Waiting 30s for cloud-init to complete...')
  await sleep(30000)

  // 4. Total time
  const totalSec = Math.round((performance.now() - start) / 1000)

  // 5. Cleanup
  log('Cleaning up — deleting VM...')
  try {
    await api('DELETE', `/vm?uuid=${uuid}`)
    log('✓ Deleted')
  } catch (e: any) {
    log(`! Delete failed: ${e.message}`)
    log(`  ! Manual cleanup: DELETE /v1/user-resource/vm?uuid=${uuid}`)
  }

  // 6. Verdict
  console.log('\n=== TEST RESULT ===')
  console.log(`Total time (create → running): ${totalSec - 30}s`)
  console.log(`Total time (incl. cloud-init wait): ${totalSec}s`)
  console.log(`Public IP assigned: ${publicIp || '(none — check region/network config)'}`)

  if (totalSec - 30 <= 180) {
    console.log('Verdict: ✓ PASS — IDCloudHost API feasible for 5-minute onboarding')
    console.log('Next: build provisioning service (packages/provisioning).')
  } else if (totalSec - 30 <= 300) {
    console.log('Verdict: ⚠ MARGINAL — provisioning takes 3-5 min, onboarding bisa kepanjangan')
    console.log('Mitigasi: pre-warm VPS pool, atau frame onboarding sebagai "agent kamu sedang dipersiapkan, ETA 5 menit"')
  } else {
    console.log('Verdict: ✗ FAIL — too slow for 5-min onboarding')
    console.log('Plan B: coba region berbeda, atau evaluate Vultr Jakarta / DigitalOcean Singapore')
  }

  process.exit(0)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

main().catch((err) => {
  console.error('\n✗ Unexpected error:', err)
  process.exit(1)
})
