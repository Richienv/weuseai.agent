// Mock-Ark identity smoke — start → confirm → register → Active → generate
// with asset:// → ModelArk create (no callback_url) → poll succeeded.
//
// No Docker, no BytePlus. Injected fetch + in-memory stores. SQL for this
// lane already lives in scripts/studio-db-smoke.mjs (PGlite).
//
// Run: npx tsx scripts/studio-identity-smoke.mjs

import assert from 'node:assert/strict'
import { tsImport } from 'tsx/esm/api'

const identity = await tsImport('../supabase/functions/_shared/ai-video-identity-handler.ts', import.meta.url)
const generate = await tsImport('../api/_shared/admin-ai-video-generate-handler.ts', import.meta.url)
const runtimeMod = await tsImport('../supabase/functions/_shared/ai-video-operator-runtime.ts', import.meta.url)

const {
  AI_VIDEO_IDENTITY_POLL_INTERVAL_MS,
  createAiVideoIdentityArk,
  handleAiVideoIdentity,
} = identity
const { startAiVideoOperatorGenerate } = generate
const { asOperatorDeliveryJob, createAiVideoOperatorRuntime } = runtimeMod

const ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const INTERNAL_BEARER = 'Bearer service-role-jwt'
const SITE = 'https://www.weuseai.id'
const T0 = new Date('2026-09-14T10:00:00.000Z')
const JOB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const REQUEST_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const GROUP_ID = 'group-20260914100000-abcde'
const ASSET_ID = 'Asset-20260914100001-fghij'
const TASK_ID = 'cgt-identity-smoke-1'
const ARK_ENV = {
  BYTEPLUS_ARK_ACCESS_KEY: 'AKLTTESTACCESSKEY0000000000',
  BYTEPLUS_ARK_SECRET_KEY: 'TESTSECRETKEY00000000000000000000',
}
const READY = { OPERATOR_GENERATE_ENABLED: 'true', MONID_API_KEY: 'monid-key-16chars-ok' }
const MERCHANT_KEY = 'merchant-key-16chars'

function envelope(result) {
  return new Response(JSON.stringify({
    ResponseMetadata: {
      RequestId: '20260914100000000000000000000000',
      Action: 'Test',
      Version: '2024-01-01',
      Service: 'ark',
      Region: 'ap-southeast-1',
    },
    Result: result,
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function createMockBytePlus() {
  const calls = []
  let getAssetHits = 0
  let getTaskHits = 0
  let lastCallbackUrl = null
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url)
    const action = parsed.searchParams.get('Action')
    const method = String(init.method || 'GET').toUpperCase()
    const body = init.body ? JSON.parse(String(init.body)) : null
    calls.push({ host: parsed.hostname, path: parsed.pathname, action, method, body })

    if (parsed.hostname === 'ark.ap-southeast-1.byteplusapi.com') {
      if (action === 'CreateVisualValidateSession') {
        lastCallbackUrl = typeof body?.CallbackURL === 'string' ? body.CallbackURL : null
        return envelope({
          BytedToken: 'byted-token-smoke-abcdefgh',
          H5Link: 'https://h5.byteplus.example/verify?ticket=smoke',
        })
      }
      if (action === 'GetVisualValidateResult') {
        return envelope({ GroupId: GROUP_ID })
      }
      if (action === 'CreateAsset') {
        return envelope({ Id: ASSET_ID })
      }
      if (action === 'GetAsset') {
        getAssetHits += 1
        return envelope({
          Id: body?.Id ?? ASSET_ID,
          GroupId: GROUP_ID,
          AssetType: 'Image',
          Name: 'full_body',
          Status: getAssetHits === 1 ? 'Processing' : 'Active',
        })
      }
      throw new Error(`unexpected Ark Assets action ${action}`)
    }

    if (parsed.hostname === 'ark.ap-southeast.bytepluses.com' && parsed.pathname.startsWith('/api/v3/contents/generations/tasks')) {
      if (method === 'POST' && parsed.pathname === '/api/v3/contents/generations/tasks') {
        return json({ id: TASK_ID })
      }
      if (method === 'GET' && parsed.pathname === `/api/v3/contents/generations/tasks/${TASK_ID}`) {
        getTaskHits += 1
        const status = getTaskHits === 1 ? 'running' : 'succeeded'
        return json({
          id: TASK_ID,
          status,
          model: 'dreamina-seedance-2-5-260628',
          content: status === 'succeeded' ? { video_url: 'https://cdn.byteplus.example/smoke.mp4' } : {},
        })
      }
      throw new Error(`unexpected ModelArk ${method} ${parsed.pathname}`)
    }

    throw new Error(`unexpected fetch ${url}`)
  }
  return {
    fetchImpl,
    calls,
    get lastCallbackUrl() { return lastCallbackUrl },
    get getAssetHits() { return getAssetHits },
    get getTaskHits() { return getTaskHits },
  }
}

function memoryStore(clock) {
  const identities = []
  const assets = []
  const objects = new Map()
  return {
    identities,
    assets,
    objects,
    async findOrder() { return null },
    async listIdentities() { return identities.filter((row) => row.revoked_at === null) },
    async getIdentity(id) { return identities.find((row) => row.id === id) ?? null },
    async findIdentityByNonceHash(hash) { return identities.find((row) => row.callback_nonce_hash === hash) ?? null },
    async insertIdentity(input) {
      const row = {
        id: crypto.randomUUID(),
        group_id: null,
        byted_token_enc: null,
        session_expires_at: null,
        callback_nonce_hash: null,
        callback_result_code: null,
        verification_billed: null,
        created_at: clock().toISOString(),
        revoked_at: null,
        ...input,
      }
      identities.push(row)
      return row
    },
    async updateIdentity(id, patch) {
      const row = identities.find((item) => item.id === id)
      if (!row) throw new Error('not_found')
      Object.assign(row, patch)
      return row
    },
    async insertConsent() {},
    async listAssets(ids) {
      return assets.filter((row) => ids.includes(row.identity_id) && row.deleted_at === null)
    },
    async insertAsset(input) {
      const row = {
        id: crypto.randomUUID(),
        failed_reason: null,
        last_checked_at: null,
        last_inference_at: null,
        created_at: clock().toISOString(),
        deleted_at: null,
        ...input,
      }
      assets.push(row)
      return row
    },
    async updateAsset(id, patch) {
      const row = assets.find((item) => item.id === id)
      if (!row) throw new Error('not_found')
      Object.assign(row, patch)
      return row
    },
    async countAssetsCreatedSince() { return assets.length },
    async quota() {
      return { active_assets: assets.length, groups: 1, asset_limit: 50, group_limit: 50, alert: false }
    },
    async gcCandidates() { return [] },
    async createSignedUploadUrl(path) {
      return { url: `https://stub.supabase.co/storage/v1/object/upload/sign/ai-video-inputs/${path}`, token: 'upload' }
    },
    async statObject(path) { return objects.get(path) ?? null },
    async createSignedDownloadUrl(path) {
      return `https://stub.supabase.co/storage/v1/object/sign/ai-video-inputs/${path}?token=dl`
    },
  }
}

function fakeSupabase(current) {
  return {
    from(table) {
      const chain = {
        select() { return chain },
        update(patch) { Object.assign(current, patch); return chain },
        eq() { return chain },
        is() { return chain },
        in() { return Promise.resolve({ data: null, error: null }) },
        async maybeSingle() { return { data: current, error: null } },
        async single() { return { data: current, error: null } },
      }
      if (table !== 'ai_video_operator_jobs' && table !== 'ai_video_identity_assets') {
        return chain
      }
      return chain
    },
    storage: {
      from() {
        return { createSignedUrl: async (path) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }) }
      },
    },
  }
}

const now = { value: new Date(T0) }
const store = memoryStore(() => now.value)
const mock = createMockBytePlus()
const ark = createAiVideoIdentityArk(() => ARK_ENV, mock.fetchImpl)
const originalFetch = globalThis.fetch
globalThis.fetch = mock.fetchImpl

async function call(action, body = {}) {
  const response = await handleAiVideoIdentity(
    new Request('https://fn.test/ai-video-identity', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: INTERNAL_BEARER },
      body: JSON.stringify({ action, ...body }),
    }),
    {
      capabilityKey: 'identity-lane-smoke-capability-key-0123456789abcdef',
      encryptionKey: ENCRYPTION_KEY,
      siteOrigin: SITE,
      store,
      ark,
      isInternalCaller: (req) => req.headers.get('authorization') === INTERNAL_BEARER,
      now: () => now.value,
    },
  )
  const parsed = await response.json()
  assert.ok(response.ok, `${action} ${response.status} ${JSON.stringify(parsed)}`)
  return parsed
}

try {
  const started = await call('start', { display_name: 'Richie', consent_version: 'v1', owner_kind: 'founder' })
  assert.equal(typeof started.identity_id, 'string')
  assert.match(started.h5_link, /^https:\/\/h5\.byteplus\.example\/verify\?ticket=smoke/)
  assert.ok(mock.lastCallbackUrl, 'CreateVisualValidateSession must receive a CallbackURL')
  const nonce = new URL(mock.lastCallbackUrl).searchParams.get('n')
  assert.match(nonce ?? '', /^[A-Za-z0-9_-]{43}$/)

  const confirmed = await call('confirm', { nonce })
  assert.equal(confirmed.verification_status, 'verified')
  assert.equal(confirmed.identity_id, started.identity_id)
  assert.equal(store.identities[0].group_id, GROUP_ID)

  const signed = await call('upload_sign', {
    identity_id: started.identity_id,
    slot: 'full_body',
    content_type: 'image/jpeg',
    bytes: 1200,
  })
  store.objects.set(signed.path, { size: 1200, contentType: 'image/jpeg' })

  const registered = await call('register', {
    identity_id: started.identity_id,
    path: signed.path,
    asset_type: 'Image',
    slot: 'full_body',
  })
  assert.equal(registered.asset.asset_id, ASSET_ID)
  assert.equal(registered.asset.status, 'processing')

  const processing = await call('status', { identity_id: started.identity_id })
  assert.equal(processing.identity.assets[0].status, 'processing')
  now.value = new Date(now.value.getTime() + AI_VIDEO_IDENTITY_POLL_INTERVAL_MS + 1)
  const active = await call('status', { identity_id: started.identity_id })
  assert.equal(active.identity.assets[0].status, 'active')
  assert.equal(active.identity.assets[0].asset_id, ASSET_ID)
  assert.equal(mock.getAssetHits, 2)

  const assetRef = `asset://${ASSET_ID}`
  let queued = null
  const generated = await startAiVideoOperatorGenerate({
    prompt_mode: 'simple',
    prompt: 'Richie melambai ke kamera',
    model: 'seedance-2.5',
    duration_seconds: 6,
    ratio: '9:16',
    resolution: '1080p',
    client_request_id: REQUEST_ID,
    ref_urls: [assetRef],
    ref_roles: ['reference_image'],
  }, {
    countInflight: async () => 0,
    findOrderByTid: async () => null,
    findIdentityAssets: async (ids) => store.assets
      .filter((row) => ids.includes(row.asset_id) && row.deleted_at === null)
      .map((row) => {
        const identityRow = store.identities.find((item) => item.id === row.identity_id)
        return {
          assetId: row.asset_id,
          assetType: row.asset_type,
          status: row.status,
          deletedAt: row.deleted_at,
          identity: {
            id: identityRow.id,
            ownerKind: identityRow.owner_kind,
            customerId: identityRow.customer_id,
            orderId: identityRow.order_id,
            verificationStatus: identityRow.verification_status,
            revokedAt: identityRow.revoked_at,
          },
        }
      }),
    createQueued: async (input) => {
      queued = {
        id: JOB_ID,
        clientRequestId: input.clientRequestId,
        provider: input.provider,
        orderId: input.orderId,
        exampleId: input.exampleId,
        prompt: input.prompt,
        lesson: input.lesson,
        libraryId: input.libraryId,
        ratio: input.ratio,
        durationSeconds: input.durationSeconds,
        generateAudio: input.generateAudio,
        resolution: input.resolution,
        status: 'queued',
        providerModelId: input.model,
        providerTaskId: null,
        providerVideoUrl: null,
        resultPath: null,
        attempt: 0,
        errorCode: null,
        usage: {},
        refPaths: input.refPaths,
        refUrls: input.refUrls,
        refRoles: input.refRoles,
        createdAt: now.value.toISOString(),
        updatedAt: now.value.toISOString(),
      }
      return queued
    },
    getJob: async () => queued,
    listJobs: async () => queued ? [queued] : [],
    cancelJob: async () => queued,
    signUpload: async () => { throw new Error('asset refs are not storage paths') },
    kickWorker: async () => undefined,
  }, READY)

  assert.equal(generated.ok, true, JSON.stringify(generated))
  assert.equal(generated.job.provider, 'byteplus_modelark')
  assert.deepEqual(generated.job.ref_urls ?? queued.refUrls, [assetRef])
  assert.equal(queued.provider, 'byteplus_modelark')
  assert.equal(queued.resolution, '1080p')

  const row = {
    id: JOB_ID,
    status: 'queued',
    prompt: queued.prompt,
    ratio: queued.ratio,
    duration_seconds: queued.durationSeconds,
    generate_audio: queued.generateAudio,
    resolution: queued.resolution,
    provider: 'byteplus_modelark',
    provider_model_id: 'seedance-2.5',
    provider_task_id: null,
    ref_urls: queued.refUrls,
    ref_paths: [],
    ref_roles: queued.refRoles,
    usage: {},
    result_path: null,
    attempt: 0,
  }
  const runtime = createAiVideoOperatorRuntime({
    supabase: fakeSupabase(row),
    apiKey: READY.MONID_API_KEY,
    modelArkApiKey: MERCHANT_KEY,
  })
  const created = await runtime.submit(asOperatorDeliveryJob(row))
  assert.deepEqual(created, { id: TASK_ID })
  const createCall = mock.calls.find((call) => call.host === 'ark.ap-southeast.bytepluses.com' && call.method === 'POST')
  assert.ok(createCall, 'ModelArk create missing')
  assert.equal('callback_url' in createCall.body, false, 'identity jobs must not send callback_url')
  assert.equal(createCall.body.resolution, '1080p')
  assert.deepEqual(createCall.body.content[1], {
    type: 'image_url',
    image_url: { url: assetRef },
    role: 'reference_image',
  })

  const firstPoll = await runtime.getAuthoritativeTask(asOperatorDeliveryJob({
    ...row,
    provider_task_id: TASK_ID,
  }))
  assert.equal(firstPoll.status, 'running')
  const secondPoll = await runtime.getAuthoritativeTask(asOperatorDeliveryJob({
    ...row,
    provider_task_id: TASK_ID,
  }))
  assert.equal(secondPoll.status, 'succeeded')
  assert.equal(secondPoll.videoUrl, 'https://cdn.byteplus.example/smoke.mp4')
  assert.equal(mock.getTaskHits, 2)

  const hosts = [...new Set(mock.calls.map((call) => call.host))].sort()
  assert.deepEqual(hosts, ['ark.ap-southeast-1.byteplusapi.com', 'ark.ap-southeast.bytepluses.com'])

  console.log('Passed: mock Ark start → confirm → register → Active → generate asset:// → ModelArk create (no callback_url) → poll succeeded.')
} finally {
  globalThis.fetch = originalFetch
}
