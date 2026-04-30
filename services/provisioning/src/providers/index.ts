import type { IVPSProvider } from '../vps-provider.js'
import { MockVPSProvider } from './mock-vps.js'
import { IDCloudHostVPSProvider } from './idcloudhost-vps.js'

/** Pilih VPS provider berdasarkan env VPS_PROVIDER. Default: idcloudhost. */
export function createVPSProvider(): IVPSProvider {
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
