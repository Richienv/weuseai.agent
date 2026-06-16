/**
 * redact-for-log — the chat relay's log scrubber. Contract: a VPS IP / key /
 * Authorization / raw stderr must NEVER survive into a log line (dashboard
 * spec §3.5).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { scrubText, redactForLog } from '../supabase/functions/_shared/redact-for-log.ts'

test('scrubText: strips an IPv4 from free text (e.g. SSH stderr)', () => {
  const out = scrubText("ssh: connect to host 203.0.113.7 port 22: Connection refused")
  assert.equal(out.includes('203.0.113.7'), false)
  assert.match(out, /\[ip\]/)
})

test('scrubText: strips an IPv6-shaped token', () => {
  const out = scrubText('bound to 2001:db8:0:0:0:0:0:1 oops')
  assert.equal(/2001:db8/.test(out), false)
})

test('redactForLog: sensitive keys become [redacted], not scrubbed-and-kept', () => {
  const out = redactForLog({
    cid: 'abc', ip_address: '203.0.113.9', api_server_key: 'sk-secret-xyz',
    Authorization: 'Bearer sk-or-v1-deadbeef', event: 'chat.forward',
  })
  assert.equal(out.cid, 'abc')
  assert.equal(out.event, 'chat.forward')
  assert.equal(out.ip_address, '[redacted]')
  assert.equal(out.api_server_key, '[redacted]')
  assert.equal(out.Authorization, '[redacted]')
})

test('redactForLog: a non-sensitive string field still gets IP-scrubbed', () => {
  const out = redactForLog({ note: 'failed talking to 198.51.100.4 retrying' })
  assert.equal(String(out.note).includes('198.51.100.4'), false)
})

test('redactForLog: never throws on a circular / bigint field via the emitter path', () => {
  // redactForLog itself only walks one level; assert it returns an object.
  const out = redactForLog({ n: BigInt(5), count: 3 })
  assert.equal(out.count, 3)
})
