import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  AI_VIDEO_IDENTITY_GC_BATCH,
  AI_VIDEO_IDENTITY_LIVENESS_BILLING_ENV,
  AI_VIDEO_IDENTITY_SESSION_TTL_MS,
  handleAiVideoIdentity,
  hashAiVideoIdentityNonce,
  isAiVideoIdentityLivenessBillingBlocked,
  mapAiVideoIdentityFailedReason,
  type AiVideoIdentityArk,
  type AiVideoIdentityAssetRow,
  type AiVideoIdentityConsentInsert,
  type AiVideoIdentityDeps,
  type AiVideoIdentityRow,
  type AiVideoIdentityStore,
} from '../supabase/functions/_shared/ai-video-identity-handler.ts'
import {
  AI_VIDEO_CAPABILITY_SCOPES,
  issueAiVideoCapability,
} from '../supabase/functions/_shared/ai-video-capability.ts'
import { decryptCredential, type CredentialCipher } from '../supabase/functions/_shared/integration-credential-crypto.ts'
import type { ArkAsset } from '../supabase/functions/_shared/ark-asset-client.ts'

const CAPABILITY_KEY = 'identity-lane-test-capability-key-0123456789abcdef'
const ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const INTERNAL_BEARER = 'Bearer service-role-jwt'
const SITE = 'https://www.weuseai.id'
const T0 = new Date('2026-09-14T10:00:00.000Z')

const CUSTOMER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ORDER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'
const CUSTOMER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ORDER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
const CUSTOMER_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ORDER_C = 'cccccccc-cccc-4ccc-8ccc-000000000001'

let sequence = 0
function uuid(): string {
  sequence += 1
  return `dddddddd-dddd-4ddd-8ddd-${String(sequence).padStart(12, '0')}`
}

class FakeStore implements AiVideoIdentityStore {
  orders = new Map<string, { id: string; customer_id: string; status: string }>([
    [ORDER_A, { id: ORDER_A, customer_id: CUSTOMER_A, status: 'paid' }],
    [ORDER_B, { id: ORDER_B, customer_id: CUSTOMER_B, status: 'pending' }],
    [ORDER_C, { id: ORDER_C, customer_id: CUSTOMER_C, status: 'paid' }],
  ])
  identities: AiVideoIdentityRow[] = []
  assets: AiVideoIdentityAssetRow[] = []
  consents: AiVideoIdentityConsentInsert[] = []
  objects = new Map<string, { size: number; contentType: string }>()
  gcRows: AiVideoIdentityAssetRow[] = []
  createdSinceOverride: number | null = null
  insertAssetError: string | null = null
  signedUploads: string[] = []
  signedDownloads: string[] = []
  constructor(private clock: () => Date) {}

  async findOrder(orderId: string, customerId: string) {
    const order = this.orders.get(orderId)
    return order && order.customer_id === customerId ? order : null
  }
  async listIdentities(filter: { ownerKind?: 'founder' | 'customer'; customerId?: string; orderId?: string }) {
    return this.identities.filter((row) => row.revoked_at === null
      && (!filter.customerId || row.customer_id === filter.customerId)
      && (!filter.orderId || row.order_id === filter.orderId)
      && (!filter.ownerKind || row.owner_kind === filter.ownerKind))
  }
  async getIdentity(id: string) {
    return this.identities.find((row) => row.id === id) ?? null
  }
  async findIdentityByNonceHash(hash: string) {
    return this.identities.find((row) => row.callback_nonce_hash === hash) ?? null
  }
  async insertIdentity(input: Parameters<AiVideoIdentityStore['insertIdentity']>[0]) {
    const row: AiVideoIdentityRow = {
      id: uuid(),
      group_id: null,
      byted_token_enc: null,
      session_expires_at: null,
      callback_nonce_hash: null,
      callback_result_code: null,
      verification_billed: null,
      created_at: this.clock().toISOString(),
      revoked_at: null,
      ...input,
    }
    this.identities.push(row)
    return row
  }
  async updateIdentity(id: string, patch: Partial<AiVideoIdentityRow>) {
    const row = this.identities.find((item) => item.id === id)
    if (!row) throw new Error('not_found')
    if (patch.group_id && this.identities.some((other) => other.id !== id && other.group_id === patch.group_id)) {
      throw new Error('duplicate')
    }
    Object.assign(row, patch)
    return row
  }
  async insertConsent(input: AiVideoIdentityConsentInsert) {
    this.consents.push(input)
  }
  async listAssets(identityIds: readonly string[]) {
    return this.assets.filter((row) => identityIds.includes(row.identity_id) && row.deleted_at === null)
  }
  async insertAsset(input: Parameters<AiVideoIdentityStore['insertAsset']>[0]) {
    if (this.insertAssetError) throw new Error(this.insertAssetError)
    const identity = this.identities.find((row) => row.id === input.identity_id)
    if (!identity) throw new Error('identity_not_found')
    const cap = identity.owner_kind === 'founder' ? 6 : 2
    const live = this.assets.filter((row) => row.identity_id === input.identity_id && row.deleted_at === null).length
    if (live >= cap) throw new Error('identity_asset_cap')
    const row: AiVideoIdentityAssetRow = {
      id: uuid(),
      failed_reason: null,
      last_checked_at: null,
      last_inference_at: null,
      created_at: this.clock().toISOString(),
      deleted_at: null,
      ...input,
    }
    this.assets.push(row)
    return row
  }
  async updateAsset(id: string, patch: Partial<AiVideoIdentityAssetRow>) {
    const row = this.assets.find((item) => item.id === id)
    if (!row) throw new Error('not_found')
    Object.assign(row, patch)
    return row
  }
  async countAssetsCreatedSince(sinceIso: string) {
    if (this.createdSinceOverride !== null) return this.createdSinceOverride
    return this.assets.filter((row) => row.created_at >= sinceIso).length
  }
  async quota() {
    const active_assets = this.assets.filter((row) => row.deleted_at === null && row.status !== 'failed').length
    const groups = this.identities.filter((row) => row.group_id !== null && row.revoked_at === null).length
    return { active_assets, groups, asset_limit: 50, group_limit: 50, alert: active_assets >= 40 || groups >= 40 }
  }
  async gcCandidates(limit: number) {
    return this.gcRows.slice(0, limit)
  }
  async createSignedUploadUrl(path: string) {
    this.signedUploads.push(path)
    return { url: `https://stub.supabase.co/storage/v1/object/upload/sign/ai-video-inputs/${path}?token=upload-token`, token: 'upload-token' }
  }
  async statObject(path: string) {
    return this.objects.get(path) ?? null
  }
  async createSignedDownloadUrl(path: string, ttl: number) {
    this.signedDownloads.push(path)
    return `https://stub.supabase.co/storage/v1/object/sign/ai-video-inputs/${path}?token=dl&ttl=${ttl}`
  }
}

class FakeArk implements AiVideoIdentityArk {
  calls: Array<{ method: string; input: Record<string, unknown> }> = []
  sessions = 0
  h5Link = 'https://h5.byteplus.example/verify?ticket=abc'
  // 'auto' hands every session its own group, like BytePlus does.
  validateResult: { groupId: string | null } | Error | 'auto' = 'auto'
  createAssetError: Error | null = null
  deleteAssetError: Error | null = null
  deleteGroupError: Error | null = null
  assetStates = new Map<string, Partial<ArkAsset>>()
  lastCallbackUrl: string | null = null

  async createVisualValidateSession(input: { callbackUrl: string }) {
    this.calls.push({ method: 'createVisualValidateSession', input })
    this.sessions += 1
    this.lastCallbackUrl = input.callbackUrl
    return { bytedToken: `byted-token-${this.sessions}-abcdefghijklmnop`, h5Link: this.h5Link }
  }
  async getVisualValidateResult(input: { bytedToken: string }) {
    this.calls.push({ method: 'getVisualValidateResult', input })
    if (this.validateResult instanceof Error) throw this.validateResult
    if (this.validateResult === 'auto') return { groupId: `grp-${String(this.sessions).padStart(12, '0')}` }
    return this.validateResult
  }
  async createAsset(input: { groupId: string; url: string; assetType: 'Image' | 'Video' | 'Audio'; name?: string }) {
    this.calls.push({ method: 'createAsset', input })
    if (this.createAssetError) throw this.createAssetError
    return { id: `asset-${String(this.calls.length).padStart(8, '0')}` }
  }
  async getAsset(input: { id: string }): Promise<ArkAsset> {
    this.calls.push({ method: 'getAsset', input })
    const state = this.assetStates.get(input.id) ?? {}
    return {
      id: input.id,
      groupId: 'grp-000000000001',
      assetType: 'Image',
      name: null,
      status: 'processing',
      failedReason: null,
      url: null,
      lastInferenceTime: null,
      ...state,
    }
  }
  async deleteAsset(input: { id: string }) {
    this.calls.push({ method: 'deleteAsset', input })
    if (this.deleteAssetError) throw this.deleteAssetError
  }
  async deleteAssetGroup(input: { id: string }) {
    this.calls.push({ method: 'deleteAssetGroup', input })
    if (this.deleteGroupError) throw this.deleteGroupError
  }
  methods(): string[] {
    return this.calls.map((call) => call.method)
  }
}

type Harness = {
  store: FakeStore
  ark: FakeArk
  logs: Array<Record<string, unknown>>
  now: { value: Date }
  call(action: string, body?: Record<string, unknown>, auth?: { customer?: string; internal?: boolean; headers?: Record<string, string> }): Promise<{ status: number; body: Record<string, unknown> }>
  nonce(): string
}

function harness(options: { livenessBillingBlocked?: boolean } = {}): Harness {
  const now = { value: new Date(T0) }
  const store = new FakeStore(() => now.value)
  const ark = new FakeArk()
  const logs: Array<Record<string, unknown>> = []
  const deps: AiVideoIdentityDeps = {
    capabilityKey: CAPABILITY_KEY,
    encryptionKey: ENCRYPTION_KEY,
    siteOrigin: SITE,
    store,
    ark,
    isInternalCaller: (req) => req.headers.get('authorization') === INTERNAL_BEARER,
    now: () => now.value,
    log: (event) => { logs.push(event) },
    livenessBillingBlocked: options.livenessBillingBlocked,
  }
  return {
    store,
    ark,
    logs,
    now,
    async call(action, body = {}, auth = {}) {
      const headers: Record<string, string> = { 'content-type': 'application/json', ...(auth.headers ?? {}) }
      if (auth.internal) headers.authorization = INTERNAL_BEARER
      if (auth.customer) headers['x-ai-video-capability'] = auth.customer
      const response = await handleAiVideoIdentity(
        new Request('https://fn.test/ai-video-identity', { method: 'POST', headers, body: JSON.stringify({ action, ...body }) }),
        deps,
      )
      return { status: response.status, body: await response.json() as Record<string, unknown> }
    },
    nonce() {
      if (!ark.lastCallbackUrl) throw new Error('no session yet')
      return new URL(ark.lastCallbackUrl).searchParams.get('n') ?? ''
    },
  }
}

async function capability(customerId: string, orderId: string, scopes: readonly string[] = AI_VIDEO_CAPABILITY_SCOPES): Promise<string> {
  return issueAiVideoCapability({
    customerId,
    orderId,
    scopes: scopes as typeof AI_VIDEO_CAPABILITY_SCOPES[number][],
    now: T0,
  }, CAPABILITY_KEY)
}

async function verifiedIdentity(h: Harness, token: string, name = 'Richie'): Promise<string> {
  const started = await h.call('start', { display_name: name, consent_version: 'v1' }, { customer: token })
  assert.equal(started.status, 200, JSON.stringify(started.body))
  const confirmed = await h.call('confirm', { nonce: h.nonce() })
  assert.equal(confirmed.body.verification_status, 'verified', JSON.stringify(confirmed.body))
  return String(started.body.identity_id)
}

function secretsIn(text: string, extra: string[] = []): string[] {
  return ['group_id', 'grp-0000', 'byted', 'byted_token', 'nonce', 'callback_nonce_hash', 'failed_reason', ...extra]
    .filter((needle) => text.includes(needle))
}

// ─── auth gates ──────────────────────────────────────────────────────────

test('unpaid order is refused with 402 not_paid before any store or ark work', async () => {
  const h = harness()
  const token = await capability(CUSTOMER_B, ORDER_B)
  const result = await h.call('list', {}, { customer: token })
  assert.equal(result.status, 402)
  assert.deepEqual(result.body, { error: 'not_paid' })
  assert.equal(h.ark.calls.length, 0)
})

test('missing or foreign capability is 401, unknown action is 400, gc needs the internal bearer', async () => {
  const h = harness()
  assert.equal((await h.call('list')).status, 401)
  const forged = await issueAiVideoCapability({ customerId: CUSTOMER_A, orderId: ORDER_A, scopes: [...AI_VIDEO_CAPABILITY_SCOPES], now: T0 }, 'another-key-that-is-long-enough-0123456789')
  assert.equal((await h.call('list', {}, { customer: forged })).status, 401)
  assert.equal((await h.call('nope', {}, { internal: true })).status, 400)
  assert.equal((await h.call('gc', {}, { customer: await capability(CUSTOMER_A, ORDER_A) })).status, 401)
  assert.equal((await h.call('gc')).status, 401)
})

test('a read-only capability cannot start an identity', async () => {
  const h = harness()
  const readOnly = await capability(CUSTOMER_A, ORDER_A, ['order:read', 'profile:read'])
  assert.equal((await h.call('list', {}, { customer: readOnly })).status, 200)
  assert.equal((await h.call('start', { display_name: 'Richie', consent_version: 'v1' }, { customer: readOnly })).status, 401)
})

// ─── start ───────────────────────────────────────────────────────────────

test('start stores the sha256 of the nonce and the encrypted BytedToken, writes consent, returns h5_link with lng=en', async () => {
  const h = harness()
  const token = await capability(CUSTOMER_A, ORDER_A)
  const result = await h.call('start', { display_name: '  Richie  Kidnovell ', consent_version: 'v1' }, {
    customer: token,
    headers: { 'x-forwarded-for': '103.10.20.30, 10.0.0.1', 'user-agent': 'UnitTest/1.0' },
  })
  assert.equal(result.status, 200, JSON.stringify(result.body))
  assert.deepEqual(Object.keys(result.body).sort(), ['expires_at', 'h5_link', 'identity_id'])
  assert.equal(result.body.h5_link, 'https://h5.byteplus.example/verify?ticket=abc&lng=en')
  assert.equal(result.body.expires_at, new Date(T0.getTime() + AI_VIDEO_IDENTITY_SESSION_TTL_MS).toISOString())

  const nonce = h.nonce()
  assert.match(nonce, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(h.ark.lastCallbackUrl, `${SITE}/ai-video-identity.html?stage=callback&n=${nonce}`)

  const row = h.store.identities[0]
  assert.equal(row.id, result.body.identity_id)
  assert.equal(row.display_name, 'Richie Kidnovell')
  assert.equal(row.owner_kind, 'customer')
  assert.equal(row.customer_id, CUSTOMER_A)
  assert.equal(row.order_id, ORDER_A)
  assert.equal(row.verification_status, 'pending')
  assert.equal(row.consent_at, T0.toISOString())
  assert.equal(row.consent_text_version, 'v1')
  assert.equal(row.callback_nonce_hash, await hashAiVideoIdentityNonce(nonce))
  assert.notEqual(row.byted_token_enc, 'byted-token-1-abcdefghijklmnop')
  assert.ok(!(row.byted_token_enc ?? '').includes('byted-token-1'))
  const cipher = JSON.parse(row.byted_token_enc ?? '') as CredentialCipher
  assert.equal(await decryptCredential(cipher, ENCRYPTION_KEY), 'byted-token-1-abcdefghijklmnop')

  assert.equal(h.store.consents.length, 1)
  assert.deepEqual(h.store.consents[0], {
    customer_id: CUSTOMER_A,
    consent_type: 'ai_video_identity_face',
    accepted_at: T0.toISOString(),
    ip_address: '103.10.20.30',
    user_agent: 'UnitTest/1.0',
    version: 'v1',
  })

  const leaked = secretsIn(JSON.stringify(result.body), ['byted-token'])
  assert.deepEqual(leaked, [], `response leaked ${leaked.join(', ')}`)
  assert.equal(JSON.stringify(h.logs).includes('byted-token'), false)
  assert.equal(JSON.stringify(h.logs).includes(nonce), false)
})

test('start keeps an existing lng parameter and rejects bad names or consent versions', async () => {
  const h = harness()
  h.ark.h5Link = 'https://h5.byteplus.example/verify?lng=zh&ticket=abc'
  const token = await capability(CUSTOMER_A, ORDER_A)
  const ok = await h.call('start', { display_name: 'Renita', consent_version: 'v1' }, { customer: token })
  assert.equal(ok.body.h5_link, 'https://h5.byteplus.example/verify?lng=zh&ticket=abc')
  assert.equal((await h.call('start', { display_name: '', consent_version: 'v1' }, { customer: token })).body.error, 'invalid_display_name')
  assert.equal((await h.call('start', { display_name: 'x'.repeat(81), consent_version: 'v1' }, { customer: token })).body.error, 'invalid_display_name')
  assert.equal((await h.call('start', { display_name: 'Renita' }, { customer: token })).body.error, 'invalid_consent_version')
})

test('internal start for a founder writes no consent_events row and never trusts the body customer for a customer scope', async () => {
  const h = harness()
  const founder = await h.call('start', { display_name: 'Richie', consent_version: 'v1', owner_kind: 'founder' }, { internal: true })
  assert.equal(founder.status, 200, JSON.stringify(founder.body))
  assert.equal(h.store.identities[0].owner_kind, 'founder')
  assert.equal(h.store.identities[0].customer_id, null)
  assert.equal(h.store.consents.length, 0)
  assert.equal((await h.call('start', { display_name: 'X', consent_version: 'v1' }, { internal: true })).body.error, 'invalid_owner_kind')
  assert.equal((await h.call('start', { display_name: 'X', consent_version: 'v1', owner_kind: 'customer' }, { internal: true })).body.error, 'customer_id_required')

  // A customer capability cannot relabel itself as a founder or another customer.
  const token = await capability(CUSTOMER_A, ORDER_A)
  await h.call('start', { display_name: 'Sneaky', consent_version: 'v1', owner_kind: 'founder', customer_id: CUSTOMER_C }, { customer: token })
  const sneaky = h.store.identities.find((row) => row.display_name === 'Sneaky')
  assert.equal(sneaky?.owner_kind, 'customer')
  assert.equal(sneaky?.customer_id, CUSTOMER_A)
})

test('the liveness billing kill switch is off unless the env is an explicit on-value', () => {
  assert.equal(AI_VIDEO_IDENTITY_LIVENESS_BILLING_ENV, 'AI_VIDEO_IDENTITY_LIVENESS_BILLING')
  assert.equal(isAiVideoIdentityLivenessBillingBlocked(undefined), false)
  assert.equal(isAiVideoIdentityLivenessBillingBlocked(null), false)
  assert.equal(isAiVideoIdentityLivenessBillingBlocked(''), false)
  assert.equal(isAiVideoIdentityLivenessBillingBlocked('false'), false)
  assert.equal(isAiVideoIdentityLivenessBillingBlocked('0'), false)
  assert.equal(isAiVideoIdentityLivenessBillingBlocked('true'), true)
  assert.equal(isAiVideoIdentityLivenessBillingBlocked('TRUE'), true)
  assert.equal(isAiVideoIdentityLivenessBillingBlocked('1'), true)
  assert.equal(isAiVideoIdentityLivenessBillingBlocked('on'), true)
  assert.equal(isAiVideoIdentityLivenessBillingBlocked('yes'), true)
})

test('start and restart are refused with liveness_billing_blocked when the kill switch is on', async () => {
  const h = harness({ livenessBillingBlocked: true })
  const token = await capability(CUSTOMER_A, ORDER_A)
  const started = await h.call('start', { display_name: 'Richie', consent_version: 'v1' }, { customer: token })
  assert.equal(started.status, 403)
  assert.deepEqual(started.body, { error: 'liveness_billing_blocked' })
  assert.equal(h.store.identities.length, 0)
  assert.equal(h.store.consents.length, 0)
  assert.equal(h.ark.calls.length, 0)
  assert.equal(h.logs.some((event) => event.event === 'ai_video_identity_liveness_billing_blocked'), true)

  const failedId = uuid()
  h.store.identities.push({
    id: failedId,
    owner_kind: 'customer',
    customer_id: CUSTOMER_A,
    order_id: ORDER_A,
    display_name: 'Richie',
    group_id: null,
    verification_status: 'failed',
    byted_token_enc: null,
    session_expires_at: null,
    callback_nonce_hash: null,
    callback_result_code: null,
    consent_at: T0.toISOString(),
    consent_text_version: 'v1',
    verification_billed: null,
    created_at: T0.toISOString(),
    revoked_at: null,
  })
  const restarted = await h.call('restart', { identity_id: failedId }, { customer: token })
  assert.equal(restarted.status, 403)
  assert.deepEqual(restarted.body, { error: 'liveness_billing_blocked' })
  assert.equal(h.ark.calls.length, 0)
  assert.equal(h.store.identities[0].verification_status, 'failed')
})

test('the edge function wires the liveness billing kill switch from env', () => {
  const source = readFileSync(new URL('../supabase/functions/ai-video-identity/index.ts', import.meta.url), 'utf8')
  assert.match(source, /isAiVideoIdentityLivenessBillingBlocked/)
  assert.match(source, /Deno\.env\.get\('AI_VIDEO_IDENTITY_LIVENESS_BILLING'\)/)
})

test('start marks the row failed when BytePlus refuses to open a session', async () => {
  const h = harness()
  h.ark.createVisualValidateSession = async () => { throw new Error('ark_unauthorized') }
  const result = await h.call('start', { display_name: 'Richie', consent_version: 'v1', owner_kind: 'founder' }, { internal: true })
  assert.equal(result.status, 502)
  assert.deepEqual(result.body, { error: 'ark_unauthorized' })
  assert.equal(h.store.identities[0].verification_status, 'failed')
  assert.equal(h.store.identities[0].callback_nonce_hash, null)
})

// ─── confirm ─────────────────────────────────────────────────────────────

test('confirm happy path: group stored, token and nonce cleared, nonce is single use', async () => {
  const h = harness()
  const token = await capability(CUSTOMER_A, ORDER_A)
  const started = await h.call('start', { display_name: 'Richie', consent_version: 'v1' }, { customer: token })
  const nonce = h.nonce()
  const confirmed = await h.call('confirm', { nonce, result_code: '10000' })
  assert.equal(confirmed.status, 200)
  assert.deepEqual(confirmed.body, { identity_id: started.body.identity_id, verification_status: 'verified' })
  const row = h.store.identities[0]
  assert.equal(row.verification_status, 'verified')
  assert.equal(row.group_id, 'grp-000000000001')
  assert.equal(row.byted_token_enc, null)
  assert.equal(row.callback_nonce_hash, null)
  assert.equal(row.callback_result_code, '10000')
  assert.deepEqual(h.ark.calls.filter((c) => c.method === 'getVisualValidateResult').map((c) => c.input), [{ bytedToken: 'byted-token-1-abcdefghijklmnop' }])

  const replay = await h.call('confirm', { nonce })
  assert.equal(replay.status, 404)
  assert.deepEqual(replay.body, { error: 'invalid_nonce' })
})

test('confirm returns pending while BytePlus has no group yet and keeps the nonce alive', async () => {
  const h = harness()
  h.ark.validateResult = { groupId: null }
  await h.call('start', { display_name: 'Richie', consent_version: 'v1', owner_kind: 'founder' }, { internal: true })
  const nonce = h.nonce()
  const pending = await h.call('confirm', { nonce })
  assert.equal(pending.status, 200)
  assert.equal(pending.body.verification_status, 'pending')
  assert.equal(h.store.identities[0].callback_nonce_hash, await hashAiVideoIdentityNonce(nonce))
  h.ark.validateResult = { groupId: 'grp-000000000002' }
  const verified = await h.call('confirm', { nonce })
  assert.equal(verified.body.verification_status, 'verified')
})

test('confirm after 30 minutes expires the session with 410 and clears the nonce', async () => {
  const h = harness()
  await h.call('start', { display_name: 'Richie', consent_version: 'v1', owner_kind: 'founder' }, { internal: true })
  const nonce = h.nonce()
  h.now.value = new Date(T0.getTime() + AI_VIDEO_IDENTITY_SESSION_TTL_MS + 1000)
  const result = await h.call('confirm', { nonce })
  assert.equal(result.status, 410)
  assert.deepEqual(result.body, { error: 'verification_expired' })
  assert.equal(h.store.identities[0].verification_status, 'expired')
  assert.equal(h.store.identities[0].byted_token_enc, null)
  assert.equal(h.store.identities[0].callback_nonce_hash, null)
  assert.equal(h.ark.calls.filter((c) => c.method === 'getVisualValidateResult').length, 0)
  assert.equal((await h.call('confirm', { nonce })).status, 404)
})

test('confirm with an unknown or malformed nonce is 404 invalid_nonce', async () => {
  const h = harness()
  assert.deepEqual(await h.call('confirm', { nonce: 'A'.repeat(43) }), { status: 404, body: { error: 'invalid_nonce' } })
  assert.deepEqual(await h.call('confirm', { nonce: 'short' }), { status: 404, body: { error: 'invalid_nonce' } })
  assert.deepEqual(await h.call('confirm', {}), { status: 404, body: { error: 'invalid_nonce' } })
})

test('confirm records the billing flag and logs it without secrets', async () => {
  const h = harness()
  await h.call('start', { display_name: 'Richie', consent_version: 'v1', owner_kind: 'founder' }, { internal: true })
  const nonce = h.nonce()
  await h.call('confirm', { nonce, billed: 'true', result_code: 10000 })
  assert.equal(h.store.identities[0].verification_billed, true)
  assert.equal(h.store.identities[0].callback_result_code, '10000')
  const billing = h.logs.find((event) => event.event === 'ai_video_identity_verification_billed')
  assert.ok(billing)
  assert.equal(billing?.billed, true)
  assert.equal(JSON.stringify(h.logs).includes(nonce), false)
  assert.equal(JSON.stringify(h.logs).includes('byted-token'), false)
})

test('confirm maps a definitive BytePlus failure to failed/verification_failed and a transient outage to a retryable 503', async () => {
  const h = harness()
  h.ark.validateResult = new Error('ark_unavailable')
  await h.call('start', { display_name: 'Richie', consent_version: 'v1', owner_kind: 'founder' }, { internal: true })
  const nonce = h.nonce()
  const outage = await h.call('confirm', { nonce })
  assert.equal(outage.status, 503)
  assert.deepEqual(outage.body, { error: 'ark_unavailable' })
  assert.equal(h.store.identities[0].verification_status, 'pending')

  h.ark.validateResult = new Error('ark_invalid_request')
  const failed = await h.call('confirm', { nonce })
  assert.equal(failed.status, 200)
  assert.deepEqual(failed.body, { identity_id: h.store.identities[0].id, verification_status: 'failed', reason_code: 'verification_failed' })
  assert.equal(h.store.identities[0].verification_status, 'failed')
  assert.equal(h.store.identities[0].callback_nonce_hash, null)
})

// ─── restart ─────────────────────────────────────────────────────────────

test('restart is refused while a session is open and allowed after failure or expiry with a fresh nonce and token', async () => {
  const h = harness()
  const token = await capability(CUSTOMER_A, ORDER_A)
  const started = await h.call('start', { display_name: 'Richie', consent_version: 'v1' }, { customer: token })
  const id = String(started.body.identity_id)
  const firstHash = h.store.identities[0].callback_nonce_hash
  assert.equal((await h.call('restart', { identity_id: id }, { customer: token })).body.error, 'identity_not_restartable')
  h.now.value = new Date(T0.getTime() + AI_VIDEO_IDENTITY_SESSION_TTL_MS + 1)
  const restarted = await h.call('restart', { identity_id: id }, { customer: token })
  assert.equal(restarted.status, 200, JSON.stringify(restarted.body))
  assert.equal(restarted.body.identity_id, id)
  assert.notEqual(h.store.identities[0].callback_nonce_hash, firstHash)
  assert.equal(h.store.identities[0].verification_status, 'pending')
  assert.equal(h.ark.sessions, 2)
  // Only the first start writes consent; restart does not duplicate it.
  assert.equal(h.store.consents.length, 1)
})

// ─── upload_sign / register ──────────────────────────────────────────────

test('upload_sign requires a verified identity and validates slot, content type and size', async () => {
  const h = harness()
  const token = await capability(CUSTOMER_A, ORDER_A)
  const started = await h.call('start', { display_name: 'Richie', consent_version: 'v1' }, { customer: token })
  const id = String(started.body.identity_id)
  assert.equal((await h.call('upload_sign', { identity_id: id, slot: 'full_body', content_type: 'image/jpeg', bytes: 1000 }, { customer: token })).body.error, 'identity_not_verified')
  await h.call('confirm', { nonce: h.nonce() })

  const signed = await h.call('upload_sign', { identity_id: id, slot: 'full_body', content_type: 'image/jpeg', bytes: 1000 }, { customer: token })
  assert.equal(signed.status, 200, JSON.stringify(signed.body))
  assert.match(String(signed.body.path), new RegExp(`^identity/${id}/full_body-[0-9a-f-]{36}\\.jpg$`))
  assert.equal(signed.body.upload_url, `https://stub.supabase.co/storage/v1/object/upload/sign/ai-video-inputs/${signed.body.path}?token=upload-token`)
  assert.deepEqual(signed.body.headers, { 'content-type': 'image/jpeg', 'x-upsert': 'false', authorization: 'Bearer upload-token' })

  assert.equal((await h.call('upload_sign', { identity_id: id, slot: 'voice', content_type: 'image/jpeg', bytes: 1000 }, { customer: token })).body.error, 'invalid_content_type')
  assert.equal((await h.call('upload_sign', { identity_id: id, slot: 'close_up', content_type: 'image/gif', bytes: 1000 }, { customer: token })).body.error, 'invalid_content_type')
  assert.equal((await h.call('upload_sign', { identity_id: id, slot: 'selfie', content_type: 'image/jpeg', bytes: 1000 }, { customer: token })).body.error, 'invalid_slot')
  assert.equal((await h.call('upload_sign', { identity_id: id, slot: 'full_body', content_type: 'image/jpeg', bytes: 30 * 1024 * 1024 + 1 }, { customer: token })).status, 413)
  assert.equal((await h.call('upload_sign', { identity_id: id, slot: 'voice', content_type: 'audio/wav', bytes: 15 * 1024 * 1024 + 1 }, { customer: token })).status, 413)
  const voice = await h.call('upload_sign', { identity_id: id, slot: 'voice', content_type: 'audio/mpeg', bytes: 4096 }, { customer: token })
  assert.match(String(voice.body.path), /\/voice-[0-9a-f-]{36}\.mp3$/)
})

test('register creates the Ark asset from a 2-hour signed URL and stores it processing; cap and rate budget stop before Ark', async () => {
  const h = harness()
  const token = await capability(CUSTOMER_A, ORDER_A)
  const id = await verifiedIdentity(h, token)

  async function registerSlot(slot: string, assetType = 'Image') {
    const contentType = slot === 'voice' ? 'audio/mpeg' : 'image/jpeg'
    const signed = await h.call('upload_sign', { identity_id: id, slot, content_type: contentType, bytes: 2048 }, { customer: token })
    const path = String(signed.body.path)
    h.store.objects.set(path, { size: 2048, contentType })
    return { path, result: await h.call('register', { identity_id: id, path, asset_type: assetType, slot }, { customer: token }) }
  }

  const first = await registerSlot('full_body')
  assert.equal(first.result.status, 200, JSON.stringify(first.result.body))
  const asset = first.result.body.asset as Record<string, unknown>
  assert.equal(asset.status, 'processing')
  assert.equal(asset.slot, 'full_body')
  assert.equal(asset.asset_type, 'Image')
  assert.equal(asset.asset_id, 'asset-00000003')
  assert.equal('failed_reason' in asset, false)
  const create = h.ark.calls.find((c) => c.method === 'createAsset')
  assert.deepEqual(create?.input, {
    groupId: 'grp-000000000001',
    url: `https://stub.supabase.co/storage/v1/object/sign/ai-video-inputs/${first.path}?token=dl&ttl=7200`,
    assetType: 'Image',
    name: 'full_body',
  })
  assert.equal(h.store.assets[0].source_path, first.path)

  const second = await registerSlot('close_up')
  assert.equal(second.result.status, 200)

  // Customer cap is 2: the third live asset is refused before CreateAsset.
  const createCalls = h.ark.calls.filter((c) => c.method === 'createAsset').length
  const third = await registerSlot('voice', 'Audio')
  assert.equal(third.result.status, 409)
  assert.deepEqual(third.result.body, { error: 'identity_asset_cap' })
  assert.equal(h.ark.calls.filter((c) => c.method === 'createAsset').length, createCalls)

  // Account-wide 3-per-minute CreateAsset budget.
  const h2 = harness()
  const token2 = await capability(CUSTOMER_C, ORDER_C)
  const id2 = await verifiedIdentity(h2, token2, 'Renita')
  h2.store.createdSinceOverride = 3
  const signed = await h2.call('upload_sign', { identity_id: id2, slot: 'full_body', content_type: 'image/png', bytes: 10 }, { customer: token2 })
  h2.store.objects.set(String(signed.body.path), { size: 10, contentType: 'image/png' })
  const throttled = await h2.call('register', { identity_id: id2, path: signed.body.path, asset_type: 'Image', slot: 'full_body' }, { customer: token2 })
  assert.equal(throttled.status, 429)
  assert.deepEqual(throttled.body, { error: 'ark_rate_limited' })
  assert.equal(h2.ark.calls.filter((c) => c.method === 'createAsset').length, 0)
})

test('register validates the path, the stored object, slot occupancy, and cleans up an orphan when the trigger wins the race', async () => {
  const h = harness()
  const token = await capability(CUSTOMER_A, ORDER_A)
  const id = await verifiedIdentity(h, token)
  const other = await verifiedIdentity(h, await capability(CUSTOMER_C, ORDER_C), 'Renita')

  const signed = await h.call('upload_sign', { identity_id: id, slot: 'full_body', content_type: 'image/webp', bytes: 10 }, { customer: token })
  const path = String(signed.body.path)
  assert.equal((await h.call('register', { identity_id: id, path, asset_type: 'Image', slot: 'full_body' }, { customer: token })).body.error, 'upload_not_found')
  assert.equal((await h.call('register', { identity_id: id, path: path.replace(id, other), asset_type: 'Image', slot: 'full_body' }, { customer: token })).body.error, 'invalid_path')
  assert.equal((await h.call('register', { identity_id: id, path: 'operator/inbox/x.jpg', asset_type: 'Image', slot: 'full_body' }, { customer: token })).body.error, 'invalid_path')
  assert.equal((await h.call('register', { identity_id: id, path, asset_type: 'Audio', slot: 'full_body' }, { customer: token })).body.error, 'invalid_asset_type')
  assert.equal((await h.call('register', { identity_id: id, path, asset_type: 'Image', slot: 'close_up' }, { customer: token })).body.error, 'invalid_path')

  h.store.objects.set(path, { size: 31 * 1024 * 1024, contentType: 'image/webp' })
  assert.equal((await h.call('register', { identity_id: id, path, asset_type: 'Image', slot: 'full_body' }, { customer: token })).status, 413)
  h.store.objects.set(path, { size: 10, contentType: 'image/webp' })

  h.store.insertAssetError = 'identity_asset_cap'
  const raced = await h.call('register', { identity_id: id, path, asset_type: 'Image', slot: 'full_body' }, { customer: token })
  assert.equal(raced.status, 409)
  assert.deepEqual(raced.body, { error: 'identity_asset_cap' })
  const tail = h.ark.methods().slice(-2)
  assert.deepEqual(tail, ['createAsset', 'deleteAsset'])
  h.store.insertAssetError = null

  const ok = await h.call('register', { identity_id: id, path, asset_type: 'Image', slot: 'full_body' }, { customer: token })
  assert.equal(ok.status, 200)
  const again = await h.call('register', { identity_id: id, path, asset_type: 'Image', slot: 'full_body' }, { customer: token })
  assert.deepEqual(again, { status: 409, body: { error: 'slot_occupied' } })

  h.ark.createAssetError = new Error('ark_quota_exceeded')
  const signed2 = await h.call('upload_sign', { identity_id: id, slot: 'close_up', content_type: 'image/jpeg', bytes: 10 }, { customer: token })
  h.store.objects.set(String(signed2.body.path), { size: 10, contentType: 'image/jpeg' })
  const quota = await h.call('register', { identity_id: id, path: signed2.body.path, asset_type: 'Image', slot: 'close_up' }, { customer: token })
  assert.deepEqual(quota, { status: 409, body: { error: 'ark_quota_exceeded' } })
  h.ark.createAssetError = new Error('ark_rate_limited')
  const limited = await h.call('register', { identity_id: id, path: signed2.body.path, asset_type: 'Image', slot: 'close_up' }, { customer: token })
  assert.deepEqual(limited, { status: 429, body: { error: 'ark_rate_limited' } })
})

test('re-registering a slot whose asset failed deletes the failed asset on Ark and soft-deletes it so the cap frees up', async () => {
  const h = harness()
  const token = await capability(CUSTOMER_A, ORDER_A)
  const id = await verifiedIdentity(h, token)
  const signed = await h.call('upload_sign', { identity_id: id, slot: 'full_body', content_type: 'image/jpeg', bytes: 10 }, { customer: token })
  const path = String(signed.body.path)
  h.store.objects.set(path, { size: 10, contentType: 'image/jpeg' })
  const first = await h.call('register', { identity_id: id, path, asset_type: 'Image', slot: 'full_body' }, { customer: token })
  const firstAsset = first.body.asset as Record<string, unknown>
  h.ark.assetStates.set(String(firstAsset.asset_id), { status: 'failed', failedReason: 'FaceMismatch' })
  h.now.value = new Date(T0.getTime() + 20_000)
  const status = await h.call('status', { identity_id: id }, { customer: token })
  const identity = status.body.identity as { assets: Array<Record<string, unknown>> }
  assert.equal(identity.assets[0].status, 'failed')
  assert.equal(identity.assets[0].reason_code, 'face_mismatch')

  const signed2 = await h.call('upload_sign', { identity_id: id, slot: 'full_body', content_type: 'image/jpeg', bytes: 10 }, { customer: token })
  h.store.objects.set(String(signed2.body.path), { size: 10, contentType: 'image/jpeg' })
  const retry = await h.call('register', { identity_id: id, path: signed2.body.path, asset_type: 'Image', slot: 'full_body' }, { customer: token })
  assert.equal(retry.status, 200, JSON.stringify(retry.body))
  const deletes = h.ark.calls.filter((c) => c.method === 'deleteAsset').map((c) => c.input.id)
  assert.deepEqual(deletes, [firstAsset.asset_id])
  const old = h.store.assets.find((row) => row.asset_id === firstAsset.asset_id)
  assert.ok(old?.deleted_at)
  assert.equal(h.store.assets.filter((row) => row.deleted_at === null).length, 1)
})

// ─── status ──────────────────────────────────────────────────────────────

test('status polls processing assets at most every 10 seconds and maps FailedReason to a customer reason_code', async () => {
  const h = harness()
  const token = await capability(CUSTOMER_A, ORDER_A)
  const id = await verifiedIdentity(h, token)
  for (const slot of ['full_body', 'close_up']) {
    const signed = await h.call('upload_sign', { identity_id: id, slot, content_type: 'image/jpeg', bytes: 10 }, { customer: token })
    h.store.objects.set(String(signed.body.path), { size: 10, contentType: 'image/jpeg' })
    await h.call('register', { identity_id: id, path: signed.body.path, asset_type: 'Image', slot }, { customer: token })
  }
  const [a, b] = h.store.assets
  h.ark.assetStates.set(a.asset_id, { status: 'active', lastInferenceTime: '2026-09-14T10:05:00Z' })
  h.ark.assetStates.set(b.asset_id, { status: 'failed', failedReason: 'MultiFace detected in image' })

  const first = await h.call('status', { identity_id: id }, { customer: token })
  assert.equal(first.status, 200)
  const view = first.body.identity as Record<string, unknown> & { assets: Array<Record<string, unknown>> }
  assert.equal(view.group_ready, true)
  assert.equal(view.assets[0].status, 'active')
  assert.equal('reason_code' in view.assets[0], false)
  assert.equal(view.assets[1].status, 'failed')
  assert.equal(view.assets[1].reason_code, 'multiple_faces')
  assert.equal('failed_reason' in view.assets[1], false)
  assert.equal(a.last_inference_at, '2026-09-14T10:05:00Z')
  assert.equal(b.failed_reason, 'MultiFace detected in image')
  assert.equal(h.ark.calls.filter((c) => c.method === 'getAsset').length, 2)

  // Nothing is processing any more, so no further GetAsset calls.
  await h.call('status', { identity_id: id }, { customer: token })
  assert.equal(h.ark.calls.filter((c) => c.method === 'getAsset').length, 2)

  // Internal callers see the raw reason.
  const internal = await h.call('status', { identity_id: id }, { internal: true })
  const internalView = internal.body.identity as { assets: Array<Record<string, unknown>> }
  assert.equal(internalView.assets[1].failed_reason, 'MultiFace detected in image')

  const leaked = secretsIn(JSON.stringify(first.body))
  assert.deepEqual(leaked, [], `customer status leaked ${leaked.join(', ')}`)
})

test('status throttles GetAsset to once per 10 s per processing asset and expires a stale pending session', async () => {
  const h = harness()
  const token = await capability(CUSTOMER_A, ORDER_A)
  const id = await verifiedIdentity(h, token)
  const signed = await h.call('upload_sign', { identity_id: id, slot: 'full_body', content_type: 'image/jpeg', bytes: 10 }, { customer: token })
  h.store.objects.set(String(signed.body.path), { size: 10, contentType: 'image/jpeg' })
  await h.call('register', { identity_id: id, path: signed.body.path, asset_type: 'Image', slot: 'full_body' }, { customer: token })
  await h.call('status', { identity_id: id }, { customer: token })
  await h.call('status', { identity_id: id }, { customer: token })
  assert.equal(h.ark.calls.filter((c) => c.method === 'getAsset').length, 1)
  h.now.value = new Date(T0.getTime() + 10_000)
  await h.call('status', { identity_id: id }, { customer: token })
  assert.equal(h.ark.calls.filter((c) => c.method === 'getAsset').length, 2)

  const pending = await h.call('start', { display_name: 'Late', consent_version: 'v1' }, { customer: token })
  h.now.value = new Date(T0.getTime() + AI_VIDEO_IDENTITY_SESSION_TTL_MS + 60_000)
  const expired = await h.call('status', { identity_id: pending.body.identity_id }, { customer: token })
  assert.equal((expired.body.identity as Record<string, unknown>).verification_status, 'expired')
})

test('failedReason mapping covers the three customer-facing codes', () => {
  assert.equal(mapAiVideoIdentityFailedReason('FaceMismatch'), 'face_mismatch')
  assert.equal(mapAiVideoIdentityFailedReason('face mismatch against the liveness capture'), 'face_mismatch')
  assert.equal(mapAiVideoIdentityFailedReason('MultiFace'), 'multiple_faces')
  assert.equal(mapAiVideoIdentityFailedReason('More than one face'), 'multiple_faces')
  assert.equal(mapAiVideoIdentityFailedReason('InvalidImage'), 'asset_failed')
  assert.equal(mapAiVideoIdentityFailedReason(null), 'asset_failed')
})

// ─── revoke ──────────────────────────────────────────────────────────────

test('revoke deletes every asset, then the group, then marks the row revoked and soft-deletes assets; second call is a no-op', async () => {
  const h = harness()
  const token = await capability(CUSTOMER_A, ORDER_A)
  const id = await verifiedIdentity(h, token)
  for (const slot of ['full_body', 'close_up']) {
    const signed = await h.call('upload_sign', { identity_id: id, slot, content_type: 'image/jpeg', bytes: 10 }, { customer: token })
    h.store.objects.set(String(signed.body.path), { size: 10, contentType: 'image/jpeg' })
    await h.call('register', { identity_id: id, path: signed.body.path, asset_type: 'Image', slot }, { customer: token })
  }
  const before = h.ark.calls.length
  h.ark.deleteAssetError = null
  const result = await h.call('revoke', { identity_id: id }, { customer: token })
  assert.deepEqual(result, { status: 200, body: { ok: true } })
  const order = h.ark.calls.slice(before).map((c) => `${c.method}:${String(c.input.id)}`)
  assert.deepEqual(order, [
    `deleteAsset:${h.store.assets[0].asset_id}`,
    `deleteAsset:${h.store.assets[1].asset_id}`,
    'deleteAssetGroup:grp-000000000001',
  ])
  const row = h.store.identities[0]
  assert.ok(row.revoked_at)
  assert.equal(row.byted_token_enc, null)
  assert.ok(h.store.assets.every((asset) => asset.deleted_at !== null))
  const list = await h.call('list', {}, { customer: token })
  assert.deepEqual(list.body.identities, [])
  assert.deepEqual(list.body.quota, { remaining_assets: 50 })

  const again = await h.call('revoke', { identity_id: id }, { customer: token })
  assert.deepEqual(again, { status: 200, body: { ok: true } })
  assert.equal(h.ark.calls.length, before + 3)
})

test('revoke still records revocation when BytePlus deletes fail, and logs the failures', async () => {
  const h = harness()
  const id = String((await h.call('start', { display_name: 'Richie', consent_version: 'v1', owner_kind: 'founder' }, { internal: true })).body.identity_id)
  await h.call('confirm', { nonce: h.nonce() })
  h.ark.deleteGroupError = new Error('ark_unavailable')
  const result = await h.call('revoke', { identity_id: id }, { internal: true })
  assert.deepEqual(result, { status: 200, body: { ok: true } })
  assert.ok(h.store.identities[0].revoked_at)
  assert.equal(h.logs.some((event) => event.event === 'ai_video_identity_group_delete_failed'), true)
  const revoked = h.logs.find((event) => event.event === 'ai_video_identity_revoked')
  assert.equal(revoked?.ark_failures, 1)
})

// ─── gc ──────────────────────────────────────────────────────────────────

test('gc deletes at most 20 candidates per run and skips ones BytePlus refuses', async () => {
  const h = harness()
  const identity = await h.store.insertIdentity({
    owner_kind: 'customer', customer_id: CUSTOMER_A, order_id: ORDER_A, display_name: 'Old',
    verification_status: 'pending', consent_at: T0.toISOString(), consent_text_version: 'v1',
  })
  for (let index = 0; index < 25; index++) {
    h.store.gcRows.push({
      id: uuid(), identity_id: identity.id, asset_id: `stale-asset-${String(index).padStart(6, '0')}`, asset_type: 'Image',
      status: 'active', failed_reason: null, source_path: null, name: 'full_body', last_checked_at: null,
      last_inference_at: null, created_at: T0.toISOString(), deleted_at: null,
    })
  }
  h.store.assets.push(...h.store.gcRows)
  let deleteCalls = 0
  h.ark.deleteAsset = async (input) => {
    deleteCalls += 1
    h.ark.calls.push({ method: 'deleteAsset', input })
    if (input.id === 'stale-asset-000003') throw new Error('ark_unavailable')
  }
  const result = await h.call('gc', {}, { internal: true })
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { deleted: AI_VIDEO_IDENTITY_GC_BATCH - 1 })
  assert.equal(deleteCalls, AI_VIDEO_IDENTITY_GC_BATCH)
  assert.equal(h.store.assets.filter((row) => row.deleted_at !== null).length, AI_VIDEO_IDENTITY_GC_BATCH - 1)
  assert.equal(h.store.assets.find((row) => row.asset_id === 'stale-asset-000003')?.deleted_at, null)
})

// ─── isolation + secrets ─────────────────────────────────────────────────

test('a customer cannot see or touch another customer identity; internal callers can', async () => {
  const h = harness()
  const tokenA = await capability(CUSTOMER_A, ORDER_A)
  const tokenC = await capability(CUSTOMER_C, ORDER_C)
  const id = await verifiedIdentity(h, tokenA)
  const before = h.ark.calls.length
  for (const [action, body] of [
    ['status', { identity_id: id }],
    ['restart', { identity_id: id }],
    ['upload_sign', { identity_id: id, slot: 'full_body', content_type: 'image/jpeg', bytes: 10 }],
    ['register', { identity_id: id, path: `identity/${id}/full_body-00000000-0000-4000-8000-000000000000.jpg`, asset_type: 'Image', slot: 'full_body' }],
    ['revoke', { identity_id: id }],
  ] as Array<[string, Record<string, unknown>]>) {
    const result = await h.call(action, body, { customer: tokenC })
    assert.equal(result.status, 404, `${action} should be 404 for another customer`)
    assert.deepEqual(result.body, { error: 'not_found' })
  }
  assert.equal(h.ark.calls.length, before)
  assert.equal(h.store.identities[0].revoked_at, null)
  const listC = await h.call('list', {}, { customer: tokenC })
  assert.deepEqual(listC.body.identities, [])
  const listA = await h.call('list', {}, { customer: tokenA })
  assert.equal((listA.body.identities as unknown[]).length, 1)

  const internal = await h.call('status', { identity_id: id }, { internal: true })
  assert.equal(internal.status, 200)
  const founderList = await h.call('list', { owner_kind: 'founder' }, { internal: true })
  assert.deepEqual(founderList.body.identities, [])
  const byCustomer = await h.call('list', { customer_id: CUSTOMER_A }, { internal: true })
  assert.equal((byCustomer.body.identities as unknown[]).length, 1)
  assert.deepEqual(byCustomer.body.quota, { remaining_assets: 50, active_assets: 0, asset_limit: 50, groups: 1, group_limit: 50, alert: false })
})

test('customer responses never carry group ids, tokens, nonces, or raw failure text', async () => {
  const h = harness()
  const token = await capability(CUSTOMER_A, ORDER_A)
  const started = await h.call('start', { display_name: 'Richie', consent_version: 'v1' }, { customer: token })
  const nonce = h.nonce()
  const confirmed = await h.call('confirm', { nonce })
  const id = String(started.body.identity_id)
  const signed = await h.call('upload_sign', { identity_id: id, slot: 'full_body', content_type: 'image/jpeg', bytes: 10 }, { customer: token })
  h.store.objects.set(String(signed.body.path), { size: 10, contentType: 'image/jpeg' })
  const registered = await h.call('register', { identity_id: id, path: signed.body.path, asset_type: 'Image', slot: 'full_body' }, { customer: token })
  h.ark.assetStates.set(String((registered.body.asset as Record<string, unknown>).asset_id), { status: 'failed', failedReason: 'FaceMismatch secret-detail' })
  h.now.value = new Date(T0.getTime() + 15_000)
  const status = await h.call('status', { identity_id: id }, { customer: token })
  const list = await h.call('list', {}, { customer: token })
  for (const [label, response] of Object.entries({ started, confirmed, signed, registered, status, list })) {
    const text = JSON.stringify(response.body)
    const leaked = secretsIn(text, ['byted-token', 'secret-detail', nonce])
    assert.deepEqual(leaked, [], `${label} leaked ${leaked.join(', ')}`)
  }
  const view = list.body.identities as Array<Record<string, unknown>>
  assert.deepEqual(Object.keys(view[0]).sort(), ['assets', 'created_at', 'display_name', 'group_ready', 'id', 'owner_kind', 'revoked_at', 'session_expires_at', 'verification_status'])
  const asset = (view[0].assets as Array<Record<string, unknown>>)[0]
  assert.deepEqual(Object.keys(asset).sort(), ['asset_id', 'asset_type', 'created_at', 'id', 'reason_code', 'slot', 'status'])
})
