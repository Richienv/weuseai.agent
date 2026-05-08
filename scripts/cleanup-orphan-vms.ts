#!/usr/bin/env tsx
/**
 * Cleanup orphan smoke-test VMs (Phase 2E-2).
 *
 * Deletes any IDCloudHost VPS whose name matches the smoke-test pattern
 * AND is older than the TTL. Safe to run nightly via cron OR manually
 * before each smoke run.
 *
 * Pattern matched: `weuseai-smoke-2e2-<YYYYMMDD>` (and any other
 * `weuseai-smoke-*` prefix variants from future phases).
 *
 * TTL: 24 hours by default. Override via TTL_HOURS env.
 *
 * Invocation:
 *   IDCLOUDHOST_API_KEY=<key> \
 *   IDCLOUDHOST_REGION=jkt01 \
 *     tsx scripts/cleanup-orphan-vms.ts [--dry-run]
 *
 * --dry-run prints what would be deleted but doesn't call the DELETE API.
 *
 * Limitations:
 *   - IDCloudHost's list API returns ALL VMs in the account; we filter
 *     client-side by name prefix.
 *   - Creation time isn't directly returned by IDCloudHost's GET /vm
 *     listing; we approximate via the date suffix in the VPS name.
 *     A VPS created today (pattern weuseai-smoke-2e2-20260508) is
 *     considered "young" until its date suffix is more than TTL_HOURS
 *     in the past.
 */

const SMOKE_PREFIX = 'weuseai-smoke-'
const DEFAULT_TTL_HOURS = 24

const apiKey = process.env.IDCLOUDHOST_API_KEY
const region = process.env.IDCLOUDHOST_REGION ?? 'jkt01'
const ttlHours = parseInt(process.env.TTL_HOURS ?? String(DEFAULT_TTL_HOURS), 10)
const dryRun = process.argv.includes('--dry-run')

if (!apiKey) {
  console.error('Missing IDCLOUDHOST_API_KEY env var')
  process.exit(2)
}

type IdchVPS = {
  uuid: string
  name: string
  status: string
  created_at?: string  // ISO if IDCH returns it; we fall back to name parsing
}

async function listAllVMs(): Promise<IdchVPS[]> {
  const url = `https://api.idcloudhost.com/v1/${region}/user-resource/vm/list`
  const r = await fetch(url, {
    headers: { 'apikey': apiKey! },
  })
  if (!r.ok) {
    throw new Error(`list VMs failed: HTTP ${r.status} ${await r.text()}`)
  }
  const json = await r.json()
  // IDCloudHost's list endpoint returns an array directly OR { vms: [...] }
  // depending on API version; handle both.
  if (Array.isArray(json)) return json
  if (json && Array.isArray((json as { vms?: unknown }).vms)) {
    return (json as { vms: IdchVPS[] }).vms
  }
  throw new Error(`list VMs returned unexpected shape: ${JSON.stringify(json).slice(0, 200)}`)
}

async function deleteVM(uuid: string): Promise<void> {
  const url = `https://api.idcloudhost.com/v1/${region}/user-resource/vm?uuid=${encodeURIComponent(uuid)}`
  const r = await fetch(url, {
    method: 'DELETE',
    headers: { 'apikey': apiKey! },
  })
  if (!r.ok) {
    throw new Error(`delete VM ${uuid} failed: HTTP ${r.status} ${await r.text()}`)
  }
}

/**
 * Parse the date suffix from a smoke VPS name.
 * `weuseai-smoke-2e2-20260508` → 2026-05-08
 * Returns null when the suffix doesn't parse — caller treats those as
 * "stale enough to delete" since we can't tell when it was created.
 */
function parseDateFromName(name: string): Date | null {
  const m = /(\d{4})(\d{2})(\d{2})$/.exec(name)
  if (!m) return null
  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

async function main() {
  console.log('━'.repeat(70))
  console.log('Phase 2E-2 cleanup: orphan smoke VMs')
  console.log('━'.repeat(70))
  console.log(`Region:    ${region}`)
  console.log(`TTL hours: ${ttlHours}`)
  console.log(`Mode:      ${dryRun ? 'DRY RUN (no deletes)' : 'LIVE'}`)
  console.log('')

  const all = await listAllVMs()
  console.log(`Total VMs in account: ${all.length}`)

  const candidates = all.filter((v) => v.name.startsWith(SMOKE_PREFIX))
  console.log(`Smoke-tagged candidates: ${candidates.length}`)

  const cutoffMs = Date.now() - ttlHours * 60 * 60 * 1000
  const toDelete: IdchVPS[] = []
  for (const vm of candidates) {
    const created = parseDateFromName(vm.name)
    if (!created) {
      console.log(`  ⚠ ${vm.name} (uuid=${vm.uuid}) — name doesn't have YYYYMMDD suffix; treating as stale`)
      toDelete.push(vm)
      continue
    }
    const ageHours = (Date.now() - created.getTime()) / (60 * 60 * 1000)
    if (created.getTime() < cutoffMs) {
      console.log(`  → ${vm.name} (uuid=${vm.uuid}) — ${ageHours.toFixed(1)}h old, marked for deletion`)
      toDelete.push(vm)
    } else {
      console.log(`  ✓ ${vm.name} (uuid=${vm.uuid}) — ${ageHours.toFixed(1)}h old, keep (within TTL)`)
    }
  }

  if (toDelete.length === 0) {
    console.log('\nNothing to delete.')
    return
  }

  console.log(`\nDeleting ${toDelete.length} VM(s)...`)
  for (const vm of toDelete) {
    if (dryRun) {
      console.log(`  [dry-run] would delete ${vm.name} (${vm.uuid})`)
      continue
    }
    try {
      await deleteVM(vm.uuid)
      console.log(`  ✓ deleted ${vm.name} (${vm.uuid})`)
    } catch (e) {
      console.error(`  ✗ failed to delete ${vm.name}:`, e instanceof Error ? e.message : e)
    }
  }

  console.log('\nDone.')
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.stack : e)
  process.exit(1)
})
