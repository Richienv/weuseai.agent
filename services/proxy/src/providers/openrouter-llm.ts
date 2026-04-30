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

/** OpenRouter adapter (OpenAI-compatible API, BYOK pelanggan Pro). */
export class OpenRouterLLMProvider implements ILLMProvider {
  readonly name = 'openrouter'
  private apiKey: string
  private base: string
  private referer?: string
  private title?: string

  constructor(opts: {
    apiKey?: string
    base?: string
    referer?: string
    title?: string
  } = {}) {
    const key = opts.apiKey ?? globalThis.process?.env?.OPENROUTER_API_KEY
    if (!key) throw new Error('OpenRouterLLMProvider: missing OPENROUTER_API_KEY')
    this.apiKey = key
    this.base = opts.base ?? 'https://openrouter.ai/api/v1'
    this.referer = opts.referer
    this.title = opts.title
  }

  async chatCompletion(opts: ChatCompletionOpts): Promise<ChatCompletionResult> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      'content-type': 'application/json',
    }
    if (this.referer) headers['HTTP-Referer'] = this.referer
    if (this.title) headers['X-Title'] = this.title

    const r = await fetch(`${this.base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
      }),
    })
    if (!r.ok) {
      const txt = await r.text()
      throw new Error(`OpenRouter chatCompletion -> ${r.status}: ${txt.slice(0, 500)}`)
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
