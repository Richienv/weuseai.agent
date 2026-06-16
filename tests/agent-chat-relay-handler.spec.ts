/**
 * agent-chat-relay handler — the browser-facing edge relay control flow
 * (dashboard Phase 2). Verifies: flag-dark 404, method, validation, X-CID,
 * rate/budget (with pre-charge refund), the not_ready/not_active split, late
 * resolve, model redaction, and that NO `detail`/IP leaks to the browser.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  agentChatRelayHandler,
  type AgentChatRelayDeps,
} from '../supabase/functions/_shared/agent-chat-relay-handler.ts'

const CID = '11111111-1111-1111-1111-111111111111'

function flyJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function makeDeps(over: Partial<AgentChatRelayDeps> = {}): AgentChatRelayDeps & { _commits: number[] } {
  const commits: number[] = []
  const base: AgentChatRelayDeps = {
    flag: { enabled: true, allowAll: true, allowlist: new Set() },
    rateLimiter: {
      check: async () => ({ allowed: true, retryAfter: 0, reason: 'ok' }),
      commit: async (_cid, delta) => { commits.push(delta) },
    },
    resolveCustomerState: async () => 'running',
    resolveTarget: async () => ({ ip: '203.0.113.5', cipher: { ciphertext: 'x', iv: 'y', auth_tag: 'z', key_version: 1 } }),
    decryptKey: async () => 'sk-decrypted-key',
    callFlyRelay: async () => flyJson({ choices: [{ message: { content: 'halo' } }], model: 'deepseek/deepseek-v4-pro', usage: { total_tokens: 120 } }),
    meta: async () => ({ chat_enabled: true, persona_slug: 'the-pro', remaining_pct: 80 }),
    ...over,
  }
  return Object.assign(base, { _commits: commits })
}

function req(body: unknown, opts: { method?: string; xcid?: string | null; raw?: string } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.xcid !== null) headers['x-cid'] = opts.xcid ?? CID
  const method = opts.method ?? 'POST'
  const init: RequestInit = { method, headers }
  // GET/HEAD cannot carry a body per the Fetch spec — omit it.
  if (method !== 'GET' && method !== 'HEAD') init.body = opts.raw !== undefined ? opts.raw : JSON.stringify(body)
  return new Request('https://x/functions/v1/agent-chat-relay', init)
}
const chat = (over: Record<string, unknown> = {}) => ({ customer_id: CID, messages: [{ role: 'user', content: 'halo' }], stream: false, ...over })

async function readErr(res: Response) { return (await res.json()) as Record<string, unknown> }

// ── flag / method / validation ──────────────────────────────────────────
test('flag OFF → 404 (dark, no route)', async () => {
  const res = await agentChatRelayHandler(req(chat()), makeDeps({ flag: { enabled: false, allowAll: true, allowlist: new Set() } }))
  assert.equal(res.status, 404)
})

test('not allowlisted → 404 (dark rollout)', async () => {
  const res = await agentChatRelayHandler(req(chat()), makeDeps({ flag: { enabled: true, allowAll: false, allowlist: new Set(['someone-else']) } }))
  assert.equal(res.status, 404)
})

test('non-POST → 405', async () => {
  const res = await agentChatRelayHandler(req(chat(), { method: 'GET' }), makeDeps())
  assert.equal(res.status, 405)
})

test('bad JSON → 400 invalid_json', async () => {
  const res = await agentChatRelayHandler(req(null, { raw: '{not json' }), makeDeps())
  assert.equal(res.status, 400)
  assert.equal((await readErr(res)).error, 'invalid_json')
})

test('non-UUID customer_id → 400', async () => {
  const res = await agentChatRelayHandler(req(chat({ customer_id: 'nope' }), { xcid: 'nope' }), makeDeps())
  assert.equal(res.status, 400)
})

test('messages must be a 1..40 array of valid roles', async () => {
  const empty = await agentChatRelayHandler(req(chat({ messages: [] })), makeDeps())
  assert.equal(empty.status, 400)
  const badRole = await agentChatRelayHandler(req(chat({ messages: [{ role: 'root', content: 'x' }] })), makeDeps())
  assert.equal(badRole.status, 400)
})

// ── X-CID ─────────────────────────────────────────────────────────────────
test('missing X-CID → 403 x_cid_mismatch', async () => {
  const res = await agentChatRelayHandler(req(chat(), { xcid: null }), makeDeps())
  assert.equal(res.status, 403)
  assert.equal((await readErr(res)).error, 'x_cid_mismatch')
})

test('X-CID != body customer_id → 403', async () => {
  const res = await agentChatRelayHandler(req(chat(), { xcid: '22222222-2222-2222-2222-222222222222' }), makeDeps())
  assert.equal(res.status, 403)
})

// ── meta ────────────────────────────────────────────────────────────────
test('meta:true → returns status, no spend (no rate charge)', async () => {
  let charged = false
  const deps = makeDeps({ rateLimiter: { check: async () => { charged = true; return { allowed: true, retryAfter: 0, reason: 'ok' } }, commit: async () => {} } })
  const res = await agentChatRelayHandler(req({ customer_id: CID, meta: true }), deps)
  assert.equal(res.status, 200)
  const m = (await res.json()) as Record<string, unknown>
  assert.equal(m.persona_slug, 'the-pro')
  assert.equal(charged, false, 'meta must not charge the rate limiter')
})

// ── rate / budget (+ refund) ──────────────────────────────────────────────
test('rate_limited → 429 + retry_after_seconds', async () => {
  const deps = makeDeps({ rateLimiter: { check: async () => ({ allowed: false, retryAfter: 17, reason: 'rate_limited' }), commit: async () => {} } })
  const res = await agentChatRelayHandler(req(chat()), deps)
  assert.equal(res.status, 429)
  const b = await readErr(res)
  assert.equal(b.error, 'rate_limited')
  assert.equal(b.retry_after_seconds, 17)
})

test('budget_exceeded → 402', async () => {
  const deps = makeDeps({ rateLimiter: { check: async () => ({ allowed: false, retryAfter: 0, reason: 'budget_exceeded' }), commit: async () => {} } })
  const res = await agentChatRelayHandler(req(chat()), deps)
  assert.equal(res.status, 402)
  assert.equal((await readErr(res)).error, 'budget_exceeded')
})

test('rate-limiter DB error fails CLOSED → 429', async () => {
  const deps = makeDeps({ rateLimiter: { check: async () => ({ allowed: false, retryAfter: 5, reason: 'error' }), commit: async () => {} } })
  const res = await agentChatRelayHandler(req(chat()), deps)
  assert.equal(res.status, 429)
})

// ── active-sub split + refund ─────────────────────────────────────────────
test('provisioning VPS → 503 not_ready (NOT 403) + refunds the pre-charge', async () => {
  const deps = makeDeps({ resolveCustomerState: async () => 'provisioning' })
  const res = await agentChatRelayHandler(req(chat()), deps)
  assert.equal(res.status, 503)
  assert.equal((await readErr(res)).error, 'not_ready')
  assert.deepEqual(deps._commits, [-2048], 'pre-charge must be refunded on rejection')
})

test('inactive customer → 403 not_active + refund', async () => {
  const deps = makeDeps({ resolveCustomerState: async () => 'inactive' })
  const res = await agentChatRelayHandler(req(chat()), deps)
  assert.equal(res.status, 403)
  assert.equal((await readErr(res)).error, 'not_active')
  assert.deepEqual(deps._commits, [-2048])
})

test('no resolvable target (0 rows / ambiguous) → 503 agent_unavailable + refund', async () => {
  const deps = makeDeps({ resolveTarget: async () => null })
  const res = await agentChatRelayHandler(req(chat()), deps)
  assert.equal(res.status, 503)
  assert.equal((await readErr(res)).error, 'agent_unavailable')
  assert.deepEqual(deps._commits, [-2048])
})

// ── happy buffered path: redact model + commit actual ─────────────────────
test('buffered success → 200, model REDACTED, commits actual−ceiling', async () => {
  const deps = makeDeps()
  const res = await agentChatRelayHandler(req(chat()), deps)
  assert.equal(res.status, 200)
  const body = (await res.json()) as { model?: unknown; choices: Array<{ message: { content: string } }> }
  assert.equal('model' in body, false, 'model must be stripped from the browser response')
  assert.equal(body.choices[0].message.content, 'halo')
  assert.deepEqual(deps._commits, [120 - 2048], 'commit reconciles actual usage vs the pre-charge')
})

// ── no leak ───────────────────────────────────────────────────────────────
test('upstream error (with an IP in its body) → opaque 502, NO ip/detail to browser', async () => {
  const deps = makeDeps({
    callFlyRelay: async () => flyJson({ ok: false, error: 'boom', ip_address: '203.0.113.9', detail: 'ssh 203.0.113.9 failed' }, 500),
  })
  const res = await agentChatRelayHandler(req(chat()), deps)
  assert.equal(res.status, 502)
  const text = await res.text()
  assert.equal(text.includes('203.0.113.9'), false, 'no VPS IP may leak')
  assert.equal(text.includes('detail'), false, 'no detail field may leak')
  assert.match(text, /upstream_unavailable/)
})

// ── streaming path: tee + meter, never buffers ────────────────────────────
test('stream success → 200 text/event-stream + meterStream invoked (no await text)', async () => {
  let metered = false
  const sse = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hai"}}]}\n\ndata: [DONE]\n\n')); c.close() },
  })
  const deps = makeDeps({
    callFlyRelay: async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    meterStream: () => { metered = true },
  })
  const res = await agentChatRelayHandler(req(chat({ stream: true })), deps)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') || '', /text\/event-stream/)
  assert.equal(metered, true, 'the tee meter branch must be wired')
})
