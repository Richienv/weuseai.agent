// Telegram bot client for Edge Functions.
//
// Phase 1 surface: replyText (uses platform @weuseaibot token from env).
// Pair-flow Option A (2026-05-09): per-token methods that operate on a
// customer's own bot token, used during onboarding to validate the
// pasted token, set/delete a temporary webhook, and send the
// pairing-success reply as the customer's bot.

import type { ITelegramClient } from './types.ts'

const TELEGRAM_API = 'https://api.telegram.org'

export class TelegramBotClient implements ITelegramClient {
  private platformToken: string

  // platformToken is the @weuseaibot bot token (legacy /pair handler
  // only). Validated lazily on first replyText call so the Edge
  // Function entry can construct the client even when the env var
  // hasn't been wired yet (deploy-then-fill-secrets workflow).
  constructor(opts: { token: string }) {
    this.platformToken = opts.token
  }

  // ─── Legacy: platform-token reply (kept for back-compat) ──────────

  async replyText(chatId: number | string, text: string): Promise<void> {
    if (!this.platformToken) {
      throw new Error(
        'TelegramBotClient: missing platform token (env TELEGRAM_BOT_TOKEN). ' +
          'Set via `supabase secrets set TELEGRAM_BOT_TOKEN=<bot-token>`.',
      )
    }
    await this.sendMessageAs(this.platformToken, chatId, text)
  }

  // ─── Per-token operations (Pair-flow Option A) ────────────────────

  async getMe(
    botToken: string,
  ): Promise<{ id: number; username: string } | null> {
    if (!botToken || !/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
      // Invalid format — short-circuit before hitting the network.
      // Telegram's API would return 404 anyway but this is faster
      // and avoids leaking malformed tokens into HTTP logs.
      return null
    }
    const r = await fetch(`${TELEGRAM_API}/bot${botToken}/getMe`, {
      method: 'GET',
    })
    if (r.status === 401 || r.status === 404) return null
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      throw new Error(`Telegram getMe -> ${r.status}: ${body.slice(0, 300)}`)
    }
    const data = (await r.json().catch(() => null)) as
      | { ok: boolean; result?: { id: number; username?: string } }
      | null
    if (!data?.ok || !data.result?.id || !data.result?.username) {
      return null
    }
    return { id: data.result.id, username: data.result.username }
  }

  async setWebhook(input: {
    botToken: string
    url: string
    secretToken: string
    allowedUpdates?: string[]
  }): Promise<void> {
    if (!/^https:\/\//.test(input.url)) {
      throw new Error(
        `Telegram setWebhook: url must be HTTPS, got "${input.url.slice(0, 50)}"`,
      )
    }
    const body: Record<string, unknown> = {
      url: input.url,
      secret_token: input.secretToken,
      // Drop pending updates to avoid replaying any test traffic the
      // customer might have sent before pairing reached this step.
      drop_pending_updates: true,
    }
    if (input.allowedUpdates && input.allowedUpdates.length > 0) {
      body.allowed_updates = input.allowedUpdates
    }
    const r = await fetch(`${TELEGRAM_API}/bot${input.botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      throw new Error(
        `Telegram setWebhook -> ${r.status}: ${txt.slice(0, 300)}`,
      )
    }
  }

  async deleteWebhook(botToken: string): Promise<void> {
    const r = await fetch(`${TELEGRAM_API}/bot${botToken}/deleteWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Same drop_pending policy — anything queued during the pairing
      // window is stale by the time provisioning completes.
      body: JSON.stringify({ drop_pending_updates: true }),
    })
    if (!r.ok) {
      // deleteWebhook is idempotent server-side; we treat any 4xx other
      // than 401 (bad token) as benign. Surface 5xx as errors so caller
      // can retry.
      if (r.status === 401) {
        throw new Error(
          `Telegram deleteWebhook -> 401: customer's bot token revoked or invalid`,
        )
      }
      if (r.status >= 500) {
        const txt = await r.text().catch(() => '')
        throw new Error(
          `Telegram deleteWebhook -> ${r.status}: ${txt.slice(0, 300)}`,
        )
      }
      // 4xx other than 401 (e.g. webhook didn't exist) — silent.
    }
  }

  async sendMessageAs(
    botToken: string,
    chatId: number | string,
    text: string,
  ): Promise<void> {
    const r = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        // Plain text — no parse_mode. Avoids Markdown injection from
        // any customer-supplied content shown in confirmation messages.
        disable_web_page_preview: true,
      }),
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      throw new Error(
        `Telegram sendMessage -> ${r.status}: ${txt.slice(0, 300)}`,
      )
    }
  }
}
