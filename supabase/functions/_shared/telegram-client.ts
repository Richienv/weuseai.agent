// Telegram bot client for Edge Functions — concrete impl that calls
// https://api.telegram.org/bot<TOKEN>/sendMessage with a plain text reply.
//
// Phase 1 surface: only `replyText`. Inline keyboards / photos /
// editMessage live in Phase 2C if/when we need them.

import type { ITelegramClient } from './types.ts'

export class TelegramBotClient implements ITelegramClient {
  private token: string

  // Token validated lazily, on first replyText call. This lets the
  // entry file construct the client at module load even before the
  // env var is set (deploy-then-fill-secrets workflow), so the
  // unrelated auth gate inside the handler can still reject bad
  // requests with the right status code instead of cold-starting
  // into a 500.
  constructor(opts: { token: string }) {
    this.token = opts.token
  }

  async replyText(chatId: number | string, text: string): Promise<void> {
    if (!this.token) {
      throw new Error(
        'TelegramBotClient: missing token (env TELEGRAM_BOT_TOKEN). ' +
          'Set via `supabase secrets set TELEGRAM_BOT_TOKEN=<bot-token>`.',
      )
    }
    const r = await fetch(
      `https://api.telegram.org/bot${this.token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          // Plain text — no parse_mode. Avoids Markdown injection from the
          // bot reply (e.g. customer-supplied content showing in a future
          // confirmation message).
          disable_web_page_preview: true,
        }),
      },
    )
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      throw new Error(
        `Telegram sendMessage -> ${r.status}: ${body.slice(0, 300)}`,
      )
    }
  }
}
