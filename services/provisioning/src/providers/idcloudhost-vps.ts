import type { IVPSProvider, CreateVPSOpts, VPSInfo } from '../vps-provider.js'

/**
 * IDCloudHost adapter.
 * Docs: https://api.idcloudhost.com/
 */
export class IDCloudHostVPSProvider implements IVPSProvider {
  private apiKey: string
  private baseUrl: string

  constructor(opts: { apiKey?: string; region?: string } = {}) {
    this.apiKey = opts.apiKey ?? process.env.IDCLOUDHOST_API_KEY ?? ''
    const region = opts.region ?? process.env.IDCLOUDHOST_REGION ?? ''
    this.baseUrl = region
      ? `https://api.idcloudhost.com/v1/${region}/user-resource`
      : 'https://api.idcloudhost.com/v1/user-resource'
  }

  private async call<T = unknown>(
    method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
    path: string,
    body?: Record<string, string>,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        apikey: this.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
    if (body) init.body = new URLSearchParams(body).toString()

    const r = await fetch(`${this.baseUrl}${path}`, init)
    if (!r.ok) {
      const txt = await r.text()
      throw new Error(`IDCloudHost ${method} ${path} -> ${r.status}: ${txt.slice(0, 500)}`)
    }
    return r.json() as Promise<T>
  }

  async create(opts: CreateVPSOpts): Promise<VPSInfo> {
    const body: Record<string, string> = {
      name: opts.name,
      os_name: opts.osName ?? 'ubuntu',
      // IDCloudHost requires '-lts' suffix on Ubuntu versions. Plain '24.04'
      // returns 400 "if 'os_name=ubuntu' then value must be one from the list
      // ['20.04-lts', '22.04-lts', '24.04-lts']". Verified 2026-05-02.
      os_version: opts.osVersion ?? '24.04-lts',
      disks: String(opts.spec.disk),
      vcpu: String(opts.spec.vcpu),
      ram: String(opts.spec.ram),
      username: opts.username ?? 'liren',
      password: opts.password,
      billing_account_id: opts.billingAccountId,
    }
    if (opts.cloudInit) body.cloud_init = opts.cloudInit
    if (opts.sshKeyUuid) body.ssh_key_uuid = opts.sshKeyUuid

    return this.call<VPSInfo>('POST', '/vm', body)
  }

  async get(uuid: string): Promise<VPSInfo> {
    return this.call<VPSInfo>('GET', `/vm?uuid=${encodeURIComponent(uuid)}`)
  }

  async stop(uuid: string): Promise<void> {
    await this.call('POST', '/vm/stop', { uuid })
  }

  async start(uuid: string): Promise<void> {
    await this.call('POST', '/vm/start', { uuid })
  }

  async delete(uuid: string): Promise<void> {
    await this.call('DELETE', `/vm?uuid=${encodeURIComponent(uuid)}`)
  }

  /**
   * GET /v1/{region}/network/ip_addresses returns ALL the user's public IP
   * records — assigned, unassigned, and deleted. The dashboard uses this
   * endpoint (discovered via DevTools 2026-05-04) — IDCloudHost's documented
   * /vm endpoints don't surface public IPs at all.
   *
   * We pick the record where:
   *   - assigned_to === vm uuid
   *   - assigned_to_resource_type === "virtual_machine"
   *   - unassigned_at is null/missing (currently attached, not stale)
   *   - is_deleted is false
   */
  async getPublicIp(uuid: string): Promise<string | null> {
    // Note: this path is /v1/{region}/network/ip_addresses (NOT under
    // /user-resource/). We have to call it on the absolute base, not via
    // this.baseUrl which carries the user-resource prefix.
    const region = this.baseUrl.match(/\/v1\/([^/]+)\/user-resource/)?.[1] ?? ''
    const url = region
      ? `https://api.idcloudhost.com/v1/${region}/network/ip_addresses`
      : `https://api.idcloudhost.com/v1/network/ip_addresses`
    const r = await fetch(url, {
      method: 'GET',
      headers: { apikey: this.apiKey },
    })
    if (!r.ok) {
      const txt = await r.text()
      throw new Error(`IDCloudHost GET ip_addresses -> ${r.status}: ${txt.slice(0, 500)}`)
    }
    const records = (await r.json()) as Array<{
      address: string
      is_deleted?: boolean
      unassigned_at?: string | null
      assigned_to?: string
      assigned_to_resource_type?: string
    }>
    const match = records.find(
      (rec) =>
        rec.assigned_to === uuid &&
        rec.assigned_to_resource_type === 'virtual_machine' &&
        rec.is_deleted !== true &&
        !rec.unassigned_at,
    )
    return match?.address ?? null
  }
}
