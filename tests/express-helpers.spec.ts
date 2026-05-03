/**
 * Pure helpers used by services/provisioning/src/index.ts.
 *
 * Extracted out of the Express handler so we can TDD them without booting
 * a server. Behavioural contract:
 *
 *   parseSpinUpRequest(body, env) →
 *     - Reads customerId, tier, etc. from body
 *     - Falls back to env.TELEGRAM_BOT_TOKEN when body omits bot token
 *     - Falls back to env.DEFAULT_TELEGRAM_CHAT_ID when body omits allowed users
 *     - Returns { ok: false, error } for missing required fields
 *
 *   formatSpinUpResponse(result) →
 *     - Always { ok: true, vps_instance_id, vps_ip } (matches Phase 1 spec)
 *
 *   createVPSProvider(env) →
 *     - When ENABLE_REAL_PROVISIONING === 'false', returns MockVPSProvider
 *     - Otherwise returns IDCloudHostVPSProvider
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseSpinUpRequest,
  formatSpinUpResponse,
} from '../services/provisioning/src/spin-up-helpers.ts'

import { createVPSProvider } from '../services/provisioning/src/providers/index.ts'
import { MockVPSProvider } from '../services/provisioning/src/providers/mock-vps.ts'
import { IDCloudHostVPSProvider } from '../services/provisioning/src/providers/idcloudhost-vps.ts'

// ─── parseSpinUpRequest ────────────────────────────────────────────────────

test('parseSpinUpRequest: reads body fields correctly', () => {
  const r = parseSpinUpRequest(
    {
      customerId: 'cust-1',
      tier: 'pro',
      customerTelegramBotToken: 'body-bot-token',
      customerTelegramAllowedUserIds: '111,222',
      alwaysOnEnabled: true,
      useStarterCredits: false,
    },
    { TELEGRAM_BOT_TOKEN: 'env-bot', DEFAULT_TELEGRAM_CHAT_ID: '999' },
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.opts.customerId, 'cust-1')
  assert.equal(r.opts.tier, 'pro')
  assert.equal(r.opts.customerTelegramBotToken, 'body-bot-token')
  assert.equal(r.opts.customerTelegramAllowedUserIds, '111,222')
  assert.equal(r.opts.alwaysOnEnabled, true)
})

test('parseSpinUpRequest: falls back to env TELEGRAM_BOT_TOKEN when body omits it', () => {
  const r = parseSpinUpRequest(
    { customerId: 'cust-1', tier: 'pro' },
    { TELEGRAM_BOT_TOKEN: 'env-bot-token', DEFAULT_TELEGRAM_CHAT_ID: '999' },
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.opts.customerTelegramBotToken, 'env-bot-token')
})

test('parseSpinUpRequest: falls back to env DEFAULT_TELEGRAM_CHAT_ID when body omits it', () => {
  const r = parseSpinUpRequest(
    { customerId: 'cust-1', tier: 'pro' },
    { TELEGRAM_BOT_TOKEN: 'env-bot', DEFAULT_TELEGRAM_CHAT_ID: '6805409051' },
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.opts.customerTelegramAllowedUserIds, '6805409051')
})

test('parseSpinUpRequest: body wins when both body + env are set', () => {
  const r = parseSpinUpRequest(
    {
      customerId: 'cust-1',
      tier: 'pro',
      customerTelegramBotToken: 'body-token',
      customerTelegramAllowedUserIds: 'body-chat',
    },
    { TELEGRAM_BOT_TOKEN: 'env-token', DEFAULT_TELEGRAM_CHAT_ID: 'env-chat' },
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.opts.customerTelegramBotToken, 'body-token')
  assert.equal(r.opts.customerTelegramAllowedUserIds, 'body-chat')
})

test('parseSpinUpRequest: rejects missing customerId', () => {
  const r = parseSpinUpRequest({ tier: 'pro' }, {})
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /customerId/)
})

test('parseSpinUpRequest: rejects missing tier', () => {
  const r = parseSpinUpRequest({ customerId: 'c' }, {})
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /tier/)
})

test('parseSpinUpRequest: rejects invalid tier', () => {
  const r = parseSpinUpRequest({ customerId: 'c', tier: 'bogus' }, {})
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /tier/)
})

test('parseSpinUpRequest: never falls back when body sends empty string (not undefined)', () => {
  // Empty string is a deliberate "no value" from the caller — don't override
  // with env. Only undefined/missing keys trigger fallback.
  const r = parseSpinUpRequest(
    {
      customerId: 'c',
      tier: 'pro',
      customerTelegramBotToken: '',
      customerTelegramAllowedUserIds: '',
    },
    { TELEGRAM_BOT_TOKEN: 'env-bot', DEFAULT_TELEGRAM_CHAT_ID: '999' },
  )
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.opts.customerTelegramBotToken, '')
  assert.equal(r.opts.customerTelegramAllowedUserIds, '')
})

// ─── formatSpinUpResponse ──────────────────────────────────────────────────

test('formatSpinUpResponse: returns Phase 1 spec shape with ok + vps_instance_id + vps_ip', () => {
  const body = formatSpinUpResponse({
    vpsId: 'vps-uuid-123',
    ip: '203.194.123.45',
    status: 'provisioning',
    done: Promise.resolve(),
  })
  assert.deepEqual(body, {
    ok: true,
    vps_instance_id: 'vps-uuid-123',
    vps_ip: '203.194.123.45',
  })
})

test('formatSpinUpResponse: vps_ip is null when IP not yet assigned', () => {
  const body = formatSpinUpResponse({
    vpsId: 'vps-uuid-123',
    ip: null,
    status: 'provisioning',
    done: Promise.resolve(),
  })
  assert.equal(body.vps_ip, null)
  assert.equal(body.ok, true)
  assert.equal(body.vps_instance_id, 'vps-uuid-123')
})

// ─── createVPSProvider factory ─────────────────────────────────────────────

test('createVPSProvider: dry-run mode (ENABLE_REAL_PROVISIONING=false) returns MockVPSProvider', () => {
  const original = process.env.ENABLE_REAL_PROVISIONING
  process.env.ENABLE_REAL_PROVISIONING = 'false'
  try {
    const p = createVPSProvider()
    assert.ok(p instanceof MockVPSProvider, 'expected mock provider in dry-run mode')
  } finally {
    if (original === undefined) delete process.env.ENABLE_REAL_PROVISIONING
    else process.env.ENABLE_REAL_PROVISIONING = original
  }
})

test('createVPSProvider: production mode (ENABLE_REAL_PROVISIONING unset) returns IDCloudHostVPSProvider', () => {
  const original = process.env.ENABLE_REAL_PROVISIONING
  delete process.env.ENABLE_REAL_PROVISIONING
  try {
    const p = createVPSProvider()
    assert.ok(p instanceof IDCloudHostVPSProvider, 'expected IDCloudHost in production mode')
  } finally {
    if (original !== undefined) process.env.ENABLE_REAL_PROVISIONING = original
  }
})

test('createVPSProvider: explicit VPS_PROVIDER=mock returns MockVPSProvider', () => {
  const oReal = process.env.ENABLE_REAL_PROVISIONING
  const oWhich = process.env.VPS_PROVIDER
  delete process.env.ENABLE_REAL_PROVISIONING
  process.env.VPS_PROVIDER = 'mock'
  try {
    const p = createVPSProvider()
    assert.ok(p instanceof MockVPSProvider)
  } finally {
    if (oReal !== undefined) process.env.ENABLE_REAL_PROVISIONING = oReal
    if (oWhich === undefined) delete process.env.VPS_PROVIDER
    else process.env.VPS_PROVIDER = oWhich
  }
})
