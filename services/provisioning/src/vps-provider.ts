/**
 * IVPSProvider — port untuk VPS lifecycle.
 *
 * Adapter implementations:
 * - providers/mock-vps.ts (in-memory, untuk tests)
 * - providers/idcloudhost-vps.ts (real)
 *
 * Factory di providers/index.ts pilih berdasarkan env VPS_PROVIDER.
 */

export type VPSSpec = {
  vcpu: number
  ram: number   // MB
  disk: number  // GB
}

export type VPSInfo = {
  uuid: string
  name: string
  status: string
  vcpu: number
  memory: number
  public_ipv4?: string
  private_ipv4?: string
  public_ipv6?: string
}

export type CreateVPSOpts = {
  name: string
  spec: VPSSpec
  password: string
  cloudInit?: string
  billingAccountId: string
  username?: string
  osName?: string
  osVersion?: string
  sshKeyUuid?: string
}

export interface IVPSProvider {
  create(opts: CreateVPSOpts): Promise<VPSInfo>
  get(uuid: string): Promise<VPSInfo>
  stop(uuid: string): Promise<void>
  start(uuid: string): Promise<void>
  delete(uuid: string): Promise<void>
  /**
   * Look up the currently-attached public IPv4 for a VM. Returns null if
   * no IP is attached yet (e.g. just-created VMs sometimes take a few
   * seconds for IDCloudHost to allocate).
   *
   * Required because `get(uuid)` doesn't return public IPs on IDCH —
   * they live in a separate /network/ip_addresses listing.
   */
  getPublicIp(uuid: string): Promise<string | null>
}
