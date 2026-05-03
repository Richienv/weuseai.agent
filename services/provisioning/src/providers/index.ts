import type { IVPSProvider } from '../vps-provider.js'
import { MockVPSProvider } from './mock-vps.js'
import { IDCloudHostVPSProvider } from './idcloudhost-vps.js'

/**
 * Pick VPS provider. Priority:
 *   1. ENABLE_REAL_PROVISIONING === 'false' → MockVPSProvider (dry-run gate)
 *   2. VPS_PROVIDER env (mock | idcloudhost)
 *   3. Default → idcloudhost
 *
 * Dry-run gate exists so dev / staging envs can boot the full Express
 * service and exercise the HTTP layer without spending IDR on real VPS
 * spawns. Set ENABLE_REAL_PROVISIONING=false in fly.toml's preview env.
 */
export function createVPSProvider(): IVPSProvider {
  if (process.env.ENABLE_REAL_PROVISIONING === 'false') {
    return new MockVPSProvider()
  }
  const which = process.env.VPS_PROVIDER ?? 'idcloudhost'
  switch (which) {
    case 'mock':
      return new MockVPSProvider()
    case 'idcloudhost':
      return new IDCloudHostVPSProvider()
    default:
      throw new Error(`Unknown VPS_PROVIDER: ${which}`)
  }
}

export { MockVPSProvider } from './mock-vps.js'
export { IDCloudHostVPSProvider } from './idcloudhost-vps.js'
