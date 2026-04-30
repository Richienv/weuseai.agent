import type { IMessageBroker, SendMessageOpts } from './message-broker.js'

/** In-memory broker. `sentMessages` exposed for assertions. */
export class MockMessageBroker implements IMessageBroker {
  readonly name = 'mock'
  sentMessages: SendMessageOpts[] = []

  async sendMessage(opts: SendMessageOpts): Promise<void> {
    this.sentMessages.push({ ...opts })
  }

  /** Test helper. */
  clear() {
    this.sentMessages = []
  }
}
