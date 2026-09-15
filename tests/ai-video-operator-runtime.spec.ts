import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  asOperatorDeliveryJob,
  operatorProviderOf,
} from '../supabase/functions/_shared/ai-video-operator-runtime.ts'

const RICHIE_FACE = 'asset://Asset-20260914100001-fghij'
const runtime = readFileSync(new URL('../supabase/functions/_shared/ai-video-operator-runtime.ts', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../supabase/functions/ai-video-render-worker/index.ts', import.meta.url), 'utf8')

test('asOperatorDeliveryJob and operatorProviderOf never send an asset:// job to Monid', () => {
  const derived = asOperatorDeliveryJob({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'queued',
    prompt: 'walk',
    ratio: '9:16',
    duration_seconds: 6,
    generate_audio: false,
    ref_urls: [RICHIE_FACE],
    ref_roles: ['reference_image'],
  })
  assert.equal(derived.provider, 'byteplus_modelark')
  assert.deepEqual(derived.refUrls, [RICHIE_FACE])
  assert.equal(operatorProviderOf({ provider: null, refUrls: [RICHIE_FACE] }), 'byteplus_modelark')
  assert.equal(operatorProviderOf({ provider: null, refUrls: [] }, { provider: 'byteplus_modelark' }), 'byteplus_modelark')
  assert.equal(operatorProviderOf({ provider: 'monid', refUrls: [RICHIE_FACE] }), 'monid')
  assert.equal(operatorProviderOf({ provider: null, refUrls: ['https://example.com/face.jpg'] }), 'monid')
})

test('runtime submit/poll branches on provider and the worker injects the merchant key', () => {
  assert.match(runtime, /operatorProviderOf\(job, data\) === 'byteplus_modelark'/)
  assert.match(runtime, /createArkSeedanceTask/)
  assert.match(runtime, /getArkSeedanceTask/)
  assert.match(runtime, /touchIdentityAssets/)
  assert.match(runtime, /modelark_submission_unknown/)
  assert.match(runtime, /asOperatorDeliveryJob/)
  assert.match(worker, /modelArkApiKey: Deno\.env\.get\('MODELARK_MERCHANT_API_KEY'\)/)
  assert.match(worker, /asOperatorDeliveryJob/)
})
