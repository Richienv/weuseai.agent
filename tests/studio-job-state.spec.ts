import assert from 'node:assert/strict'
import { test } from 'node:test'
const { jobState, mayCancelJob, isActiveJob, estimateCost } = await import(new URL('../admin/assets/studio-job-state.js', import.meta.url).href)
const job = { id: 'job', status: 'running', updated_at: new Date().toISOString() }
test('temporary provider output remains saving until a stored result exists', () => {
  assert.equal(jobState({ ...job, result_url: 'https://cdn.example/video.mp4' }).phase, 'saving')
  assert.equal(jobState({ ...job, status: 'succeeded' }).phase, 'saving')
  assert.equal(jobState({ ...job, status: 'succeeded', result_path: 'result.mp4' }).phase, 'ready')
})
test('queued errors are unresolved rather than falsely terminal', () => {
  assert.equal(isActiveJob({ ...job, status: 'queued', error_code: 'monid_unavailable' }), true)
  assert.equal(jobState({ ...job, status: 'queued', error_code: 'monid_unavailable' }).phase, 'queued')
})
test('local sync exhaustion offers an existing-run recovery, not a new paid generation', () => {
  const state = jobState({ ...job, status: 'failed', provider_task_id: 'run-1', error_code: 'operator_sync_timeout' })
  assert.equal(state.phase, 'sync-paused')
  assert.equal(state.canSync, true)
  assert.equal(jobState({ ...job, status: 'failed', error_code: 'monid_privacy' }).phase, 'failed')
})
test('unconfirmed stale status never claims upstream failure', () => {
  const state = jobState({ ...job, updated_at: '2026-09-01T00:00:00Z' }, Date.parse('2026-09-01T00:03:00Z'))
  assert.equal(state.phase, 'stale')
  assert.equal(state.active, true)
})
test('fresh queued jobs stay in the queue after two minutes', () => {
  const state = jobState({ ...job, status: 'queued', attempt: 0, updated_at: '2026-09-01T00:00:00Z' }, Date.parse('2026-09-01T00:03:00Z'))
  assert.equal(state.phase, 'queued')
  assert.equal(state.label, 'Dalam antrean')
})
test('cancellation is offered only before the provider accepts the job', () => {
  assert.equal(mayCancelJob({ ...job, can_cancel: true }), false)
  assert.equal(mayCancelJob({ ...job, status: 'submitted', can_cancel: true }), false)
  assert.equal(mayCancelJob({ ...job, status: 'queued', can_cancel: true }), true)
})
test('displayed estimates reflect the selected model', () => {
  assert.equal(estimateCost('seedance-2.5', '720p', 5), 1.16)
  assert.equal(estimateCost('seedance-2.0', '720p', 5), .76)
  assert.equal(estimateCost('seedance-2.0-mini', '720p', 5), .38)
})
test('unknown provider submission is not mislabeled as a failed render', () => {
  const state = jobState({ ...job, status: 'failed', error_code: 'monid_submission_unknown' })
  assert.equal(state.phase, 'unconfirmed')
  assert.equal(state.tone, 'warning')
  assert.equal(state.canSync, undefined)
  const ark = jobState({ ...job, status: 'failed', error_code: 'modelark_submission_unknown' })
  assert.equal(ark.phase, 'unconfirmed')
  assert.equal(ark.tone, 'warning')
})
