/**
 * Vercel Cron handler — nightly orphan-resource cleanup (Phase 2E-3).
 *
 * Spec: docs/plans/2026-05-08-phase-2e-3-spec.md (Day 4 — cleanup cron).
 *
 * Schedule: 03:00 UTC daily (10:00 WIB) — see vercel.json `crons`.
 *
 * Two cleanup tracks:
 *   1. Orphan smoke VMs — delete any IDCloudHost VPS named
 *      `weuseai-smoke-*` older than 24h. Idempotent + safe.
 *   2. Orphan Floating IPs — DETECTION ONLY (IDCH API doesn't expose
 *      release; see docs/risks-known.md). Lists orphans + posts a
 *      Telegram nudge to the founder so they can release via dashboard.
 *
 * Every run inserts a row in `cleanup_notifications` for trace.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on every
 * scheduled invocation. We require + validate that header so the
 * endpoint isn't trivially DDoSable.
 *
 * Required Vercel env:
 *   CRON_SECRET                  — set automatically by Vercel; we
 *                                  validate against process.env.CRON_SECRET
 *   IDCLOUDHOST_API_KEY          — read VMs + IPs (no DELETE for IPs)
 *   IDCLOUDHOST_REGION           — empty default (same convention as
 *                                  scripts/cleanup-orphan-vms.ts)
 *   SUPABASE_URL                 — for cleanup_notifications insert
 *   SUPABASE_SECRET_KEY          — service-role bearer
 *   SUPPORT_TELEGRAM_BOT_TOKEN   — founder nudge
 *   RICHIE_CHAT_ID               — chat_id of the founder Telegram
 */

// We talk to Supabase via the REST endpoint (PostgREST) directly, not
// the @supabase/supabase-js client — keeps the Vercel function dep-free
// (no need to add @supabase/supabase-js to the root package.json).
//
// Auth model: send the service-role secret as `Authorization: Bearer
// <key>` AND `apikey: <key>`. Both headers are required by PostgREST.

// ─── env ────────────────────────────────────────────────────────────────

import { isValidBearer } from './_shared/timing-safe-bearer.js'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const IDCH_KEY = process.env.IDCLOUDHOST_API_KEY ?? ''
const IDCH_REGION = process.env.IDCLOUDHOST_REGION ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const TELEGRAM_BOT_TOKEN = process.env.SUPPORT_TELEGRAM_BOT_TOKEN ?? ''
const RICHIE_CHAT_ID = process.env.RICHIE_CHAT_ID ?? ''

// ─── constants ──────────────────────────────────────────────────────────

const SMOKE_PREFIX = 'weuseai-smoke-'
const VM_TTL_HOURS = 24
const IP_GRACE_MINUTES = 30
const IDR_PER_IP_PER_MONTH = 40_000  // for the nudge cost summary

// ─── IDCH helpers ───────────────────────────────────────────────────────

const VM_LIST_URL = IDCH_REGION
  ? `https://api.idcloudhost.com/v1/${IDCH_REGION}/user-resource/vm/list`
  : `https://api.idcloudhost.com/v1/user-resource/vm/list`
const VM_BASE_URL = IDCH_REGION
  ? `https://api.idcloudhost.com/v1/${IDCH_REGION}/user-resource/vm`
  : `https://api.idcloudhost.com/v1/user-resource/vm`
const IP_LIST_URL = IDCH_REGION
  ? `https://api.idcloudhost.com/v1/${IDCH_REGION}/network/ip_addresses`
  : `https://api.idcloudhost.com/v1/network/ip_addresses`

type IdchVPS = {
  uuid: string
  name: string
  status: string
  created_at?: string
}

type IdchIP = {
  uuid: string
  address: string
  type: string
  enabled: boolean
  is_deleted: boolean
  assigned_to?: string | null
  assigned_to_resource_type?: string | null
  unassigned_at?: string | null
  is_ipv6?: boolean
  created_at?: string
}

async function listVMs(): Promise<IdchVPS[]> {
  const r = await fetch(VM_LIST_URL, { headers: { apikey: IDCH_KEY } })
  if (!r.ok) throw new Error(`list VMs HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const json = await r.json()
  if (Array.isArray(json)) return json as IdchVPS[]
  if (json && Array.isArray((json as { vms?: unknown }).vms)) {
    return (json as { vms: IdchVPS[] }).vms
  }
  throw new Error('list VMs returned unexpected shape')
}

async function deleteVM(uuid: string): Promise<void> {
  const url = `${VM_BASE_URL}?uuid=${encodeURIComponent(uuid)}`
  const r = await fetch(url, { method: 'DELETE', headers: { apikey: IDCH_KEY } })
  if (!r.ok) throw new Error(`delete VM ${uuid} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
}

async function listIPs(): Promise<IdchIP[]> {
  const r = await fetch(IP_LIST_URL, { headers: { apikey: IDCH_KEY } })
  if (!r.ok) throw new Error(`list IPs HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const json = await r.json()
  if (Array.isArray(json)) return json as IdchIP[]
  throw new Error('list IPs returned unexpected shape')
}

function parseDateFromVMName(name: string): Date | null {
  const m = /(\d{4})(\d{2})(\d{2})$/.exec(name)
  if (!m) return null
  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

// ─── Telegram ───────────────────────────────────────────────────────────

async function sendTelegramNudge(text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!TELEGRAM_BOT_TOKEN || !RICHIE_CHAT_ID) {
    return { ok: false, error: 'no token or chat id' }
  }
  try {
    const r = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: RICHIE_CHAT_ID, text }),
      },
    )
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ─── Cleanup logic ──────────────────────────────────────────────────────

type VmCleanupReport = {
  scanned: number
  deleted_uuids: string[]
  errors: string[]
}

type IpReport = {
  total: number
  orphans: Array<{ uuid: string; address: string; age_hours: number }>
}

async function cleanupSmokeVMs(): Promise<VmCleanupReport> {
  const all = await listVMs()
  const candidates = all.filter((v) => v.name.startsWith(SMOKE_PREFIX))
  const cutoffMs = Date.now() - VM_TTL_HOURS * 60 * 60 * 1000

  const toDelete: IdchVPS[] = []
  for (const vm of candidates) {
    const created = parseDateFromVMName(vm.name)
    if (!created) {
      // Couldn't parse — treat as stale (the script in the repo does the same).
      toDelete.push(vm)
      continue
    }
    if (created.getTime() < cutoffMs) toDelete.push(vm)
  }

  const errors: string[] = []
  const deleted: string[] = []
  for (const vm of toDelete) {
    try {
      await deleteVM(vm.uuid)
      deleted.push(vm.uuid)
    } catch (e) {
      errors.push(`${vm.name} (${vm.uuid}): ${e instanceof Error ? e.message : e}`)
    }
  }
  return { scanned: candidates.length, deleted_uuids: deleted, errors }
}

async function detectOrphanIPs(): Promise<IpReport> {
  const all = await listIPs()
  const graceCutoffMs = Date.now() - IP_GRACE_MINUTES * 60 * 1000
  const orphans: IpReport['orphans'] = []

  for (const ip of all) {
    if (ip.is_deleted) continue
    const isUnassigned =
      !ip.assigned_to ||
      ip.assigned_to === '' ||
      ip.assigned_to_resource_type !== 'virtual_machine' ||
      !!ip.unassigned_at
    if (!isUnassigned) continue

    const refMs = ip.unassigned_at
      ? Date.parse(ip.unassigned_at)
      : ip.created_at
        ? Date.parse(ip.created_at)
        : NaN
    if (Number.isFinite(refMs) && refMs > graceCutoffMs) continue
    const ageHours = Number.isFinite(refMs) ? (Date.now() - refMs) / 3600000 : 9999
    orphans.push({ uuid: ip.uuid, address: ip.address, age_hours: ageHours })
  }
  return { total: all.length, orphans }
}

// ─── Vercel handler ─────────────────────────────────────────────────────

type VercelRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, string | string[] | undefined>
}
type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  send: (body: unknown) => VercelResponse
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // ── Auth ──────────────────────────────────────────────────────────
  // Vercel Cron sets `Authorization: Bearer ${CRON_SECRET}`. We only
  // accept that exact secret. Without CRON_SECRET set in env this
  // function is unreachable (not a security failure — fail closed).
  const auth = (req.headers.authorization ?? '') as string
  // Sesi D pass-2 P1: timing-safe bearer comparison (was plain `!==`).
  // isValidBearer() returns false on empty secret, preserving the
  // pre-fix fail-closed semantics when CRON_SECRET is unset.
  if (!isValidBearer(auth, CRON_SECRET)) {
    res.status(401).send({ error: 'unauthorized' })
    return
  }

  if (!IDCH_KEY) {
    res.status(500).send({ error: 'IDCLOUDHOST_API_KEY missing' })
    return
  }

  // Direct PostgREST insert helper (replaces supabase-js to keep this
  // function dep-free). Bearer + apikey both required.
  async function insertCleanupNotification(
    resource_type: 'orphan_vm' | 'orphan_floating_ip',
    count_flagged: number,
    details: unknown[],
    notified_via: 'telegram' | 'log_only',
  ): Promise<void> {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/cleanup_notifications`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            apikey: SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            resource_type,
            count_flagged,
            details,
            notified_via,
          }),
        },
      )
      if (!r.ok) {
        console.error(
          `cleanup_notifications insert (${resource_type}) HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`,
        )
      }
    } catch (e) {
      console.error('cleanup_notifications insert failed:', e instanceof Error ? e.message : e)
    }
  }

  // ── Cleanup tracks ────────────────────────────────────────────────
  let vmReport: VmCleanupReport
  try {
    vmReport = await cleanupSmokeVMs()
  } catch (e) {
    res.status(502).send({
      error: 'idch_vm_track_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
    return
  }

  let ipReport: IpReport
  try {
    ipReport = await detectOrphanIPs()
  } catch (e) {
    // If IP track fails but VM track succeeded, still record the VM
    // result. IP detection is read-only and infrequently flaky.
    ipReport = { total: 0, orphans: [] }
    console.error('idch_ip_track_failed:', e)
  }

  // ── Telegram nudge (when there's something to surface) ───────────
  let telegramResult: { ok: boolean; error?: string } = { ok: true }
  if (vmReport.deleted_uuids.length > 0 || ipReport.orphans.length > 0) {
    const lines: string[] = [
      `⚠ weuseai-cleanup nightly summary (${new Date().toISOString().slice(0, 10)})`,
    ]
    if (vmReport.deleted_uuids.length > 0) {
      lines.push(
        `• Deleted ${vmReport.deleted_uuids.length} smoke VM(s) older than ${VM_TTL_HOURS}h`,
      )
    } else {
      lines.push(`• 0 orphan VMs (TTL ${VM_TTL_HOURS}h)`)
    }
    if (ipReport.orphans.length > 0) {
      const monthlyBurnIdr = ipReport.orphans.length * IDR_PER_IP_PER_MONTH
      lines.push(
        `• ${ipReport.orphans.length} orphan Floating IP(s) — burning ~Rp ${monthlyBurnIdr.toLocaleString('id-ID')}/month silently:`,
      )
      for (const ip of ipReport.orphans.slice(0, 10)) {
        lines.push(`  - ${ip.address}  uuid=${ip.uuid}  unassigned ${ip.age_hours.toFixed(1)}h ago`)
      }
      if (ipReport.orphans.length > 10) {
        lines.push(`  ... +${ipReport.orphans.length - 10} more`)
      }
      lines.push(
        `→ release via dashboard.idcloudhost.com → Network → Floating IPs (IDCH API doesn't expose release; see docs/risks-known.md)`,
      )
    }
    telegramResult = await sendTelegramNudge(lines.join('\n'))
  }

  // ── cleanup_notifications audit insert ────────────────────────────
  if (vmReport.deleted_uuids.length > 0 || ipReport.orphans.length > 0) {
    const notifiedVia: 'telegram' | 'log_only' =
      telegramResult.ok && TELEGRAM_BOT_TOKEN && RICHIE_CHAT_ID
        ? 'telegram'
        : 'log_only'
    if (vmReport.deleted_uuids.length > 0) {
      await insertCleanupNotification(
        'orphan_vm',
        vmReport.deleted_uuids.length,
        vmReport.deleted_uuids.map((uuid) => ({ uuid })),
        notifiedVia,
      )
    }
    if (ipReport.orphans.length > 0) {
      await insertCleanupNotification(
        'orphan_floating_ip',
        ipReport.orphans.length,
        ipReport.orphans,
        notifiedVia,
      )
    }
  }

  // ── Response ──────────────────────────────────────────────────────
  res.status(200).json({
    ok: true,
    vm: {
      scanned: vmReport.scanned,
      deleted_count: vmReport.deleted_uuids.length,
      errors: vmReport.errors,
    },
    ip: {
      total: ipReport.total,
      orphan_count: ipReport.orphans.length,
    },
    telegram: telegramResult,
  })
}
