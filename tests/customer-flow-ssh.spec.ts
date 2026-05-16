/**
 * customer-flow uses SSH-based provisioning instead of cloud-init.
 *
 * History: cloud-init proved unreliable on the original IDCloudHost
 * adapter (2026-05-04 — three back-to-back VMs returned with sshd
 * unreachable / no halo), so the pivot was to drive setup over SSH:
 *   1. Create VM (NO cloud_init param)
 *   2. Poll vps.getPublicIp(uuid) until non-null
 *   3. Wait for SSH port 22 reachable
 *   4. ssh.runSetup(host, user, password|privateKey, buildSetupScript(...))
 *   5. Mark store row with the public IP
 *
 * Production now runs on Vultr (key auth, user=root) with DO failover.
 * The IDCloudHost adapter was retired 2026-05-13; these tests drive the
 * mock SSH provisioner + mock VPS provider in-process. The real SSH
 * integration test lives separately.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { spinUpCustomer, type SpinUpDeps } from '../services/provisioning/src/customer-flow.ts'
import { MockVPSProvider } from '../services/provisioning/src/providers/mock-vps.ts'
import { MockDataStore } from '../services/provisioning/src/stores/mock-store.ts'
import { MockMessageBroker } from '../services/hermes/src/adapters/mock-broker.ts'
import { MockSshProvisioner } from '../services/provisioning/src/ssh/mock-ssh-provisioner.ts'
import { MockLlmKeyMinter } from '../services/provisioning/src/llm/mock-minter.ts'

type DepsWithMocks = SpinUpDeps & {
  vps: MockVPSProvider
  store: MockDataStore
  broker: MockMessageBroker
  ssh: MockSshProvisioner
  llmMinter: MockLlmKeyMinter
}

function makeDeps(overrides: Partial<SpinUpDeps> = {}): DepsWithMocks {
  const vps = new MockVPSProvider({ autoRunAfterMs: 0 })
  const store = new MockDataStore()
  const broker = new MockMessageBroker()
  const ssh = new MockSshProvisioner()
  const llmMinter = new MockLlmKeyMinter()
  const merged = {
    vps, store, broker, ssh, llmMinter,
    providerName: 'mock' as const,
    billingAccountId: 'bil-1',
    region: 'jkt01',
    sshPollIntervalMs: 1,
    sshReadyTimeoutMs: 1000,
    ipPollIntervalMs: 1,
    ipPollTimeoutMs: 1000,
    waitForSshOpen: async () => {/* mock — port always open */},
    log: () => {},
    ...overrides,
  }
  // Cast preserves the concrete mock types overrides may have replaced
  // with bare interface impls — tests rely on the `.calls` / `.state` etc.
  return merged as DepsWithMocks
}

test('flow: vps.create is called WITHOUT cloud_init', async () => {
  const deps = makeDeps()
  let createCalledWith: any = null
  const origCreate = deps.vps.create.bind(deps.vps)
  ;(deps.vps as any).create = async (opts: any) => {
    createCalledWith = opts
    return origCreate(opts)
  }

  const r = await spinUpCustomer(
    {
      customerId: 'cust-1',
      tier: 'pro',
      customerTelegramBotToken: 'tok',
      customerTelegramAllowedUserIds: '6805409051',
    },
    deps,
  )
  await r.done

  assert.ok(createCalledWith, 'vps.create was called')
  assert.equal(
    createCalledWith.cloudInit,
    undefined,
    'cloud_init NOT passed to vps.create (SSH-based provisioning)',
  )
})

test('flow: ssh.runSetup is called with the public IP from getPublicIp', async () => {
  const deps = makeDeps()
  // Override mock to return a known IP
  ;(deps.vps as any).getPublicIp = async () => '203.194.55.66'

  const r = await spinUpCustomer(
    {
      customerId: 'cust-1',
      tier: 'pro',
      customerTelegramBotToken: 'tok',
      customerTelegramAllowedUserIds: '6805409051',
    },
    deps,
  )
  await r.done

  assert.equal(deps.ssh.calls.length, 1, 'ssh.runSetup called once')
  assert.equal(deps.ssh.calls[0].host, '203.194.55.66', 'host = the public IP we discovered')
  // Mock provider goes through the legacy password-auth branch in
  // customer-flow.ts (the modern Vultr/DO path is key auth, root user).
  // The exact user name is an implementation detail of the mock; the
  // real assertion is that SSH was invoked at all with the discovered IP.
  assert.equal(deps.ssh.calls[0].user, 'liren')
  assert.ok((deps.ssh.calls[0].password ?? '').length > 0, 'password is the one we passed at create time')
})

test('flow: ssh.runSetup script contains halo curl + Hermes install + OpenRouter key', async () => {
  const deps = makeDeps()
  ;(deps.vps as any).getPublicIp = async () => '1.2.3.4'

  const r = await spinUpCustomer(
    {
      customerId: 'cust-1',
      tier: 'pro',
      customerTelegramBotToken: '8630424948:AAGmM1ND-test',
      customerTelegramAllowedUserIds: '6805409051',
    },
    deps,
  )
  await r.done

  const script = deps.ssh.calls[0].script
  assert.match(script, /api\.telegram\.org/, 'halo curl present')
  assert.match(script, /Halo, gue agen lo/, 'liveness greeting present')
  assert.match(script, /install\.sh/, 'Hermes installer')
  assert.match(script, /OPENAI_API_KEY=sk-or-v1-mock-/, 'minted OpenRouter key written into script')
  assert.match(script, /OPENAI_BASE_URL=https:\/\/openrouter\.ai\/api\/v1/, 'OpenRouter base URL')
  // 2026-05-12 — Fix 2 of post-Vultr polish: setup-script writes the
  // OpenRouter sub-key under BOTH OPENAI_API_KEY (Hermes primary chat
  // path, OpenAI-compatible) AND OPENROUTER_API_KEY (Hermes auxiliary
  // tasks: context compression, title generation). Without the second
  // name Hermes logged "No auxiliary LLM provider configured" warnings
  // on every message.
  assert.match(
    script,
    /OPENROUTER_API_KEY=sk-or-v1-mock-/,
    'OpenRouter sub-key ALSO written under OPENROUTER_API_KEY name (silences Hermes aux warnings)',
  )
})

test('flow: vps_instances row gets ip_address populated from getPublicIp', async () => {
  const deps = makeDeps()
  ;(deps.vps as any).getPublicIp = async () => '203.194.55.66'

  const r = await spinUpCustomer(
    { customerId: 'cust-1', tier: 'pro', customerTelegramBotToken: 'tok' },
    deps,
  )
  await r.done

  const row = await deps.store.findActiveVPSByCustomer('cust-1')
  assert.ok(row, 'row exists')
  assert.equal(row!.ip_address, '203.194.55.66', 'public IP persisted to DB')
})

test('flow: ssh.runSetup failure → subscription marked failed + alert + throws', async () => {
  const deps = makeDeps()
  ;(deps.vps as any).getPublicIp = async () => '1.2.3.4'
  deps.ssh.setNextResult({ ok: false, stdout: '', stderr: 'connection refused', exitCode: 255 })

  const alerts: { chatId: string; text: string }[] = []
  ;(deps as any).alertChatId = 'admin-chat'
  // override broker.sendMessage to capture
  const origSend = deps.broker.sendMessage.bind(deps.broker)
  ;(deps.broker as any).sendMessage = async (m: any) => {
    alerts.push({ chatId: m.chatId, text: m.text })
    return origSend(m)
  }

  const r = await spinUpCustomer(
    { customerId: 'cust-1', tier: 'pro', customerTelegramBotToken: 'tok' },
    deps,
  )

  await assert.rejects(() => r.done, /SSH setup failed|connection refused/)
  // VPS row marked failed for retry worker
  const row = deps.store.vpsInstances.values().next().value
  assert.equal(row?.status, 'failed', 'row marked failed after SSH failure')
  // Founder alerted
  assert.ok(
    alerts.some((a) => a.chatId === 'admin-chat' && /provisioning/i.test(a.text)),
    'admin alert sent',
  )
})

test('flow: idempotent — second call returns existing row, no second SSH', async () => {
  const deps = makeDeps()
  ;(deps.vps as any).getPublicIp = async () => '1.2.3.4'

  const r1 = await spinUpCustomer({ customerId: 'cust-1', tier: 'pro', customerTelegramBotToken: 'tok' }, deps)
  await r1.done

  const r2 = await spinUpCustomer({ customerId: 'cust-1', tier: 'pro', customerTelegramBotToken: 'tok' }, deps)
  await r2.done

  assert.equal(deps.ssh.calls.length, 1, 'ssh.runSetup called only once across two spinUp calls')
})

// ─── Phase 2A — OpenRouter key minting ───────────────────────────────────

test('flow: mints OpenRouter key with starter tier limit ($3 = 300 cents)', async () => {
  const deps = makeDeps()
  ;(deps.vps as any).getPublicIp = async () => '1.2.3.4'

  const r = await spinUpCustomer({ customerId: 'c-starter', tier: 'starter', customerTelegramBotToken: 'tok' }, deps)
  await r.done

  assert.equal(deps.llmMinter.calls.length, 1, 'minter called once')
  assert.equal(deps.llmMinter.calls[0].limitUsdCents, 300, 'starter cap = $3')
  assert.match(deps.llmMinter.calls[0].name, /weuseai-customer-c-starter/, 'name namespaced')
})

test('flow: mints OpenRouter key with pro tier limit ($5 = 500 cents)', async () => {
  const deps = makeDeps()
  ;(deps.vps as any).getPublicIp = async () => '1.2.3.4'
  const r = await spinUpCustomer({ customerId: 'c-pro', tier: 'pro', customerTelegramBotToken: 'tok' }, deps)
  await r.done
  assert.equal(deps.llmMinter.calls[0].limitUsdCents, 500, 'pro cap = $5')
})

test('flow: mints OpenRouter key with studio tier limit ($30 = 3000 cents)', async () => {
  const deps = makeDeps()
  ;(deps.vps as any).getPublicIp = async () => '1.2.3.4'
  const r = await spinUpCustomer({ customerId: 'c-studio', tier: 'studio', customerTelegramBotToken: 'tok' }, deps)
  await r.done
  assert.equal(deps.llmMinter.calls[0].limitUsdCents, 3000, 'studio cap = $30')
})

test('flow: passes minted OpenRouter key into the SSH setup script', async () => {
  const deps = makeDeps()
  ;(deps.vps as any).getPublicIp = async () => '1.2.3.4'
  const r = await spinUpCustomer({ customerId: 'c-1', tier: 'pro', customerTelegramBotToken: 'tok' }, deps)
  await r.done

  const minted = deps.llmMinter.calls[0]  // this happened
  // The script must contain the actual minted key — find it in the SSH script:
  const script = deps.ssh.calls[0].script
  // The mock minter returns sk-or-v1-mock-N-... pattern. Verify SOMETHING was passed.
  assert.match(script, /OPENAI_API_KEY=sk-or-v1-mock-/, 'minted key written into setup script')
  assert.match(script, /OPENAI_BASE_URL=https:\/\/openrouter\.ai\/api\/v1/, 'OpenRouter base URL')
})

test('flow: persists OpenRouter key hash to customer_openrouter_keys store', async () => {
  const deps = makeDeps()
  ;(deps.vps as any).getPublicIp = async () => '1.2.3.4'
  const r = await spinUpCustomer({ customerId: 'c-1', tier: 'pro', customerTelegramBotToken: 'tok' }, deps)
  await r.done

  const stored = await deps.store.getOpenRouterKey('c-1')
  assert.ok(stored, 'row was inserted')
  assert.equal(stored!.credit_limit_usd_cents, 500, 'limit persisted (Pro = $5)')
  assert.match(stored!.openrouter_key_hash, /^mock-hash-/, 'hash from minter (NOT the secret key)')
})

test('flow: minter failure → subscription marked failed + alert + throws', async () => {
  const deps = makeDeps({ llmMinter: new MockLlmKeyMinter({ shouldFailMint: true }) }) as any
  ;(deps.vps as any).getPublicIp = async () => '1.2.3.4'
  ;(deps as any).alertChatId = 'admin-chat'
  const alerts: any[] = []
  const orig = deps.broker.sendMessage.bind(deps.broker)
  deps.broker.sendMessage = async (m: any) => { alerts.push(m); return orig(m) }

  const r = await spinUpCustomer({ customerId: 'c-1', tier: 'pro', customerTelegramBotToken: 'tok' }, deps)
  await assert.rejects(() => r.done, /mock mint failure/)

  // No SSH attempted if we couldn't mint a key — script wouldn't have a working LLM
  assert.equal(deps.ssh.calls.length, 0, 'no SSH when minter failed')
  assert.ok(alerts.some((a: any) => /provisioning alert/i.test(a.text)), 'admin alerted')
})

// ─── wait-page race fix (2026-05-16): second-finisher hook ─────────
//
// When the setup-script finishes and the VPS row flips to 'running',
// spinUpCustomer must invoke deps.notifyVpsReady exactly once. In
// production that hook pings admin-customer-vps-refresh so a customer
// who already finished onboarding (their complete-onboarding deferred
// refreshEnv) gets hermes-gateway started. It must NOT fire on a
// failed provision, and a throw from it must never fail the run.

test('wait-page race: notifyVpsReady fires once after setup-script success', async () => {
  const calls: string[] = []
  const deps = makeDeps({
    notifyVpsReady: async (cid: string) => {
      calls.push(cid)
    },
  })

  const r = await spinUpCustomer(
    { customerId: 'cust-race-1', tier: 'pro', customerTelegramBotToken: 'tok' },
    deps,
  )
  await r.done

  assert.deepEqual(
    calls,
    ['cust-race-1'],
    'notifyVpsReady called once with the customer id after status→running',
  )
  const vps = await deps.store.findActiveVPSByCustomer('cust-race-1')
  assert.equal(vps?.status, 'running', 'VPS row flipped to running')
})

test('wait-page race: notifyVpsReady NOT fired when the setup-script fails', async () => {
  const calls: string[] = []
  const deps = makeDeps({
    notifyVpsReady: async (cid: string) => {
      calls.push(cid)
    },
  })
  // Force ssh.runSetup to report a non-zero exit → background fails.
  deps.ssh.setNextResult({ ok: false, stdout: '', stderr: 'boom', exitCode: 1 })

  const r = await spinUpCustomer(
    { customerId: 'cust-race-2', tier: 'pro', customerTelegramBotToken: 'tok' },
    deps,
  )
  await assert.rejects(r.done, 'background provision rejects on SSH failure')

  assert.deepEqual(calls, [], 'notifyVpsReady NOT called on a failed provision')
})

test('wait-page race: a throw from notifyVpsReady never fails the provision', async () => {
  const deps = makeDeps({
    notifyVpsReady: async () => {
      throw new Error('supabase unreachable')
    },
  })

  const r = await spinUpCustomer(
    { customerId: 'cust-race-3', tier: 'pro', customerTelegramBotToken: 'tok' },
    deps,
  )
  // Must resolve — the provision itself succeeded; the hook is best-effort.
  await r.done

  const vps = await deps.store.findActiveVPSByCustomer('cust-race-3')
  assert.equal(vps?.status, 'running', 'VPS still running despite hook throw')
})
