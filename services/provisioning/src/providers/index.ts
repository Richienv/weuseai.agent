import type { IVPSProvider, CreateVPSOpts, VPSInfo } from '../vps-provider.js'
import { MockVPSProvider } from './mock-vps.js'
import { IDCloudHostVPSProvider } from './idcloudhost-vps.js'
import { VultrVPSProvider, classifyVultrError } from './vultr-vps.js'
import { DigitalOceanVPSProvider, classifyDOError } from './digitalocean-vps.js'

/**
 * Pick VPS provider. Priority:
 *   1. ENABLE_REAL_PROVISIONING === 'false' → MockVPSProvider (dry-run gate)
 *   2. VPS_PROVIDER env (mock | idcloudhost | vultr | digitalocean)
 *      - 'vultr' returns a FailoverVPSProvider wrapping Vultr (primary)
 *        + DigitalOcean SGP1 (failover on capacity errors). Matches the
 *        Sesi R §5 multi-provider recommendation.
 *      - 'idcloudhost' returns the IDCH adapter raw (grandfathered
 *        customers route here via createVPSProviderByName based on
 *        the stored vps_instances.provider column — see per-customer
 *        routing note below).
 *   3. Default — current main branch shipping with 'idcloudhost' until
 *      Step 2 cutover PR flips the Fly secret to 'vultr'.
 *
 * Dry-run gate exists so dev / staging envs can boot the full Express
 * service and exercise the HTTP layer without spending IDR/USD on real
 * VPS spawns. Set ENABLE_REAL_PROVISIONING=false in fly.toml's preview env.
 *
 * Per-customer routing for grandfathered customers: callers like
 * tear-down + refresh-env look up vps_instances.provider on each row
 * and use createVPSProviderByName() to construct the matching adapter
 * directly. The factory's default only affects NEW provisioning
 * (xendit-webhook spinUp, complete-onboarding step 8).
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
    case 'vultr': {
      // DO failover is opt-in: when DIGITALOCEAN_API_KEY is set, we wrap
      // Vultr (primary) + DO (failover) in FailoverVPSProvider. When it
      // isn't set, the factory returns Vultr alone — no failover.
      //
      // History (2026-05-11 hotfix): the original PR #74 factory always
      // eager-constructed DigitalOceanVPSProvider, whose constructor
      // throws on missing DIGITALOCEAN_API_KEY. Cutover deploys with
      // VPS_PROVIDER=vultr but DO secrets deferred → provisioning service
      // crashlooped on startup. This conditional construction lets the
      // founder ship the Vultr-only cutover today + add DO failover
      // later (the "small task" deferral founder mentioned).
      const vultr = new VultrVPSProvider()
      const doKey = process.env.DIGITALOCEAN_API_KEY
      if (doKey && doKey.length > 0) {
        return new FailoverVPSProvider(vultr, new DigitalOceanVPSProvider())
      }
      console.warn(
        '[providers] VPS_PROVIDER=vultr but DIGITALOCEAN_API_KEY not set — running Vultr-only (no DO failover). Set DO secrets to enable failover.',
      )
      return vultr
    }
    case 'digitalocean':
      // DO-only path — for testing or as the hot-swap if Vultr SGP becomes
      // structurally unreliable. Not the default production path.
      return new DigitalOceanVPSProvider()
    default:
      throw new Error(`Unknown VPS_PROVIDER: ${which}`)
  }
}

/**
 * Construct an adapter for a SPECIFIC stored provider name. Used by
 * tear-down + refresh-env to route to whichever provider owns an
 * existing vps_instances row. No failover — these ops target a specific
 * VPS that has a specific provider attached, so retrying on a different
 * provider would be incorrect.
 *
 * Pass the value of vps_instances.provider verbatim.
 */
export function createVPSProviderByName(name: string): IVPSProvider {
  switch (name) {
    case 'mock':         return new MockVPSProvider()
    case 'idcloudhost':  return new IDCloudHostVPSProvider()
    case 'vultr':        return new VultrVPSProvider()
    case 'digitalocean': return new DigitalOceanVPSProvider()
    default:
      throw new Error(`createVPSProviderByName: unknown provider "${name}"`)
  }
}

/**
 * Failover wrapper — primary first; on capacity errors, retries on
 * secondary. Only the `create()` call is failover-aware because that's
 * the only operation where capacity matters. All other ops (get / stop /
 * start / delete / getPublicIp) target a specific provider's VPS by id
 * and just pass through to whichever provider was active at create time.
 *
 * Design choice: this wrapper picks "primary" at create time and the
 * caller stores the resulting `vps_instances.provider` row. Subsequent
 * ops on that row construct the right single-provider adapter via
 * `createVPSProviderByName()`. So the wrapper is ONLY used during the
 * initial create — never for follow-up ops. That keeps the failure mode
 * clean (no per-call provider drift between create and tear-down).
 *
 * The `lastCreatedWith` field exposes which provider the most recent
 * create() actually succeeded on. customer-flow.ts reads this to record
 * the right provider name in the vps_instances row.
 */
export class FailoverVPSProvider implements IVPSProvider {
  private primary: IVPSProvider
  private secondary: IVPSProvider
  public primaryName: string
  public secondaryName: string
  /** Which provider name served the most recent successful create().
   *  Null before any create() call; one of primaryName/secondaryName after. */
  public lastCreatedWith: string | null = null

  constructor(
    primary: IVPSProvider,
    secondary: IVPSProvider,
    opts: { primaryName?: string; secondaryName?: string } = {},
  ) {
    this.primary = primary
    this.secondary = secondary
    this.primaryName = opts.primaryName ?? 'vultr'
    this.secondaryName = opts.secondaryName ?? 'digitalocean'
  }

  async create(opts: CreateVPSOpts): Promise<VPSInfo> {
    try {
      const info = await this.primary.create(opts)
      this.lastCreatedWith = this.primaryName
      return info
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (classifyFailoverError(msg) !== 'capacity') {
        // Non-capacity errors (auth, network, malformed request) surface
        // as-is — don't mask real bugs with a silent failover.
        throw e
      }
      // Capacity exhaustion on primary → retry on secondary. Log so
      // the cutover-period dashboards capture the failover rate.
      console.warn(
        `[FailoverVPSProvider] ${this.primaryName} capacity exhausted: ${msg.slice(0, 200)} — retrying on ${this.secondaryName}`,
      )
      const info = await this.secondary.create(opts)
      this.lastCreatedWith = this.secondaryName
      return info
    }
  }

  // Pass-through ops — when the factory is the FailoverVPSProvider,
  // these always go to the primary. In practice the customer-flow code
  // routes via createVPSProviderByName(vps_instances.provider) for
  // post-create ops, so these methods are mostly defensive
  // implementations of the IVPSProvider contract.
  async get(uuid: string): Promise<VPSInfo> {
    return this.primary.get(uuid)
  }
  async stop(uuid: string): Promise<void> {
    return this.primary.stop(uuid)
  }
  async start(uuid: string): Promise<void> {
    return this.primary.start(uuid)
  }
  async delete(uuid: string): Promise<void> {
    return this.primary.delete(uuid)
  }
  async getPublicIp(uuid: string): Promise<string | null> {
    return this.primary.getPublicIp(uuid)
  }
}

/**
 * Detect capacity-style errors across Vultr + DO + IDCloudHost (the last
 * for defense-in-depth — the IDCH capacity message that motivated this
 * migration is distinctive enough to recognize even though IDCH isn't
 * in the primary/secondary chain here).
 *
 * Tested in tests/vultr-do-adapter.spec.ts.
 */
export function classifyFailoverError(msg: string): 'capacity' | 'other' {
  if (classifyVultrError(msg) === 'capacity') return 'capacity'
  if (classifyDOError(msg) === 'capacity') return 'capacity'
  if (/Compute resources temporarily unavailable/i.test(msg)) return 'capacity'
  return 'other'
}

export { MockVPSProvider } from './mock-vps.js'
export { IDCloudHostVPSProvider } from './idcloudhost-vps.js'
export { VultrVPSProvider, classifyVultrError } from './vultr-vps.js'
export { DigitalOceanVPSProvider, classifyDOError } from './digitalocean-vps.js'
