/**
 * The "one-click" provisioning flow per pelanggan baru.
 *
 * Pure dependency injection — semua external service masuk via SpinUpDeps.
 * Idempotent: dipanggil dua kali untuk customer yang sama → return existing VPS.
 *
 * Result `done` resolves setelah background work selesai (waitForRunning + healthcheck +
 * notify). Production code boleh ignore; tests should `await result.done`.
 */

import type { IVPSProvider, VPSInfo, VPSSpec } from './vps-provider.js'
import type { IDataStore } from './data-store.js'
import type { IMessageBroker } from '../../hermes/src/adapters/message-broker.js'
import { buildCloudInit, type Tier, type CloudInitParams } from './cloud-init.js'
import { mintProxyToken } from './proxy-token.js'

export type { Tier }

export const WELCOME_MESSAGE = [
  'Halo, agent kamu hidup.',
  '',
  'Untuk mulai pakai, paste Telegram bot token kamu di dashboard: https://weuseai-agent.vercel.app/dashboard',
  '',
  'Belum punya bot? Buat di @BotFather, copy token, paste di dashboard.',
  '',
  'Pertanyaan? Reply pesan ini.',
].join('\n')

const TIER_SPEC: Record<Tier, VPSSpec> = {
  starter: { vcpu: 1, ram: 4096, disk: 50 },
  pro: { vcpu: 2, ram: 8192, disk: 100 },
  studio: { vcpu: 4, ram: 16384, disk: 200 },
}

export type SpinUpOpts = {
  customerId: string
  tier: Tier
  telegramChatId?: string
  // Optional Phase 1 — customer pastes bot token via dashboard later;
  // VPS spawns and Hermes starts, Telegram channel comes online when token set.
  customerTelegramBotToken?: string
  customerTelegramAllowedUserIds?: string
  customerLlmApiKey?: string
  customerLlmProvider?: 'deepseek' | 'openrouter' | 'openai' | 'glm'
  alwaysOnEnabled?: boolean
  useStarterCredits?: boolean
}

export type SpinUpDeps = {
  vps: IVPSProvider
  store: IDataStore
  broker: IMessageBroker
  /** Provider name to record alongside vps_id in the DB row. */
  providerName?: 'idcloudhost' | 'mock'
  proxyUrl?: string
  billingAccountId?: string
  region?: string | null
  alertChatId?: string
  mintToken?: (customerId: string) => Promise<string>
  healthCheck?: (ip: string) => Promise<void>
  pollIntervalMs?: number
  vpsRunningTimeoutMs?: number
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
  const mintToken = deps.mintToken ?? mintProxyToken
  const healthCheck = deps.healthCheck ?? defaultHealthCheck
  const pollIntervalMs = deps.pollIntervalMs ?? 3000
  const vpsRunningTimeoutMs = deps.vpsRunningTimeoutMs ?? 5 * 60 * 1000
  const proxyUrl = deps.proxyUrl ?? process.env.PROXY_URL ?? ''
  const billingAccountId =
    deps.billingAccountId ?? process.env.IDCLOUDHOST_BILLING_ACCOUNT_ID ?? ''
  const region = deps.region ?? process.env.IDCLOUDHOST_REGION ?? null

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

  const cloudInitParams: CloudInitParams =
    opts.tier === 'starter'
      ? {
          customerId: opts.customerId,
          tier: opts.tier,
          telegramBotToken: opts.customerTelegramBotToken,
          telegramAllowedUserIds: opts.customerTelegramAllowedUserIds,
          llmProxyUrl: proxyUrl,
          llmProxyToken: await mintToken(opts.customerId),
        }
      : {
          customerId: opts.customerId,
          tier: opts.tier,
          telegramBotToken: opts.customerTelegramBotToken,
          telegramAllowedUserIds: opts.customerTelegramAllowedUserIds,
          customerLlmApiKey: opts.customerLlmApiKey,
          customerLlmProvider: opts.customerLlmProvider,
        }
  const cloudInit = buildCloudInit(cloudInitParams)

  log(`Creating VPS for tier=${opts.tier}...`)
  let vps: VPSInfo
  try {
    vps = await deps.vps.create({
      name: `liren-${opts.customerId.slice(0, 8)}-${Date.now().toString().slice(-6)}`,
      spec: TIER_SPEC[opts.tier],
      password: cryptoRandomPassword(),
      cloudInit,
      billingAccountId,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`✗ Create failed: ${msg}`)
    if (deps.alertChatId) {
      try {
        await deps.broker.sendMessage({
          chatId: deps.alertChatId,
          text: `[provisioning alert]\nFailed for ${opts.customerId}: ${msg}`,
        })
      } catch {
        // best effort
      }
    }
    throw e
  }
  log(`✓ VPS created: ${vps.uuid}`)

  await deps.store.createVPSInstance({
    customer_id: opts.customerId,
    vps_id: vps.uuid,
    provider: deps.providerName ?? 'idcloudhost',
    ip_address: vps.public_ipv4 ?? null,
    region,
    status: 'provisioning',
  })

  const done = (async () => {
    try {
      log('Waiting for VPS running...')
      const running = await waitForRunning(deps.vps, vps.uuid, {
        timeoutMs: vpsRunningTimeoutMs,
        pollIntervalMs,
      })
      log(`✓ VPS running. IP: ${running.public_ipv4}`)

      log('Waiting for Hermes /health...')
      await healthCheck(running.public_ipv4 ?? '')
      log('✓ Hermes alive')

      await deps.store.updateVPSInstance(vps.uuid, {
        status: 'running',
        ip_address: running.public_ipv4 ?? null,
      })

      // Welcome message — broker decides delivery. In Phase 1 the customer
      // bot token may not yet be set; in that case the broker queues / no-ops
      // and the dashboard surfaces the same copy when they paste a token.
      if (opts.telegramChatId) {
        await deps.broker.sendMessage({
          chatId: opts.telegramChatId,
          text: WELCOME_MESSAGE,
        })
      } else {
        log('Welcome deferred — no telegramChatId. Dashboard will surface instructions when customer signs in.')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log(`✗ Background provision failed: ${msg}`)
      try {
        await deps.store.updateVPSInstance(vps.uuid, { status: 'failed' })
      } catch {
        // best effort
      }
      if (deps.alertChatId) {
        try {
          await deps.broker.sendMessage({
            chatId: deps.alertChatId,
            text: `[provisioning alert]\nBackground failed for ${opts.customerId}: ${msg}`,
          })
        } catch {
          // best effort
        }
      }
      throw e
    }
  })()

  done.catch(() => {
    // swallow unhandled rejection if caller ignores `done`
  })

  return {
    vpsId: vps.uuid,
    ip: vps.public_ipv4 ?? null,
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

async function waitForRunning(
  vps: IVPSProvider,
  uuid: string,
  opts: { timeoutMs: number; pollIntervalMs: number },
): Promise<VPSInfo> {
  const deadline = Date.now() + opts.timeoutMs
  while (Date.now() < deadline) {
    const info = await vps.get(uuid)
    if (info.status === 'running') return info
    if (info.status === 'failed' || info.status === 'error') {
      throw new Error(`VM ${uuid} entered ${info.status} state`)
    }
    await new Promise((r) => setTimeout(r, opts.pollIntervalMs))
  }
  throw new Error(`Timeout waiting for VM ${uuid} to reach running state`)
}

async function defaultHealthCheck(ip: string): Promise<void> {
  const timeoutMs = 5 * 60 * 1000
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://${ip}:3000/health`, {
        signal: AbortSignal.timeout(5000),
      })
      if (r.ok) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error(`Hermes /health did not respond at ${ip} within timeout`)
}

function cryptoRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  return (
    Array.from({ length: 20 }, () => chars[Math.floor(Math.random() * chars.length)]).join('') +
    '!1Aa'
  )
}
