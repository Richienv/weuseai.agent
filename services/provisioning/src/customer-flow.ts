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
import type { IMessageBroker } from '../../hermes/src/adapters/message-broker.js'
import type { ISshProvisioner } from './ssh-provisioner.js'
import type { ILlmKeyMinter } from './llm-key-minter.js'
import { readFileSync } from 'node:fs'
import { resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildSetupScript, type Tier } from './setup-script.js'

export type { Tier }

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

export type SpinUpOpts = {
  customerId: string
  tier: Tier
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
  providerName?: 'idcloudhost' | 'mock'
  billingAccountId?: string
  region?: string | null
  alertChatId?: string
  ipPollIntervalMs?: number
  ipPollTimeoutMs?: number
  sshPollIntervalMs?: number
  sshReadyTimeoutMs?: number
  log?: (msg: string, ...rest: unknown[]) => void
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
  const billingAccountId =
    deps.billingAccountId ?? process.env.IDCLOUDHOST_BILLING_ACCOUNT_ID ?? ''
  const region = deps.region ?? process.env.IDCLOUDHOST_REGION ?? null
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
  log(`Minting OpenRouter key (limit: $${TIER_LLM_LIMIT_CENTS[opts.tier] / 100})...`)
  let openRouterKey: string
  let openRouterHash: string
  try {
    const minted = await deps.llmMinter.mint({
      name: `weuseai-customer-${opts.customerId}`,
      limitUsdCents: TIER_LLM_LIMIT_CENTS[opts.tier],
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
    credit_limit_usd_cents: TIER_LLM_LIMIT_CENTS[opts.tier],
  })

  // ── Build setup script (the customer's persona, skill, halo, install) ──
  const sshPassword = cryptoRandomPassword()
  const setupScript = buildScriptFor(opts, openRouterKey)

  // ── Create VM (NO cloud_init — we're going SSH route) ──
  log(`Creating VPS for tier=${opts.tier}...`)
  let vps: VPSInfo
  try {
    vps = await deps.vps.create({
      name: `liren-${opts.customerId.slice(0, 8)}-${Date.now().toString().slice(-6)}`,
      spec: TIER_SPEC[opts.tier],
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
  await deps.store.createVPSInstance({
    customer_id: opts.customerId,
    vps_id: vps.uuid,
    provider: deps.providerName ?? 'idcloudhost',
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
      const sshResult = await deps.ssh.runSetup({
        host: publicIp,
        user: 'liren',
        password: sshPassword,
        script: setupScript,
        timeoutMs: 12 * 60 * 1000, // Hermes install can take 5+ min
      })
      if (!sshResult.ok) {
        throw new Error(
          `SSH setup failed (exit ${sshResult.exitCode}): ${sshResult.stderr.slice(0, 500)}`,
        )
      }
      log('✓ Setup script complete')

      await deps.store.updateVPSInstance(vps.uuid, { status: 'running' })
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
  await deps.vps.delete(existing.vps_id)
  await deps.store.updateVPSInstance(existing.vps_id, { status: 'stopped' })
  return { ok: true }
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

function buildScriptFor(opts: SpinUpOpts, openRouterKey: string): string {
  // Phase 2A: every tier uses the same script shape — single OpenRouter key
  // routed via OpenAI-compatible env vars. No more starter/proxy split.
  // Phase 2E-2: include bootstrap bundle + agentSlug for Hermes-native bundle.
  // Phase 2E-3: include fleet SSH pubkey + Hermes version pin.
  return buildSetupScript({
    customerId: opts.customerId,
    tier: opts.tier,
    telegramBotToken: opts.customerTelegramBotToken,
    telegramAllowedUserIds: opts.customerTelegramAllowedUserIds,
    openRouterKey,
    agentSlug: opts.agentSlug ?? 'the-pro',
    bundleTarBase64: BOOTSTRAP_BUNDLE_BASE64,
    fleetSshPubkey: FLEET_SSH_PUBKEY || undefined,
    hermesVersion: HERMES_VERSION,
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
