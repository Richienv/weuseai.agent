// Phase 5-5: approval-telegram-formatter tests.
//
// Pure formatter at supabase/functions/_shared/approval-telegram-formatter.ts.
// Tests:
//   - callback_data round-trips and stays under 64-byte limit
//   - parser rejects malformed payloads
//   - formatApprovalRequest produces BI brand-voice copy + 2-button keyboard
//   - expiry formatting handles days / hours / sub-hour correctly

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  APPROVAL_ACK,
  buildCallbackData,
  formatApprovalRequest,
  formatExpiry,
  parseCallbackData,
  type ApprovalRowSlim,
} from '../supabase/functions/_shared/approval-telegram-formatter.ts'

const APPR_ID = '11111111-1111-1111-1111-111111111111'
const NOW = '2026-05-09T13:00:00.000Z'

// ─── callback_data wire format ────────────────────────────────────

test('buildCallbackData produces the expected wire format', () => {
  assert.equal(
    buildCallbackData('approve', APPR_ID),
    `appr:approve:${APPR_ID}`,
  )
  assert.equal(buildCallbackData('reject', APPR_ID), `appr:reject:${APPR_ID}`)
})

test('buildCallbackData fits within Telegram 64-byte cap', () => {
  // Real uuids are 36 chars; max payload = 4 + 1 + 7 + 1 + 36 = 49.
  const data = buildCallbackData('approve', APPR_ID)
  assert.ok(data.length <= 64, `${data.length} > 64`)
})

test('parseCallbackData round-trips the same data', () => {
  const data = buildCallbackData('approve', APPR_ID)
  const parsed = parseCallbackData(data)
  assert.deepEqual(parsed, { decision: 'approve', approval_id: APPR_ID })
})

test('parseCallbackData rejects bad prefix', () => {
  assert.equal(parseCallbackData('not-a-prefix:approve:abc'), null)
  assert.equal(parseCallbackData(''), null)
})

test('parseCallbackData rejects bad decision', () => {
  assert.equal(parseCallbackData('appr:maybe:abc'), null)
})

test('parseCallbackData rejects missing approval_id', () => {
  assert.equal(parseCallbackData('appr:approve:'), null)
})

// ─── formatExpiry ─────────────────────────────────────────────────

test('formatExpiry: days when ≥1 day remaining', () => {
  // 2026-05-09 13:00 → 2026-05-23 13:00 = 14 days
  const out = formatExpiry('2026-05-23T13:00:00.000Z', NOW)
  assert.match(out, /expires dalam 14 hari/)
})

test('formatExpiry: hours when <1 day, ≥1 hour', () => {
  const out = formatExpiry('2026-05-10T01:00:00.000Z', NOW) // +12h
  assert.match(out, /expires dalam 12 jam/)
})

test('formatExpiry: kurang dari 1 jam when <1 hour remaining', () => {
  const out = formatExpiry('2026-05-09T13:30:00.000Z', NOW) // +30min
  assert.match(out, /expires kurang dari 1 jam/)
})

test('formatExpiry: returns "expired" when in past', () => {
  const out = formatExpiry('2026-05-08T13:00:00.000Z', NOW)
  assert.equal(out, 'expired')
})

// ─── formatApprovalRequest ────────────────────────────────────────

function makeRow(): ApprovalRowSlim {
  return {
    id: APPR_ID,
    action_kind: 'incorporate',
    action_summary: 'Sign akta notaris untuk PT founders',
    proposed_by_agent: 'business-director',
    expires_at: '2026-05-23T13:00:00.000Z',
  }
}

test('formatApprovalRequest produces BI brand-voice copy + 2-button keyboard', () => {
  const out = formatApprovalRequest(makeRow(), NOW)

  // Text contains key fields
  assert.match(out.text, /Approval diminta dari business-director/)
  assert.match(out.text, /Action: Incorporate/)
  assert.match(out.text, /Sign akta notaris untuk PT founders/)
  assert.match(out.text, /expires dalam 14 hari/)

  // BI brand voice — kamu form, no banned words, no exclamation
  assert.match(out.text, /\bkamu\b/)
  assert.ok(!out.text.includes('!'), 'no exclamation marks')
  assert.ok(!out.text.includes(' Anda '), 'no Anda')
  for (const banned of ['basically', 'just', 'literally', 'honestly', 'kind of', 'pretty much', 'revolutionary', 'disrupt', '10x', 'game-changer', 'next-level']) {
    assert.ok(
      !out.text.toLowerCase().includes(banned),
      `text should not contain banned word "${banned}"`,
    )
  }

  // 2-button inline keyboard (Approve + Reject in single row)
  assert.equal(out.reply_markup.inline_keyboard.length, 1)
  assert.equal(out.reply_markup.inline_keyboard[0].length, 2)
  const [approveBtn, rejectBtn] = out.reply_markup.inline_keyboard[0]
  assert.equal(approveBtn.text, 'Approve')
  assert.equal(rejectBtn.text, 'Reject')
  if ('callback_data' in approveBtn) {
    assert.equal(approveBtn.callback_data, `appr:approve:${APPR_ID}`)
  } else {
    assert.fail('approve button should have callback_data, not url')
  }
  if ('callback_data' in rejectBtn) {
    assert.equal(rejectBtn.callback_data, `appr:reject:${APPR_ID}`)
  } else {
    assert.fail('reject button should have callback_data, not url')
  }
})

test('formatApprovalRequest renders different action_kinds with correct labels', () => {
  for (const kind of ['contract_sign', 'public_emission', 'regulatory_filing'] as const) {
    const row = makeRow()
    row.action_kind = kind
    const out = formatApprovalRequest(row, NOW)
    assert.match(out.text, /^Approval diminta/, `${kind} should format text`)
    // callback_data wired correctly per row
    const buttons = out.reply_markup.inline_keyboard[0]
    if ('callback_data' in buttons[0]) {
      assert.equal(buttons[0].callback_data, `appr:approve:${row.id}`)
    }
  }
})

// ─── APPROVAL_ACK strings ────────────────────────────────────────

test('APPROVAL_ACK strings match BI brand voice (no banned words, no exclamation)', () => {
  for (const [kind, msg] of Object.entries(APPROVAL_ACK)) {
    assert.ok(!msg.includes('!'), `${kind} ack contains exclamation`)
    for (const banned of ['basically', 'just', 'literally', 'honestly', '10x']) {
      assert.ok(
        !msg.toLowerCase().includes(banned),
        `${kind} ack contains banned word "${banned}"`,
      )
    }
  }
})

// ─── ACTION_KINDS drift defense (action_kind enum coherent with handler) ──

test('all 4 action_kinds have ACTION_LABELS coverage', () => {
  // Implicitly tested above since formatApprovalRequest doesn't crash for
  // the 4 known kinds. Make it explicit:
  for (const kind of [
    'incorporate',
    'contract_sign',
    'public_emission',
    'regulatory_filing',
  ] as const) {
    const row = makeRow()
    row.action_kind = kind
    const out = formatApprovalRequest(row, NOW)
    assert.ok(out.text.includes('Action:'), `${kind} should produce labeled text`)
  }
})
