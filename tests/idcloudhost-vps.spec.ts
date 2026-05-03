/**
 * IDCloudHost provider unit tests — mocks global fetch.
 *
 * The provider was scaffolded earlier with no test coverage. Adding these
 * as a safety net before Phase 1 deploy so we catch regressions in:
 *   - URL construction (region prefix, encoding)
 *   - apikey header
 *   - x-www-form-urlencoded body shape
 *   - response surfacing
 *   - error formatting
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { IDCloudHostVPSProvider } from '../services/provisioning/src/providers/idcloudhost-vps.ts'

type FetchCall = {
  url: string
  init: RequestInit
}

function makeFetchMock(response: {
  status?: number
  body: unknown
}): { fn: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fn: typeof fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init })
    const status = response.status ?? 200
    const ok = status >= 200 && status < 300
    return new Response(
      typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
      { status, headers: { 'content-type': 'application/json' } },
    ) as Response
  }
  return { fn, calls }
}

function withMockedFetch<T>(mock: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch
  globalThis.fetch = mock
  return fn().finally(() => {
    globalThis.fetch = orig
  })
}

test('idch.create: hits /vm with form-encoded body + apikey header', async () => {
  const { fn, calls } = makeFetchMock({
    body: { uuid: 'vm-abc', name: 'test', status: 'pending', vcpu: 2, memory: 8192 },
  })
  await withMockedFetch(fn, async () => {
    const p = new IDCloudHostVPSProvider({ apiKey: 'key-123', region: 'jakarta' })
    await p.create({
      name: 'liren-cust1',
      spec: { vcpu: 2, ram: 8192, disk: 100 },
      password: 'pwd-secret',
      cloudInit: '#cloud-config\n',
      billingAccountId: 'biz-99',
    })
  })

  assert.equal(calls.length, 1)
  const c = calls[0]
  assert.equal(c.url, 'https://api.idcloudhost.com/v1/jakarta/user-resource/vm')
  assert.equal(c.init.method, 'POST')
  const headers = c.init.headers as Record<string, string>
  assert.equal(headers['apikey'], 'key-123')
  assert.equal(headers['Content-Type'], 'application/x-www-form-urlencoded')

  const body = String(c.init.body)
  const parsed = Object.fromEntries(new URLSearchParams(body))
  assert.equal(parsed.name, 'liren-cust1')
  assert.equal(parsed.vcpu, '2')
  assert.equal(parsed.ram, '8192')
  assert.equal(parsed.disks, '100')
  assert.equal(parsed.password, 'pwd-secret')
  assert.equal(parsed.billing_account_id, 'biz-99')
  assert.equal(parsed.os_name, 'ubuntu')
  assert.equal(parsed.os_version, '24.04')
  assert.equal(parsed.cloud_init, '#cloud-config\n')
})

test('idch.create: returns parsed VPSInfo', async () => {
  const { fn } = makeFetchMock({
    body: {
      uuid: 'vm-abc',
      name: 'liren-x',
      status: 'building',
      vcpu: 2,
      memory: 8192,
      public_ipv4: '203.194.1.2',
    },
  })
  const result = await withMockedFetch(fn, async () => {
    const p = new IDCloudHostVPSProvider({ apiKey: 'k', region: 'jakarta' })
    return p.create({
      name: 'x',
      spec: { vcpu: 2, ram: 8192, disk: 50 },
      password: 'p',
      billingAccountId: 'b',
    })
  })
  assert.equal(result.uuid, 'vm-abc')
  assert.equal(result.public_ipv4, '203.194.1.2')
  assert.equal(result.status, 'building')
})

test('idch.create: error response throws with status + body in message', async () => {
  const { fn } = makeFetchMock({
    status: 422,
    body: { error: 'invalid_billing_account_id' },
  })
  await withMockedFetch(fn, async () => {
    const p = new IDCloudHostVPSProvider({ apiKey: 'k', region: 'jakarta' })
    await assert.rejects(
      () =>
        p.create({
          name: 'x',
          spec: { vcpu: 1, ram: 1024, disk: 10 },
          password: 'p',
          billingAccountId: 'bad',
        }),
      /IDCloudHost POST \/vm -> 422.*invalid_billing_account_id/,
    )
  })
})

test('idch.get: GET /vm?uuid=… url-encodes the id', async () => {
  const { fn, calls } = makeFetchMock({
    body: { uuid: 'vm/with slashes', name: 'x', status: 'running', vcpu: 1, memory: 1024 },
  })
  await withMockedFetch(fn, async () => {
    const p = new IDCloudHostVPSProvider({ apiKey: 'k', region: 'jakarta' })
    await p.get('vm/with slashes')
  })
  assert.equal(
    calls[0].url,
    'https://api.idcloudhost.com/v1/jakarta/user-resource/vm?uuid=vm%2Fwith%20slashes',
  )
  assert.equal(calls[0].init.method, 'GET')
})

test('idch.delete: DELETE /vm?uuid=…', async () => {
  const { fn, calls } = makeFetchMock({ body: { ok: true, uuid: 'vm-zz', name: 'x', status: 'deleted', vcpu: 1, memory: 1024 } })
  await withMockedFetch(fn, async () => {
    const p = new IDCloudHostVPSProvider({ apiKey: 'k', region: 'jakarta' })
    await p.delete('vm-zz')
  })
  assert.equal(calls[0].init.method, 'DELETE')
  assert.match(calls[0].url, /\/vm\?uuid=vm-zz$/)
})

test('idch: omits region segment when no region configured', async () => {
  const { fn, calls } = makeFetchMock({ body: { uuid: 'x', name: 'x', status: 'x', vcpu: 1, memory: 1024 } })
  await withMockedFetch(fn, async () => {
    const p = new IDCloudHostVPSProvider({ apiKey: 'k' /* no region */ })
    await p.get('vm-1')
  })
  assert.equal(
    calls[0].url,
    'https://api.idcloudhost.com/v1/user-resource/vm?uuid=vm-1',
    'no region prefix in URL when region absent',
  )
})

test('idch.create: defaults username to "liren" + ssh_key_uuid omitted when not given', async () => {
  const { fn, calls } = makeFetchMock({ body: { uuid: 'x', name: 'x', status: 'x', vcpu: 1, memory: 1024 } })
  await withMockedFetch(fn, async () => {
    const p = new IDCloudHostVPSProvider({ apiKey: 'k', region: 'jakarta' })
    await p.create({
      name: 'x',
      spec: { vcpu: 1, ram: 1024, disk: 10 },
      password: 'p',
      billingAccountId: 'b',
    })
  })
  const parsed = Object.fromEntries(new URLSearchParams(String(calls[0].init.body)))
  assert.equal(parsed.username, 'liren')
  assert.equal(parsed.ssh_key_uuid, undefined, 'ssh_key_uuid not sent when not provided')
})
