import type { ILLMProvider } from './llm-provider.js'
import { MockLLMProvider } from './mock-llm.js'
import { DeepSeekLLMProvider } from './deepseek-llm.js'
import { OpenRouterLLMProvider } from './openrouter-llm.js'

/**
 * Pilih LLM provider berdasarkan env LLM_PROVIDER. Default: deepseek.
 *
 * Note: pelanggan Pro BYOK tetap pakai factory ini di Phase 2;
 * di Phase 1 BYOK key dipasang langsung di VPS env (cloud-init).
 */
export function createLLMProvider(): ILLMProvider {
  const which = globalThis.process?.env?.LLM_PROVIDER ?? 'deepseek'
  switch (which) {
    case 'mock':
      return new MockLLMProvider()
    case 'deepseek':
      return new DeepSeekLLMProvider()
    case 'openrouter':
      return new OpenRouterLLMProvider()
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${which}`)
  }
}

export { MockLLMProvider } from './mock-llm.js'
export { DeepSeekLLMProvider } from './deepseek-llm.js'
export { OpenRouterLLMProvider } from './openrouter-llm.js'
export type {
  ILLMProvider,
  ChatMessage,
  ChatCompletionOpts,
  ChatCompletionResult,
  Usage,
  ChatRole,
} from './llm-provider.js'
