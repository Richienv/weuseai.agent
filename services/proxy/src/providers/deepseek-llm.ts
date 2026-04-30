import type {
  ILLMProvider,
  ChatCompletionOpts,
  ChatCompletionResult,
} from './llm-provider.js'

type OpenAIShapeResponse = {
  model: string
  choices: Array<{ message: { content: string } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/** DeepSeek adapter (OpenAI-compatible API). */
export class DeepSeekLLMProvider implements ILLMProvider {
  readonly name = 'deepseek'
  private apiKey: string
  private base: string

  constructor(opts: { apiKey?: string; base?: string } = {}) {
    const key = opts.apiKey ?? globalThis.process?.env?.DEEPSEEK_API_KEY
    if (!key) throw new Error('DeepSeekLLMProvider: missing DEEPSEEK_API_KEY')
    this.apiKey = key
    this.base = opts.base ?? globalThis.process?.env?.DEEPSEEK_BASE ?? 'https://api.deepseek.com/v1'
  }

  async chatCompletion(opts: ChatCompletionOpts): Promise<ChatCompletionResult> {
    const r = await fetch(`${this.base}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
      }),
    })
    if (!r.ok) {
      const txt = await r.text()
      throw new Error(`DeepSeek chatCompletion -> ${r.status}: ${txt.slice(0, 500)}`)
    }
    const data = (await r.json()) as OpenAIShapeResponse
    return {
      content: data.choices[0]?.message?.content ?? '',
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
    }
  }
}
