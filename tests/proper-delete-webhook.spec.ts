// properDeleteWebhook — replaces the old safeDeleteWebhook which
// silently swallowed all errors and never verified the webhook was
// actually cleared. Customer e282ce25's bot still received our webhook
// after step 4 ran (REPLY_ALREADY_PAIRED to every message) because
// safeDeleteWebhook either returned silently on a 5xx or the webhook
// re-asserted on Telegram's side and we never noticed.
//
// New contract:
//   1. Call deleteWebhook (existing client method).
//   2. Call NEW getWebhookInfo to verify .url is empty.
//   3. Retry up to 3 attempts with exponential backoff (2s/4s/8s).
//   4. Return a structured result so the caller can:
//      - Continue onboarding on success (ok: true).
//      - Surface a non-fatal warning to the customer + log to alerts
//        on permanent failure (ok: false).

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  properDeleteWebhook,
  type ProperDeleteWebhookResult,
  type ITelegramWebhookOps,
} from '../supabase/functions/_shared/proper-delete-webhook.ts'

class StubTelegram implements ITelegramWebhookOps {
  deleteCalls: string[] = []
  infoCalls: string[] = []
  /** Queue of behaviours per `deleteWebhook` call. Pop-front. */
  deleteScript: Array<'ok' | 'throw'> = []
  /** Queue of `getWebhookInfo` returns (the .url field). Pop-front. */
  infoScript: Array<string | { throw: string }> = []

  async deleteWebhook(token: string): Promise<void> {
    this.deleteCalls.push(token)
    const next = this.deleteScript.shift() ?? 'ok'
    if (next === 'throw') throw new Error('Telegram deleteWebhook -> 503')
  }
  async getWebhookInfo(token: string): Promise<{ url: string }> {
    this.infoCalls.push(token)
    const next = this.infoScript.shift() ?? ''
    if (typeof next === 'object' && 'throw' in next) {
      throw new Error(next.throw)
    }
    return { url: typeof next === 'string' ? next : '' }
  }
}

// ─── happy path ────────────────────────────────────────────────────

test('happy path: deleteWebhook + getWebhookInfo both succeed first try', async () => {
  const t = new StubTelegram()
  // delete: ok by default; getWebhookInfo returns empty url
  const res = await properDeleteWebhook(t, 'tok-1', { sleepMs: () => {} })
  assert.equal(res.ok, true)
  assert.equal(res.attempts, 1)
  assert.equal(t.deleteCalls.length, 1)
  assert.equal(t.infoCalls.length, 1)
})

// ─── retry on transient failure ────────────────────────────────────

test('retries on deleteWebhook 5xx, succeeds on 2nd attempt', async () => {
  const t = new StubTelegram()
  t.deleteScript = ['throw', 'ok']
  // After throw, we don't call getWebhookInfo on attempt 1
  const sleepDurations: number[] = []
  const res = await properDeleteWebhook(t, 'tok-2', {
    sleepMs: (ms) => { sleepDurations.push(ms) },
  })
  assert.equal(res.ok, true)
  assert.equal(res.attempts, 2)
  assert.equal(t.deleteCalls.length, 2)
  // First sleep is 2000ms (exponential: 2s, 4s, 8s)
  assert.deepEqual(sleepDurations, [2000])
})

test('retries when getWebhookInfo says webhook still set', async () => {
  const t = new StubTelegram()
  // delete: ok-ok; getWebhookInfo returns set-then-cleared
  t.infoScript = ['https://still-our-webhook/path', '']
  const res = await properDeleteWebhook(t, 'tok-3', { sleepMs: () => {} })
  assert.equal(res.ok, true)
  assert.equal(res.attempts, 2)
  assert.equal(t.deleteCalls.length, 2)
  assert.equal(t.infoCalls.length, 2)
})

// ─── permanent failure ────────────────────────────────────────────

test('all 3 attempts fail → ok=false with finalError', async () => {
  const t = new StubTelegram()
  t.deleteScript = ['throw', 'throw', 'throw']
  const res = await properDeleteWebhook(t, 'tok-4', { sleepMs: () => {} })
  assert.equal(res.ok, false)
  assert.equal(res.attempts, 3)
  assert.match(res.finalError ?? '', /503/)
  assert.equal(t.deleteCalls.length, 3)
})

test('all 3 verify-fails → ok=false with verification error', async () => {
  const t = new StubTelegram()
  // delete always succeeds, but getWebhookInfo always reports a webhook
  t.infoScript = [
    'https://still-set/1',
    'https://still-set/2',
    'https://still-set/3',
  ]
  const res = await properDeleteWebhook(t, 'tok-5', { sleepMs: () => {} })
  assert.equal(res.ok, false)
  assert.equal(res.attempts, 3)
  assert.match(res.finalError ?? '', /still set|webhook url/i)
})

// ─── exponential backoff sequence ─────────────────────────────────

test('backoff sequence is 2s / 4s on first two retries', async () => {
  const t = new StubTelegram()
  t.deleteScript = ['throw', 'throw', 'ok']
  const sleepDurations: number[] = []
  await properDeleteWebhook(t, 'tok-6', {
    sleepMs: (ms) => { sleepDurations.push(ms) },
  })
  assert.deepEqual(sleepDurations, [2000, 4000])
})

// ─── never retries on 401 (bot token revoked) ─────────────────────

test('401 bot token revoked → no retry, returns immediately ok=false', async () => {
  const t = new StubTelegram()
  // Telegram client throws with a specific message on 401
  t.deleteScript = [{ throw: '401-marker' } as unknown as 'throw']
  // Override script with synthetic 401 thrown
  let firstCall = true
  const t401: ITelegramWebhookOps = {
    async deleteWebhook(token: string) {
      t.deleteCalls.push(token)
      if (firstCall) {
        firstCall = false
        throw new Error("Telegram deleteWebhook -> 401: customer's bot token revoked or invalid")
      }
    },
    async getWebhookInfo(token: string) {
      t.infoCalls.push(token)
      return { url: '' }
    },
  }
  const res = await properDeleteWebhook(t401, 'tok-7', { sleepMs: () => {} })
  assert.equal(res.ok, false)
  assert.equal(res.attempts, 1, 'no retry on 401')
  assert.match(res.finalError ?? '', /401/)
  // We should NOT have called getWebhookInfo because deleteWebhook threw
  assert.equal(t.infoCalls.length, 0)
})
