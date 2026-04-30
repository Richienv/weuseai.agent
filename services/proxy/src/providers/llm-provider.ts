/**
 * ILLMProvider — port untuk LLM chat completion.
 *
 * Adapter implementations:
 * - mock-llm.ts (in-memory, untuk tests)
 * - deepseek-llm.ts (real)
 * - openrouter-llm.ts (real)
 */

export type ChatRole = 'system' | 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  content: string
}

export type ChatCompletionOpts = {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
}

export type Usage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type ChatCompletionResult = {
  content: string
  model: string
  usage: Usage
}

export interface ILLMProvider {
  readonly name: string
  chatCompletion(opts: ChatCompletionOpts): Promise<ChatCompletionResult>
}
