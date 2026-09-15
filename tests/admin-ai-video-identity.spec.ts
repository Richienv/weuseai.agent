/**
 * Admin proxy for the verified identity lane (founder Karakter panel).
 *
 * Source: api/_shared/admin-ai-video-identity.ts, wired into
 * api/admin/customer-action.ts. Pins action registration, the proxy
 * body/header shape, and the response mapping. No network.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  AI_VIDEO_IDENTITY_ADMIN_ACTIONS,
  buildAiVideoIdentityProxyRequest,
  functionActionFor,
  isAiVideoIdentityAdminAction,
  proxyAiVideoIdentityAction,
} from '../api/_shared/admin-ai-video-identity.ts'
import {
  listAiVideoIdentitiesForPicker,
  presentAiVideoIdentityPicker,
  type AiVideoIdentityReadRow,
} from '../api/_shared/admin-ai-video-identity-read.ts'

const ENV = { functionsUrl: 'https://proj.supabase.co/functions/v1/', serviceKey: 'sb_secret_test_key' }

const customerAction = readFileSync(new URL('../api/admin/customer-action.ts', import.meta.url), 'utf8')
const panelHtml = readFileSync(new URL('../admin/ai-video-influencers.html', import.meta.url), 'utf8')
const panelJs = readFileSync(new URL('../admin/assets/ai-video-karakter.js', import.meta.url), 'utf8')
const adminShared = readFileSync(new URL('../admin/assets/admin-shared.js', import.meta.url), 'utf8')
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
const configToml = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8')
const customerData = readFileSync(new URL('../api/admin/customer-data.ts', import.meta.url), 'utf8')

const CONTRACT_ACTIONS = [
  'ai_video_identity_list',
  'ai_video_identity_start',
  'ai_video_identity_restart',
  'ai_video_identity_upload_sign',
  'ai_video_identity_register',
  'ai_video_identity_status',
  'ai_video_identity_revoke',
] as const

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// ---------------------------------------------------------------------------
// Action registration
// ---------------------------------------------------------------------------

test('every contract action is registered, plus quota; gc is never exposed to the admin cookie', () => {
  for (const action of CONTRACT_ACTIONS) {
    assert.ok(isAiVideoIdentityAdminAction(action), `${action} must be an admin action`)
  }
  assert.ok(isAiVideoIdentityAdminAction('ai_video_identity_quota'))
  assert.equal(isAiVideoIdentityAdminAction('ai_video_identity_gc'), false)
  assert.equal(isAiVideoIdentityAdminAction('ai_video_identity_confirm'), false)
  assert.equal(isAiVideoIdentityAdminAction('manual_provision'), false)
  assert.equal(isAiVideoIdentityAdminAction(undefined), false)
  assert.equal(isAiVideoIdentityAdminAction(42), false)
  assert.equal(AI_VIDEO_IDENTITY_ADMIN_ACTIONS.length, CONTRACT_ACTIONS.length + 1)
})

test('customer-action.ts spreads the identity actions into ACTIONS and dispatches them through the proxy', () => {
  assert.match(customerAction, /\.\.\.AI_VIDEO_IDENTITY_ADMIN_ACTIONS,/)
  assert.match(customerAction, /isAiVideoIdentityAdminAction\(action\)/)
  assert.match(customerAction, /proxyAiVideoIdentityAction\(action, body\)/)
  assert.match(customerAction, /aiVideoIdentityConfigured\(\)/)
  // The dispatch sits behind the admin cookie like every other action.
  assert.ok(customerAction.indexOf('requireAdminCookie(') < customerAction.indexOf('isAiVideoIdentityAdminAction(action)'))
})

test('the existing admin action list stays intact', () => {
  for (const action of [
    'manual_provision',
    'manual_provision_v2',
    'resend_onboarding',
    'restart_gateway',
    'mark_refunded',
    'escalate',
    'ai_video_fulfillment',
    'ai_video_refund_needed',
    'ai_video_generate_upload',
    'ai_video_generate_list_uploads',
    'ai_video_generate_start',
    'ai_video_generate_submit',
    'ai_video_generate_cancel',
    'ai_video_generate_save_library',
    'ai_video_prompt_save',
    'ai_video_character_save',
    'ai_video_prompt_compile',
  ]) {
    assert.match(customerAction, new RegExp(`'${action}',`), `${action} must remain in ACTIONS`)
  }
})

// ---------------------------------------------------------------------------
// Proxy request shape
// ---------------------------------------------------------------------------

test('proxy posts to <functions>/ai-video-identity with the service-role bearer, like kickWorker()', () => {
  const { url, init } = buildAiVideoIdentityProxyRequest('ai_video_identity_list', {}, ENV)
  assert.equal(url, 'https://proj.supabase.co/functions/v1/ai-video-identity')
  assert.equal(init.method, 'POST')
  assert.equal(init.headers.apikey, ENV.serviceKey)
  assert.equal(init.headers.authorization, `Bearer ${ENV.serviceKey}`)
  assert.equal(init.headers['content-type'], 'application/json')
  assert.deepEqual(JSON.parse(init.body), { action: 'list', owner_kind: 'founder' })
})

test('proxy strips the ai_video_identity_ prefix and forwards only whitelisted fields, owner_kind founder', () => {
  const { init } = buildAiVideoIdentityProxyRequest('ai_video_identity_start', {
    action: 'ai_video_identity_start',
    display_name: 'Richie',
    consent_version: 'v1',
    // Forged / stray fields must never reach the function.
    owner_kind: 'customer',
    nonce: 'x'.repeat(64),
    group_id: 'grp-1',
    callback_nonce_hash: 'deadbeef',
    byted_token_enc: 'secret',
    verification_status: 'verified',
    cookie: 'admin=1',
  }, ENV)
  assert.deepEqual(JSON.parse(init.body), {
    action: 'start',
    owner_kind: 'founder',
    display_name: 'Richie',
    consent_version: 'v1',
  })
})

test('proxy keeps numeric bytes and string paths, drops empty, boolean and object values', () => {
  const { init } = buildAiVideoIdentityProxyRequest('ai_video_identity_upload_sign', {
    identity_id: '11111111-1111-4111-8111-111111111111',
    slot: 'full_body',
    content_type: 'image/jpeg',
    bytes: 123456,
    path: '',
    asset_type: null,
    order_id: undefined,
    display_name: { nested: true },
    consent_version: true,
  }, ENV)
  assert.deepEqual(JSON.parse(init.body), {
    action: 'upload_sign',
    owner_kind: 'founder',
    identity_id: '11111111-1111-4111-8111-111111111111',
    slot: 'full_body',
    content_type: 'image/jpeg',
    bytes: 123456,
  })
})

test('proxy lets the admin manage a customer identity only when it names the customer', () => {
  const named = buildAiVideoIdentityProxyRequest('ai_video_identity_list', {
    owner_kind: 'customer',
    customer_id: '22222222-2222-4222-8222-222222222222',
  }, ENV)
  assert.deepEqual(JSON.parse(named.init.body), {
    action: 'list',
    owner_kind: 'customer',
    customer_id: '22222222-2222-4222-8222-222222222222',
  })
  const unnamed = buildAiVideoIdentityProxyRequest('ai_video_identity_list', { owner_kind: 'customer' }, ENV)
  assert.equal(JSON.parse(unnamed.init.body).owner_kind, 'founder')
})

test('quota rides the list action; every other action maps to its bare name', () => {
  assert.equal(functionActionFor('ai_video_identity_quota'), 'list')
  assert.equal(functionActionFor('ai_video_identity_list'), 'list')
  assert.equal(functionActionFor('ai_video_identity_start'), 'start')
  assert.equal(functionActionFor('ai_video_identity_restart'), 'restart')
  assert.equal(functionActionFor('ai_video_identity_upload_sign'), 'upload_sign')
  assert.equal(functionActionFor('ai_video_identity_register'), 'register')
  assert.equal(functionActionFor('ai_video_identity_status'), 'status')
  assert.equal(functionActionFor('ai_video_identity_revoke'), 'revoke')
})

test('proxy refuses to build a request without functions URL or service key', () => {
  assert.throws(
    () => buildAiVideoIdentityProxyRequest('ai_video_identity_list', {}, { functionsUrl: '', serviceKey: 'k' }),
    /identity_proxy_unconfigured/,
  )
  assert.throws(
    () => buildAiVideoIdentityProxyRequest('ai_video_identity_list', {}, { functionsUrl: 'https://x', serviceKey: '' }),
    /identity_proxy_unconfigured/,
  )
})

// ---------------------------------------------------------------------------
// Proxy response mapping
// ---------------------------------------------------------------------------

test('proxy passes the function JSON through with ok:true and sends the signal-timed request', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return jsonResponse(200, { identities: [{ id: 'i1' }], quota: { remaining_assets: 7 } })
  }
  const result = await proxyAiVideoIdentityAction('ai_video_identity_list', {}, fetchImpl, ENV)
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { ok: true, identities: [{ id: 'i1' }], quota: { remaining_assets: 7 } })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://proj.supabase.co/functions/v1/ai-video-identity')
  assert.ok(calls[0].init?.signal instanceof AbortSignal)
  assert.equal((calls[0].init?.headers as Record<string, string>).authorization, `Bearer ${ENV.serviceKey}`)
})

test('quota action returns only the quota view from list', async () => {
  const fetchImpl = async () => jsonResponse(200, {
    identities: [{ id: 'i1' }],
    quota: { asset_limit: 50, active_assets: 12, remaining_assets: 38, active_groups: 3, group_limit: 20 },
  })
  const result = await proxyAiVideoIdentityAction('ai_video_identity_quota', {}, fetchImpl, ENV)
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, {
    ok: true,
    quota: { asset_limit: 50, active_assets: 12, remaining_assets: 38, active_groups: 3, group_limit: 20 },
  })
  assert.equal('identities' in result.body, false)
})

test('proxy keeps the function status and error code on non-2xx', async () => {
  const cap = await proxyAiVideoIdentityAction(
    'ai_video_identity_register',
    { identity_id: 'i1', path: 'identity/i1/full_body-x.jpg', asset_type: 'Image', slot: 'full_body' },
    async () => jsonResponse(409, { error: 'identity_asset_cap' }),
    ENV,
  )
  assert.deepEqual(cap, { status: 409, body: { ok: false, error: 'identity_asset_cap' } })

  const limited = await proxyAiVideoIdentityAction(
    'ai_video_identity_register',
    {},
    async () => jsonResponse(429, { error: 'ark_rate_limited' }),
    ENV,
  )
  assert.deepEqual(limited, { status: 429, body: { ok: false, error: 'ark_rate_limited' } })

  const html = await proxyAiVideoIdentityAction(
    'ai_video_identity_status',
    { identity_id: 'i1' },
    async () => new Response('<html>gateway</html>', { status: 500 }),
    ENV,
  )
  assert.deepEqual(html, { status: 500, body: { ok: false, error: 'identity_http_500' } })
})

test('proxy maps a network failure to 502 identity_unavailable', async () => {
  const result = await proxyAiVideoIdentityAction(
    'ai_video_identity_list',
    {},
    async () => { throw new Error('ECONNRESET') },
    ENV,
  )
  assert.deepEqual(result, { status: 502, body: { ok: false, error: 'identity_unavailable' } })
})

// ---------------------------------------------------------------------------
// Founder surface pins
// ---------------------------------------------------------------------------

test('karakter panel rides the admin rails: rewrite, sidebar, shared css, vanilla JS mount', () => {
  assert.match(vercel, /"source": "\/admin\/ai-video-influencers",\s*"destination": "\/admin\/ai-video-influencers\.html"/)
  assert.match(adminShared, /href: '\/admin\/ai-video-influencers'/)
  assert.match(panelHtml, /\/admin\/assets\/admin\.css/)
  assert.match(panelHtml, /\/admin\/assets\/admin-shared\.js/)
  assert.match(panelHtml, /data-karakter-panel/)
  assert.match(panelHtml, /\/admin\/assets\/ai-video-karakter\.js/)
  assert.doesNotMatch(panelHtml, /babel/)
})

test('karakter panel calls every contract action through /api/admin/customer-action', () => {
  assert.match(panelJs, /\/api\/admin\/customer-action/)
  for (const action of [...CONTRACT_ACTIONS, 'ai_video_identity_quota']) {
    assert.match(panelJs, new RegExp(`'${action}'`), `${action} must be used by the panel`)
  }
  // The panel never calls confirm — the public callback page does that.
  assert.doesNotMatch(panelJs, /ai_video_identity_confirm/)
  assert.doesNotMatch(panelJs, /'confirm'/)
})

test('karakter panel covers the three slots, the quota bar at 50 with a warning at 40, copy link, and Hapus', () => {
  assert.match(panelJs, /ASSET_LIMIT = 50/)
  assert.match(panelJs, /ASSET_ALERT_AT = 40/)
  for (const slot of ['full_body', 'close_up', 'voice']) {
    assert.match(panelJs, new RegExp(`'${slot}'`), `${slot} slot must exist`)
  }
  assert.match(panelJs, /Tambah karakter/)
  assert.match(panelJs, /'Hapus'/)
  assert.match(panelJs, /clipboard/)
  assert.match(panelJs, /h5_link/)
  assert.match(panelJs, /failed_reason/)
  assert.match(panelJs, /liveness_billing_blocked/)
})

test('karakter copy: Bahasa, no exclamation marks, no banned words', () => {
  const text = panelHtml + panelJs
  // Drop comments (apostrophes in prose would desync the literal scan), then
  // pull out string literals so code punctuation does not trip the check.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '')
  const literals = code.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g) ?? []
  const withExclamation = literals.filter((s) => /[A-Za-z]!/.test(s))
  assert.deepEqual(withExclamation, [], 'customer-facing strings must not use exclamation marks')
  // Visible HTML text too.
  const htmlText = panelHtml.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')
  assert.doesNotMatch(htmlText, /!/)
  assert.doesNotMatch(text, /\b(basically|just|literally|honestly|kind of|pretty much|revolutionary|disrupt|10x|game-changer|next-level)\b/i)
  assert.doesNotMatch(text, /\bAnda\b/)
})

test('supabase config registers the ai-video-identity function without gateway JWT verification', () => {
  assert.match(configToml, /\[functions\.ai-video-identity\]\s*\n\s*verify_jwt = false/)
})

// ---------------------------------------------------------------------------
// Studio picker feed (GET customer-data?resource=ai-video-identities)
// ---------------------------------------------------------------------------

function pickerRow(over: Partial<AiVideoIdentityReadRow> & { assets?: AiVideoIdentityReadRow['assets'] } = {}): AiVideoIdentityReadRow {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    display_name: 'Richie',
    owner_kind: 'founder',
    customer_id: null,
    order_id: null,
    verification_status: 'verified',
    revoked_at: null,
    assets: [{
      id: 'a1', asset_id: 'Asset-20260914100001-fghij', asset_type: 'Image',
      status: 'active', name: 'full_body', deleted_at: null,
    }],
    ...over,
  }
}

test('customer-data exposes the picker as resource=ai-video-identities and re-checks ownership on start', () => {
  assert.match(customerData, /resource=== 'ai-video-identities'|resource'\) \?\? ''\)\.trim\(\) === 'ai-video-identities'/)
  assert.match(customerData, /listAiVideoIdentitiesForPicker/)
  assert.match(customerData, /createAiVideoIdentityReadStore/)
  assert.match(customerData, /aiVideoIdentityReadConfigured/)
})

test('picker keeps founder assets and the tid customer, drops revoked, unverified, inactive, and other customers', () => {
  const orderId = '11111111-1111-4111-8111-111111111111'
  const customerId = '33333333-3333-4333-8333-333333333333'
  const items = presentAiVideoIdentityPicker([
    pickerRow(),
    pickerRow({ id: 'r1', display_name: 'Revoked', revoked_at: '2026-09-14T00:00:00Z' }),
    pickerRow({ id: 'p1', display_name: 'Pending', verification_status: 'pending' }),
    pickerRow({
      id: 'c1', display_name: 'Buyer', owner_kind: 'customer',
      customer_id: customerId, order_id: orderId,
      assets: [
        { id: 'a2', asset_id: 'Asset-20260914100002-klmno', asset_type: 'Image', status: 'active', name: 'close_up', deleted_at: null },
        { id: 'a3', asset_id: 'Asset-20260914100003-pqrst', asset_type: 'Audio', status: 'processing', name: 'voice', deleted_at: null },
      ],
    }),
    pickerRow({
      id: 'x1', display_name: 'Stranger', owner_kind: 'customer',
      customer_id: '55555555-5555-4555-8555-555555555555', order_id: '44444444-4444-4444-8444-444444444444',
    }),
    pickerRow({
      id: 'e1', display_name: 'Empty',
      assets: [{ id: 'z', asset_id: 'Asset-20260914100009-zzzzz', asset_type: 'Image', status: 'failed', name: 'full_body', deleted_at: null }],
    }),
  ], { orderId, customerId })
  assert.deepEqual(items.map((item) => item.display_name), ['Richie', 'Buyer'])
  assert.deepEqual(items[0].assets.map((asset) => asset.slot), ['full_body'])
  assert.deepEqual(items[1].assets.map((asset) => asset.slot), ['close_up'])
  assert.equal(items[1].owner_kind, 'customer')
})

test('picker list without a tid still returns founder identities; a fake tid is 404', async () => {
  const rows = [pickerRow()]
  const store = {
    findOrderByTid: async () => null,
    listIdentities: async () => rows,
  }
  const open = await listAiVideoIdentitiesForPicker({ tid: '' }, store)
  assert.equal('identities' in open && open.identities.length, 1)
  const missing = await listAiVideoIdentitiesForPicker({ tid: 'WU-9F2K' }, store)
  assert.deepEqual(missing, { error: 'order_not_found', status: 404 })
})
