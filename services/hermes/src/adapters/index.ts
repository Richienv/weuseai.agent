import type { IMessageBroker } from './message-broker.js'
import { MockMessageBroker } from './mock-broker.js'
import { TelegramMessageBroker } from './telegram-broker.js'
import { DiscordMessageBroker } from './discord-broker.js'

/** Pilih broker berdasarkan env MESSAGE_BROKER. Default: telegram. */
export function createMessageBroker(): IMessageBroker {
  const which = process.env.MESSAGE_BROKER ?? 'telegram'
  switch (which) {
    case 'mock':
      return new MockMessageBroker()
    case 'telegram':
      return new TelegramMessageBroker()
    case 'discord':
      return new DiscordMessageBroker()
    default:
      throw new Error(`Unknown MESSAGE_BROKER: ${which}`)
  }
}

export { MockMessageBroker } from './mock-broker.js'
export { TelegramMessageBroker } from './telegram-broker.js'
export { DiscordMessageBroker } from './discord-broker.js'
export type { IMessageBroker, SendMessageOpts } from './message-broker.js'
