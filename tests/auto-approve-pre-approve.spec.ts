// Auto-approve — minimum-viable happy-path coverage.
//
// Pre-approves customer's Telegram chat_id by writing directly to
// /home/weuseai/.hermes/pairing/telegram-approved.json. Skips Hermes
// upstream's pairing-code prompt on first /start.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRefreshEnvCommand,
} from '../services/provisioning/src/routes/refresh-env.js'

test('emits pre-approve block when telegramChatId provided', () => {
  const cmd = buildRefreshEnvCommand(
    { TELEGRAM_BOT_TOKEN: '12345:fake' },
    { telegramChatId: '6805409051', telegramUserName: 'Sarah Test' },
  )
  // Must reference the canonical pairing file path.
  assert.match(cmd, /\/home\/weuseai\/\.hermes\/pairing\/telegram-approved\.json/)
  // Must include the chat_id in the python heredoc.
  assert.match(cmd, /chat_id = "6805409051"/)
  // Must include user_name.
  assert.match(cmd, /Sarah Test/)
  // Must use atomic os.replace (not direct write).
  assert.match(cmd, /os\.replace/)
})

test('omits pre-approve block when telegramChatId not provided', () => {
  const cmd = buildRefreshEnvCommand({ TELEGRAM_BOT_TOKEN: '12345:fake' })
  assert.ok(
    !/telegram-approved\.json/.test(cmd),
    'pre-approve block must not appear when telegram_chat_id absent',
  )
})

test('rejects non-digit telegram_chat_id (injection guard)', () => {
  assert.throws(
    () =>
      buildRefreshEnvCommand(
        { TELEGRAM_BOT_TOKEN: '12345:fake' },
        { telegramChatId: '6805; rm -rf /' },
      ),
    /digits-only/,
  )
})

test('user_name strips control chars + caps at 80', () => {
  const cmd = buildRefreshEnvCommand(
    { TELEGRAM_BOT_TOKEN: '12345:fake' },
    {
      telegramChatId: '12345',
      telegramUserName: 'Sarah" injection<>; \nrm Test ' + 'a'.repeat(200),
    },
  )
  // Cleaned name should still appear (alphanumerics + space + . _ -).
  assert.match(cmd, /Sarah injection rm Test/)
  // Should NOT contain the raw quote / angle brackets / newline / semicolon.
  assert.ok(
    !/Sarah".*injection/.test(cmd),
    'user_name must strip injection chars',
  )
})
