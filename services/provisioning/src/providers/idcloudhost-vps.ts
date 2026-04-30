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
      os_version: opts.osVersion ?? '24.04',
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
}
