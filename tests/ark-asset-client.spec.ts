import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  ARK_ASSET_URI_RE as apiArkAssetUriRe,
  arkAssetIdFromUri as apiArkAssetIdFromUri,
  isArkAssetUri as apiIsArkAssetUri,
  signArkRequest as apiSignArkRequest,
} from '../api/_shared/ark-asset-client.ts'
import {
  ARK_ASSET_HOST,
  ARK_ASSET_URI_RE,
  arkAssetIdFromUri,
  arkAssetRequest,
  createAsset,
  createVisualValidateSession,
  deleteAsset,
  deleteAssetGroup,
  formatArkDate,
  getAsset,
  getVisualValidateResult,
  isArkAssetUri,
  listAssets,
  mapArkError,
  presentArkAsset,
  resolveArkAssetConfig,
  signArkRequest,
  type ArkAssetConfig,
} from '../supabase/functions/_shared/ark-asset-client.ts'

// Fixed vector, cross-checked against an independent node:crypto implementation of
// volc-openapi-demos/signature/python/sign.py (same inputs, same output).
const VECTOR = {
  accessKey: 'AKLTTESTACCESSKEY0000000000',
  secretKey: 'TESTSECRETKEY00000000000000000000',
  host: ARK_ASSET_HOST,
  region: 'ap-southeast-1',
  service: 'ark',
  query: { Version: '2024-01-01', Action: 'CreateAsset' },
  body: '{"GroupId":"group-20260328000000-abcde","URL":"https://example.com/image.jpg","AssetType":"Image","ProjectName":"default"}',
  date: new Date('2026-03-28T00:00:00.000Z'),
}
const VECTOR_PAYLOAD_SHA256 = 'b5a2dd4e8b0e2c8ad51f65ab2abffe3969e532308b3a9cf9862cf8e7b71808cb'
const VECTOR_CANONICAL_SHA256 = '151c2e359d943784b1a3b956b66b749614eef7ac7ed4a8c68eff4a557f67a20a'
const VECTOR_SIGNATURE = '29dee2fa94d134bfe1686ba080b91a264fb33f4aad7bd7493d994ec1cd341167'

const ENV = {
  BYTEPLUS_ARK_ACCESS_KEY: VECTOR.accessKey,
  BYTEPLUS_ARK_SECRET_KEY: VECTOR.secretKey,
}
const CONFIG: ArkAssetConfig = resolveArkAssetConfig(ENV)
const FIXED_NOW = () => new Date('2026-09-14T10:00:00.000Z')
const GROUP_ID = 'group-20260914100000-abcde'
const ASSET_ID = 'Asset-20260914100001-fghij'

type Captured = { url: string; init: RequestInit; body: Record<string, unknown> }

function envelope(result: unknown, status = 200, error?: { Code: string; Message?: string }): Response {
  const metadata: Record<string, unknown> = {
    RequestId: '20260914100000000000000000000000',
    Action: 'Test',
    Version: '2024-01-01',
    Service: 'ark',
    Region: 'ap-southeast-1',
  }
  if (error) metadata.Error = error
  return new Response(JSON.stringify({ ResponseMetadata: metadata, Result: result }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function capture(reply: Response | ((captured: Captured) => Response)) {
  const calls: Captured[] = []
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const captured: Captured = { url, init: init ?? {}, body: JSON.parse(String(init?.body)) as Record<string, unknown> }
    calls.push(captured)
    return typeof reply === 'function' ? reply(captured) : reply
  }
  return { calls, fetchImpl }
}

test('signer reproduces the fixed Volcengine HMAC-SHA256 vector', async () => {
  const signed = await signArkRequest(VECTOR)
  assert.equal(signed.url, 'https://ark.ap-southeast-1.byteplusapi.com/?Action=CreateAsset&Version=2024-01-01')
  assert.equal(signed.method, 'POST')
  assert.equal(signed.headers.Host, ARK_ASSET_HOST)
  assert.equal(signed.headers['Content-Type'], 'application/json')
  assert.equal(signed.headers['X-Date'], '20260328T000000Z')
  assert.equal(signed.headers['X-Content-Sha256'], VECTOR_PAYLOAD_SHA256)
  assert.equal(
    signed.headers.Authorization,
    `HMAC-SHA256 Credential=${VECTOR.accessKey}/20260328/ap-southeast-1/ark/request, SignedHeaders=content-type;host;x-content-sha256;x-date, Signature=${VECTOR_SIGNATURE}`,
  )
  assert.equal(signed.canonicalRequest, [
    'POST',
    '/',
    'Action=CreateAsset&Version=2024-01-01',
    'content-type:application/json',
    `host:${ARK_ASSET_HOST}`,
    `x-content-sha256:${VECTOR_PAYLOAD_SHA256}`,
    'x-date:20260328T000000Z',
    '',
    'content-type;host;x-content-sha256;x-date',
    VECTOR_PAYLOAD_SHA256,
  ].join('\n'))
  assert.equal(signed.stringToSign, `HMAC-SHA256\n20260328T000000Z\n20260328/ap-southeast-1/ark/request\n${VECTOR_CANONICAL_SHA256}`)
  // The secret never appears in any output field.
  assert.equal(JSON.stringify(signed).includes(VECTOR.secretKey), false)
  // Node twin produces the same bytes.
  const viaApi = await apiSignArkRequest(VECTOR)
  assert.deepEqual(viaApi, signed)
})

test('signer sorts the query, RFC3986-encodes it, and pins the date format', async () => {
  const signed = await signArkRequest({ ...VECTOR, query: { Version: '2024-01-01', Action: 'ListAssets', 'x y': "a*b'c" } })
  assert.equal(signed.url, `https://${ARK_ASSET_HOST}/?Action=ListAssets&Version=2024-01-01&x%20y=a%2Ab%27c`)
  assert.equal(formatArkDate(new Date('2026-12-31T23:59:59.999Z')), '20261231T235959Z')
  assert.throws(() => formatArkDate(new Date('nope')), /invalid_ark_sign_date/)
  await assert.rejects(() => signArkRequest({ ...VECTOR, host: 'evil.example/..' }), /invalid_ark_asset_host/)
  await assert.rejects(() => signArkRequest({ ...VECTOR, path: '/other' }), /invalid_ark_sign_path/)
})

test('config resolver allowlists the single Assets API host and requires AK/SK', () => {
  assert.equal(CONFIG.host, 'ark.ap-southeast-1.byteplusapi.com')
  assert.equal(CONFIG.region, 'ap-southeast-1')
  assert.equal(CONFIG.service, 'ark')
  assert.equal(CONFIG.projectName, 'default')
  assert.equal(resolveArkAssetConfig({ ...ENV, MODELARK_ASSET_HOST: 'https://ark.ap-southeast-1.byteplusapi.com/' }).host, ARK_ASSET_HOST)
  assert.equal(resolveArkAssetConfig({ ...ENV, MODELARK_ASSET_HOST: ' ARK.ap-southeast-1.byteplusapi.com ' }).host, ARK_ASSET_HOST)
  assert.equal(resolveArkAssetConfig(ENV, { projectName: 'studio' }).projectName, 'studio')
  assert.throws(() => resolveArkAssetConfig({ ...ENV, MODELARK_ASSET_HOST: 'ark.cn-beijing.volcengineapi.com' }), /invalid_ark_asset_host/)
  assert.throws(() => resolveArkAssetConfig({ ...ENV, MODELARK_ASSET_HOST: 'http://ark.ap-southeast-1.byteplusapi.com' }), /invalid_ark_asset_host/)
  assert.throws(() => resolveArkAssetConfig({ ...ENV, MODELARK_ASSET_HOST: 'https://ark.ap-southeast-1.byteplusapi.com/api' }), /invalid_ark_asset_host/)
  assert.throws(() => resolveArkAssetConfig({ ...ENV, MODELARK_ASSET_HOST: 'ark.ap-southeast-1.byteplusapi.com.evil.example' }), /invalid_ark_asset_host/)
  assert.throws(() => resolveArkAssetConfig({ BYTEPLUS_ARK_ACCESS_KEY: VECTOR.accessKey }), /missing_ark_asset_credentials/)
  assert.throws(() => resolveArkAssetConfig({}), /missing_ark_asset_credentials/)
  assert.throws(() => resolveArkAssetConfig(ENV, { projectName: 'bad name!' }), /invalid_ark_project_name/)
})

test('asset:// helpers are exact and shared by both twins', () => {
  assert.equal(String(ARK_ASSET_URI_RE), String(apiArkAssetUriRe))
  assert.equal(isArkAssetUri(`asset://${ASSET_ID}`), true)
  assert.equal(apiIsArkAssetUri(`asset://${ASSET_ID}`), true)
  assert.equal(isArkAssetUri('asset://short'), false)
  assert.equal(isArkAssetUri('asset://has space-0000000'), false)
  assert.equal(isArkAssetUri('asset://../../etc/passwd'), false)
  assert.equal(isArkAssetUri(`https://files.example/${ASSET_ID}`), false)
  assert.equal(isArkAssetUri(`asset://${'a'.repeat(121)}`), false)
  assert.equal(isArkAssetUri(null), false)
  assert.equal(arkAssetIdFromUri(`asset://${ASSET_ID}`), ASSET_ID)
  assert.equal(apiArkAssetIdFromUri(`asset://${ASSET_ID}`), ASSET_ID)
  assert.throws(() => arkAssetIdFromUri('https://files.example/x.jpg'), /invalid_ark_asset_uri/)
})

test('createVisualValidateSession posts CallbackURL and returns token + H5 link', async () => {
  const { calls, fetchImpl } = capture(envelope({
    BytedToken: '2026070223064318B4CC874F89ABCDEF',
    H5Link: 'https://www.byteplus.com/en/liveness-face-manage/authorization?pl=abc&uid=def',
    CallbackURL: 'https://weuseai.id/ai-video-identity.html?stage=callback&n=nonce1',
  }))
  const session = await createVisualValidateSession(
    { callbackUrl: 'https://weuseai.id/ai-video-identity.html?stage=callback&n=nonce1' }, CONFIG, fetchImpl, FIXED_NOW,
  )
  assert.equal(session.bytedToken, '2026070223064318B4CC874F89ABCDEF')
  assert.match(session.h5Link, /^https:\/\/www\.byteplus\.com\//)
  assert.equal(session.callbackUrl, 'https://weuseai.id/ai-video-identity.html?stage=callback&n=nonce1')
  const [call] = calls
  assert.equal(call.url, `https://${ARK_ASSET_HOST}/?Action=CreateVisualValidateSession&Version=2024-01-01`)
  assert.equal(call.init.method, 'POST')
  assert.deepEqual(call.body, {
    CallbackURL: 'https://weuseai.id/ai-video-identity.html?stage=callback&n=nonce1',
    ProjectName: 'default',
  })
  const headers = call.init.headers as Record<string, string>
  assert.equal(headers['X-Date'], '20260914T100000Z')
  assert.match(headers.Authorization, /^HMAC-SHA256 Credential=AKLTTESTACCESSKEY0000000000\/20260914\/ap-southeast-1\/ark\/request, SignedHeaders=content-type;host;x-content-sha256;x-date, Signature=[0-9a-f]{64}$/)
  assert.equal(headers['Content-Type'], 'application/json')
  assert.match(headers['X-Content-Sha256'], /^[0-9a-f]{64}$/)
  await assert.rejects(() => createVisualValidateSession({ callbackUrl: 'http://weuseai.id/cb' }, CONFIG, fetchImpl), /invalid_ark_callback_url/)
  await assert.rejects(
    () => createVisualValidateSession({ callbackUrl: 'https://weuseai.id/cb' }, CONFIG, async () => envelope({ H5Link: 'https://x.example' })),
    /ark_invalid_response/,
  )
})

test('getVisualValidateResult returns the group id or null while pending', async () => {
  const { calls, fetchImpl } = capture(envelope({ GroupId: GROUP_ID }))
  const ready = await getVisualValidateResult({ bytedToken: 'vvs-20240514212750-c8f2p' }, CONFIG, fetchImpl)
  assert.deepEqual(ready, { groupId: GROUP_ID })
  assert.equal(calls[0].url, `https://${ARK_ASSET_HOST}/?Action=GetVisualValidateResult&Version=2024-01-01`)
  assert.deepEqual(calls[0].body, { BytedToken: 'vvs-20240514212750-c8f2p', ProjectName: 'default' })
  const pending = await getVisualValidateResult({ bytedToken: 'vvs-20240514212750-c8f2p' }, CONFIG, async () => envelope({}))
  assert.deepEqual(pending, { groupId: null })
  await assert.rejects(() => getVisualValidateResult({ bytedToken: 'short' }, CONFIG, fetchImpl), /invalid_ark_byted_token/)
  await assert.rejects(
    () => getVisualValidateResult({ bytedToken: 'vvs-20240514212750-c8f2p' }, CONFIG, async () => envelope({ GroupId: 'bad id!' })),
    /ark_invalid_response/,
  )
})

test('createAsset sends GroupId/URL/AssetType and never a Moderation field', async () => {
  const { calls, fetchImpl } = capture(envelope({ Id: ASSET_ID }))
  const created = await createAsset({
    groupId: GROUP_ID,
    url: 'https://files.example/signed/richie-front.jpg?token=abc',
    assetType: 'Image',
    name: '  Richie front  ',
  }, CONFIG, fetchImpl)
  assert.deepEqual(created, { id: ASSET_ID })
  assert.equal(calls[0].url, `https://${ARK_ASSET_HOST}/?Action=CreateAsset&Version=2024-01-01`)
  assert.deepEqual(calls[0].body, {
    GroupId: GROUP_ID,
    URL: 'https://files.example/signed/richie-front.jpg?token=abc',
    AssetType: 'Image',
    Name: 'Richie front',
    ProjectName: 'default',
  })
  assert.equal('Moderation' in calls[0].body, false)
  const { calls: noName, fetchImpl: noNameFetch } = capture(envelope({ Id: ASSET_ID }))
  await createAsset({ groupId: GROUP_ID, url: 'https://files.example/voice.mp3', assetType: 'Audio' }, CONFIG, noNameFetch)
  assert.equal('Name' in noName[0].body, false)
  assert.equal(noName[0].body.AssetType, 'Audio')
  await assert.rejects(() => createAsset({ groupId: 'nope', url: 'https://f.example/a.jpg', assetType: 'Image' }, CONFIG, fetchImpl), /invalid_ark_group_id/)
  await assert.rejects(() => createAsset({ groupId: GROUP_ID, url: 'http://f.example/a.jpg', assetType: 'Image' }, CONFIG, fetchImpl), /invalid_ark_asset_url/)
  await assert.rejects(() => createAsset({ groupId: GROUP_ID, url: `asset://${ASSET_ID}`, assetType: 'Image' }, CONFIG, fetchImpl), /invalid_ark_asset_url/)
  await assert.rejects(
    () => createAsset({ groupId: GROUP_ID, url: 'https://f.example/a.jpg', assetType: 'Gif' as unknown as 'Image' }, CONFIG, fetchImpl),
    /invalid_ark_asset_type/,
  )
  await assert.rejects(
    () => createAsset({ groupId: GROUP_ID, url: 'https://f.example/a.jpg', assetType: 'Image' }, CONFIG, async () => envelope({ Id: 'x' })),
    /ark_invalid_response/,
  )
})

test('getAsset maps Processing/Active/Failed and surfaces the failure code', async () => {
  const { calls, fetchImpl } = capture(envelope({
    Id: ASSET_ID,
    Name: 'test',
    URL: 'https://example.com/asset-url',
    AssetType: 'Image',
    GroupId: GROUP_ID,
    Status: 'Active',
    Moderation: { Strategy: 'Default' },
    CreateTime: '2026-03-28T00:00:00Z',
    UpdateTime: '2026-03-28T00:00:00Z',
    LastInferenceTime: '2026-07-24T10:08:49+08:00',
    ProjectName: 'default',
  }))
  const active = await getAsset({ id: ASSET_ID }, CONFIG, fetchImpl)
  assert.equal(calls[0].url, `https://${ARK_ASSET_HOST}/?Action=GetAsset&Version=2024-01-01`)
  assert.deepEqual(calls[0].body, { Id: ASSET_ID, ProjectName: 'default' })
  assert.deepEqual(active, {
    id: ASSET_ID,
    groupId: GROUP_ID,
    assetType: 'Image',
    name: 'test',
    status: 'active',
    failedReason: null,
    url: 'https://example.com/asset-url',
    lastInferenceTime: '2026-07-24T10:08:49+08:00',
  })
  const processing = await getAsset({ id: ASSET_ID }, CONFIG, async () => envelope({ Id: ASSET_ID, GroupId: GROUP_ID, Status: 'Processing' }))
  assert.equal(processing.status, 'processing')
  assert.equal(processing.failedReason, null)
  assert.equal(processing.url, null)
  const failed = await getAsset({ id: ASSET_ID }, CONFIG, async () => envelope({
    Id: ASSET_ID, GroupId: GROUP_ID, Status: 'Failed',
    Error: { Code: 'FaceMismatch', Message: 'Uploaded face does not match the verified person' },
  }))
  assert.equal(failed.status, 'failed')
  assert.equal(failed.failedReason, 'FaceMismatch')
  const failedNoCode = presentArkAsset({ Id: ASSET_ID, GroupId: GROUP_ID, Status: 'Failed', Error: { Message: 'multiple faces' } })
  assert.equal(failedNoCode.failedReason, 'multiple faces')
  assert.equal(presentArkAsset({ Id: ASSET_ID, GroupId: GROUP_ID, Status: 'Failed' }).failedReason, 'unknown')
  assert.throws(() => presentArkAsset({ Id: ASSET_ID, GroupId: GROUP_ID, Status: 'Weird' }), /ark_invalid_response/)
  assert.throws(() => presentArkAsset({ Id: 'x', Status: 'Active' }), /ark_invalid_response/)
  await assert.rejects(() => getAsset({ id: 'bad id' }, CONFIG, fetchImpl), /invalid_ark_asset_id/)
})

test('listAssets requires a GroupType, maps statuses both ways, and pages', async () => {
  const { calls, fetchImpl } = capture(envelope({
    Items: [
      { Id: ASSET_ID, GroupId: GROUP_ID, AssetType: 'Image', Status: 'Active', URL: 'https://example.com/a' },
      { Id: 'Asset-20260914100002-klmno', GroupId: GROUP_ID, AssetType: 'Audio', Status: 'Failed', Error: { Code: 'AudioTooShort' } },
    ],
    TotalCount: 2,
    PageNumber: 1,
    PageSize: 20,
  }))
  const page = await listAssets({ groupIds: [GROUP_ID], statuses: ['active', 'failed'], pageSize: 20 }, CONFIG, fetchImpl)
  assert.equal(calls[0].url, `https://${ARK_ASSET_HOST}/?Action=ListAssets&Version=2024-01-01`)
  assert.deepEqual(calls[0].body, {
    Filter: { GroupType: 'LivenessFace', GroupIds: [GROUP_ID], Statuses: ['Active', 'Failed'] },
    PageNumber: 1,
    PageSize: 20,
    ProjectName: 'default',
  })
  assert.equal(page.totalCount, 2)
  assert.equal(page.pageNumber, 1)
  assert.equal(page.pageSize, 20)
  assert.equal(page.items.length, 2)
  assert.equal(page.items[0].status, 'active')
  assert.equal(page.items[1].status, 'failed')
  assert.equal(page.items[1].failedReason, 'AudioTooShort')
  assert.equal(page.items[1].assetType, 'Audio')
  const { calls: aigc, fetchImpl: aigcFetch } = capture(envelope({ Items: [] }))
  const empty = await listAssets({ groupType: 'AIGC' }, CONFIG, aigcFetch)
  assert.deepEqual(aigc[0].body, { Filter: { GroupType: 'AIGC' }, PageNumber: 1, PageSize: 50, ProjectName: 'default' })
  assert.deepEqual(empty, { items: [], totalCount: null, pageNumber: 1, pageSize: 50 })
  await assert.rejects(() => listAssets({ groupType: 'Other' as unknown as 'AIGC' }, CONFIG, fetchImpl), /invalid_ark_group_type/)
  await assert.rejects(() => listAssets({ groupIds: ['bad id'] }, CONFIG, fetchImpl), /invalid_ark_group_id/)
  await assert.rejects(() => listAssets({ pageSize: 0 }, CONFIG, fetchImpl), /invalid_ark_page/)
  await assert.rejects(() => listAssets({ pageSize: 101 }, CONFIG, fetchImpl), /invalid_ark_page/)
  await assert.rejects(() => listAssets({ pageNumber: 1.5 }, CONFIG, fetchImpl), /invalid_ark_page/)
})

test('deleteAsset and deleteAssetGroup post only the Id', async () => {
  const { calls, fetchImpl } = capture(() => envelope({}))
  await deleteAsset({ id: ASSET_ID }, CONFIG, fetchImpl)
  await deleteAssetGroup({ id: GROUP_ID }, CONFIG, fetchImpl)
  assert.equal(calls[0].url, `https://${ARK_ASSET_HOST}/?Action=DeleteAsset&Version=2024-01-01`)
  assert.deepEqual(calls[0].body, { Id: ASSET_ID, ProjectName: 'default' })
  assert.equal(calls[1].url, `https://${ARK_ASSET_HOST}/?Action=DeleteAssetGroup&Version=2024-01-01`)
  assert.deepEqual(calls[1].body, { Id: GROUP_ID, ProjectName: 'default' })
  await assert.rejects(() => deleteAsset({ id: 'x' }, CONFIG, fetchImpl), /invalid_ark_asset_id/)
  await assert.rejects(() => deleteAssetGroup({ id: '../x' }, CONFIG, fetchImpl), /invalid_ark_group_id/)
})

test('upstream errors map to stable ark_* codes from status and Error.Code', async () => {
  assert.equal(mapArkError(401, null), 'ark_unauthorized')
  assert.equal(mapArkError(403, 'AccessDenied'), 'ark_unauthorized')
  assert.equal(mapArkError(400, 'SignatureDoesNotMatch'), 'ark_unauthorized')
  assert.equal(mapArkError(400, 'InvalidAccessKey'), 'ark_unauthorized')
  assert.equal(mapArkError(429, null), 'ark_rate_limited')
  assert.equal(mapArkError(400, 'QuotaExceeded.QPM'), 'ark_rate_limited')
  assert.equal(mapArkError(400, 'RequestLimitExceeded'), 'ark_rate_limited')
  assert.equal(mapArkError(400, 'QuotaExceeded'), 'ark_quota_exceeded')
  assert.equal(mapArkError(400, 'AssetGroupLimitExceeded'), 'ark_quota_exceeded')
  assert.equal(mapArkError(400, 'AccountOverdueError'), 'ark_quota_exceeded')
  assert.equal(mapArkError(400, 'InvalidParameter.URL'), 'ark_invalid_request')
  assert.equal(mapArkError(404, 'ResourceNotFound'), 'ark_invalid_request')
  assert.equal(mapArkError(500, null), 'ark_unavailable')
  assert.equal(mapArkError(503, 'ServiceUnavailable'), 'ark_unavailable')
  assert.equal(mapArkError(0, null), 'ark_unavailable')

  const errored = (status: number, code: string) => async () => envelope({}, status, { Code: code, Message: 'x' })
  await assert.rejects(() => getAsset({ id: ASSET_ID }, CONFIG, errored(403, 'AccessDenied')), /^Error: ark_unauthorized$/)
  await assert.rejects(() => getAsset({ id: ASSET_ID }, CONFIG, errored(429, 'QuotaExceeded.QPM')), /^Error: ark_rate_limited$/)
  await assert.rejects(() => getAsset({ id: ASSET_ID }, CONFIG, errored(400, 'QuotaExceeded')), /^Error: ark_quota_exceeded$/)
  await assert.rejects(() => getAsset({ id: ASSET_ID }, CONFIG, errored(400, 'InvalidParameter')), /^Error: ark_invalid_request$/)
  // Error inside a 200 envelope still counts.
  await assert.rejects(() => getAsset({ id: ASSET_ID }, CONFIG, errored(200, 'InvalidParameter')), /^Error: ark_invalid_request$/)
  // Non-JSON 5xx, network failure, and non-JSON 200.
  await assert.rejects(() => getAsset({ id: ASSET_ID }, CONFIG, async () => new Response('gateway', { status: 502 })), /^Error: ark_unavailable$/)
  await assert.rejects(() => getAsset({ id: ASSET_ID }, CONFIG, async () => { throw new TypeError('fetch failed') }), /^Error: ark_unavailable$/)
  await assert.rejects(() => getAsset({ id: ASSET_ID }, CONFIG, async () => new Response('<html>', { status: 200 })), /^Error: ark_invalid_response$/)
  await assert.rejects(() => getAsset({ id: ASSET_ID }, CONFIG, async () => new Response('[]', { status: 200 })), /^Error: ark_invalid_response$/)
  // Error messages carry codes only, never secrets or tokens.
  try {
    await getVisualValidateResult({ bytedToken: 'vvs-secret-token-value' }, CONFIG, errored(403, 'AccessDenied'))
    assert.fail('expected rejection')
  } catch (error) {
    const message = (error as Error).message
    assert.equal(message, 'ark_unauthorized')
    assert.equal(message.includes('vvs-secret-token-value'), false)
    assert.equal(message.includes(VECTOR.secretKey), false)
  }
})

test('arkAssetRequest signs with the configured credentials and stamps ProjectName', async () => {
  const { calls, fetchImpl } = capture(envelope({ ok: true }))
  const result = await arkAssetRequest('ListAssetGroups', { Filter: { GroupType: 'LivenessFace' } }, {
    ...CONFIG, projectName: 'studio',
  }, fetchImpl, FIXED_NOW)
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(calls[0].body, { Filter: { GroupType: 'LivenessFace' }, ProjectName: 'studio' })
  const headers = calls[0].init.headers as Record<string, string>
  const expected = await signArkRequest({
    accessKey: CONFIG.accessKey,
    secretKey: CONFIG.secretKey,
    host: CONFIG.host,
    region: CONFIG.region,
    service: CONFIG.service,
    query: { Action: 'ListAssetGroups', Version: '2024-01-01' },
    body: String(calls[0].init.body),
    date: FIXED_NOW(),
  })
  assert.equal(headers.Authorization, expected.headers.Authorization)
  assert.equal(headers['X-Content-Sha256'], expected.headers['X-Content-Sha256'])
  assert.ok(calls[0].init.signal instanceof AbortSignal)
  await assert.rejects(() => arkAssetRequest('Bad Action', {}, CONFIG, fetchImpl), /invalid_ark_action/)
})

test('api and supabase ark-asset-client twins stay byte-identical', () => {
  const api = readFileSync(new URL('../api/_shared/ark-asset-client.ts', import.meta.url), 'utf8')
  const edge = readFileSync(new URL('../supabase/functions/_shared/ark-asset-client.ts', import.meta.url), 'utf8')
  assert.equal(api, edge)
  // Self-contained on purpose: no local imports means no .js/.ts suffix drift between runtimes.
  assert.equal(/^import\s/m.test(api), false)
  assert.equal(/console\./.test(api), false)
})
