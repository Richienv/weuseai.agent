import type { IMessageBroker, SendMessageOpts } from './message-broker.js'

/** Telegram Bot API adapter — fetch-based, no SDK. */
export class TelegramMessageBroker implements IMessageBroker {
  readonly name = 'telegram'
  private token: string

  constructor(opts: { token?: string } = {}) {
    const token = opts.token ?? process.env.TELEGRAM_BOT_TOKEN
    if (!token) throw new Error('TelegramMessageBroker: missing TELEGRAM_BOT_TOKEN')
    this.token = token
  }

  async sendMessage(opts: SendMessageOpts): Promise<void> {
    const r = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: opts.chatId, text: opts.text }),
    })
    if (!r.ok) {
      const body = await r.text()
      throw new Error(`Telegram sendMessage -> ${r.status}: ${body.slice(0, 300)}`)
    }
  }
}
