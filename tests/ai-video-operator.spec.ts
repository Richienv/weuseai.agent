import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  AI_VIDEO_OPERATOR_RESOLUTIONS,
  ARK_SEEDANCE_25_USD_PER_SECOND_1080P,
  ARK_SEEDANCE_25_USD_PER_SECOND_720P,
  applyOperatorTransition,
  canCancelOperatorJob,
  canSubmitOperatorJob,
  estimateOperatorCostUsd,
  identityAssetRefsError,
  isOperatorAssetRef,
  isOperatorImageHandle,
  operatorAssetIdFromRef,
  operatorJobProvider,
  operatorRefKindForRole,
  simpleEstimate,
  simpleReferenceError,
  type AiVideoIdentityAssetLink,
  isOperatorRefPath,
  isOperatorRefRole,
  isOperatorRefUrl,
  operatorGenerateReady,
  operatorMaxRefs,
  operatorPromptHasBannedToken,
  operatorPromptIsReady,
  parseOperatorCharacterInput,
  sanitizeOperatorPrompt,
  parseOperatorPromptSaveInput,
  parseOperatorStartInput,
  presentAiVideoOperatorCharacter,
  presentAiVideoOperatorJob,
  type AiVideoOperatorJob,
} from '../supabase/functions/_shared/ai-video-operator.ts'

const PROMPT = [
  'SCENE',
  'A woman walks a wet Jakarta alley at dusk. One take. No cut.',
  'REFERENCES',
  'Attach the supplied face crops as FACE LOCK. Use @Image1 for the face.',
  'PHYSICS',
  'Rain on stone. Weight in the steps. Hair moves with wind, not float.',
  'LIGHT',
  'Warm shop neon from camera left. Cool puddle reflections.',
  'CAMERA',
  'Locked off, 35mm, 9:16. Eye-level. No orbit.',
  'TIMELINE',
  '0-6s walk toward camera, stop, look past lens.',
  'PERFORMANCE',
  'Quiet, closed-mouth, no smile at camera.',
  'SOUND',
  'Ambient rain and distant traffic only.',
  'LOCKS',
  'One person. No logo. No subtitle. No extra product.',
].join('\n')

function job(over: Partial<AiVideoOperatorJob> = {}): AiVideoOperatorJob {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    orderId: null,
    exampleId: 'show-explore',
    prompt: PROMPT,
    lesson: null,
    libraryId: null,
    ratio: '9:16',
    durationSeconds: 6,
    generateAudio: false,
    resolution: '720p',
    status: 'queued',
    providerModelId: 'seedance-2.5',
    providerTaskId: null,
    providerVideoUrl: null,
    resultPath: null,
    attempt: 0,
    errorCode: null,
    usage: {},
    refPaths: [],
    refUrls: [],
    refRoles: [],
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
    ...over,
  }
}

test('legal transitions stay open and illegal ones stay closed', () => {
  assert.equal(applyOperatorTransition('queued', 'submitted'), 'submitted')
  assert.equal(applyOperatorTransition('submitted', 'succeeded'), 'succeeded')
  assert.throws(() => applyOperatorTransition('queued', 'succeeded'))
  assert.throws(() => applyOperatorTransition('succeeded', 'queued'))
})

test('submit and cancel caps match the desk contract', () => {
  assert.equal(canSubmitOperatorJob(job()), true)
  assert.equal(canSubmitOperatorJob(job({ status: 'submitted' })), false)
  assert.equal(canSubmitOperatorJob(job({ attempt: 2 })), false)
  assert.equal(canCancelOperatorJob(job()), true)
  assert.equal(canCancelOperatorJob(job({ status: 'running' })), false)
})

test('start input allows 30s and @Image1 on 2.5, and strips Higgsfield tokens', () => {
  const ok = parseOperatorStartInput({
    prompt: PROMPT,
    lesson: 'Keep the walk slower next time.',
    ratio: '9:16',
    duration_seconds: 30,
    model: 'seedance-2.5',
    resolution: '480p',
    ref_paths: ['operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/face.jpg'],
  })
  assert.equal(ok.durationSeconds, 30)
  assert.equal(ok.model, 'seedance-2.5')
  assert.equal(ok.resolution, '480p')
  assert.equal(ok.lesson, 'Keep the walk slower next time.')
  assert.equal(ok.refPaths.length, 1)
  assert.throws(() => parseOperatorStartInput({ prompt: 'walk in rain', ratio: '9:16', duration_seconds: 6 }), /operator_prompt/)
  const cleaned = parseOperatorStartInput({
    prompt: `${PROMPT}\nKeep @[Richie-final](ae9f347c-b941-40c5-9dec-6ccb931c4c3b) Higgsfield Cadence`,
    ratio: '9:16',
    duration_seconds: 6,
  })
  assert.match(cleaned.prompt, /Keep Richie-final/)
  assert.doesNotMatch(cleaned.prompt, /@\[|ae9f347c|higgsfield|cadence/i)
  assert.throws(() => parseOperatorStartInput({
    prompt: PROMPT, ratio: '9:16', duration_seconds: 30, model: 'seedance-2.0-fast',
  }), /invalid_operator_duration/)
  assert.throws(() => parseOperatorStartInput({ prompt: PROMPT, ratio: '4:3', duration_seconds: 6 }), /invalid_operator_ratio/)
})

test('refs must be operator storage paths or https', () => {
  assert.equal(isOperatorRefPath('operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/face.jpg'), true)
  assert.equal(isOperatorRefPath('factory/x/y.jpg'), false)
  assert.equal(isOperatorRefUrl('https://example.com/face.jpg'), true)
  assert.equal(isOperatorRefUrl('http://example.com/face.jpg'), false)
})

const RICHIE_FACE = 'asset://Asset-20260914100001-fghij'
const RICHIE_VOICE = 'asset://Asset-20260914100003-pqrst'

test('asset:// refs are accepted as ref_urls and force the BytePlus provider', () => {
  assert.equal(isOperatorRefUrl(RICHIE_FACE), true)
  assert.equal(isOperatorAssetRef(RICHIE_FACE), true)
  assert.equal(isOperatorAssetRef('asset://short'), false)
  assert.equal(isOperatorAssetRef('asset://has space-1234567'), false)
  assert.equal(isOperatorAssetRef('https://example.com/asset://x'), false)
  assert.equal(operatorAssetIdFromRef(RICHIE_FACE), 'Asset-20260914100001-fghij')
  assert.throws(() => operatorAssetIdFromRef('https://example.com/face.jpg'), /invalid_operator_ref_url/)
  assert.equal(operatorJobProvider([]), 'monid')
  assert.equal(operatorJobProvider(['https://example.com/face.jpg']), 'monid')
  assert.equal(operatorJobProvider(['https://example.com/face.jpg', RICHIE_FACE]), 'byteplus_modelark')
  assert.equal(operatorRefKindForRole('first_frame'), 'image')
  assert.equal(operatorRefKindForRole('reference_video'), 'video')
  assert.equal(operatorRefKindForRole('reference_audio'), 'audio')
})

test('asset:// start input needs Seedance 2.5, takes the role as media kind, and unlocks 1080p', () => {
  const ok = parseOperatorStartInput({
    prompt: PROMPT, ratio: '9:16', duration_seconds: 10, model: 'seedance-2.5', resolution: '1080p',
    ref_urls: [RICHIE_FACE, RICHIE_VOICE], ref_roles: ['reference_image', 'reference_audio'],
  })
  assert.equal(ok.provider, 'byteplus_modelark')
  assert.equal(ok.resolution, '1080p')
  assert.deepEqual(ok.refUrls, [RICHIE_FACE, RICHIE_VOICE])
  assert.deepEqual(ok.refRoles, ['reference_image', 'reference_audio'])
  const plain = parseOperatorStartInput({ prompt: PROMPT, ratio: '9:16', duration_seconds: 6, model: 'seedance-2.5', ref_urls: ['https://example.com/face.jpg'] })
  assert.equal(plain.provider, 'monid')
  assert.throws(() => parseOperatorStartInput({
    prompt: PROMPT, ratio: '9:16', duration_seconds: 6, model: 'wan3.0', ref_urls: [RICHIE_FACE],
  }), /invalid_operator_ref_url/)
  assert.throws(() => parseOperatorStartInput({
    prompt: PROMPT, ratio: '9:16', duration_seconds: 6, model: 'seedance-2.5', resolution: '1080p', ref_urls: ['https://example.com/face.jpg'],
  }), /invalid_operator_resolution/)
  assert.throws(() => parseOperatorStartInput({
    prompt: PROMPT, ratio: '9:16', duration_seconds: 6, model: 'seedance-2.5', resolution: '1080p',
  }), /invalid_operator_resolution/)
  assert.deepEqual([...AI_VIDEO_OPERATOR_RESOLUTIONS], ['480p', '720p', '1080p'])
})

test('ModelArk estimate prices output seconds only; Monid numbers are unchanged', () => {
  assert.equal(estimateOperatorCostUsd(10, '720p', 'seedance-2.5', 0, 'byteplus_modelark'), Math.round(10 * ARK_SEEDANCE_25_USD_PER_SECOND_720P * 1000) / 1000)
  assert.equal(estimateOperatorCostUsd(10, '1080p', 'seedance-2.5', 0, 'byteplus_modelark'), Math.round(10 * ARK_SEEDANCE_25_USD_PER_SECOND_1080P * 1000) / 1000)
  assert.equal(estimateOperatorCostUsd(10, '720p', 'seedance-2.5', 30, 'byteplus_modelark'), estimateOperatorCostUsd(10, '720p', 'seedance-2.5', 0, 'byteplus_modelark'))
  assert.equal(estimateOperatorCostUsd(5, '720p', 'seedance-2.5'), 1.156)
  assert.equal(estimateOperatorCostUsd(5, '720p', 'seedance-2.5', 0, 'monid'), 1.156)
  assert.equal(simpleEstimate(10, 3), 2.312)
  assert.equal(simpleEstimate(10, 0, 'seedance-2.5', '1080p', 'byteplus_modelark'), Math.round(10 * ARK_SEEDANCE_25_USD_PER_SECOND_1080P * 1000) / 1000)
  const presented = presentAiVideoOperatorJob(job({ refUrls: [RICHIE_FACE], refRoles: ['reference_image'], resolution: '1080p', provider: 'byteplus_modelark' }))
  assert.equal(presented.provider, 'byteplus_modelark')
  assert.equal(presented.estimate_usd, Math.round(6 * ARK_SEEDANCE_25_USD_PER_SECOND_1080P * 1000) / 1000)
  assert.equal(presentAiVideoOperatorJob(job({ refUrls: [RICHIE_FACE], refRoles: ['reference_image'] })).provider, 'byteplus_modelark')
  assert.equal(presentAiVideoOperatorJob(job()).provider, 'monid')
})

test('asset refs skip clip-length checks the Studio cannot measure', () => {
  assert.equal(simpleReferenceError('seedance-2.5', [{ role: 'reference_audio', asset: true }], 6), '')
  assert.equal(simpleReferenceError('seedance-2.5', [{ role: 'reference_video', asset: true }, { role: 'reference_video', seconds: 1 }], 6), 'video_duration')
})

function assetLink(over: Partial<Omit<AiVideoIdentityAssetLink, 'identity'>> & { identity?: Partial<AiVideoIdentityAssetLink['identity']> } = {}): AiVideoIdentityAssetLink {
  const { identity: _identity, ...rest } = over
  return {
    assetId: 'Asset-20260914100001-fghij',
    assetType: 'Image',
    status: 'active',
    deletedAt: null,
    ...rest,
    identity: {
      id: '22222222-2222-4222-8222-222222222222',
      ownerKind: 'founder',
      customerId: null,
      orderId: null,
      verificationStatus: 'verified',
      revokedAt: null,
      ...(over.identity ?? {}),
    },
  }
}

test('identity asset ownership gate: active, verified, unrevoked, founder or the order behind the tid', () => {
  const input = { refUrls: ['https://example.com/x.jpg', RICHIE_FACE], refRoles: ['reference_image', 'reference_image'] }
  const order = { id: '11111111-1111-4111-8111-111111111111', customerId: '33333333-3333-4333-8333-333333333333' }
  assert.equal(identityAssetRefsError(input, [assetLink()], null), null)
  assert.equal(identityAssetRefsError(input, [], null), 'identity_asset_not_active')
  assert.equal(identityAssetRefsError(input, [assetLink({ status: 'processing' })], null), 'identity_asset_not_active')
  assert.equal(identityAssetRefsError(input, [assetLink({ deletedAt: '2026-09-14T00:00:00Z' })], null), 'identity_asset_not_active')
  assert.equal(identityAssetRefsError(input, [assetLink({ identity: { revokedAt: '2026-09-14T00:00:00Z' } })], null), 'identity_asset_not_active')
  assert.equal(identityAssetRefsError(input, [assetLink({ identity: { verificationStatus: 'pending' } })], null), 'identity_asset_not_active')
  const customer = assetLink({ identity: { ownerKind: 'customer', orderId: order.id, customerId: null } })
  assert.equal(identityAssetRefsError(input, [customer], order), null)
  assert.equal(identityAssetRefsError(input, [customer], null), 'identity_asset_not_active')
  assert.equal(identityAssetRefsError(input, [customer], { id: '44444444-4444-4444-8444-444444444444', customerId: null }), 'identity_asset_not_active')
  const sameCustomer = assetLink({ identity: { ownerKind: 'customer', orderId: '44444444-4444-4444-8444-444444444444', customerId: order.customerId } })
  assert.equal(identityAssetRefsError(input, [sameCustomer], order), null)
  assert.equal(identityAssetRefsError(input, [assetLink({ assetType: 'Audio' })], null), 'invalid_operator_ref_role')
  assert.equal(identityAssetRefsError({ refUrls: [RICHIE_VOICE], refRoles: ['reference_audio'] }, [assetLink({ assetId: 'Asset-20260914100003-pqrst', assetType: 'Audio' })], null), null)
  assert.equal(identityAssetRefsError({ refUrls: ['https://example.com/x.jpg'], refRoles: ['reference_image'] }, [], null), null)
})

test('ref roles are per image, at most one first_frame, and length-locked', () => {
  assert.equal(isOperatorRefRole('first_frame'), true)
  assert.equal(isOperatorRefRole('reference_image'), true)
  assert.equal(isOperatorRefRole('face_lock'), false)
  const sheetOnly = parseOperatorStartInput({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
    ref_urls: ['https://example.com/sheet.png'],
    ref_roles: ['reference_image'],
  })
  assert.deepEqual(sheetOnly.refRoles, ['reference_image'])
  const withStill = parseOperatorStartInput({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
    ref_urls: ['https://example.com/sheet.png'],
    ref_paths: ['operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/still.jpg'],
    ref_roles: ['reference_image', 'first_frame'],
  })
  assert.deepEqual(withStill.refRoles, ['reference_image', 'first_frame'])
  // Legacy callers that send no roles still parse. Kind is inferred so a
  // video/audio URL cannot silently become a reference_image.
  const legacy = parseOperatorStartInput({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
    ref_urls: ['https://example.com/sheet.png'],
  })
  assert.deepEqual(legacy.refRoles, ['reference_image'])
  assert.throws(() => parseOperatorStartInput({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
    ref_urls: ['https://example.com/sheet.png'],
    ref_roles: ['face_lock'],
  }), /invalid_operator_ref_role/)
  assert.throws(() => parseOperatorStartInput({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
    ref_urls: ['https://example.com/sheet.png'],
    ref_roles: ['reference_image', 'reference_image'],
  }), /invalid_operator_ref_role/)
  assert.throws(() => parseOperatorStartInput({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
    ref_urls: ['https://example.com/a.png', 'https://example.com/b.png'],
    ref_roles: ['first_frame', 'first_frame'],
  }), /invalid_operator_ref_role/)
})

test('character input needs a name and an operator sheet path', () => {
  const ok = parseOperatorCharacterInput({
    name: '  Richie · kaus navy  ',
    sheet_path: 'operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sheet.png',
    notes: 'FRONT, SIDE, BACK, CLOSE-UP.',
  })
  assert.equal(ok.name, 'Richie · kaus navy')
  assert.equal(ok.notes, 'FRONT, SIDE, BACK, CLOSE-UP.')
  assert.throws(() => parseOperatorCharacterInput({
    name: 'R',
    sheet_path: 'operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sheet.png',
  }), /invalid_operator_character_name/)
  assert.throws(() => parseOperatorCharacterInput({
    name: 'Richie',
    sheet_path: 'factory/x/sheet.png',
  }), /invalid_operator_character_sheet/)
  const presented = presentAiVideoOperatorCharacter({
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    name: 'Richie',
    sheetPath: 'operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sheet.png',
    sheetUrl: null,
    notes: null,
    createdAt: '2026-09-02T00:00:00.000Z',
  }, 'https://signed.example/sheet.png')
  assert.equal(presented.sheet_url, 'https://signed.example/sheet.png')
  assert.equal(presented.name, 'Richie')
})

test('prompt saver keeps the full prompt and a cover image', () => {
  const ok = parseOperatorPromptSaveInput({
    title: 'Hujan gang',
    prompt: PROMPT,
    cover_path: 'operator/inbox/cover.png',
    ratio: '9:16',
    duration_seconds: 6,
  })
  assert.equal(ok.title, 'Hujan gang')
  assert.equal(ok.coverPath, 'operator/inbox/cover.png')
  assert.equal(ok.prompt, PROMPT)
  assert.throws(() => parseOperatorPromptSaveInput({
    title: 'Hujan gang',
    prompt: PROMPT,
  }), /invalid_operator_cover/)
  assert.throws(() => parseOperatorPromptSaveInput({
    title: 'Hujan gang',
    prompt: 'pendek',
    cover_path: 'operator/inbox/cover.png',
  }), /invalid_operator_prompt/)
})

test('generate opens when the Monid key is present unless explicitly disabled', () => {
  assert.equal(operatorGenerateReady({}), false)
  assert.equal(operatorGenerateReady({ OPERATOR_GENERATE_ENABLED: 'true' }), false)
  assert.equal(operatorGenerateReady({ MONID_API_KEY: 'monid-key-16chars' }), true)
  assert.equal(operatorGenerateReady({
    OPERATOR_GENERATE_ENABLED: 'true',
    MONID_API_KEY: 'monid-key-16chars',
  }), true)
  assert.equal(operatorGenerateReady({
    OPERATOR_GENERATE_ENABLED: 'false',
    MONID_API_KEY: 'monid-key-16chars',
  }), false)
})

test('estimate is the published 720p 5s rate scaled by duration', () => {
  assert.equal(estimateOperatorCostUsd(5), 1.156)
  assert.equal(estimateOperatorCostUsd(10), 2.312)
  assert.equal(estimateOperatorCostUsd(30), 6.936)
  assert.equal(estimateOperatorCostUsd(5, '480p'), 0.52)
  assert.equal(presentAiVideoOperatorJob(job()).estimate_usd, 1.387)
})

test('api and supabase operator types stay byte-identical', () => {
  const api = readFileSync(new URL('../api/_shared/ai-video-operator.ts', import.meta.url), 'utf8')
  const edge = readFileSync(new URL('../supabase/functions/_shared/ai-video-operator.ts', import.meta.url), 'utf8')
  assert.equal(api, edge)
  const ark = readFileSync(new URL('../api/_shared/ark-asset-client.ts', import.meta.url), 'utf8')
  const operatorRe = api.match(/const ASSET_URI_RE = (\/\^asset:\\\/\\\/\[A-Za-z0-9\._-\]\{8,120\}\$\/)/)
  const arkRe = ark.match(/export const ARK_ASSET_URI_RE = (\/\^asset:\\\/\\\/\[A-Za-z0-9\._-\]\{8,120\}\$\/)/)
  assert.ok(operatorRe && arkRe, 'asset URI regex missing')
  assert.equal(operatorRe[1], arkRe[1])
})

test('character migration adds the library table and per-image roles', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260902010000_ai_video_operator_characters.sql', import.meta.url), 'utf8')
  assert.match(sql, /create table if not exists public\.ai_video_operator_characters/)
  assert.match(sql, /sheet_path/)
  assert.match(sql, /add column if not exists ref_roles/)
  assert.match(sql, /first_frame/)
  assert.match(sql, /reference_image/)
  assert.match(sql, /revoke all on table public\.ai_video_operator_characters from public, anon, authenticated/)
})

test('migration keeps operator jobs off the customer render table', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260824010000_ai_video_operator_jobs.sql', import.meta.url), 'utf8')
  assert.match(sql, /create table if not exists public\.ai_video_operator_jobs/)
  assert.match(sql, /ai_video_operator_assets/)
  assert.match(sql, /ai_video_operator_costs/)
  assert.match(sql, /claim_due_ai_video_operator_jobs/)
  assert.match(sql, /revoke all on table public\.ai_video_operator_jobs from public, anon, authenticated/)
  assert.doesNotMatch(sql, /ai_video_render_jobs/)
  assert.doesNotMatch(sql, /higgsfield/i)
})

test('monid migration adds library, lesson, 30s, and keeps old provider rows valid', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260828010000_ai_video_operator_monid.sql', import.meta.url), 'utf8')
  assert.match(sql, /ai_video_operator_library/)
  assert.match(sql, /add column if not exists lesson/)
  assert.match(sql, /duration_seconds between 4 and 30/)
  assert.match(sql, /provider in \('monid', 'byteplus_modelark'\)/)
  assert.match(sql, /poll_attempts between 0 and 40/)
  assert.match(sql, /revoke all on table public\.ai_video_operator_library from public, anon, authenticated/)
})

test('identity migration adds identities + assets and pins asset:// jobs to BytePlus', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260914010000_ai_video_identities.sql', import.meta.url), 'utf8')
  assert.match(sql, /create table if not exists public\.ai_video_identities/)
  assert.match(sql, /create table if not exists public\.ai_video_identity_assets/)
  assert.match(sql, /owner_kind in \('founder', 'customer'\)/)
  assert.match(sql, /asset_type in \('Image', 'Video', 'Audio'\)/)
  assert.match(sql, /last_inference_at timestamptz/)
  assert.match(sql, /revoked_at timestamptz/)
  // Every ref_urls element is https or asset://, and any asset:// forces provider byteplus_modelark.
  assert.match(sql, /asset:\/\//)
  assert.match(sql, /byteplus_modelark/)
  assert.match(sql, /revoke all on table public\.ai_video_identities from public, anon, authenticated/)
  assert.match(sql, /revoke all on table public\.ai_video_identity_assets from public, anon, authenticated/)
})

test('prompt ban allows @Image1 and still catches Cadence', () => {
  assert.equal(operatorPromptHasBannedToken('no tokens here'), false)
  assert.equal(operatorPromptHasBannedToken('Use @Image1 as FACE LOCK'), false)
  assert.equal(operatorPromptHasBannedToken('Use Cadence Face Lock'), true)
  assert.equal(operatorPromptHasBannedToken('Keep @Richie'), true)
  assert.match(sanitizeOperatorPrompt('Use Cadence Face Lock and keep @Richie on @Image1'), /keep Richie on @Image1/)
  assert.doesNotMatch(sanitizeOperatorPrompt('Generated with Higgsfield @[RICHIE] 7a69255a-4143-4f85-bb2f-538937da88ba'), /higgsfield|@\[|7a69255a/i)
  assert.equal(operatorPromptHasBannedToken(sanitizeOperatorPrompt('HiggsfieldAI CadenceLock @Richie @[RENITA] Use @Image 1 and @Audio2')), false)
  assert.match(sanitizeOperatorPrompt('Use @Image 5 as the cake'), /@Image5/)
})

test('a long Higgsfield paste is ready without the 9 official headings', () => {
  const pasted = [
    'Reference @Image1 = RICHIE. Copy this person exactly: same face, same hair, same wardrobe.',
    'Reference @Image2 = RENITA. Copy this person exactly: same face, same wardrobe, same hair.',
    'Reference @Image3 = THE APARTMENT SET. Copy this room exactly.',
    'Reference @Image4 = MIMI THE CAT. Copy this cat exactly.',
    'Reference @Image5 = Luxury Matcha Cake. This is the product.',
    '@Audio1 = RENITA VOICE',
    '@Audio2 = richie voice',
    'PHYSICS Weight, gravity, cloth, cake glaze, cat fur.',
    'AUDIO Dialogue locked to the two attached voices.',
    'WHAT MUST SURVIVE Face, cake, cat jacket, apartment window.',
    'Generated with Higgsfield. Cadence Face Lock @[RICHIE].',
  ].join('\n')
  assert.equal(operatorPromptIsReady(sanitizeOperatorPrompt(pasted)), true)
  const started = parseOperatorStartInput({
    prompt: pasted,
    ratio: '9:16',
    duration_seconds: 30,
    model: 'seedance-2.5',
  })
  assert.match(started.prompt, /@Image1/)
  assert.match(started.prompt, /@Audio2/)
  assert.doesNotMatch(started.prompt, /higgsfield|cadence|@\[/i)
})

test('Seedance 2.5 accepts 30 image refs and @Image30, not 31 or @Image31', () => {
  assert.equal(operatorMaxRefs('seedance-2.5'), 50)
  assert.equal(operatorMaxRefs('seedance-2.0-fast'), 8)
  assert.equal(isOperatorImageHandle('Image1'), true)
  assert.equal(isOperatorImageHandle('Image30'), true)
  assert.equal(isOperatorImageHandle('Image31'), false)
  assert.equal(operatorPromptHasBannedToken('Lock @Image12 and @Image30'), false)
  assert.equal(operatorPromptHasBannedToken('Lock @Image31'), true)
  const paths = Array.from({ length: 30 }, (_, i) => (
    `operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/ref-${String(i + 1).padStart(2, '0')}.jpg`
  ))
  const ok = parseOperatorStartInput({
    prompt: `${PROMPT}\nUse @Image30 as the last wardrobe still.`,
    ratio: '9:16',
    duration_seconds: 6,
    model: 'seedance-2.5',
    ref_paths: paths,
    ref_roles: paths.map(() => 'reference_image'),
  })
  assert.equal(ok.refPaths.length, 30)
  assert.throws(() => parseOperatorStartInput({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
    model: 'seedance-2.5',
    ref_paths: [...paths, 'operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/ref-31.jpg'],
  }), /operator_ref_cap/)
  assert.throws(() => parseOperatorStartInput({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
    model: 'seedance-2.0-fast',
    ref_paths: paths.slice(0, 9),
  }), /operator_ref_cap/)
})

test('Seedance 2.5 accepts 10 video and 10 audio refs, not 11 or 2.0 media', () => {
  assert.equal(isOperatorRefRole('reference_video'), true)
  assert.equal(isOperatorRefRole('reference_audio'), true)
  assert.equal(isOperatorRefPath('operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/clip.mp4'), true)
  assert.equal(isOperatorRefPath('operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/tone.mp3'), true)
  assert.equal(operatorPromptHasBannedToken('Keep @Video1 and @Audio10'), false)
  assert.equal(operatorPromptHasBannedToken('Keep @Video11'), true)
  assert.equal(operatorPromptHasBannedToken('Keep @Audio11'), true)
  const videos = Array.from({ length: 10 }, (_, i) => (
    `operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/clip-${String(i + 1).padStart(2, '0')}.mp4`
  ))
  const audios = Array.from({ length: 10 }, (_, i) => (
    `operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/tone-${String(i + 1).padStart(2, '0')}.mp3`
  ))
  const ok = parseOperatorStartInput({
    prompt: `${PROMPT}\nUse @Video1 and @Audio1.`,
    ratio: '9:16',
    duration_seconds: 6,
    model: 'seedance-2.5',
    ref_paths: [
      'operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sheet.jpg',
      ...videos,
      ...audios,
    ],
    ref_roles: [
      'reference_image',
      ...videos.map(() => 'reference_video'),
      ...audios.map(() => 'reference_audio'),
    ],
  })
  assert.equal(ok.refPaths.length, 21)
  assert.equal(ok.refRoles.filter((role) => role === 'reference_video').length, 10)
  assert.equal(ok.refRoles.filter((role) => role === 'reference_audio').length, 10)
  assert.throws(() => parseOperatorStartInput({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
    model: 'seedance-2.5',
    ref_paths: [...videos, 'operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/clip-11.mp4'],
    ref_roles: Array.from({ length: 11 }, () => 'reference_video'),
  }), /operator_video_cap/)
  assert.throws(() => parseOperatorStartInput({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
    model: 'seedance-2.5',
    ref_paths: [...audios, 'operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/tone-11.mp3'],
    ref_roles: Array.from({ length: 11 }, () => 'reference_audio'),
  }), /operator_audio_cap/)
  assert.throws(() => parseOperatorStartInput({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
    model: 'seedance-2.0-fast',
    ref_paths: ['operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/clip-01.mp4'],
    ref_roles: ['reference_video'],
  }), /operator_video_cap/)
  assert.throws(() => parseOperatorStartInput({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
    model: 'seedance-2.5',
    ref_paths: ['operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sheet.jpg'],
    ref_roles: ['reference_video'],
  }), /invalid_operator_ref_role/)
})

test('prompt-len migration drops the homemade 16k cap', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260903020000_ai_video_operator_prompt_len.sql', import.meta.url), 'utf8')
  assert.match(sql, /drop constraint if exists ai_video_operator_jobs_prompt_check/)
  assert.match(sql, /char_length\(prompt\) >= 40/)
  assert.doesNotMatch(sql, /16000/)
})

test('media-ref migration raises the job cap to 50 and allows video/audio roles', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260903010000_ai_video_operator_media_refs.sql', import.meta.url), 'utf8')
  assert.match(sql, /between 0 and 50/)
  assert.match(sql, /reference_video/)
  assert.match(sql, /reference_audio/)
  assert.match(sql, /file_size_limit = 83886080/)
})
