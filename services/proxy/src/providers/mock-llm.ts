import type {
  ILLMProvider,
  ChatCompletionOpts,
  ChatCompletionResult,
} from './llm-provider.js'

/** In-memory LLM. Returns a deterministic echo unless `respondWith` is set. */
export class MockLLMProvider implements ILLMProvider {
  readonly name = 'mock'
  calls: ChatCompletionOpts[] = []
  respondWith: string | null = null

  async chatCompletion(opts: ChatCompletionOpts): Promise<ChatCompletionResult> {
    this.calls.push(opts)
    const lastUser = [...opts.messages].reverse().find((m) => m.role === 'user')
    const content = this.respondWith ?? `[mock-llm] echo: ${lastUser?.content ?? ''}`
    const promptTokens = opts.messages.reduce((n, m) => n + m.content.length, 0)
    const completionTokens = content.length
    return {
      content,
      model: opts.model,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    }
  }
}
