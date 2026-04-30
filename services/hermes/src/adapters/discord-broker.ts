import type { IMessageBroker, SendMessageOpts } from './message-broker.js'

/**
 * Discord webhook adapter (skeleton untuk Phase 2).
 *
 * `chatId` di sini ditafsirkan sebagai webhook URL — Discord routing per channel
 * pakai unique webhook, bukan satu bot token + channel ID.
 */
export class DiscordMessageBroker implements IMessageBroker {
  readonly name = 'discord'

  async sendMessage(opts: SendMessageOpts): Promise<void> {
    const r = await fetch(opts.chatId, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: opts.text }),
    })
    if (!r.ok) {
      const body = await r.text()
      throw new Error(`Discord webhook -> ${r.status}: ${body.slice(0, 300)}`)
    }
  }
}
