/**
 * IMessageBroker — port untuk outbound notifications ke pelanggan.
 *
 * Phase 1 = Telegram. Discord adapter ada sebagai placeholder buat Phase 2.
 *
 * Adapter implementations:
 * - mock-broker.ts (in-memory, untuk tests)
 * - telegram-broker.ts (real, fetch-based)
 * - discord-broker.ts (real, webhook-based)
 */

export type SendMessageOpts = {
  chatId: string
  text: string
}

export interface IMessageBroker {
  /** Identifier untuk logs/debug (e.g. 'mock', 'telegram', 'discord'). */
  readonly name: string
  sendMessage(opts: SendMessageOpts): Promise<void>
}
