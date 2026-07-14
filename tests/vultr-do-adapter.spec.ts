// Vultr + DigitalOcean adapter tests + FailoverVPSProvider behavior.
//
// Vultr-migration cascade 2026-05-11. See:
//   - docs/design/2026-05-11-vultr-migration.md
//   - docs/research/2026-05-11-vultr-migration-validation.md (corrected
//     plan catalog + decision matrix)
//
// Adapters tested via injected fetch mocks (no network). Failover
// wrapper tested with mock IVPSProvider implementations.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  VultrVPSProvider,
  classifyVultrError,
} from '../services/provisioning/src/providers/vultr-vps.ts'
import {
  DigitalOceanVPSProvider,
  classifyDOError,
} from '../services/provisioning/src/providers/digitalocean-vps.ts'
import {
  FailoverVPSProvider,
  classifyFailoverError,
} from '../services/provisioning/src/providers/index.ts'
import type {
  IVPSProvider,
  CreateVPSOpts,
  VPSInfo,
} from '../services/provisioning/src/vps-provider.ts'

// ─── Test helpers ──────────────────────────────────────────────────

type FetchCall = { url: string; init: RequestInit }

function makeMockFetch(handlers: Array<{
  match: (url: string, init: RequestInit) => boolean
  respond: () => Promise<Response> | Response
}>): { fn: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fn: typeof fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = String(url)
    const i = init ?? {}
    calls.push({ url: urlStr, init: i })
    for (const h of handlers) {
      if (h.match(urlStr, i)) return h.respond()
    }
    throw new Error(`mock fetch: unmatched ${i.method ?? 'GET'} ${urlStr}`)
  }) as typeof fetch
  return { fn, calls }
}

// ─── VultrVPSProvider ──────────────────────────────────────────────

test('Vultr create: base64-encodes user_data + uses Bearer auth + locks plan to vc2-1c-1gb', async () => {
  const { fn, calls } = makeMockFetch([
    {
      match: (u, i) => u.endsWith('/v2/instances') && i.method === 'POST',
      respond: () =>
        new Response(
          JSON.stringify({
            instance: {
              id: 'vultr-uuid-1',
              main_ip: '0.0.0.0',
              status: 'pending',
              label: 'liren-abc12345-123456',
              vcpu_count: 1,
              ram: 1024,
              disk: 25,
            },
          }),
          { status: 202, headers: { 'content-type': 'application/json' } },
        ),
    },
  ])
  globalThis.fetch = fn

  const provider = new VultrVPSProvider({
    apiKey: 'test-vultr-key',
    region: 'sgp',
    fleetSshKeyId: 'fleet-ssh-key-uuid',
  })

  const cloudInitScript = '#!/bin/bash\necho hello\nexit 0'
  const info = await provider.create({
    name: 'liren-abc12345-123456',
    spec: { vcpu: 2, ram: 4096, disk: 50 },
    password: 'unused-on-vultr',
    cloudInit: cloudInitScript,
    billingAccountId: '',
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.method, 'POST')
  const headers = calls[0].init.headers as Record<string, string>
  assert.equal(headers.Authorization, 'Bearer test-vultr-key')
  assert.equal(headers['Content-Type'], 'application/json')

  const body = JSON.parse(calls[0].init.body as string)
  assert.equal(body.region, 'sgp')
  assert.equal(body.plan, 'vc2-1c-1gb', 'locked tier per RSS test 2026-05-11')
  assert.equal(body.os_id, 1743)
  assert.deepEqual(body.sshkey_id, ['fleet-ssh-key-uuid'])
  assert.equal(body.enable_ipv6, false)
  assert.equal(body.backups, 'disabled')

  // user_data MUST be base64 (Vultr quirk vs IDCH plain).
  const decoded = Buffer.from(body.user_data, 'base64').toString('utf8')
  assert.equal(decoded, cloudInitScript)

  assert.equal(info.uuid, 'vultr-uuid-1')
  assert.equal(info.public_ipv4, undefined, 'main_ip=0.0.0.0 treated as null')
})

test('Vultr getPublicIp: returns null on 0.0.0.0, real IP on allocation', async () => {
  let callIdx = 0
  const { fn } = makeMockFetch([
    {
      match: (u, i) => /\/v2\/instances\/inst-1$/.test(u) && i.method === 'GET',
      respond: () => {
        callIdx++
        return new Response(
          JSON.stringify({
            instance: {
              id: 'inst-1',
              main_ip: callIdx === 1 ? '0.0.0.0' : '198.51.100.1',
              status: 'active',
              label: 'liren-test',
              vcpu_count: 1,
              ram: 1024,
              disk: 25,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    },
  ])
  globalThis.fetch = fn

  const provider = new VultrVPSProvider({
    apiKey: 'k',
    region: 'sgp',
    fleetSshKeyId: 'uuid',
  })
  assert.equal(await provider.getPublicIp('inst-1'), null)
  assert.equal(await provider.getPublicIp('inst-1'), '198.51.100.1')
})

test('Vultr delete: 204 response handled gracefully (no JSON parse attempt)', async () => {
  const { fn, calls } = makeMockFetch([
    {
      match: (u, i) => /\/v2\/instances\//.test(u) && i.method === 'DELETE',
      respond: () => new Response(null, { status: 204 }),
    },
  ])
  globalThis.fetch = fn
  const provider = new VultrVPSProvider({ apiKey: 'k', region: 'sgp', fleetSshKeyId: 'u' })
  await provider.delete('inst-1')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.method, 'DELETE')
})

test('Vultr constructor rejects missing API key', () => {
  // Clear envs for this assertion only
  const savedKey = process.env.VULTR_API_KEY
  const savedId = process.env.VULTR_FLEET_SSH_KEY_ID
  delete process.env.VULTR_API_KEY
  delete process.env.VULTR_FLEET_SSH_KEY_ID
  try {
    assert.throws(() => new VultrVPSProvider({}), /missing VULTR_API_KEY/)
    assert.throws(
      () => new VultrVPSProvider({ apiKey: 'k' }),
      /missing VULTR_FLEET_SSH_KEY_ID/,
    )
  } finally {
    if (savedKey !== undefined) process.env.VULTR_API_KEY = savedKey
    if (savedId !== undefined) process.env.VULTR_FLEET_SSH_KEY_ID = savedId
  }
})

test('classifyVultrError: capacity vs auth vs unknown', () => {
  assert.equal(classifyVultrError('plan/region combination is out of stock'), 'capacity')
  assert.equal(classifyVultrError('temporarily unavailable in sgp'), 'capacity')
  assert.equal(classifyVultrError('insufficient capacity'), 'capacity')
  assert.equal(classifyVultrError('Invalid API key'), 'auth')
  assert.equal(classifyVultrError('Unauthorized IP address: 1.2.3.4'), 'auth')
  assert.equal(classifyVultrError('quota exceeded'), 'quota')
  assert.equal(classifyVultrError('something else'), 'unknown')
})

// ─── DigitalOceanVPSProvider ───────────────────────────────────────

test('DO create: plain-text user_data + Bearer auth + ssh_keys array + sgp1 region', async () => {
  const { fn, calls } = makeMockFetch([
    {
      match: (u, i) => u.endsWith('/v2/droplets') && i.method === 'POST',
      respond: () =>
        new Response(
          JSON.stringify({
            droplet: {
              id: 12345,
              name: 'liren-xyz',
              status: 'new',
              vcpus: 1,
              memory: 1024,
              disk: 25,
              networks: { v4: [] },
            },
          }),
          { status: 202, headers: { 'content-type': 'application/json' } },
        ),
    },
  ])
  globalThis.fetch = fn

  const provider = new DigitalOceanVPSProvider({
    apiToken: 'do-token',
    region: 'sgp1',
    fleetSshKeyId: 'do-key-id',
  })
  const cloudInitScript = '#!/bin/bash\necho hello'
  const info = await provider.create({
    name: 'liren-xyz',
    spec: { vcpu: 2, ram: 4096, disk: 50 },
    password: 'unused',
    cloudInit: cloudInitScript,
    billingAccountId: '',
  })

  assert.equal(calls.length, 1)
  const headers = calls[0].init.headers as Record<string, string>
  assert.equal(headers.Authorization, 'Bearer do-token')

  const body = JSON.parse(calls[0].init.body as string)
  assert.equal(body.region, 'sgp1', 'DO Singapore is sgp1, NOT sgp')
  assert.equal(body.size, 's-1vcpu-1gb')
  assert.equal(body.image, 'ubuntu-22-04-x64')
  assert.deepEqual(body.ssh_keys, ['do-key-id'])
  assert.equal(body.ipv6, false)
  assert.equal(body.backups, false)
  // CRITICAL: DO user_data is PLAIN TEXT, NOT base64 (different from Vultr)
  assert.equal(body.user_data, cloudInitScript)

  assert.equal(info.uuid, '12345', 'DO droplet.id is number — coerced to string')
})

test('DO getPublicIp: filters networks.v4 by type=public', async () => {
  const { fn } = makeMockFetch([
    {
      match: (u, i) => /\/v2\/droplets\/12345$/.test(u) && i.method === 'GET',
      respond: () =>
        new Response(
          JSON.stringify({
            droplet: {
              id: 12345,
              name: 'liren-xyz',
              status: 'active',
              vcpus: 1,
              memory: 1024,
              disk: 25,
              networks: {
                v4: [
                  { ip_address: '10.0.0.1', type: 'private', netmask: '255.255.255.0' },
                  { ip_address: '198.51.100.42', type: 'public', netmask: '255.255.255.0' },
                ],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    },
  ])
  globalThis.fetch = fn
  const provider = new DigitalOceanVPSProvider({ apiToken: 't', region: 'sgp1', fleetSshKeyId: 'k' })
  assert.equal(await provider.getPublicIp('12345'), '198.51.100.42')
})

test('DO stop/start: POST /v2/droplets/{id}/actions with type', async () => {
  const seen: Array<{ type: string }> = []
  const { fn } = makeMockFetch([
    {
      match: (u, i) => /\/v2\/droplets\/.+\/actions$/.test(u) && i.method === 'POST',
      respond: () =>
        new Response(JSON.stringify({ action: { id: 1, type: 'pending' } }), { status: 201 }),
    },
  ])
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    if (init?.body) seen.push(JSON.parse(init.body as string))
    return fn(url, init)
  }) as typeof fetch
  const provider = new DigitalOceanVPSProvider({ apiToken: 't', region: 'sgp1', fleetSshKeyId: 'k' })
  await provider.stop('12345')
  await provider.start('12345')
  assert.deepEqual(seen, [{ type: 'shutdown' }, { type: 'power_on' }])
})

test('classifyDOError: capacity vs auth vs unknown', () => {
  assert.equal(classifyDOError('size is not available in region'), 'capacity')
  assert.equal(classifyDOError('Sold out'), 'capacity')
  assert.equal(classifyDOError('Unauthorized'), 'auth')
  assert.equal(classifyDOError('Quota exceeded'), 'quota')
  assert.equal(classifyDOError('Something else'), 'unknown')
})

// ─── FailoverVPSProvider ───────────────────────────────────────────

function fakeProvider(
  createImpl: (opts: CreateVPSOpts) => Promise<VPSInfo>,
): IVPSProvider {
  return {
    create: createImpl,
    get: async () => ({ uuid: 'fake', name: 'fake', status: 'active', vcpu: 1, memory: 1024 }),
    stop: async () => {},
    start: async () => {},
    delete: async () => {},
    getPublicIp: async () => '1.2.3.4',
  }
}

test('Failover: primary succeeds → secondary not invoked, lastCreatedWith=primary', async () => {
  let secondaryCalled = false
  const primary = fakeProvider(async () => ({
    uuid: 'p1', name: 'n', status: 'active', vcpu: 1, memory: 1024,
  }))
  const secondary = fakeProvider(async () => {
    secondaryCalled = true
    return { uuid: 's1', name: 'n', status: 'active', vcpu: 1, memory: 1024 }
  })
  const fp = new FailoverVPSProvider(primary, secondary)
  const info = await fp.create({
    name: 'n', spec: { vcpu: 1, ram: 1024, disk: 25 }, password: '', billingAccountId: '',
  })
  assert.equal(info.uuid, 'p1')
  assert.equal(secondaryCalled, false)
  assert.equal(fp.lastCreatedWith, 'vultr', 'default primary name = vultr')
})

test('Failover: primary capacity error → secondary tried, lastCreatedWith=secondary', async () => {
  let secondaryCalled = false
  const primary = fakeProvider(async () => {
    throw new Error('Vultr POST /v2/instances -> 503: out of stock in sgp')
  })
  const secondary = fakeProvider(async () => {
    secondaryCalled = true
    return { uuid: 's1', name: 'n', status: 'active', vcpu: 1, memory: 1024 }
  })
  const fp = new FailoverVPSProvider(primary, secondary)
  const info = await fp.create({
    name: 'n', spec: { vcpu: 1, ram: 1024, disk: 25 }, password: '', billingAccountId: '',
  })
  assert.equal(info.uuid, 's1')
  assert.equal(secondaryCalled, true)
  assert.equal(fp.lastCreatedWith, 'digitalocean')
})

test('Failover: primary auth error → throws, secondary NOT tried (no silent masking)', async () => {
  let secondaryCalled = false
  const primary = fakeProvider(async () => {
    throw new Error('Vultr POST /v2/instances -> 401: Unauthorized')
  })
  const secondary = fakeProvider(async () => {
    secondaryCalled = true
    return { uuid: 's1', name: 'n', status: 'active', vcpu: 1, memory: 1024 }
  })
  const fp = new FailoverVPSProvider(primary, secondary)
  await assert.rejects(
    () => fp.create({
      name: 'n', spec: { vcpu: 1, ram: 1024, disk: 25 }, password: '', billingAccountId: '',
    }),
    /Unauthorized/,
  )
  assert.equal(secondaryCalled, false, 'auth errors must NOT trigger failover')
  assert.equal(fp.lastCreatedWith, null)
})

test('Factory: VPS_PROVIDER=vultr WITHOUT DIGITALOCEAN_API_KEY returns Vultr alone (no FailoverVPSProvider, no DO construction)', async () => {
  // 2026-05-11 hotfix: pre-fix the factory eager-constructed
  // DigitalOceanVPSProvider whose constructor throws on missing
  // DIGITALOCEAN_API_KEY. Cutover with VPS_PROVIDER=vultr + DO secrets
  // deferred → crashloop. The fix is conditional construction —
  // factory returns Vultr alone when DO key absent.
  const saved = {
    VPS_PROVIDER: process.env.VPS_PROVIDER,
    VULTR_API_KEY: process.env.VULTR_API_KEY,
    VULTR_FLEET_SSH_KEY_ID: process.env.VULTR_FLEET_SSH_KEY_ID,
    DIGITALOCEAN_API_KEY: process.env.DIGITALOCEAN_API_KEY,
    DIGITALOCEAN_FLEET_SSH_KEY_ID: process.env.DIGITALOCEAN_FLEET_SSH_KEY_ID,
    ENABLE_REAL_PROVISIONING: process.env.ENABLE_REAL_PROVISIONING,
  }
  try {
    process.env.VPS_PROVIDER = 'vultr'
    process.env.VULTR_API_KEY = 'fake-vultr-key-for-test'
    process.env.VULTR_FLEET_SSH_KEY_ID = 'fake-uuid'
    delete process.env.DIGITALOCEAN_API_KEY
    delete process.env.DIGITALOCEAN_FLEET_SSH_KEY_ID
    delete process.env.ENABLE_REAL_PROVISIONING

    const { createVPSProvider } = await import(
      '../services/provisioning/src/providers/index.ts'
    )
    // Should NOT throw. Returns VultrVPSProvider directly, not a
    // FailoverVPSProvider — verify by checking absence of failover
    // shape.
    const provider = createVPSProvider()
    assert.ok(provider, 'must return a provider')
    assert.equal(
      (provider as { lastCreatedWith?: unknown }).lastCreatedWith,
      undefined,
      'no FailoverVPSProvider wrapping when DO key missing',
    )
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})

test('Factory: VPS_PROVIDER=vultr WITH DIGITALOCEAN_API_KEY returns FailoverVPSProvider', async () => {
  const saved = {
    VPS_PROVIDER: process.env.VPS_PROVIDER,
    VULTR_API_KEY: process.env.VULTR_API_KEY,
    VULTR_FLEET_SSH_KEY_ID: process.env.VULTR_FLEET_SSH_KEY_ID,
    DIGITALOCEAN_API_KEY: process.env.DIGITALOCEAN_API_KEY,
    DIGITALOCEAN_FLEET_SSH_KEY_ID: process.env.DIGITALOCEAN_FLEET_SSH_KEY_ID,
    ENABLE_REAL_PROVISIONING: process.env.ENABLE_REAL_PROVISIONING,
  }
  try {
    process.env.VPS_PROVIDER = 'vultr'
    process.env.VULTR_API_KEY = 'fake-vultr-key'
    process.env.VULTR_FLEET_SSH_KEY_ID = 'fake-vultr-uuid'
    process.env.DIGITALOCEAN_API_KEY = 'fake-do-token'
    process.env.DIGITALOCEAN_FLEET_SSH_KEY_ID = 'fake-do-key-id'
    delete process.env.ENABLE_REAL_PROVISIONING

    const { createVPSProvider } = await import(
      '../services/provisioning/src/providers/index.ts'
    )
    const provider = createVPSProvider() as {
      lastCreatedWith?: unknown
      primaryName?: string
      secondaryName?: string
    }
    assert.equal(provider.lastCreatedWith, null, 'FailoverVPSProvider exposes lastCreatedWith=null pre-create')
    assert.equal(provider.primaryName, 'vultr')
    assert.equal(provider.secondaryName, 'digitalocean')
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})

test('classifyFailoverError: captures Vultr + DO + IDCloudHost capacity patterns', () => {
  assert.equal(classifyFailoverError('out of stock in sgp'), 'capacity')
  assert.equal(classifyFailoverError('Sold out region'), 'capacity')
  // IDCloudHost defense-in-depth — the message that motivated this migration
  assert.equal(
    classifyFailoverError('Compute resources temporarily unavailable due to high demand'),
    'capacity',
  )
  assert.equal(classifyFailoverError('Unauthorized'), 'other')
  assert.equal(classifyFailoverError('Network unreachable'), 'other')
})
