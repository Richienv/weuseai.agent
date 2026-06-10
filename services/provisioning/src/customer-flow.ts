/**
 * One-click provisioning per customer (post-payment).
 *
 * Architecture v2 (2026-05-04 — pivoted from cloud-init delivery after
 * IDCloudHost was confirmed to drop cloud_init payloads):
 *
 *   1. vps.create() — fresh Ubuntu, NO cloud_init, password set via API
 *   2. Poll vps.getPublicIp(uuid) until non-null (IDCloudHost takes ~30s)
 *   3. Wait for SSH port 22 reachable on the public IP
 *   4. ssh.runSetup() — run buildSetupScript() output remotely
 *      (script's first action: send halo Telegram ping for proof-of-life)
 *   5. Mark vps_instances.ip_address with the discovered IP
 *   6. Return — customer's halo Telegram message has already landed
 *
 * Idempotent: a second call for the same customerId returns the existing
 * vps_instances row without re-creating.
 */

import type { IVPSProvider, VPSInfo, VPSSpec } from './vps-provider.js'
import type { IDataStore } from './data-store.js'
import { createVPSProviderByName } from './providers/index.js'
import type { IMessageBroker } from '../../hermes/src/adapters/message-broker.js'
import type { ISshProvisioner } from './ssh-provisioner.js'
import type { ILlmKeyMinter } from './llm-key-minter.js'
import { readFileSync } from 'node:fs'
import { resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildSetupScript, type Tier, type ProvisionTier } from './setup-script.js'
import { personasForTier, DEFAULT_PERSONA } from '../../../supabase/functions/_shared/tier-personas.js'
// Phase 5-3.c rollout: per-customer HMAC token computed at customer-creation
// time. Reuses the same auth module as the verifier side (Edge Functions).
import { signCustomerToken } from '../../../supabase/functions/_shared/hermes-instance-auth'

export type { Tier, ProvisionTier }

// IDCloudHost jkt01 enforces vcpu >= 2 ("CPU count must be between 2 and 32").
const TIER_SPEC: Record<Tier, VPSSpec> = {
  starter: { vcpu: 2, ram: 4096, disk: 50 },
  pro: { vcpu: 2, ram: 8192, disk: 100 },
  studio: { vcpu: 4, ram: 16384, disk: 200 },
}

/**
 * Phase 2A: per-tier OpenRouter spend cap (USD cents). Customer can top up
 * via Phase 2C flow; initial allocation lasts ~600-2500 messages on
 * deepseek/deepseek-chat depending on length.
 */
const TIER_LLM_LIMIT_CENTS: Record<Tier, number> = {
  starter: 300,    // $3
  pro: 500,        // $5
  studio: 3000,    // $30
}

/**
 * Map any provisionable tier slug (v1.4 canonical OR legacy) to a VPS
 * spec-class. Persona + voice are derived SEPARATELY from the REAL
 * canonical slug (personasForTier / TIERS[resolveTier]) — this only sizes
 * the VPS + LLM budget by resource class, so collapsing same-size tiers is
 * lossless. bare / solo / voice-starter share the smallest box ($3);
 * done-for-you sizes like pro ($5); library-full sizes like studio ($30).
 */
export function resolveTierToSpecClass(tier: ProvisionTier): Tier {
  switch (tier) {
    case 'starter':
    case 'bare':
    case 'solo':
    case 'voice-starter':
      return 'starter'
    case 'pro':
    case 'done-for-you':
      return 'pro'
    case 'studio':
    case 'library-full':
      return 'studio'
    default: {
      // Exhaustiveness guard — a new ProvisionTier must be classed here.
      const _exhaustive: never = tier
      void _exhaustive
      return 'starter'
    }
  }
}

export type SpinUpOpts = {
  customerId: string
  tier: ProvisionTier
  /** Where the welcome / liveness message lands. Optional. */
  telegramChatId?: string
  customerTelegramBotToken?: string
  customerTelegramAllowedUserIds?: string
  /**
   * @deprecated Phase 2A — LLM key is now minted via OpenRouter inside
   * spinUpCustomer (no BYOK at customer-flow level). Kept on the type for
   * webhook back-compat; ignored.
   */
  customerLlmApiKey?: string
  /** @deprecated as customerLlmApiKey above. */
  customerLlmProvider?: 'deepseek' | 'openrouter' | 'openai' | 'glm'
  alwaysOnEnabled?: boolean
  useStarterCredits?: boolean
  /**
   * Phase 2E-2: which agent persona's bundle ships at provision. Default
   * `'the-pro'` (matches the persona-pack default). Customer's chosen
   * persona at onboarding overrides this when `complete-onboarding`
   * triggers a bundle re-deploy via Storage. Initial provision uses
   * The Pro until the customer picks otherwise.
   */
  agentSlug?: string
}

export type SpinUpDeps = {
  vps: IVPSProvider
  store: IDataStore
  broker: IMessageBroker
  /** SSH executor — runs buildSetupScript() output on the fresh VM. */
  ssh: ISshProvisioner
  /** Phase 2A: mints per-customer OpenRouter key with tier-based spend cap. */
  llmMinter: ILlmKeyMinter
  /** Custom polling/timeout hooks (tests override; prod uses defaults). */
  waitForSshOpen?: (host: string, opts: { timeoutMs: number; pollIntervalMs: number }) => Promise<void>
  providerName?: 'idcloudhost' | 'vultr' | 'digitalocean' | 'mock' | string
  billingAccountId?: string
  region?: string | null
  alertChatId?: string
  ipPollIntervalMs?: number
  ipPollTimeoutMs?: number
  sshPollIntervalMs?: number
  sshReadyTimeoutMs?: number
  log?: (msg: string, ...rest: unknown[]) => void
  /**
   * Wait-page race fix (2026-05-16): second-finisher hook. Called
   * exactly once, AFTER the setup-script completes and the VPS row
   * flips to status='running'. Production wires it (services/
   * provisioning/src/index.ts) to a POST to the Supabase
   * admin-customer-vps-refresh Edge Function, which decrypts the
   * customer's bot token and SSH-pushes it (+ TELEGRAM_ALLOWED_USERS +
   * SOUL.md + chat_id pre-approve) to the now-ready VPS, starting
   * hermes-gateway.
   *
   * This unsticks the "fast customer": one who finished the onboarding
   * form while the VPS was still provisioning. Their complete-onboarding
   * deferred refreshEnv (it would have raced a half-built VPS → exit 4),
   * so the gateway would otherwise never start. admin-customer-vps-
   * refresh self-gates on "customer has a bot token" — when the
   * customer has not onboarded yet it is a benign 409 no-op (their
   * complete-onboarding will refreshEnv itself once it sees
   * status='running').
   *
   * Best-effort: a throw is caught + logged inside the background
   * task; it never fails the provisioning run.
   */
  notifyVpsReady?: (customerId: string) => Promise<void>
}

export type SpinUpResult = {
  vpsId: string
  ip: string | null
  status: 'provisioning' | 'running'
  done: Promise<void>
}

export async function spinUpCustomer(
  opts: SpinUpOpts,
  deps: SpinUpDeps,
): Promise<SpinUpResult> {
  const log =
    deps.log ??
    ((msg: string, ...rest: unknown[]) =>
      console.log(`[provision:${opts.customerId}] ${msg}`, ...rest))
  const ipPollIntervalMs = deps.ipPollIntervalMs ?? 3000
  const ipPollTimeoutMs = deps.ipPollTimeoutMs ?? 5 * 60 * 1000
  const sshPollIntervalMs = deps.sshPollIntervalMs ?? 3000
  const sshReadyTimeoutMs = deps.sshReadyTimeoutMs ?? 5 * 60 * 1000
  // billingAccountId was an IDCloudHost-only concept (jkt01 region needed
  // a separate billing account UUID per customer). Vultr + DO don't need
  // it. Kept as a deps override so legacy callers compile; production
  // code never reads it post-IDCH-retirement.
  const billingAccountId = deps.billingAccountId ?? ''
  // Region stamp depends on the active provider so vps_instances.region
  // matches reality. Post-IDCH-retirement (2026-05-13) the default is
  // 'vultr'; an explicit deps.providerName override or VPS_PROVIDER env
  // still picks up 'mock' / 'digitalocean' as needed.
  const activeProvider = deps.providerName ?? process.env.VPS_PROVIDER ?? 'vultr'
  const regionEnvKey =
    activeProvider === 'vultr' ? process.env.VULTR_REGION
    : activeProvider === 'digitalocean' ? process.env.DIGITALOCEAN_REGION
    : null
  const region = deps.region ?? regionEnvKey ?? null
  const waitForSshOpen = deps.waitForSshOpen ?? defaultWaitForSshOpen

  // ── Idempotency ──
  const existing = await deps.store.findActiveVPSByCustomer(opts.customerId)
  if (existing) {
    log(`Already exists: ${existing.vps_id} (status: ${existing.status})`)
    return {
      vpsId: existing.vps_id,
      ip: existing.ip_address ?? null,
      status: existing.status === 'running' ? 'running' : 'provisioning',
      done: Promise.resolve(),
    }
  }

  // ── Mint per-customer OpenRouter key (Phase 2A — replaces proxy + BYOK) ──
  // Done BEFORE VM creation so a minter failure costs us nothing in IDCH IPs.
  log(`Minting OpenRouter key (limit: $${TIER_LLM_LIMIT_CENTS[resolveTierToSpecClass(opts.tier)] / 100})...`)
  let openRouterKey: string
  let openRouterHash: string
  try {
    const minted = await deps.llmMinter.mint({
      name: `weuseai-customer-${opts.customerId}`,
      limitUsdCents: TIER_LLM_LIMIT_CENTS[resolveTierToSpecClass(opts.tier)],
    })
    openRouterKey = minted.key
    openRouterHash = minted.hash
    log(`✓ OpenRouter key minted (hash=${openRouterHash.slice(0, 8)}…)`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`✗ Mint failed: ${msg}`)
    if (deps.alertChatId) {
      try {
        await deps.broker.sendMessage({
          chatId: deps.alertChatId,
          text: `[provisioning alert]\nOpenRouter mint failed for ${opts.customerId}: ${msg}`,
        })
      } catch {/* best effort */}
    }
    // Wrap in done so caller's `await result.done` rejects (matches contract).
    return {
      vpsId: '',
      ip: null,
      status: 'provisioning',
      done: Promise.reject(e instanceof Error ? e : new Error(msg)),
    }
  }

  // Persist hash + cap (NOT the secret key — that lives only on the VM).
  await deps.store.upsertOpenRouterKey({
    customer_id: opts.customerId,
    openrouter_key_hash: openRouterHash,
    credit_limit_usd_cents: TIER_LLM_LIMIT_CENTS[resolveTierToSpecClass(opts.tier)],
  })

  // ── Build setup script (the customer's persona, skill, halo, install) ──
  const sshPassword = cryptoRandomPassword()
  const setupScript = await buildScriptFor(opts, openRouterKey)

  // ── Create VM (NO cloud_init — we're going SSH route) ──
  log(`Creating VPS for tier=${opts.tier}...`)
  let vps: VPSInfo
  try {
    vps = await deps.vps.create({
      name: `liren-${opts.customerId.slice(0, 8)}-${Date.now().toString().slice(-6)}`,
      spec: TIER_SPEC[resolveTierToSpecClass(opts.tier)],
      password: sshPassword,
      // cloudInit intentionally omitted — IDCH drops it silently
      billingAccountId,
      username: 'liren',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`✗ Create failed: ${msg}`)
    if (deps.alertChatId) {
      try {
        await deps.broker.sendMessage({
          chatId: deps.alertChatId,
          text: `[provisioning alert]\nCreate failed for ${opts.customerId}: ${msg}`,
        })
      } catch {/* best effort */}
    }
    throw e
  }
  log(`✓ VPS created: ${vps.uuid}`)

  // ── DB row (status=provisioning, no IP yet) ──
  // Vultr-migration cascade 2026-05-11: when the factory returned a
  // FailoverVPSProvider, the actual provider that served the create
  // (primary Vultr or secondary DigitalOcean) is exposed via
  // `lastCreatedWith`. Record THAT in the row so tear-down + refresh-env
  // route to the right adapter via createVPSProviderByName. Without this
  // a Vultr-failed → DO-succeeded customer would have their VPS recorded
  // as `vultr` and subsequent ops would hit the wrong API.
  const inferredProvider =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (deps.vps as any).lastCreatedWith ?? deps.providerName ?? 'vultr'
  await deps.store.createVPSInstance({
    customer_id: opts.customerId,
    vps_id: vps.uuid,
    provider: inferredProvider,
    ip_address: null,
    region,
    status: 'provisioning',
  })

  // ── Background: discover IP, wait for SSH, run setup ──
  const done = (async () => {
    try {
      log('Polling for public IP allocation...')
      const publicIp = await waitForPublicIp(deps.vps, vps.uuid, {
        timeoutMs: ipPollTimeoutMs,
        pollIntervalMs: ipPollIntervalMs,
      })
      log(`✓ Public IP allocated: ${publicIp}`)
      await deps.store.updateVPSInstance(vps.uuid, { ip_address: publicIp })

      log('Waiting for SSH port 22 to open...')
      await waitForSshOpen(publicIp, {
        timeoutMs: sshReadyTimeoutMs,
        pollIntervalMs: sshPollIntervalMs,
      })
      log('✓ SSH port open')

      log('Running setup script over SSH (sends halo first, then installs Hermes)...')
      // Vultr-migration cascade 2026-05-11: branch SSH config by provider.
      //   - idcloudhost → user='liren' + sshpass + password (legacy)
      //   - vultr / digitalocean → user='root' + ssh -i fleet-key (key auth)
      // The fleet private key for Vultr/DO is written to a tmpfile
      // (mode 0600) and removed in the finally block. Pre-fix, the
      // hardcoded `liren` user + password path failed exit 5 on Vultr
      // because Vultr's default user is `linuxuser` (not liren), so
      // password auth had no matching account.
      const isKeyAuth = inferredProvider === 'vultr' || inferredProvider === 'digitalocean'
      let keyPath: string | undefined
      if (isKeyAuth) {
        const fleetKey = process.env.FLEET_SSH_PRIVATE_KEY ?? ''
        if (!fleetKey) {
          throw new Error(
            `SSH setup needs FLEET_SSH_PRIVATE_KEY env for provider=${inferredProvider}`,
          )
        }
        const { mkdtempSync, writeFileSync, chmodSync } = await import('node:fs')
        const { tmpdir } = await import('node:os')
        const { join } = await import('node:path')
        const dir = mkdtempSync(join(tmpdir(), 'weuseai-fleet-'))
        keyPath = join(dir, 'id_fleet')
        const normalised = fleetKey.endsWith('\n') ? fleetKey : fleetKey + '\n'
        writeFileSync(keyPath, normalised, { encoding: 'utf8' })
        chmodSync(keyPath, 0o600)
      }
      let sshResult
      try {
        sshResult = await deps.ssh.runSetup({
          host: publicIp,
          user: isKeyAuth ? 'root' : 'liren',
          ...(isKeyAuth
            ? { privateKeyPath: keyPath }
            : { password: sshPassword }),
          script: setupScript,
          timeoutMs: 12 * 60 * 1000, // Hermes install can take 5+ min
        })
      } finally {
        if (keyPath) {
          try {
            const { rmSync } = await import('node:fs')
            const { dirname } = await import('node:path')
            rmSync(dirname(keyPath), { recursive: true, force: true })
          } catch {/* best effort */}
        }
      }
      if (!sshResult.ok) {
        throw new Error(
          `SSH setup failed (exit ${sshResult.exitCode}): ${sshResult.stderr.slice(0, 500)}`,
        )
      }
      log('✓ Setup script complete')

      await deps.store.updateVPSInstance(vps.uuid, { status: 'running' })

      // Wait-page race fix (2026-05-16): second-finisher. The setup-
      // script is done + the VPS row is now 'running', so it is finally
      // safe to SSH-refresh the .env (the hermes binary is installed →
      // refresh-env's install-if-missing block won't hit `exit 4`). If
      // the customer already finished onboarding while we were
      // provisioning, their complete-onboarding deferred refreshEnv —
      // fire it now via the hook so hermes-gateway starts and
      // welcome.html un-sticks. Best-effort: a throw never escapes the
      // background task (the provision itself already succeeded).
      if (deps.notifyVpsReady) {
        try {
          await deps.notifyVpsReady(opts.customerId)
        } catch (e) {
          log(
            `notifyVpsReady failed (non-fatal): ${
              e instanceof Error ? e.message : String(e)
            }`,
          )
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log(`✗ Background provision failed: ${msg}`)
      try {
        await deps.store.updateVPSInstance(vps.uuid, { status: 'failed' })
      } catch {/* best effort */}
      if (deps.alertChatId) {
        try {
          await deps.broker.sendMessage({
            chatId: deps.alertChatId,
            text: `[provisioning alert]\nBackground failed for ${opts.customerId}: ${msg}`,
          })
        } catch {/* best effort */}
      }
      throw e
    }
  })()

  done.catch(() => {/* swallow if caller ignores */})

  return {
    vpsId: vps.uuid,
    ip: null,
    status: 'provisioning',
    done,
  }
}

export async function tearDownCustomer(
  customerId: string,
  deps: { vps: IVPSProvider; store: IDataStore },
): Promise<{ ok: boolean; reason?: string }> {
  const existing = await deps.store.findActiveVPSByCustomer(customerId)
  if (!existing) return { ok: false, reason: 'no_vps_found' }

  // Vultr-migration cascade 2026-05-11: per-customer routing. The
  // grandfathered IDCH customers (Renita 42c024ce + e282ce25) have
  // vps_instances.provider='idcloudhost' rows whose vps_ids are
  // IDCloudHost UUIDs. Calling deps.vps.delete() on a global factory
  // wrapped in FailoverVPSProvider (Vultr+DO) post-cutover would route
  // to Vultr's DELETE /v2/instances/{idch-uuid} → 404. Route by stored
  // provider instead — same pattern createVPSProviderByName() is meant
  // for. See services/provisioning/src/providers/index.ts.
  //
  // Fallback to deps.vps for backward-compat with callers that pass
  // a specific adapter (e.g. tests using MockVPSProvider directly).
  let adapter: IVPSProvider = deps.vps
  if (existing.provider && existing.provider !== 'mock') {
    try {
      adapter = createVPSProviderByName(existing.provider)
    } catch (e) {
      // Unknown provider name → fall back to deps.vps. Log so future
      // VPSes with new provider values are caught in monitoring.
      console.warn(
        `[tearDownCustomer] couldn't construct provider="${existing.provider}" — falling back to deps.vps: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }
  await adapter.delete(existing.vps_id)
  await deps.store.updateVPSInstance(existing.vps_id, { status: 'stopped' })
  return { ok: true }
}

/**
 * Resolve the right provider adapter for a stored VPS row — by the row's
 * `provider` field, falling back to deps.vps (mock / specific adapter in
 * tests). Same routing tearDownCustomer uses; extracted so suspend/resume
 * share it.
 */
function adapterForRow(
  row: { provider?: string },
  deps: { vps: IVPSProvider },
  label: string,
): IVPSProvider {
  let adapter: IVPSProvider = deps.vps
  if (row.provider && row.provider !== 'mock') {
    try {
      adapter = createVPSProviderByName(row.provider)
    } catch (e) {
      console.warn(
        `[${label}] couldn't construct provider="${row.provider}" — falling back to deps.vps: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }
  return adapter
}

/**
 * The VPS a lifecycle action targets. The fleet-sentinel Edge Function
 * already holds the vps_instances row (it queried the fleet to build its
 * snapshot), so it passes vps_id + provider explicitly. This is also why
 * suspend/resume do NOT go through findActiveVPSByCustomer — that lookup
 * filters to status running/provisioning, which would make a SUSPENDED
 * (stopped) VPS impossible to find at resume time.
 */
export type LifecycleTarget = {
  customerId: string
  vpsId: string
  provider?: string
}

/**
 * Fleet Sentinel lifecycle — suspend (Vultr halt) an idle customer's VPS.
 * Compute stops; storage (and the box) is retained, so a resume just powers
 * it back on. REVERSIBLE — never deletes. The vps_instances row is patched
 * status='stopped'; the lifecycle_state/suspended_at stamping is done by the
 * caller (fleet-sentinel Edge Function) which owns those columns.
 *
 * Spec: docs/specs/2026-06-07-fable5-10x-build-spec.md
 */
export async function suspendCustomer(
  target: LifecycleTarget,
  deps: { vps: IVPSProvider; store: IDataStore },
): Promise<{ ok: boolean; reason?: string; vpsId?: string }> {
  if (!target.vpsId) return { ok: false, reason: 'missing_vps_id' }
  const adapter = adapterForRow(target, deps, 'suspendCustomer')
  await adapter.stop(target.vpsId)
  await deps.store.updateVPSInstance(target.vpsId, { status: 'stopped' })
  return { ok: true, vpsId: target.vpsId }
}

/**
 * Fleet Sentinel lifecycle — resume (Vultr start) a previously-suspended
 * VPS when the customer shows fresh activity. Patches status='running';
 * Hermes auto-starts on boot (systemd Restart=always) and its bundle-pull
 * ExecStartPre re-runs. Caller clears lifecycle_state/suspended_at.
 */
export async function resumeCustomer(
  target: LifecycleTarget,
  deps: { vps: IVPSProvider; store: IDataStore },
): Promise<{ ok: boolean; reason?: string; vpsId?: string }> {
  if (!target.vpsId) return { ok: false, reason: 'missing_vps_id' }
  const adapter = adapterForRow(target, deps, 'resumeCustomer')
  await adapter.start(target.vpsId)
  await deps.store.updateVPSInstance(target.vpsId, { status: 'running' })
  return { ok: true, vpsId: target.vpsId }
}

// ──────── helpers ────────

// Phase 2E-2 Day 2: bootstrap bundle (~5KB tar.gz) read once at module
// load time. Setup-script gets the base64 inlined; Hermes' bundle-pull
// script does the full per-agent bundle pull from Storage at boot.
//
// Source of truth: agent-packs/_bootstrap-bundle.tar.gz (committed to repo,
// rebuilt by scripts/build-bootstrap-bundle.ts when source files change).
// Drift test in tests/bootstrap-bundle.spec.ts catches stale builds.
const BOOTSTRAP_BUNDLE_BASE64 = (() => {
  try {
    // Resolve from this file's location: ../../../agent-packs/_bootstrap-bundle.tar.gz
    const here = fileURLToPath(import.meta.url)
    const bundlePath = pathResolve(here, '../../../../agent-packs/_bootstrap-bundle.tar.gz')
    const bytes = readFileSync(bundlePath)
    return bytes.toString('base64')
  } catch (e) {
    // Bootstrap bundle missing → log + degrade to no-bundle provisioning
    // (matches the back-compat path in setup-script.ts when bundleTarBase64
    // is undefined). Non-fatal; provisioning still proceeds.
    console.warn(
      '[customer-flow] Bootstrap bundle missing or unreadable:',
      e instanceof Error ? e.message : String(e),
    )
    return undefined
  }
})()

// Phase 2E-3: fleet SSH pubkey read once at module load. Set on the
// provisioning service env (Fly.io) as FLEET_SSH_PUBKEY. Empty/missing
// → setup-script omits the authorized_keys write (back-compat); the
// resulting VPS won't be tier-bump-able until manually injected.
const FLEET_SSH_PUBKEY = process.env.FLEET_SSH_PUBKEY ?? ''

// Phase 2E-3 Q7: pinned Hermes version. Default in setup-script.ts
// (v0.13.0); operator can override via env.
const HERMES_VERSION = process.env.HERMES_VERSION

// Phase B (voice-input STT, 2026-06-02): the STT provider key for Hermes'
// native voice-memo transcription, read once at module load (mirrors the
// FLEET_SSH_PUBKEY pattern). It is a single fleet-wide provisioning secret
// set on the Fly service env, NOT per-customer — Hermes calls the STT
// provider internally with this key on each customer VPS.
//
// The default provider is Groq (see VOICE_STT_PROVIDER in setup-script.ts);
// set VOICE_STT_GROQ_KEY accordingly. If the fleet is switched to the
// OpenAI provider, set VOICE_STT_OPENAI_KEY instead (a REAL api.openai.com
// key — NOT an OpenRouter key, which only works for the chat path). We read
// both and prefer the one matching the active provider, falling back to the
// other so a mis-set var name still works.
//
// Absent → setup-script still writes the voice CONFIG block (so STT
// activates the moment the key lands via refresh-env) but omits the key
// env line; incoming voice stays untranscribed until then, text unaffected.
const VOICE_STT_GROQ_KEY = process.env.VOICE_STT_GROQ_KEY ?? ''
const VOICE_STT_OPENAI_KEY = process.env.VOICE_STT_OPENAI_KEY ?? ''

if (!VOICE_STT_GROQ_KEY && !VOICE_STT_OPENAI_KEY) {
  // Consult-accepted (2026-06-02): ship the voice config anyway; text
  // fallback active until the key is set. This warning makes the gap
  // visible in the Fly logs so the founder knows STT is dormant.
  console.warn(
    '[customer-flow] No VOICE_STT_GROQ_KEY / VOICE_STT_OPENAI_KEY set — ' +
      'voice-tier VPSes get the voice/stt config block but STT stays dormant ' +
      '(incoming voice not transcribed) until a key is set. Text chat unaffected.',
  )
}

// Phase 5-3.c: shared HMAC secret. When set, computeHermesInstanceToken()
// signs a per-customer token at provision time and threads it through
// the VPS .env. When unset, no token written → Hermes-side falls back
// to MVP customer_id existence check (handler-side gating preserves
// backward compat).
const HERMES_INSTANCE_HMAC_KEY = process.env.HERMES_INSTANCE_HMAC_KEY ?? ''

async function computeHermesInstanceToken(
  customerId: string,
): Promise<string | undefined> {
  if (!HERMES_INSTANCE_HMAC_KEY) return undefined
  return await signCustomerToken(customerId, HERMES_INSTANCE_HMAC_KEY)
}

async function buildScriptFor(opts: SpinUpOpts, openRouterKey: string): Promise<string> {
  // Phase 2A: every tier uses the same script shape — single OpenRouter key
  // routed via OpenAI-compatible env vars. No more starter/proxy split.
  // Phase 2E-2: include bootstrap bundle + agentSlug for Hermes-native bundle.
  // Phase 2E-3: include fleet SSH pubkey + Hermes version pin.
  // Phase 5-3.c: compute HMAC token if HERMES_INSTANCE_HMAC_KEY env set.
  const hermesInstanceToken = await computeHermesInstanceToken(opts.customerId)
  // D1 lock (2026-05-12 multi-persona MVP): derive the customer's
  // persona list from their tier. Caller can override via opts.agentSlug
  // to pick a non-default primary persona (e.g., Studio fixture that
  // wants Business Director as the bare-message default).
  const tierPersonas = personasForTier(opts.tier)
  // v1.4 `bare`: persona-free tier → no default-persona hoist, no slugs.
  // Vanilla Hermes (setup-script also gates on the tier, defence in depth).
  const personaFree = tierPersonas.length === 0
  const defaultSlug = personaFree ? undefined : (opts.agentSlug ?? DEFAULT_PERSONA)
  // Ensure the chosen default appears first in the list (first-of-list
  // invariant): if the caller picked a non-default primary, hoist it.
  const agentSlugs = personaFree
    ? []
    : tierPersonas.includes(defaultSlug as string)
      ? [defaultSlug as string, ...tierPersonas.filter((s) => s !== defaultSlug)]
      : [defaultSlug as string, ...tierPersonas]

  // Phase B (voice-input STT): pick the key matching the active provider.
  // setup-script's VOICE_STT_PROVIDER default is 'groq', so prefer the Groq
  // key; fall back to the OpenAI key if only that is set (mis-named env, or
  // a fleet that flipped the provider constant but kept the OpenAI var).
  // setup-script gates strictly on tier.features.voice — passing the key is
  // harmless for text-only tiers (it simply isn't written there).
  const voiceSttKey = VOICE_STT_GROQ_KEY || VOICE_STT_OPENAI_KEY || undefined

  return buildSetupScript({
    customerId: opts.customerId,
    tier: opts.tier,
    telegramBotToken: opts.customerTelegramBotToken,
    telegramAllowedUserIds: opts.customerTelegramAllowedUserIds,
    openRouterKey,
    agentSlug: defaultSlug,
    agentSlugs,
    bundleTarBase64: BOOTSTRAP_BUNDLE_BASE64,
    fleetSshPubkey: FLEET_SSH_PUBKEY || undefined,
    hermesVersion: HERMES_VERSION,
    hermesInstanceToken,
    voiceSttKey,
  })
}

async function waitForPublicIp(
  vps: IVPSProvider,
  uuid: string,
  opts: { timeoutMs: number; pollIntervalMs: number },
): Promise<string> {
  const deadline = Date.now() + opts.timeoutMs
  while (Date.now() < deadline) {
    const ip = await vps.getPublicIp(uuid)
    if (ip) return ip
    await new Promise((r) => setTimeout(r, opts.pollIntervalMs))
  }
  throw new Error(`Timeout waiting for public IP allocation on VM ${uuid}`)
}

async function defaultWaitForSshOpen(
  host: string,
  opts: { timeoutMs: number; pollIntervalMs: number },
): Promise<void> {
  // Default impl uses Node's net.connect — no external deps. Tests inject
  // their own mock waiter; production gets this real one.
  const net = await import('node:net')
  const deadline = Date.now() + opts.timeoutMs
  while (Date.now() < deadline) {
    const open = await new Promise<boolean>((resolve) => {
      const sock = net.createConnection({ host, port: 22, timeout: 5000 }, () => {
        sock.end()
        resolve(true)
      })
      sock.on('error', () => resolve(false))
      sock.on('timeout', () => {
        sock.destroy()
        resolve(false)
      })
    })
    if (open) return
    await new Promise((r) => setTimeout(r, opts.pollIntervalMs))
  }
  throw new Error(`Timeout waiting for SSH port 22 on ${host}`)
}

function cryptoRandomPassword(): string {
  // IDCloudHost requires upper+lower+digit, 8+ chars.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  return (
    'Aa1' +
    Array.from(
      { length: 21 },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join('')
  )
}
