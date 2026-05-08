#!/usr/bin/env tsx
/**
 * Cleanup orphan IDCloudHost resources (Phase 2E-2).
 *
 * Two cleanup tracks:
 *
 * 1. Orphan smoke VMs — any VPS whose name matches the smoke-test
 *    pattern AND is older than the TTL. Performs DELETE via IDCH API.
 *    Pattern: `weuseai-smoke-2e2-<YYYYMMDD>` (and any future
 *    `weuseai-smoke-*` variants).
 *
 * 2. Orphan Floating IPs (opt-in via --include-ips) — LIST + WARN ONLY.
 *    IDCloudHost's public API does NOT expose programmatic IP release
 *    (verified 2026-05-08: GET works, DELETE returns 405, POST without
 *    body allocates a new IP — there is no released-by-uuid endpoint).
 *    So this script can detect orphans and print them with the dashboard
 *    URL, but the founder must manually click "Release" in the IDCH
 *    dashboard's Network tab. See docs/risks-known.md for context.
 *
 * TTL for VMs: 24 hours by default. Override via TTL_HOURS env.
 *
 * Invocation:
 *   IDCLOUDHOST_API_KEY=<key> tsx scripts/cleanup-orphan-vms.ts \
 *     [--dry-run] [--include-ips]
 *
 * Flags:
 *   --dry-run      Print what would be deleted; don't call DELETE API.
 *   --include-ips  Scan and report orphan Floating IPs. Off by default
 *                  to keep the script's primary output (VM cleanup
 *                  summary) uncluttered. The IP report is read-only
 *                  regardless of --dry-run; manual dashboard action
 *                  required to actually release.
 *
 * Limitations:
 *   - VM list returns all VMs in account; we filter client-side by name.
 *   - VM creation time isn't directly returned; we approximate via the
 *     YYYYMMDD suffix in the smoke VPS name.
 *   - IP release is dashboard-only (see Track 2 note above).
 */

const SMOKE_PREFIX = 'weuseai-smoke-'
const DEFAULT_TTL_HOURS = 24
const IP_GRACE_MINUTES = 30  // IP must be unassigned for ≥30 min before reaped

const apiKey = process.env.IDCLOUDHOST_API_KEY
// Empty fallback matches services/provisioning/src/providers/idcloudhost-vps.ts
// — non-region URL (`/v1/user-resource/...`). The legacy default `jkt01`
// returned HTTP 404 "no route" because it's not a valid region path.
const region = process.env.IDCLOUDHOST_REGION ?? ''
const ttlHours = parseInt(process.env.TTL_HOURS ?? String(DEFAULT_TTL_HOURS), 10)
const dryRun = process.argv.includes('--dry-run')
const includeIps = process.argv.includes('--include-ips')

if (!apiKey) {
  console.error('Missing IDCLOUDHOST_API_KEY env var')
  process.exit(2)
}

const vmListUrl = region
  ? `https://api.idcloudhost.com/v1/${region}/user-resource/vm/list`
  : `https://api.idcloudhost.com/v1/user-resource/vm/list`
const vmDeleteBase = region
  ? `https://api.idcloudhost.com/v1/${region}/user-resource/vm`
  : `https://api.idcloudhost.com/v1/user-resource/vm`
const ipListUrl = region
  ? `https://api.idcloudhost.com/v1/${region}/network/ip_addresses`
  : `https://api.idcloudhost.com/v1/network/ip_addresses`
// (No ipDeleteBase — release isn't implemented; see top-of-file note.)

type IdchVPS = {
  uuid: string
  name: string
  status: string
  created_at?: string  // ISO if IDCH returns it; we fall back to name parsing
}

type IdchIP = {
  uuid: string
  address: string
  type: string  // 'public_ipv4' | 'public' | etc
  enabled: boolean
  is_deleted: boolean
  assigned_to?: string | null
  assigned_to_resource_type?: string | null
  unassigned_at?: string | null
  created_at?: string  // ISO; available on IP list responses
}

async function listAllVMs(): Promise<IdchVPS[]> {
  const r = await fetch(vmListUrl, {
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
  const url = `${vmDeleteBase}?uuid=${encodeURIComponent(uuid)}`
  const r = await fetch(url, {
    method: 'DELETE',
    headers: { 'apikey': apiKey! },
  })
  if (!r.ok) {
    throw new Error(`delete VM ${uuid} failed: HTTP ${r.status} ${await r.text()}`)
  }
}

async function listAllIPs(): Promise<IdchIP[]> {
  const r = await fetch(ipListUrl, {
    headers: { 'apikey': apiKey! },
  })
  if (!r.ok) {
    throw new Error(`list IPs failed: HTTP ${r.status} ${await r.text()}`)
  }
  const json = await r.json()
  if (Array.isArray(json)) return json
  throw new Error(`list IPs returned unexpected shape: ${JSON.stringify(json).slice(0, 200)}`)
}

// IP release is intentionally NOT implemented: IDCloudHost's public API
// returns 405 Method Not Allowed on DELETE /v1/network/ip_addresses, and
// `Allow: GET, POST` (verified 2026-05-08). POST allocates a new IP
// (idempotency-broken when called without the right body) — so we keep
// IP cleanup strictly read-only and prompt the founder to use the
// dashboard. If IDCH adds an API endpoint later, swap this comment for
// a `releaseIP()` function and call from `cleanupOrphanFloatingIPs()`.

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

async function cleanupOrphanVMs(): Promise<{ scanned: number; deleted: number }> {
  console.log('━'.repeat(70))
  console.log('Track 1: orphan smoke VMs')
  console.log('━'.repeat(70))

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
    console.log('Nothing to delete.\n')
    return { scanned: candidates.length, deleted: 0 }
  }

  console.log(`\nDeleting ${toDelete.length} VM(s)...`)
  let deleted = 0
  for (const vm of toDelete) {
    if (dryRun) {
      console.log(`  [dry-run] would delete ${vm.name} (${vm.uuid})`)
      continue
    }
    try {
      await deleteVM(vm.uuid)
      console.log(`  ✓ deleted ${vm.name} (${vm.uuid})`)
      deleted++
    } catch (e) {
      console.error(`  ✗ failed to delete ${vm.name}:`, e instanceof Error ? e.message : e)
    }
  }
  console.log('')
  return { scanned: candidates.length, deleted }
}

async function cleanupOrphanFloatingIPs(): Promise<{ scanned: number; flagged: number }> {
  console.log('━'.repeat(70))
  console.log('Track 2: orphan Floating IPs (READ-ONLY — manual dashboard release required)')
  console.log('━'.repeat(70))
  console.log('Context: IDCH API does NOT support IP release. See docs/risks-known.md.')
  console.log('Manual release: dashboard.idcloudhost.com → Network → Floating IPs → Release\n')

  const all = await listAllIPs()
  console.log(`Total IPs in account: ${all.length}`)

  // Orphan = unassigned + not soft-deleted + past the grace window.
  // The grace window protects against a freshly-allocated IP that's
  // about to be attached to a customer VM in customer-flow.ts.
  const graceCutoffMs = Date.now() - IP_GRACE_MINUTES * 60 * 1000
  const orphans: IdchIP[] = []
  for (const ip of all) {
    if (ip.is_deleted) continue
    const isUnassigned =
      !ip.assigned_to ||
      ip.assigned_to === '' ||
      ip.assigned_to_resource_type !== 'virtual_machine' ||
      !!ip.unassigned_at  // explicitly marked unassigned
    if (!isUnassigned) {
      console.log(`  ✓ ${ip.address} (uuid=${ip.uuid}) — attached to ${ip.assigned_to_resource_type ?? '?'}, keep`)
      continue
    }
    // Grace window: IP must be older than IP_GRACE_MINUTES OR unassigned_at older.
    const createdMs = ip.created_at ? Date.parse(ip.created_at) : NaN
    const unassignedMs = ip.unassigned_at ? Date.parse(ip.unassigned_at) : NaN
    const referenceMs = Number.isFinite(unassignedMs) ? unassignedMs : createdMs
    if (Number.isFinite(referenceMs) && referenceMs > graceCutoffMs) {
      const ageMin = (Date.now() - referenceMs) / 60000
      console.log(
        `  ⏳ ${ip.address} (uuid=${ip.uuid}) — unassigned ${ageMin.toFixed(1)}m ago (< ${IP_GRACE_MINUTES}m grace), keep`,
      )
      continue
    }
    orphans.push(ip)
  }

  if (orphans.length === 0) {
    console.log('\nNo orphan IPs detected. Nice.\n')
    return { scanned: all.length, flagged: 0 }
  }

  console.log(
    `\n⚠ ${orphans.length} orphan IP(s) detected — burning ~Rp ${orphans.length * 40}k/month silently:`,
  )
  for (const ip of orphans) {
    const refMs = Number.isFinite(Date.parse(ip.unassigned_at ?? ''))
      ? Date.parse(ip.unassigned_at!)
      : Number.isFinite(Date.parse(ip.created_at ?? ''))
        ? Date.parse(ip.created_at!)
        : NaN
    const ageHrs = Number.isFinite(refMs) ? ((Date.now() - refMs) / 3600000).toFixed(1) : '?'
    console.log(`  → ${ip.address}  uuid=${ip.uuid}  unassigned=${ageHrs}h ago`)
  }
  console.log('\nNext step: log into dashboard.idcloudhost.com → Network → Floating IPs')
  console.log('           Click "Release" on each IP listed above.')
  console.log('           (IDCH API does not expose programmatic release — verified 2026-05-08.)\n')

  return { scanned: all.length, flagged: orphans.length }
}

async function main() {
  console.log('━'.repeat(70))
  console.log('Phase 2E-2 cleanup: orphan IDCloudHost resources')
  console.log('━'.repeat(70))
  console.log(`Region:       ${region || '(none — non-regioned URL)'}`)
  console.log(`VM TTL hours: ${ttlHours}`)
  console.log(`Mode:         ${dryRun ? 'DRY RUN (no deletes)' : 'LIVE'}`)
  console.log(`Include IPs:  ${includeIps ? 'YES (--include-ips)' : 'NO  (default; pass --include-ips to enable)'}`)
  console.log('')

  const vmReport = await cleanupOrphanVMs()
  let ipReport = { scanned: 0, flagged: 0 }
  if (includeIps) {
    ipReport = await cleanupOrphanFloatingIPs()
  }

  console.log('━'.repeat(70))
  console.log('Summary')
  console.log('━'.repeat(70))
  console.log(`VMs:           scanned=${vmReport.scanned}  deleted=${vmReport.deleted}`)
  if (includeIps) {
    console.log(`Floating IPs:  scanned=${ipReport.scanned}  flagged=${ipReport.flagged} (manual dashboard release required)`)
  } else {
    console.log(`Floating IPs:  skipped (pass --include-ips to scan + report orphans)`)
  }
  console.log('Done.')
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.stack : e)
  process.exit(1)
})
