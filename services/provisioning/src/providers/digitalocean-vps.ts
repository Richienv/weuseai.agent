import type { IVPSProvider, CreateVPSOpts, VPSInfo } from '../vps-provider.js'

/**
 * DigitalOcean v2 adapter — failover for Vultr capacity exhaustion.
 *
 * Docs: https://docs.digitalocean.com/reference/api/digitalocean/
 *
 * Architecture choice — DO vs Vultr:
 *
 * 1. **Same auth shape**: `Authorization: Bearer <PAT>`. Same JSON body
 *    pattern. Drop-in switch from Vultr in most respects.
 * 2. **user_data is plain text** (NOT base64-encoded like Vultr). Same
 *    cloud-init script content; different wire encoding. The branch
 *    below handles this in create().
 * 3. **`image` is a slug string** (e.g. 'ubuntu-22-04-x64'), not a
 *    numeric os_id like Vultr's. More human-readable.
 * 4. **Region is `sgp1`** (NOT `sgp` like Vultr — easy to confuse).
 * 5. **Size is `s-1vcpu-1gb`** ($6/mo at the cheapest tier — $1 more
 *    than Vultr's vc2-1c-1gb $5/mo). Sustainable per
 *    docs/research/2026-05-11-vultr-migration-validation.md §5.
 * 6. **`ssh_keys` array accepts either UUIDs OR fingerprints** —
 *    Vultr is UUID-only. We use UUID (passed as
 *    DIGITALOCEAN_FLEET_SSH_KEY_ID Fly secret).
 * 7. **Public IPv4 lives at `droplet.networks.v4[].ip_address`** with
 *    a `type` discriminator (`public` / `private`). Vultr's `main_ip`
 *    is much simpler — DO requires filtering.
 * 8. **Default user is `root`** (same as Vultr). Cloud-init `- default`
 *    line preserves it.
 *
 * Tier mapping (same RSS-test-locked tier as Vultr):
 *
 *   starter / pro / studio → ALL `s-1vcpu-1gb` ($6/mo, sgp1 region).
 *
 * Failover semantics (handled in factory, not here): if Vultr returns a
 * capacity error (out-of-stock / quota / 503), the factory wrapper
 * tries this DO adapter as a second attempt. Margin compresses by
 * Rp 17,380/mo (+$1) on DO-routed customers but availability dominates.
 */

const IMAGE_UBUNTU_22_04 = 'ubuntu-22-04-x64'

const SIZE_BY_TIER: Record<string, string> = {
  starter: 's-1vcpu-1gb',
  pro: 's-1vcpu-1gb',
  studio: 's-1vcpu-1gb',
}

export type DOErrorClass = 'capacity' | 'auth' | 'quota' | 'unknown'

export function classifyDOError(body: string): DOErrorClass {
  // DO's documented capacity error returns 422 with id="not_available" or
  // similar. Their docs aren't fully explicit; we match common phrasings.
  if (/not.*available|out.*of.*stock|capacity|sold.*out/i.test(body)) {
    return 'capacity'
  }
  if (/unauthorized|invalid.*token|forbidden/i.test(body)) {
    return 'auth'
  }
  if (/quota|limit/i.test(body)) {
    return 'quota'
  }
  return 'unknown'
}

export class DigitalOceanVPSProvider implements IVPSProvider {
  private apiToken: string
  private region: string
  private fleetSshKeyId: string

  constructor(opts: { apiToken?: string; region?: string; fleetSshKeyId?: string } = {}) {
    this.apiToken = opts.apiToken ?? process.env.DIGITALOCEAN_API_KEY ?? ''
    this.region = opts.region ?? process.env.DIGITALOCEAN_REGION ?? 'sgp1'
    this.fleetSshKeyId = opts.fleetSshKeyId ?? process.env.DIGITALOCEAN_FLEET_SSH_KEY_ID ?? ''
    if (!this.apiToken) {
      throw new Error('DigitalOceanVPSProvider: missing DIGITALOCEAN_API_KEY')
    }
    if (!this.fleetSshKeyId) {
      throw new Error(
        'DigitalOceanVPSProvider: missing DIGITALOCEAN_FLEET_SSH_KEY_ID — upload FLEET_SSH_PUBKEY via POST /v2/account/keys + set returned id as Fly secret.',
      )
    }
  }

  private async call<T = unknown>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
    }
    if (body !== undefined) init.body = JSON.stringify(body)
    const r = await fetch(`https://api.digitalocean.com/v2${path}`, init)
    if (!r.ok) {
      const txt = await r.text()
      throw new Error(`DigitalOcean ${method} ${path} -> ${r.status}: ${txt.slice(0, 500)}`)
    }
    if (r.status === 204) return undefined as T
    return r.json() as Promise<T>
  }

  async create(opts: CreateVPSOpts): Promise<VPSInfo> {
    const tier = inferTierFromName(opts.name)
    const size = SIZE_BY_TIER[tier] ?? 's-1vcpu-1gb'
    const body: Record<string, unknown> = {
      name: opts.name,
      region: this.region,
      size,
      image: IMAGE_UBUNTU_22_04,
      ssh_keys: [this.fleetSshKeyId],
      backups: false,
      ipv6: false,
      monitoring: false,
    }
    if (opts.cloudInit) {
      // DO accepts cloud-init plain text — NO base64 (unlike Vultr).
      body.user_data = opts.cloudInit
    }

    const resp = await this.call<{ droplet: DODroplet }>('POST', '/droplets', body)
    return mapDOToVPSInfo(resp.droplet)
  }

  async get(uuid: string): Promise<VPSInfo> {
    const resp = await this.call<{ droplet: DODroplet }>(
      'GET',
      `/droplets/${encodeURIComponent(uuid)}`,
    )
    return mapDOToVPSInfo(resp.droplet)
  }

  /** DO uses POST /v2/droplets/{id}/actions for power ops. Body: { type } */
  async stop(uuid: string): Promise<void> {
    await this.call('POST', `/droplets/${encodeURIComponent(uuid)}/actions`, {
      type: 'shutdown',
    })
  }

  async start(uuid: string): Promise<void> {
    await this.call('POST', `/droplets/${encodeURIComponent(uuid)}/actions`, {
      type: 'power_on',
    })
  }

  async delete(uuid: string): Promise<void> {
    await this.call('DELETE', `/droplets/${encodeURIComponent(uuid)}`)
  }

  /**
   * DO returns droplet.networks.v4[] which can include public AND
   * private IPs in any order. Filter on type='public'. Returns null
   * during the post-create allocation window (~20-30s typical on DO).
   */
  async getPublicIp(uuid: string): Promise<string | null> {
    const resp = await this.call<{ droplet: DODroplet }>(
      'GET',
      `/droplets/${encodeURIComponent(uuid)}`,
    )
    const v4s = resp.droplet.networks?.v4 ?? []
    const pub = v4s.find((n) => n.type === 'public')
    return pub?.ip_address && pub.ip_address !== '' ? pub.ip_address : null
  }
}

// ─── internal types ──────────────────────────────────────────────

type DODroplet = {
  id: number
  name: string
  status: string // 'new' / 'active' / 'off' / 'archive'
  vcpus: number
  memory: number  // MB
  disk: number    // GB
  image?: { slug?: string; name?: string }
  networks?: { v4?: Array<{ ip_address: string; type: string; netmask: string }> }
}

function mapDOToVPSInfo(d: DODroplet): VPSInfo {
  // DO's droplet.id is an integer. Our VPSInfo.uuid is a string so we
  // coerce — this is the value we'll store in vps_instances.provider_vps_id
  // for DO-provisioned VPSes. All other adapters happen to return UUID
  // strings, but the contract is "string id," not "UUID specifically."
  const pub = d.networks?.v4?.find((n) => n.type === 'public')?.ip_address
  return {
    uuid: String(d.id),
    name: d.name,
    status: d.status,
    vcpu: d.vcpus,
    memory: d.memory,
    public_ipv4: pub && pub !== '' ? pub : undefined,
  }
}

function inferTierFromName(_name: string): string {
  return 'pro'
}
