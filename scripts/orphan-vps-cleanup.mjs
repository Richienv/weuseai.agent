#!/usr/bin/env node
/**
 * Orphan-VPS hygiene — daily safety net.
 *
 * Customer onboarding (and Phase F runs) provision REAL Vultr VPSes. If
 * a chain crashes mid-flight — or teardown fails — a VPS leaks. At $5/mo
 * each, leaked VPSes are slow money. Phase F deployed run #1 (2026-05-15)
 * leaked one empirically, which is why this script is now critical-path,
 * not a nice-to-have: any real customer who hits a mid-chain failure
 * leaks the same way.
 *
 * Definition of "orphan":
 *   A Vultr instance whose label looks like one of ours (prefix
 *   `liren-` — set by services/provisioning customer-flow) AND whose
 *   id is NOT referenced by a vps_instances row tied to an ACTIVE
 *   subscription (i.e. no matching live customer in Supabase).
 *
 * v1 IS ALERT-ONLY — it NEVER deletes anything (Cowork consult
 * 2026-05-15). It lists orphan candidates and exits non-zero so a cron
 * surfaces them. A human reviews the list and tears each one down
 * manually (POST /tear-down on the provisioning service, or the Vultr
 * console). A guarded delete mode is deliberately deferred to a v2.
 *
 * Env required:
 *   VULTR_API_KEY              (IP-allowlisted to the Fly provisioning
 *                               machine — run this script there, e.g.
 *                               as a Fly scheduled task, not from a
 *                               random cron host)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/orphan-vps-cleanup.mjs     # list orphans; exit 0 clean, 1 if any
 *
 * Exit codes:
 *   0  no orphans
 *   1  one or more orphans found (cron/CI should alert on this)
 *   2  misconfiguration / API error
 *
 * Known gap: DigitalOcean SGP1 failover instances are not yet scanned —
 * Vultr is the primary and the only provider that has leaked so far.
 *
 * Intended cadence: daily (Fly scheduled task / cron).
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load .env.local if present (local runs); cron/CI passes real env.
const ENV_LOCAL = resolve(process.cwd(), '.env.local')
if (existsSync(ENV_LOCAL)) {
  for (const line of readFileSync(ENV_LOCAL, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const VULTR_API_KEY = process.env.VULTR_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Our VPS label prefix — set in services/provisioning/src/customer-flow.ts
// (hostname `liren-<cid8>-<rand>`). Anything without this prefix is NOT
// ours and is never reported.
const OUR_LABEL_PREFIX = 'liren-'

function fail(msg) {
  console.error(`orphan-vps-cleanup: ${msg}`)
  process.exit(2)
}

if (!VULTR_API_KEY) fail('VULTR_API_KEY required')
if (!SUPABASE_URL || !SERVICE_KEY) fail('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required')

async function vultrListInstances() {
  const out = []
  let cursor = ''
  for (let page = 0; page < 20; page++) {
    const url = `https://api.vultr.com/v2/instances?per_page=100${cursor ? `&cursor=${cursor}` : ''}`
    const r = await fetch(url, { headers: { authorization: `Bearer ${VULTR_API_KEY}` } })
    if (!r.ok) fail(`Vultr list HTTP ${r.status}: ${await r.text()}`)
    const body = await r.json()
    for (const inst of body.instances ?? []) out.push(inst)
    cursor = body.meta?.links?.next ?? ''
    if (!cursor) break
  }
  return out
}

async function dbLiveVpsIds() {
  // A VPS is "live" if its vps_instances row is status=running AND the
  // owning customer has an active subscription. Everything else is an
  // orphan candidate.
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/vps_instances?select=vps_id,status,customer_id&status=eq.running`,
    { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
  )
  if (!r.ok) fail(`Supabase vps_instances HTTP ${r.status}: ${await r.text()}`)
  const rows = await r.json()

  const liveVpsIds = new Set()
  for (const row of rows) {
    const subR = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?select=id&customer_id=eq.${row.customer_id}&status=eq.active`,
      { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
    )
    const subs = subR.ok ? await subR.json() : []
    if (subs.length > 0) liveVpsIds.add(row.vps_id)
  }
  return liveVpsIds
}

async function main() {
  console.log('orphan-vps-cleanup — ALERT-ONLY (v1 never deletes)')

  const [instances, liveIds] = await Promise.all([vultrListInstances(), dbLiveVpsIds()])
  console.log(`Vultr instances total: ${instances.length}`)
  console.log(`DB live VPS ids (running + active subscription): ${liveIds.size}`)

  const orphans = instances.filter((inst) => {
    const label = inst.label ?? ''
    if (!label.startsWith(OUR_LABEL_PREFIX)) return false // not ours — never report
    return !liveIds.has(inst.id) // ours, but DB has no live customer for it
  })

  if (orphans.length === 0) {
    console.log('✓ No orphan VPSes. Nothing to do.')
    return
  }

  console.log(`\n⚠ ${orphans.length} orphan VPS(es) found — review + tear down manually:`)
  for (const o of orphans) {
    console.log(`  - ${o.id}  label=${o.label}  ip=${o.main_ip}  region=${o.region}  created=${o.date_created}`)
  }
  console.log(
    '\nThis script does NOT delete. To tear an orphan down, POST /tear-down on\n' +
      'the provisioning service with the owning customerId, or delete via the\n' +
      'Vultr console after confirming it is genuinely unowned.',
  )
  process.exitCode = 1 // non-zero so a cron/CI schedule alerts
}

main().catch((e) => {
  console.error(`orphan-vps-cleanup crashed: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
