#!/usr/bin/env node
/**
 * Orphan-VPS hygiene — daily safety net (Phase F pre-coding adjustment 3).
 *
 * Phase F runs provision REAL Vultr VPSes and tear them down in Stage 11.
 * If a run crashes before teardown — or teardown's Vultr DELETE fails —
 * a VPS leaks. At $5/mo each, leaked VPSes are slow money. This script
 * is the catch-all: it finds Vultr instances that our DB does NOT
 * consider live, and deletes them.
 *
 * Definition of "orphan":
 *   A Vultr instance whose label looks like one of ours (prefix
 *   `liren-` — set by services/provisioning customer-flow) AND whose
 *   id is NOT referenced by a vps_instances row tied to an ACTIVE
 *   subscription.
 *
 * Safety:
 *   - DRY RUN by default. Pass --apply to actually delete.
 *   - Only touches instances whose label matches the `liren-` prefix —
 *     never an unrelated VPS on the same Vultr account.
 *   - Prints every candidate + reason before deleting.
 *
 * Env required:
 *   VULTR_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/orphan-vps-cleanup.mjs            # dry run — list only
 *   node scripts/orphan-vps-cleanup.mjs --apply    # actually delete
 *
 * Intended cadence: daily (cron / GitHub Actions schedule). Cheap to
 * run — two API list calls + N deletes.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load .env.local if present (local runs); CI passes real env.
const ENV_LOCAL = resolve(process.cwd(), '.env.local')
if (existsSync(ENV_LOCAL)) {
  for (const line of readFileSync(ENV_LOCAL, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const APPLY = process.argv.includes('--apply')
const VULTR_API_KEY = process.env.VULTR_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Our VPS label prefix — set in services/provisioning/src/customer-flow.ts
// (hostname `liren-<cid8>-<rand>`). Anything without this prefix is NOT
// ours and is never touched.
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

async function dbActiveVpsIds() {
  // vps_instances rows whose subscription is active. We consider a VPS
  // "live" if its row is status=running AND the owning subscription is
  // active. Everything else is a teardown candidate.
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/vps_instances?select=vps_id,status,customer_id&status=eq.running`,
    { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
  )
  if (!r.ok) fail(`Supabase vps_instances HTTP ${r.status}: ${await r.text()}`)
  const rows = await r.json()

  // Cross-check each customer has an active subscription.
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
  console.log(`orphan-vps-cleanup — ${APPLY ? 'APPLY (will delete)' : 'DRY RUN (list only)'}`)

  const [instances, liveIds] = await Promise.all([vultrListInstances(), dbActiveVpsIds()])
  console.log(`Vultr instances total: ${instances.length}`)
  console.log(`DB live VPS ids (running + active subscription): ${liveIds.size}`)

  const orphans = instances.filter((inst) => {
    const label = inst.label ?? ''
    if (!label.startsWith(OUR_LABEL_PREFIX)) return false // not ours — never touch
    return !liveIds.has(inst.id) // ours, but DB doesn't consider it live
  })

  if (orphans.length === 0) {
    console.log('✓ No orphan VPSes. Nothing to do.')
    return
  }

  console.log(`\n⚠ ${orphans.length} orphan VPS(es) found:`)
  for (const o of orphans) {
    console.log(`  - ${o.id}  label=${o.label}  ip=${o.main_ip}  region=${o.region}  created=${o.date_created}`)
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — re-run with --apply to delete these ${orphans.length} instance(s).`)
    return
  }

  let deleted = 0
  for (const o of orphans) {
    const r = await fetch(`https://api.vultr.com/v2/instances/${o.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${VULTR_API_KEY}` },
    })
    if (r.ok || r.status === 404) {
      console.log(`  ✓ deleted ${o.id}`)
      deleted++
    } else {
      console.log(`  ✗ failed ${o.id}: HTTP ${r.status}`)
    }
  }
  console.log(`\nDeleted ${deleted}/${orphans.length} orphan VPS(es).`)
}

main().catch((e) => {
  console.error(`orphan-vps-cleanup crashed: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
