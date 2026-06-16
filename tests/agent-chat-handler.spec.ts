/**
 * Fly tunnel relay handler (dashboard Phase 3) — DI-tested against a mock 8642.
 * Verifies: flag-dark, validation, that the FORCE-PINNED body (not the client's
 * model) reaches the upstream, response-side pin verification, error-frame
 * interception, status mapping, and opaque errors.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleAgentChat, type AgentChatDeps, type ApiServerResult } from '../services/provisioning/src/routes/agent-chat.ts'
import { PINNED_MODEL } from '../services/provisioning/src/routes/agent-chat-model-guard.ts'

const VALID = {
  customer_id: '11111111-1111-1111-1111-111111111111',
  ip_address: '203.0.113.5',
  api_server_key: 'sk-key',
  messages: [{ role: 'user', content: 'halo' }],
  max_tokens_ceiling: 2048,
}
const deepseekOk: ApiServerResult = { ok: true, status: 200, json: { model: 'deepseek/deepseek-v4-pro', choices: [{ message: { content: 'hai' } }] } }

function deps(over: Partial<AgentChatDeps> = {}): AgentChatDeps {
  return {
    enabled: true,
    callApiServer: async () => deepseekOk,
    ...over,
  }
}

test('flag OFF → 404, never calls the API server', async () => {
  let called = false
  const r = await handleAgentChat(VALID, deps({ enabled: false, callApiServer: async () => { called = true; return deepseekOk } }))
  assert.equal(r.status, 404)
  assert.equal(called, false)
})

test('missing ip / key / messages → 400', async () => {
  assert.equal((await handleAgentChat({ ...VALID, ip_address: '' }, deps())).status, 400)
  assert.equal((await handleAgentChat({ ...VALID, api_server_key: '' }, deps())).status, 400)
  assert.equal((await handleAgentChat({ ...VALID, messages: [] }, deps())).status, 400)
})

test('FORCE-PIN: a malicious client model never reaches the upstream', async () => {
  let seenBody: { model?: string; messages?: unknown; stream?: boolean } | null = null
  const r = await handleAgentChat(
    { ...VALID, model: 'anthropic/claude-opus-4-8', stream: true, provider: { order: ['Anthropic'] } },
    deps({ callApiServer: async (_t, body) => { seenBody = body; return deepseekOk } }),
  )
  assert.equal(r.status, 200)
  assert.equal(seenBody!.model, PINNED_MODEL, 'upstream must receive the DeepSeek pin, not claude-opus')
  assert.equal(seenBody!.stream, false, 'Phase 3 forces buffered (stream:false) to the VPS')
})

test('happy buffered → 200 with the completion', async () => {
  const r = await handleAgentChat(VALID, deps())
  assert.equal(r.status, 200)
  assert.equal((r.body as { choices: Array<{ message: { content: string } }> }).choices[0].message.content, 'hai')
})

test('response reports a NON-deepseek model → 502 pin_violation', async () => {
  const r = await handleAgentChat(VALID, deps({
    callApiServer: async () => ({ ok: true, status: 200, json: { model: 'anthropic/claude-opus-4-8', choices: [] } }),
  }))
  assert.equal(r.status, 502)
  assert.equal((r.body as { error: string }).error, 'pin_violation')
})

test('upstream error frame is intercepted → opaque 502 (no provider/config leak)', async () => {
  const r = await handleAgentChat(VALID, deps({
    callApiServer: async () => ({ ok: true, status: 200, json: { error: { message: 'no credit', metadata: { provider: 'Anthropic' } } } }),
  }))
  assert.equal(r.status, 502)
  const text = JSON.stringify(r.body)
  assert.equal(r.status, 502)
  assert.equal((r.body as { error: string }).error, 'upstream_unavailable')
  assert.equal(text.includes('Anthropic'), false, 'upstream provider must not leak')
})

test('callApiServer throws → opaque 502', async () => {
  const r = await handleAgentChat(VALID, deps({ callApiServer: async () => { throw new Error('ssh boom 203.0.113.9') } }))
  assert.equal(r.status, 502)
  const text = JSON.stringify(r.body)
  assert.equal(text.includes('203.0.113.9'), false, 'no IP/stderr may leak')
  assert.equal(text.includes('detail'), false)
})

test('upstream 429 / 402 → mapped to rate_limited / budget_exceeded', async () => {
  assert.equal((await handleAgentChat(VALID, deps({ callApiServer: async () => ({ ok: false, status: 429 }) }))).status, 429)
  assert.equal((await handleAgentChat(VALID, deps({ callApiServer: async () => ({ ok: false, status: 402 }) }))).status, 402)
  assert.equal((await handleAgentChat(VALID, deps({ callApiServer: async () => ({ ok: false, status: 500 }) }))).status, 502)
})
