import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compileAiVideoOperatorPrompt,
  listAiVideoOperatorGenerate,
  listAiVideoOperatorUploads,
  saveAiVideoOperatorCharacter,
  startAiVideoOperatorGenerate as startCompiledGenerate,
  submitAiVideoOperatorGenerate,
} from '../api/_shared/admin-ai-video-generate-handler.ts'
import {
  cancelAiVideoOperatorGenerate,
  saveAiVideoOperatorLibrary,
  saveAiVideoOperatorPrompt,
  signAiVideoOperatorUpload,
  startAiVideoOperatorGenerate,
  type AiVideoOperatorGenerateStore,
} from '../supabase/functions/_shared/ai-video-operator-generate.ts'
import type { AiVideoOperatorJob, AiVideoOperatorLibraryItem } from '../supabase/functions/_shared/ai-video-operator.ts'

const PROMPT = [
  'SCENE A quiet alley walk at dusk.',
  'REFERENCES Face crops only. Use @Image1.',
  'PHYSICS Weight in the steps.',
  'LIGHT Neon from the left.',
  'CAMERA Locked 9:16.',
  'TIMELINE Six seconds, one take.',
  'PERFORMANCE Off-lens.',
  'SOUND Rain only.',
  'LOCKS One person.',
].join('\n')

function job(over: Partial<AiVideoOperatorJob> = {}): AiVideoOperatorJob {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    orderId: null,
    exampleId: null,
    prompt: PROMPT,
    lesson: 'Slow the walk.',
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

function libraryItem(over: Partial<AiVideoOperatorLibraryItem> = {}): AiVideoOperatorLibraryItem {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    title: 'Alley walk',
    prompt: PROMPT,
    lesson: 'Slow the walk.',
    ratio: '9:16',
    durationSeconds: 6,
    model: 'seedance-2.5',
    resultPath: 'operator/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/result.mp4',
    refPaths: [],
    sourceJobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sourceOrderId: null,
    createdAt: '2026-08-28T00:00:00.000Z',
    ...over,
  }
}

function store(over: Partial<AiVideoOperatorGenerateStore> = {}): AiVideoOperatorGenerateStore {
  const created: AiVideoOperatorJob[] = []
  return {
    countInflight: async () => 0,
    findOrderByTid: async () => ({
      id: '11111111-1111-4111-8111-111111111111',
      tid: 'WU-9F2K',
      email: 'a@b.co',
      idea: 'brief',
      photos: [],
      paymentStatus: 'paid',
      fulfillment: 'processing',
    }),
    createQueued: async (input) => {
      const row = job({
        orderId: input.orderId,
        prompt: input.prompt,
        lesson: input.lesson,
        providerModelId: input.model,
        resolution: input.resolution,
        refPaths: input.refPaths,
        refUrls: input.refUrls,
        refRoles: input.refRoles,
        libraryId: input.libraryId,
        exampleId: input.exampleId,
      })
      created.push(row)
      return row
    },
    getJob: async () => created[0] ?? job(),
    listJobs: async () => created,
    cancelJob: async () => job({ status: 'cancelled' }),
    signUpload: async (filename) => ({ path: `operator/inbox/${filename}`, signedUrl: 'https://example.com/u', token: 't' }),
    kickWorker: async () => undefined,
    listLibrary: async () => [libraryItem()],
    saveLibrary: async ({ title }) => libraryItem({ title }),
    savePrompt: async (input) => libraryItem({
      title: input.title,
      prompt: input.prompt,
      resultPath: input.coverPath,
      sourceJobId: null,
    }),
    ...over,
  }
}

const READY = { OPERATOR_GENERATE_ENABLED: 'true', MONID_API_KEY: 'monid-key-16chars' }
const REQUEST_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

test('start is blocked until the Monid probe is enabled', async () => {
  const result = await startAiVideoOperatorGenerate({
    prompt: PROMPT, ratio: '9:16', duration_seconds: 6,
  }, store(), { OPERATOR_GENERATE_ENABLED: undefined, MONID_API_KEY: undefined })
  assert.equal(result.error, 'operator_probe_required')
  assert.equal(result.status, 409)
})

test('legacy shared start still waits for inline Monid', async () => {
  let submitted = 0
  const result = await startAiVideoOperatorGenerate({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
    client_request_id: REQUEST_ID,
  }, store({
    submitQueued: async (row) => {
      submitted += 1
      return job({ ...row, status: 'submitted', providerTaskId: 'run_1' })
    },
  }), READY)
  assert.equal(result.ok, true)
  if (!('job' in result)) throw new Error('missing job')
  assert.equal(result.job.status, 'submitted')
  assert.equal(submitted, 1)
})

test('admin start submits Monid inline including storage refs', async () => {
  let submitted = 0
  const result = await startCompiledGenerate({
    prompt_mode: 'simple',
    prompt: 'Kucing lari',
    ratio: '9:16',
    duration_seconds: 6,
    client_request_id: REQUEST_ID,
    ref_paths: ['operator/inbox/cat.jpg', 'operator/inbox/voice.wav'],
    ref_durations: [0, 3],
  }, store({
    submitQueued: async (row) => {
      submitted += 1
      return job({ ...row, status: 'submitted', providerTaskId: 'run_1' })
    },
  }), READY)
  assert.equal(result.ok, true)
  if (!('job' in result)) throw new Error('missing job')
  assert.equal(result.job.status, 'submitted')
  assert.equal(submitted, 1)
})

test('admin start is ready with only the Monid key', async () => {
  const result = await startCompiledGenerate({
    prompt: PROMPT, ratio: '9:16', duration_seconds: 6, client_request_id: REQUEST_ID,
  }, store(), { MONID_API_KEY: 'monid-key-16chars' })
  assert.equal(result.ok, true)
})

test('start without client_request_id returns 400', async () => {
  let created = 0
  const result = await startCompiledGenerate({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
  }, store({
    createQueued: async () => {
      created += 1
      return job()
    },
  }), READY)
  assert.equal(result.status, 400)
  assert.equal(result.error, 'invalid_operator_request_id')
  assert.equal(created, 0)
})

test('submit retries a queued job and no-ops after it leaves the queue', async () => {
  let kicked = 0
  const result = await submitAiVideoOperatorGenerate({
    job_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  }, store({
    getJob: async () => job({ status: 'queued' }),
    submitQueued: async (row) => job({ ...row, status: 'submitted', providerTaskId: 'run_retry' }),
    kickWorker: async () => { kicked += 1 },
  }))
  assert.equal(result.ok, true)
  if (!('job' in result)) throw new Error('missing job')
  assert.equal(result.job.status, 'submitted')
  assert.equal(kicked, 1)
  const skip = await submitAiVideoOperatorGenerate({
    job_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  }, store({
    getJob: async () => job({ status: 'submitted', providerTaskId: 'run_retry' }),
    submitQueued: async () => { throw new Error('should_not_submit') },
  }))
  assert.equal(skip.ok, true)
  if (!('job' in skip)) throw new Error('missing job')
  assert.equal(skip.job.status, 'submitted')
})

test('start stays queued and still kicks if inline submit fails', async () => {
  const result = await startAiVideoOperatorGenerate({
    prompt: PROMPT, ratio: '9:16', duration_seconds: 6, client_request_id: REQUEST_ID,
  }, store({
    submitQueued: async () => { throw new Error('monid_down') },
  }), READY)
  assert.equal(result.ok, true)
  if (!('job' in result)) throw new Error('missing job')
  assert.equal(result.job.status, 'queued')
})

test('start links a TID and kicks the worker', async () => {
  let kicked = false
  const result = await startAiVideoOperatorGenerate({
    prompt: PROMPT, ratio: '9:16', duration_seconds: 6, tid: 'WU-9F2K', lesson: 'Keep rain louder.', client_request_id: REQUEST_ID,
  }, store({ kickWorker: async () => { kicked = true } }), READY)
  assert.equal(result.ok, true)
  if (!('job' in result)) throw new Error('missing job')
  assert.equal(result.job.order_id, '11111111-1111-4111-8111-111111111111')
  assert.equal(result.job.lesson, 'Keep rain louder.')
  assert.equal(kicked, true)
})

test('inflight cap and missing order stay closed', async () => {
  const cap = await startAiVideoOperatorGenerate({
    prompt: PROMPT, ratio: '9:16', duration_seconds: 6, client_request_id: REQUEST_ID,
  }, store({ countInflight: async () => 3 }), READY)
  assert.equal(cap.error, 'operator_inflight_cap')
  const missing = await startAiVideoOperatorGenerate({
    prompt: PROMPT, ratio: '9:16', duration_seconds: 6, tid: 'WU-9F2K', client_request_id: REQUEST_ID,
  }, store({ findOrderByTid: async () => null }), READY)
  assert.equal(missing.error, 'order_not_found')
})

test('cancel only works before the provider is running', async () => {
  const ok = await cancelAiVideoOperatorGenerate({ job_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, store())
  assert.equal(ok.ok, true)
  const blocked = await cancelAiVideoOperatorGenerate(
    { job_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    store({ getJob: async () => job({ status: 'running' }) }),
  )
  assert.equal(blocked.error, 'invalid_operator_transition')
})

test('upload signs operator paths only', async () => {
  const result = await signAiVideoOperatorUpload({ filenames: ['face.jpg'] }, store())
  assert.equal(result.ok, true)
  if (!('uploads' in result)) throw new Error('missing uploads')
  assert.match(result.uploads[0].path, /operator\//)
  const batch = await signAiVideoOperatorUpload({
    filenames: Array.from({ length: 50 }, (_, i) => `ref-${String(i + 1).padStart(2, '0')}.jpg`),
  }, store())
  assert.equal(batch.ok, true)
  if (!('uploads' in batch)) throw new Error('missing uploads')
  assert.equal(batch.uploads.length, 50)
  const mixed = await signAiVideoOperatorUpload({
    filenames: ['clip.mp4', 'tone.mp3', 'still.jpg'],
  }, store())
  assert.equal(mixed.ok, true)
  const over = await signAiVideoOperatorUpload({
    filenames: Array.from({ length: 51 }, (_, i) => `ref-${String(i + 1).padStart(2, '0')}.jpg`),
  }, store())
  assert.equal(over.error, 'invalid_input')
})

test('list uploads reads the operator inbox without polling generate', async () => {
  const empty = await listAiVideoOperatorUploads(store())
  assert.equal(empty.ok, true)
  if (!('uploads' in empty)) throw new Error('missing uploads')
  assert.deepEqual(empty.uploads, [])
  const listed = await listAiVideoOperatorUploads({
    ...store(),
    listInbox: async () => [{
      path: 'operator/inbox/a/face.jpg',
      name: 'face.jpg',
      url: 'https://example.test/face.jpg',
      createdAt: '2026-09-01T00:00:00.000Z',
    }],
  })
  assert.equal(listed.ok, true)
  if (!('uploads' in listed)) throw new Error('missing uploads')
  assert.equal(listed.uploads[0].path, 'operator/inbox/a/face.jpg')
})

test('prompt saver stores title, full prompt, and cover without a job', async () => {
  const ready = await saveAiVideoOperatorPrompt({
    title: 'Hujan gang',
    prompt: PROMPT,
    cover_path: 'operator/inbox/cover.png',
    ratio: '9:16',
    duration_seconds: 6,
    model: 'seedance-2.5',
  }, store())
  assert.equal(ready.ok, true)
  if (!('item' in ready)) throw new Error('missing item')
  assert.equal(ready.item.title, 'Hujan gang')
  assert.equal(ready.item.result_path, 'operator/inbox/cover.png')
  assert.equal(ready.item.source_job_id, null)
  const short = await saveAiVideoOperatorPrompt({
    title: 'X',
    prompt: 'too short',
    cover_path: 'operator/inbox/cover.png',
  }, store())
  assert.equal(short.error, 'invalid_operator_title')
  const noCover = await saveAiVideoOperatorPrompt({
    title: 'Hujan gang',
    prompt: PROMPT,
  }, store())
  assert.equal(noCover.error, 'invalid_operator_cover')
})

test('save library only copies a succeeded clip', async () => {
  const ready = await saveAiVideoOperatorLibrary({
    job_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    title: 'Rain alley',
  }, store({
    getJob: async () => job({ status: 'succeeded', resultPath: 'operator/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/result.mp4' }),
  }))
  assert.equal(ready.ok, true)
  if (!('item' in ready)) throw new Error('missing item')
  assert.equal(ready.item.title, 'Rain alley')
  const early = await saveAiVideoOperatorLibrary({
    job_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    title: 'Too soon',
  }, store({ getJob: async () => job({ status: 'queued' }) }))
  assert.equal(early.error, 'library_job_not_ready')
})

test('start forwards per-image roles and a library id to the store', async () => {
  let stored: { refRoles: string[]; libraryId: string | null } | null = null
  const result = await startAiVideoOperatorGenerate({
    prompt: PROMPT,
    ratio: '9:16',
    duration_seconds: 6,
    ref_urls: ['https://example.com/sheet.png'],
    ref_roles: ['reference_image'],
    library_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    client_request_id: REQUEST_ID,
  }, store({
    createQueued: async (input) => {
      stored = { refRoles: input.refRoles, libraryId: input.libraryId }
      return job({ refRoles: input.refRoles, libraryId: input.libraryId })
    },
  }), READY)
  assert.equal(result.ok, true)
  assert.deepEqual(stored, {
    refRoles: ['reference_image'],
    libraryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  })
})

test('list leaves a running job alone without waking the worker', async () => {
  let kicked = 0
  const result = await listAiVideoOperatorGenerate({ tid: 'WU-9F2K' }, store({
    listJobs: async () => [job({ status: 'running' })],
    kickWorker: async () => { kicked += 1 },
  }), READY)
  assert.equal(result.ok, true)
  assert.equal(result.enabled, true)
  assert.equal(result.library.length, 1)
  assert.equal(kicked, 0)
  assert.match(result.wallet_note, /monid\.ai\/wallet/)
  assert.ok(result.skill_stack?.modes?.some((row) => row.id === 'one-take-locked'))
})

test('list with a queued leftover job does not wake the worker', async () => {
  let kicked = 0
  const queued = job({ status: 'queued' })
  const result = await listAiVideoOperatorGenerate({}, store({
    listJobs: async () => [queued],
    kickWorker: async () => { kicked += 1 },
  }), READY)
  assert.equal(result.ok, true)
  assert.equal(result.jobs[0].status, 'queued')
  assert.equal(kicked, 0)
})

test('list ships the Monid wallet when the store can read it', async () => {
  const result = await listAiVideoOperatorGenerate({}, store({
    getWallet: async () => ({ value: 0.07, currency: 'USD', held: 0 }),
  }), READY)
  assert.equal(result.ok, true)
  assert.equal(result.wallet?.value, 0.07)
  const missing = await listAiVideoOperatorGenerate({}, store(), READY)
  assert.equal(missing.wallet, null)
})

const CHARACTER = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  name: 'Richie · kaus navy',
  sheetPath: 'operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sheet.png',
  sheetUrl: null,
  notes: null,
  createdAt: '2026-09-02T00:00:00.000Z',
}

test('character save validates input and signs the stored sheet', async () => {
  const saved = await saveAiVideoOperatorCharacter({
    name: 'Richie · kaus navy',
    sheet_path: 'operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sheet.png',
  }, {
    ...store(),
    saveCharacter: async ({ name, sheetPath }) => ({ ...CHARACTER, name, sheetPath }),
    signResult: async () => 'https://signed.example/sheet.png',
  })
  assert.equal(saved.ok, true)
  if (!('character' in saved)) throw new Error('missing character')
  assert.equal(saved.character.name, 'Richie · kaus navy')
  assert.equal(saved.character.sheet_url, 'https://signed.example/sheet.png')
  const badPath = await saveAiVideoOperatorCharacter({
    name: 'Richie',
    sheet_path: 'factory/x/sheet.png',
  }, { ...store(), saveCharacter: async () => CHARACTER })
  assert.equal(badPath.error, 'invalid_operator_character_sheet')
  const unavailable = await saveAiVideoOperatorCharacter({
    name: 'Richie',
    sheet_path: 'operator/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sheet.png',
  }, store())
  assert.equal(unavailable.error, 'characters_unavailable')
  assert.equal(unavailable.status, 501)
})

test('Higgsfield paste is sanitized and starts as written', async () => {
  const pasted = [
    'Reference @Image1 = RICHIE. Copy this person exactly: same face, same hair, same wardrobe, same body.',
    'Reference @Image2 = RENITA. Copy this person exactly: same face, same wardrobe, same hair length.',
    '@Audio1 = RENITA VOICE',
    '@Audio2 = richie voice',
    'PHYSICS Weight and cloth stay honest.',
    'AUDIO Keep the two attached voices.',
    'WHAT MUST SURVIVE Face, cake, apartment window.',
    'Generated with Higgsfield. Cadence Face Lock @[RICHIE].',
  ].join('\n')
  let stored = ''
  const started = await startCompiledGenerate({
    prompt: pasted,
    ratio: '9:16',
    duration_seconds: 30,
    client_request_id: REQUEST_ID,
  }, store({
    createQueued: async (input) => {
      stored = input.prompt
      return job({ prompt: input.prompt })
    },
  }), READY)
  assert.equal(started.ok, true)
  assert.match(stored, /@Image1/)
  assert.match(stored, /@Audio2/)
  assert.doesNotMatch(stored, /higgsfield|cadence|@\[/i)
  assert.doesNotMatch(stored, /Never slim the midface/)
})

test('headed prompt beyond the provider limit is rejected before a job is created', async () => {
  const long = `${PROMPT}\n${'Keep the alley wet. '.repeat(900)}`
  let stored = ''
  const started = await startCompiledGenerate({
    prompt: long,
    ratio: '9:16',
    duration_seconds: 6,
    client_request_id: REQUEST_ID,
  }, store({
    createQueued: async (input) => {
      stored = input.prompt
      return job({ prompt: input.prompt })
    },
  }), READY)
  assert.equal(started.error, 'monid_prompt_limit')
  assert.equal(stored, '')
})

test('compile locks a loose idea and start writes the compiled prompt', async () => {
  const compiled = compileAiVideoOperatorPrompt({
    idea: 'Richie duduk di diner malam, seruput kopi',
    skill_mode: 'one-take-locked',
    character_name: 'Richie · Adidas tee',
    duration_seconds: 6,
    ratio: '9:16',
  })
  if ('error' in compiled) throw new Error(String(compiled.error))
  assert.equal(compiled.ok, true)
  if (!('prompt' in compiled)) throw new Error('missing prompt')
  assert.match(compiled.prompt, /Never slim the midface/)
  assert.equal(compiled.identity, 'richie')
  let storedPrompt = ''
  const started = await startCompiledGenerate({
    prompt: 'Richie duduk di diner malam, seruput kopi',
    skill_mode: 'one-take-locked',
    character_name: 'Richie · Adidas tee',
    ratio: '9:16',
    duration_seconds: 6,
    client_request_id: REQUEST_ID,
    ref_urls: ['https://example.com/sheet.png'],
    ref_roles: ['reference_image'],
  }, store({
    createQueued: async (input) => {
      storedPrompt = input.prompt
      return job({ prompt: input.prompt })
    },
  }), READY)
  assert.equal(started.ok, true)
  assert.match(storedPrompt, /SCENE/)
  assert.match(storedPrompt, /174 cm/)
  const still = await startCompiledGenerate({
    prompt: 'Richie mid-sip at the diner window',
    output_kind: 'still',
    client_request_id: REQUEST_ID,
    character_name: 'Richie',
    skill_mode: 'cinematic-reel',
    ratio: '16:9',
    duration_seconds: 5,
  }, store(), READY)
  assert.equal(still.ok, true)
  if (!('still_prompt' in still)) throw new Error('missing still')
  assert.match(still.still_prompt ?? '', /LOOK-LOCK STILL/)
  assert.equal('job' in still, false)
})

test('list ships the character library with signed sheet urls', async () => {
  const result = await listAiVideoOperatorGenerate({}, {
    ...store(),
    listCharacters: async () => [CHARACTER],
    signResult: async () => 'https://signed.example/sheet.png',
  }, READY)
  assert.equal(result.ok, true)
  assert.equal(result.characters.length, 1)
  assert.equal(result.characters[0].name, 'Richie · kaus navy')
  assert.equal(result.characters[0].sheet_url, 'https://signed.example/sheet.png')
})

test('a repeated client request returns its existing job even at the inflight cap', async () => {
  let created = 0
  const result = await startCompiledGenerate({ prompt: PROMPT, ratio: '9:16', duration_seconds: 6, client_request_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }, store({
    findByRequestId: async () => job({ status: 'submitted', providerTaskId: 'existing-provider-run' }),
    countInflight: async () => 3,
    createQueued: async () => { created++; return job() },
  }), READY)
  assert.equal(result.ok, true)
  assert.equal(created, 0)
  assert.equal('job' in result && result.job?.provider_task_id, 'existing-provider-run')
})

test('rechecking a paused job resumes polling without creating a provider run', async () => {
  let submissions = 0; let resumed = 0
  const paused = job({ status: 'failed', providerTaskId: 'existing-provider-run', errorCode: 'operator_sync_timeout' })
  const result = await submitAiVideoOperatorGenerate({ job_id: paused.id }, {
    ...store({ getJob: async () => paused, submitQueued: async () => { submissions++; return job() } }),
    resumePolling: async () => { resumed++; return { ...paused, status: 'submitted', errorCode: null } },
  })
  assert.equal(resumed, 1); assert.equal(submissions, 0)
  assert.equal('job' in result && result.job?.provider_task_id, 'existing-provider-run')
})

test('list does not touch an unavailable worker', async () => {
  let kicked = 0
  const result = await listAiVideoOperatorGenerate({}, store({
    listJobs: async () => [job({ status: 'running' })],
    kickWorker: async () => { kicked += 1; throw new Error('down') },
  }), READY)
  assert.equal(result.worker_warning, null)
  assert.equal(result.jobs[0].status, 'running')
  assert.equal(kicked, 0)
})

test('simple start bypasses the old skill compiler and binds every photo and audio', async () => {
  let saved: any
  const result = await startCompiledGenerate({ prompt_mode: 'simple', prompt: 'Kucing lari', model: 'wan3.0', duration_seconds: 6, ratio: '9:16', client_request_id: REQUEST_ID, ref_paths: ['operator/inbox/cat.jpg', 'operator/inbox/voice.wav'], ref_durations: [0, 3] }, store({ createQueued: async (input) => { saved = input; return job({ prompt: input.prompt, providerModelId: input.model }) } }), { OPERATOR_GENERATE_ENABLED: 'true', MONID_API_KEY: 'mock-monid-test-credential-123456' })
  assert.equal(result.ok, true)
  assert.equal(saved.model, 'wan3.0')
  assert.equal(saved.generateAudio, true)
  assert.match(saved.prompt, /@Audio1/)
  assert.match(saved.prompt, /@Image1/)
  assert.deepEqual(saved.refRoles, ['reference_image', 'reference_audio'])
})

const RICHIE_FACE = 'asset://Asset-20260914100001-fghij'
const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333'
function founderAsset(over: Record<string, unknown> = {}) {
  return {
    assetId: 'Asset-20260914100001-fghij', assetType: 'Image' as const, status: 'active' as const, deletedAt: null,
    identity: { id: '22222222-2222-4222-8222-222222222222', ownerKind: 'founder' as const, customerId: null, orderId: null, verificationStatus: 'verified', revokedAt: null },
    ...over,
  }
}
const ASSET_START = { prompt_mode: 'simple', prompt: 'Richie melambai', model: 'seedance-2.5', duration_seconds: 6, ratio: '9:16', resolution: '1080p', client_request_id: REQUEST_ID, ref_urls: [RICHIE_FACE], ref_roles: ['reference_image'] }

test('asset:// start fails closed without an identity store and never creates a job', async () => {
  for (const start of [startCompiledGenerate, startAiVideoOperatorGenerate]) {
    let created = 0
    const result = await start(ASSET_START, store({ createQueued: async () => { created++; return job() } }), READY)
    assert.equal('error' in result && result.error, 'identity_asset_not_active')
    assert.equal('status' in result && result.status, 400)
    assert.equal(created, 0)
  }
})

test('asset:// start checks ownership, keeps asset refs unsigned, and inserts provider byteplus_modelark', async () => {
  for (const start of [startCompiledGenerate, startAiVideoOperatorGenerate]) {
    let saved: any, looked: string[] = []
    const result = await start(ASSET_START, store({
      findIdentityAssets: async (ids) => { looked = ids; return [founderAsset()] },
      createQueued: async (input) => { saved = input; return job({ provider: input.provider, refUrls: input.refUrls, resolution: input.resolution }) },
      signUpload: async () => { throw new Error('asset refs are not storage paths') },
    }), READY)
    assert.equal(result.ok, true)
    assert.deepEqual(looked, ['Asset-20260914100001-fghij'])
    assert.equal(saved.provider, 'byteplus_modelark')
    assert.deepEqual(saved.refUrls, [RICHIE_FACE])
    assert.deepEqual(saved.refPaths, [])
    assert.equal(saved.resolution, '1080p')
    assert.equal('job' in result && result.job?.provider, 'byteplus_modelark')
  }
})

test('asset:// start rejects a customer identity from another order and an inactive asset', async () => {
  for (const start of [startCompiledGenerate, startAiVideoOperatorGenerate]) {
    let created = 0
    const otherOrder = founderAsset({ identity: { id: 'x', ownerKind: 'customer', customerId: '55555555-5555-4555-8555-555555555555', orderId: '44444444-4444-4444-8444-444444444444', verificationStatus: 'verified', revokedAt: null } })
    const rejected = await start({ ...ASSET_START, tid: 'WU-9F2K' }, store({
      findOrderByTid: async () => ({ id: ORDER_ID, tid: 'WU-9F2K', email: 'a@b.co', idea: null, photos: [], customerId: CUSTOMER_ID }),
      findIdentityAssets: async () => [otherOrder],
      createQueued: async () => { created++; return job() },
    }), READY)
    assert.equal('error' in rejected && rejected.error, 'identity_asset_not_active')
    const sameCustomer = founderAsset({ identity: { ...otherOrder.identity, customerId: CUSTOMER_ID } })
    const accepted = await start({ ...ASSET_START, tid: 'WU-9F2K' }, store({
      findOrderByTid: async () => ({ id: ORDER_ID, tid: 'WU-9F2K', email: 'a@b.co', idea: null, photos: [], customerId: CUSTOMER_ID }),
      findIdentityAssets: async () => [sameCustomer],
      createQueued: async (input) => { created++; return job({ provider: input.provider, orderId: input.orderId }) },
    }), READY)
    assert.equal(accepted.ok, true)
    assert.equal('job' in accepted && accepted.job?.order_id, ORDER_ID)
    const processing = await start(ASSET_START, store({
      findIdentityAssets: async () => [founderAsset({ status: 'processing' })],
      createQueued: async () => { created++; return job() },
    }), READY)
    assert.equal('error' in processing && processing.error, 'identity_asset_not_active')
    const wrongRole = await start({ ...ASSET_START, ref_roles: ['reference_video'] }, store({
      findIdentityAssets: async () => [founderAsset()],
      createQueued: async () => { created++; return job() },
    }), READY)
    assert.equal('error' in wrongRole && wrongRole.error, 'invalid_operator_ref_role')
    assert.equal(created, 1)
  }
})

test('admin start keeps asset:// jobs queued without inline Monid', async () => {
  let submitted = 0
  const result = await startCompiledGenerate(ASSET_START, store({
    findIdentityAssets: async () => [founderAsset()],
    submitQueued: async () => { submitted += 1; throw new Error('should_not_submit_byteplus') },
    createQueued: async (input) => job({ provider: input.provider, refUrls: input.refUrls, status: 'queued' }),
  }), READY)
  assert.equal(result.ok, true)
  if (!('job' in result)) throw new Error('missing job')
  assert.equal(result.job.status, 'queued')
  assert.equal(result.job.provider, 'byteplus_modelark')
  assert.equal(submitted, 0)
})

test('https-only start never touches the identity store and stays on Monid', async () => {
  for (const start of [startCompiledGenerate, startAiVideoOperatorGenerate]) {
    let saved: any
    const result = await start({ ...ASSET_START, resolution: '720p', ref_urls: ['https://example.com/face.jpg'] }, store({
      findIdentityAssets: async () => { throw new Error('unnecessary identity lookup') },
      createQueued: async (input) => { saved = input; return job({ provider: input.provider }) },
    }), READY)
    assert.equal(result.ok, true)
    assert.equal(saved.provider, 'monid')
  }
})

test('list hides asset:// refs behind a null url so the Studio shows its avatar', async () => {
  const row = job({ refUrls: [RICHIE_FACE, 'https://example.com/face.jpg'], refRoles: ['reference_image', 'reference_image'], provider: 'byteplus_modelark' })
  const body = await listAiVideoOperatorGenerate({ simple: true, jobId: row.id, includeReferences: true }, store({ listJobs: async () => [row], getJob: async () => row }), READY)
  assert.deepEqual(body.job?.reference_media?.map((item: { path: string; url: string | null }) => [item.path, item.url]), [[RICHIE_FACE, null], ['https://example.com/face.jpg', 'https://example.com/face.jpg']])
  assert.equal(body.job?.provider, 'byteplus_modelark')
})

test('simple polling skips catalog/library work and only signs references when requested', async () => {
  let signed: string[] = []
  const row = job({ refPaths: ['operator/inbox/cat.jpg'] })
  const deps = store({ listJobs: async () => [row], getJob: async () => row, listLibrary: async () => { throw new Error('unnecessary library fetch') }, listCharacters: async () => { throw new Error('unnecessary character fetch') }, signResult: async (path) => { signed.push(path); return 'https://example.com/' + path } })
  const env = { OPERATOR_GENERATE_ENABLED: 'true', MONID_API_KEY: 'mock-monid-test-credential-123456' }
  const plain = await listAiVideoOperatorGenerate({ simple: true, jobId: row.id }, deps, env)
  assert.equal(plain.ok, true); assert.equal(signed.length, 0); assert.deepEqual(plain.library, [])
  const hydrated = await listAiVideoOperatorGenerate({ simple: true, jobId: row.id, includeReferences: true }, deps, env)
  assert.deepEqual(signed, ['operator/inbox/cat.jpg'])
  assert.equal(hydrated.job?.reference_media?.[0]?.path, 'operator/inbox/cat.jpg')
})
