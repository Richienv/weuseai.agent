import type { IVPSProvider, CreateVPSOpts, VPSInfo } from '../vps-provider.js'

/**
 * In-memory mock. Default behavior: VPS create → status `provisioning`,
 * flips to `running` on next macrotask (mimics async boot).
 *
 * Tests can override via `autoRunAfterMs` (set to 0 for instant, or null to disable auto-run).
 */
export class MockVPSProvider implements IVPSProvider {
  private vms = new Map<string, VPSInfo>()
  private uuidCounter = 0
  private autoRunAfterMs: number | null

  constructor(opts: { autoRunAfterMs?: number | null } = {}) {
    this.autoRunAfterMs = opts.autoRunAfterMs ?? 0
  }

  async create(opts: CreateVPSOpts): Promise<VPSInfo> {
    const uuid = `mock-vps-${++this.uuidCounter}-${Date.now()}`
    const info: VPSInfo = {
      uuid,
      name: opts.name,
      status: 'provisioning',
      vcpu: opts.spec.vcpu,
      memory: opts.spec.ram,
      public_ipv4: this.fakeIp(),
      private_ipv4: '10.0.0.1',
    }
    this.vms.set(uuid, info)

    if (this.autoRunAfterMs !== null) {
      setTimeout(() => {
        const v = this.vms.get(uuid)
        if (v && v.status === 'provisioning') v.status = 'running'
      }, this.autoRunAfterMs)
    }

    return { ...info }
  }

  async get(uuid: string): Promise<VPSInfo> {
    const v = this.vms.get(uuid)
    if (!v) throw new Error(`mock vps not found: ${uuid}`)
    return { ...v }
  }

  async stop(uuid: string): Promise<void> {
    const v = this.vms.get(uuid)
    if (!v) throw new Error(`mock vps not found: ${uuid}`)
    v.status = 'stopped'
  }

  async start(uuid: string): Promise<void> {
    const v = this.vms.get(uuid)
    if (!v) throw new Error(`mock vps not found: ${uuid}`)
    v.status = 'running'
  }

  async delete(uuid: string): Promise<void> {
    if (!this.vms.has(uuid)) throw new Error(`mock vps not found: ${uuid}`)
    this.vms.delete(uuid)
  }

  /** Test helper — list all current VMs. */
  listAll(): VPSInfo[] {
    return Array.from(this.vms.values()).map((v) => ({ ...v }))
  }

  private fakeIp(): string {
    return `203.0.113.${Math.floor(Math.random() * 254) + 1}`
  }
}
