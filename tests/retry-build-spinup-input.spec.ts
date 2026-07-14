/**
 * Regression guard for the dead auto-retry worker (go-live audit 2026-06-18).
 *
 * buildSpinUpInput previously lived in the Deno entry (index.ts) and called
 * decrypt_bot_token with a NON-EXISTENT `cust_id` arg — the RPC's real
 * signature is decrypt_bot_token(encrypted text, enc_key text). The RPC
 * errored on every call, so the worker silently returned null for EVERY
 * retry while its handler test stayed green (it mocked buildSpinUpInput).
 *
 * These tests exercise the REAL shared buildSpinUpInput with a recording
 * mock client, asserting the customer SELECT + the exact RPC call shape.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSpinUpInput,
  type RetryDbClient,
  type PendingProvisionRow,
} from '../supabase/functions/_shared/retry-pending-provisions-handler.ts'

type MockOpts = {
  customer?: Record<string, unknown> | null
  custErr?: unknown
  decrypted?: unknown
  decErr?: unknown
  orKey?: string | null
}

function makeDb(opts: MockOpts) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const selects: string[] = []
  const db: RetryDbClient = {
    from(table: string) {
      return {
        select(cols: string) {
          selects.push(`${table}:${cols}`)
          return {
            eq() {
              return {
                async maybeSingle() {
                  if (table === 'customers') {
                    return { data: opts.customer ?? null, error: opts.custErr ?? null }
                  }
                  if (table === 'customer_openrouter_keys') {
                    return { data: opts.orKey ? { api_key: opts.orKey } : null, error: null }
                  }
                  return { data: null, error: null }
                },
              }
            },
          }
        },
      }
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args })
      if (fn === 'decrypt_bot_token') return { data: opts.decrypted ?? null, error: opts.decErr ?? null }
      return { data: null, error: null }
    },
  }
  return { db, rpcCalls, selects }
}

const ROW: PendingProvisionRow = {
  subscription_id: 'sub-1',
  customer_id: 'cust-1',
  tier: 'done-for-you',
  always_on_enabled: false,
  subscription_started_at: '2026-06-18T00:00:00Z',
}

test('buildSpinUpInput decrypts via {encrypted, enc_key} — never cust_id (dead-worker regression)', async () => {
  const { db, rpcCalls, selects } = makeDb({
    customer: {
      id: 'cust-1',
      telegram_chat_id: '12345',
      soul_md_text: '# soul',
      telegram_bot_token: 'CIPHERTEXT',
    },
    decrypted: 'BOT:TOKEN',
    orKey: 'sk-or-123',
  })

  const input = await buildSpinUpInput(db, ROW, 'ENC_KEY_B64')

  // The RPC must be called with the CIPHERTEXT as `encrypted`, not the customer id.
  assert.equal(rpcCalls.length, 1)
  assert.equal(rpcCalls[0].fn, 'decrypt_bot_token')
  assert.equal(rpcCalls[0].args.encrypted, 'CIPHERTEXT')
  assert.equal(rpcCalls[0].args.enc_key, 'ENC_KEY_B64')
  assert.ok(!('cust_id' in rpcCalls[0].args), 'must NOT pass the non-existent cust_id arg')

  // The customer SELECT must include telegram_bot_token (the ciphertext source).
  assert.ok(selects.some(s => s.startsWith('customers:') && s.includes('telegram_bot_token')))

  // Returns a fully-populated SpinUpInput.
  assert.deepEqual(input, {
    customerId: 'cust-1',
    tier: 'done-for-you',
    telegramChatId: '12345',
    telegramBotToken: 'BOT:TOKEN',
    openrouterApiKey: 'sk-or-123',
    soulMdContent: '# soul',
    alwaysOnEnabled: false,
  })
})

test('buildSpinUpInput returns null without calling the RPC when the bot token ciphertext is absent', async () => {
  const { db, rpcCalls } = makeDb({
    customer: { id: 'cust-1', telegram_chat_id: '1', soul_md_text: '# soul', telegram_bot_token: null },
    orKey: 'sk-or-123',
  })
  const input = await buildSpinUpInput(db, ROW, 'ENC_KEY_B64')
  assert.equal(input, null)
  assert.equal(rpcCalls.length, 0, 'no decrypt attempt when there is no ciphertext')
})

test('buildSpinUpInput returns null when a critical field (openrouter key) is missing', async () => {
  const { db } = makeDb({
    customer: { id: 'cust-1', telegram_chat_id: '1', soul_md_text: '# soul', telegram_bot_token: 'CIPHER' },
    decrypted: 'BOT:TOKEN',
    orKey: null,
  })
  assert.equal(await buildSpinUpInput(db, ROW, 'ENC_KEY_B64'), null)
})
