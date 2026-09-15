import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  listAiVideoIdentitiesForPicker,
  presentAiVideoIdentityPicker,
  type AiVideoIdentityReadRow,
  type AiVideoIdentityReadStore,
} from '../api/_shared/admin-ai-video-identity-read.ts'

// Studio Karakter picker feed: GET /api/admin/customer-data?resource=ai-video-identities&tid=
// -> { identities: [{ id, display_name, owner_kind, assets: [{ id, asset_id, asset_type, slot }] }] }

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333'

function identity(over: Partial<AiVideoIdentityReadRow> = {}): AiVideoIdentityReadRow {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    display_name: 'Richie',
    owner_kind: 'founder',
    customer_id: null,
    order_id: null,
    verification_status: 'verified',
    revoked_at: null,
    assets: [
      { id: 'a1', asset_id: 'Asset-20260914100003-pqrst', asset_type: 'Audio', status: 'active', name: 'suara', deleted_at: null },
      { id: 'a2', asset_id: 'Asset-20260914100001-fghij', asset_type: 'Image', status: 'active', name: 'wajah', deleted_at: null },
      { id: 'a3', asset_id: 'Asset-20260914100009-zzzzz', asset_type: 'Image', status: 'processing', name: 'profil', deleted_at: null },
      { id: 'a4', asset_id: 'Asset-20260914100010-yyyyy', asset_type: 'Video', status: 'active', name: 'gerak', deleted_at: '2026-09-14T00:00:00Z' },
    ],
    ...over,
  }
}

function store(rows: AiVideoIdentityReadRow[], order: { id: string; customerId: string | null } | null = { id: ORDER_ID, customerId: CUSTOMER_ID }): AiVideoIdentityReadStore & { scopes: unknown[] } {
  const scopes: unknown[] = []
  return {
    scopes,
    findOrderByTid: async () => order,
    listIdentities: async (scope) => { scopes.push(scope); return rows },
  }
}

test('picker shape: only active undeleted assets, images before video before audio, founder first', () => {
  const rows = [
    identity({ id: 'c', display_name: 'Budi', owner_kind: 'customer', order_id: ORDER_ID }),
    identity(),
  ]
  const items = presentAiVideoIdentityPicker(rows, { orderId: ORDER_ID, customerId: null })
  assert.deepEqual(items.map((item) => [item.display_name, item.owner_kind]), [['Richie', 'founder'], ['Budi', 'customer']])
  assert.deepEqual(items[0].assets, [
    { id: 'a2', asset_id: 'Asset-20260914100001-fghij', asset_type: 'Image', slot: 'wajah' },
    { id: 'a1', asset_id: 'Asset-20260914100003-pqrst', asset_type: 'Audio', slot: 'suara' },
  ])
  for (const item of items) for (const asset of item.assets) assert.deepEqual(Object.keys(asset).sort(), ['asset_id', 'asset_type', 'id', 'slot'])
  assert.deepEqual(Object.keys(items[0]).sort(), ['assets', 'display_name', 'id', 'owner_kind'])
})

test('picker drops unverified, revoked, asset-less, and other customers identities', () => {
  const rows = [
    identity({ id: 'p', verification_status: 'pending' }),
    identity({ id: 'r', revoked_at: '2026-09-14T00:00:00Z' }),
    identity({ id: 'e', assets: [] }),
    identity({ id: 'o', owner_kind: 'customer', order_id: '44444444-4444-4444-8444-444444444444', customer_id: '55555555-5555-4555-8555-555555555555' }),
    identity({ id: 's', display_name: 'Sari', owner_kind: 'customer', order_id: '44444444-4444-4444-8444-444444444444', customer_id: CUSTOMER_ID }),
  ]
  const items = presentAiVideoIdentityPicker(rows, { orderId: ORDER_ID, customerId: CUSTOMER_ID })
  assert.deepEqual(items.map((item) => item.id), ['s'])
  assert.deepEqual(presentAiVideoIdentityPicker(rows, { orderId: null, customerId: null }), [])
})

test('an empty tid lists founder identities only; a tid scopes to its order and customer', async () => {
  const founderOnly = store([identity(), identity({ id: 'c', owner_kind: 'customer', order_id: ORDER_ID })])
  const result = await listAiVideoIdentitiesForPicker({ tid: '' }, founderOnly)
  assert.ok('identities' in result)
  assert.deepEqual(result.identities.map((item) => item.id), ['22222222-2222-4222-8222-222222222222'])
  assert.deepEqual(founderOnly.scopes, [{ orderId: null, customerId: null }])
  const scoped = store([identity(), identity({ id: 'c', owner_kind: 'customer', order_id: ORDER_ID })])
  const withTid = await listAiVideoIdentitiesForPicker({ tid: 'WU-9F2K' }, scoped)
  assert.ok('identities' in withTid)
  assert.deepEqual(withTid.identities.map((item) => item.id), ['22222222-2222-4222-8222-222222222222', 'c'])
  assert.deepEqual(scoped.scopes, [{ orderId: ORDER_ID, customerId: CUSTOMER_ID }])
})

test('an unknown or malformed tid is a 404, not a founder-only fallback', async () => {
  const missing = await listAiVideoIdentitiesForPicker({ tid: 'WU-9F2K' }, store([identity()], null))
  assert.deepEqual(missing, { error: 'order_not_found', status: 404 })
  const malformed = store([identity()])
  const bad = await listAiVideoIdentitiesForPicker({ tid: 'not a claim code' }, malformed)
  assert.deepEqual(bad, { error: 'order_not_found', status: 404 })
  assert.equal(malformed.scopes.length, 0)
})

test('customer-data exposes the resource on the existing admin rails', () => {
  const data = readFileSync(new URL('../api/admin/customer-data.ts', import.meta.url), 'utf8')
  assert.match(data, /resource'\) \?\? ''\)\.trim\(\) === 'ai-video-identities'/)
  assert.match(data, /listAiVideoIdentitiesForPicker\(\{ tid: u\.searchParams\.get\('tid'\) \?\? '' \}/)
  assert.match(data, /from '\.\.\/_shared\/admin-ai-video-identity-read\.js'/)
  const read = readFileSync(new URL('../api/_shared/admin-ai-video-identity-read.ts', import.meta.url), 'utf8')
  // Vercel Node cannot boot raw supabase/functions imports; the read module stays api-local.
  assert.doesNotMatch(read, /supabase\/functions/)
  assert.match(read, /verification_status=eq\.verified&revoked_at=is\.null/)
  assert.match(read, /ai_video_identity_assets\.status=eq\.active&ai_video_identity_assets\.deleted_at=is\.null/)
})
