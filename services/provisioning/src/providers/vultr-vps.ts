import { lookup as dnsLookup } from 'node:dns/promises'

import type { IVPSProvider, CreateVPSOpts, VPSInfo } from '../vps-provider.js'

/**
 * Vultr v2 adapter.
 *
 * Docs: https://www.vultr.com/api/
 *
 * Architecture choice — Vultr vs IDCloudHost (the existing adapter):
 *
 * 1. **Auth header is `Authorization: Bearer <key>`** (vs IDCH's `apikey:`).
 * 2. **JSON request bodies** (vs IDCH's form-encoded).
 * 3. **user_data must be base64-encoded** when sent on POST /v2/instances.
 *    Cloud-init runs the SAME script on the VPS; only the wire-format
 *    differs.
 * 4. **`main_ip` is returned directly on the instance object** — no
 *    separate /network/ip_addresses endpoint dance like IDCH requires.
 *    Massively simpler. We only need GET /v2/instances/{id} to read it.
 * 5. **No billing_account_id** field — Vultr uses the account-level
 *    billing tied to the API key.
 * 6. **Default user is `root`** (vs IDCH's `liren`). The cloud-init
 *    `- default` users-block line preserves the distro/provider default
 *    user, so our customer-flow.ts can stay agnostic.
 * 7. **SSH key registration is one-time**: POST /v2/ssh-keys returns
 *    a UUID; pass it in `sshkey_id` array on instance create. The fleet
 *    pubkey is uploaded once by ops; the UUID lives as
 *    `VULTR_FLEET_SSH_KEY_ID` Fly secret.
 *
 * Tier mapping (locked by RSS test 2026-05-11, peak VmRSS = 115 MB):
 *
 *   starter / pro / studio → ALL `vc2-1c-1gb` ($5/mo, sgp region).
 *
 * Hermes' actual memory footprint is ~115 MB peak, well under the 600 MB
 * ceiling for the cheapest 1vCPU/1GB plan. The existing TIER_SPEC table
 * in customer-flow.ts (which sized for IDCloudHost's vcpu>=2 minimum)
 * is left unchanged — we just don't pass the spec through to Vultr;
 * Vultr's `plan` field is the source of truth, not vcpu/ram/disk.
 *
 * Cost rationale: vc2-1c-1gb at Rp 86,900/mo + Rp 99k hosting fee =
 * +Rp 12,100/customer/mo margin. Sustainable at all customer counts.
 * See docs/research/2026-05-11-vultr-migration-validation.md §2.
 *
 * If we ever need to upsize (e.g. Camofox browser-automation lands):
 * change PLAN_BY_TIER below. No structural code change required.
 */

/** Pinned Vultr os_id for Ubuntu 22.04 LTS. Confirmed empirically by RSS
 *  test 2026-05-11 — id=1743 actually deploys 22.04 (not 24.04 as
 *  Sesi R's design doc assumed). The 24.04 image has a different id on
 *  Vultr (look up via GET /v2/os if we want to upgrade). 22.04 has full
 *  LTS support until April 2027, fine for now. */
const OS_ID_UBUNTU_22_04 = 1743

/** All tiers map to vc2-1c-1gb until traffic-driven RSS exceeds 600 MB.
 *  See module-doc rationale. */
const PLAN_BY_TIER: Record<string, string> = {
  starter: 'vc2-1c-1gb',
  pro: 'vc2-1c-1gb',
  studio: 'vc2-1c-1gb',
}

/** Inferred Vultr error class — capacity is transient (retry-with-DO),
 *  auth/quota is permanent (alert). Used by upstream factory wrapper. */
export type VultrErrorClass = 'capacity' | 'auth' | 'quota' | 'unknown'

export function classifyVultrError(body: string): VultrErrorClass {
  // Vultr's documented capacity message: "out of stock" or
  // "plan/region combination unavailable". Both fail to allocate the VM.
  if (/out of stock|unavailable|no.*capacity|insufficient.*capacity/i.test(body)) {
    return 'capacity'
  }
  if (/unauthorized|invalid.*api.*key|forbidden/i.test(body)) {
    return 'auth'
  }
  if (/quota|limit.*exceeded|over.*limit/i.test(body)) {
    return 'quota'
  }
  return 'unknown'
}

export class VultrVPSProvider implements IVPSProvider {
  private apiKey: string
  private region: string
  private fleetSshKeyId: string

  constructor(opts: { apiKey?: string; region?: string; fleetSshKeyId?: string } = {}) {
    this.apiKey = opts.apiKey ?? process.env.VULTR_API_KEY ?? ''
    this.region = opts.region ?? process.env.VULTR_REGION ?? 'sgp'
    this.fleetSshKeyId = opts.fleetSshKeyId ?? process.env.VULTR_FLEET_SSH_KEY_ID ?? ''
    if (!this.apiKey) {
      throw new Error('VultrVPSProvider: missing VULTR_API_KEY')
    }
    if (!this.fleetSshKeyId) {
      throw new Error(
        'VultrVPSProvider: missing VULTR_FLEET_SSH_KEY_ID — upload FLEET_SSH_PUBKEY to Vultr via POST /v2/ssh-keys + set the returned UUID as Fly secret. See docs/design/2026-05-11-vultr-migration.md §6.',
      )
    }
  }

  /** Pure helper — JSON request to Vultr API with consistent error
   *  shape. The error message includes status + body so upstream
   *  classifiers (factory failover, complete-onboarding-handler's
   *  isProviderCapacityError) can extract the substring. */
  private async call<T = unknown>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    }
    if (body !== undefined) init.body = JSON.stringify(body)
    // Bug B evidence log (2026-05-15) — record which IP family
    // api.vultr.com resolves to for this call. The Vultr key allowlist
    // is IPv4-only; index.ts forces IPv4 egress. If a future log line
    // shows IPv6 here, the IPv4 forcing has regressed before Vultr 401s.
    try {
      const { address, family } = await dnsLookup('api.vultr.com')
      console.log(`[vultr] ${method} ${path} → api.vultr.com ${address} (IPv${family})`)
    } catch {
      /* logging only — never block the API call */
    }
    const r = await fetch(`https://api.vultr.com/v2${path}`, init)
    if (!r.ok) {
      const txt = await r.text()
      throw new Error(`Vultr ${method} ${path} -> ${r.status}: ${txt.slice(0, 500)}`)
    }
    // DELETE returns 204 No Content — don't parse JSON.
    if (r.status === 204) return undefined as T
    return r.json() as Promise<T>
  }

  async create(opts: CreateVPSOpts): Promise<VPSInfo> {
    // Plan selection: we don't pass opts.spec through directly because
    // Vultr's plan field is the catalog identifier, not a spec. We infer
    // tier from opts.name (which carries the customer prefix) — but if
    // the name doesn't encode a tier, default to vc2-1c-1gb (the locked
    // tier per RSS test 2026-05-11).
    const tier = inferTierFromName(opts.name)
    const plan = PLAN_BY_TIER[tier] ?? 'vc2-1c-1gb'

    const body: Record<string, unknown> = {
      region: this.region,
      plan,
      os_id: OS_ID_UBUNTU_22_04,
      label: opts.name,
      hostname: opts.name,
      sshkey_id: [this.fleetSshKeyId],
      enable_ipv6: false,
      backups: 'disabled',
    }
    if (opts.cloudInit) {
      // Vultr expects base64-encoded user_data. The cloud-init bash
      // payload itself is unchanged — same content that runs on IDCH.
      body.user_data = Buffer.from(opts.cloudInit, 'utf8').toString('base64')
    }

    const resp = await this.call<{ instance: VultrInstance }>('POST', '/instances', body)
    return mapVultrToVPSInfo(resp.instance)
  }

  async get(uuid: string): Promise<VPSInfo> {
    const resp = await this.call<{ instance: VultrInstance }>(
      'GET',
      `/instances/${encodeURIComponent(uuid)}`,
    )
    return mapVultrToVPSInfo(resp.instance)
  }

  async stop(uuid: string): Promise<void> {
    await this.call('POST', `/instances/${encodeURIComponent(uuid)}/halt`)
  }

  async start(uuid: string): Promise<void> {
    await this.call('POST', `/instances/${encodeURIComponent(uuid)}/start`)
  }

  async delete(uuid: string): Promise<void> {
    await this.call('DELETE', `/instances/${encodeURIComponent(uuid)}`)
  }

  /**
   * Read main_ip from the instance object. `0.0.0.0` is Vultr's
   * placeholder during the ~30s allocation window after create —
   * treat it as null so customer-flow's waitForPublicIp loop keeps
   * polling.
   */
  async getPublicIp(uuid: string): Promise<string | null> {
    const resp = await this.call<{ instance: VultrInstance }>(
      'GET',
      `/instances/${encodeURIComponent(uuid)}`,
    )
    const ip = resp.instance.main_ip
    return ip && ip !== '0.0.0.0' ? ip : null
  }
}

// ─── internal types ──────────────────────────────────────────────

/** Subset of Vultr's instance shape we depend on. Other fields exist
 *  but aren't needed by the IVPSProvider contract. */
type VultrInstance = {
  id: string
  main_ip: string
  status: string         // 'pending' / 'active' / 'suspended' / 'resizing'
  server_status?: string // 'none' / 'locked' / 'installingbooting' / 'ok'
  power_status?: string  // 'running' / 'stopped' / 'starting'
  label: string
  vcpu_count: number
  ram: number            // MB
  disk: number           // GB
  os?: string
}

function mapVultrToVPSInfo(i: VultrInstance): VPSInfo {
  return {
    uuid: i.id,
    name: i.label,
    status: i.status,
    vcpu: i.vcpu_count,
    memory: i.ram,
    public_ipv4: i.main_ip && i.main_ip !== '0.0.0.0' ? i.main_ip : undefined,
  }
}

/**
 * Customer VPS names follow the pattern `liren-<cid-prefix>-<6digits>`
 * (per the existing provisioning service convention). The tier isn't
 * encoded in the name today — so this helper currently always returns
 * 'pro' (the dominant tier post-migration). If tier-aware sizing
 * becomes necessary, refactor customer-flow.ts to pass tier through
 * CreateVPSOpts.
 */
function inferTierFromName(_name: string): string {
  return 'pro'
}
