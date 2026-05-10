// proactive-greeting — Track 2 of post-pair UX polish (2026-05-10).
//
// Sends an in-character "hi, I'm your agent" greeting from the customer's
// own bot to their Telegram chat AS SOON AS provisioning + refreshEnv
// succeed. Eliminates the awkward "send /start to wake up" friction:
// pre-fix, customer landed on welcome.html "Buka Telegram" CTA, opened
// the bot, sent /start, and waited in confused silence while Hermes
// finished polling Telegram.
//
// Architecture choice: generate the greeting via an OpenRouter chat-
// completion call using the customer's freshly-minted sub-key + their
// SOUL.md as system prompt. That gives an in-character (not generic)
// opening line. Falls back to a pre-baked Indonesian template on any
// failure (timeout, OpenRouter error, malformed response) — best-effort,
// never blocks the onboarding redirect.
//
// Cost: ~$0.0005 per call at deepseek-chat rates, charged to the
// customer's already-capped sub-key. Well under any reasonable budget.
//
// Latency: capped at LLM_TIMEOUT_MS. Fallback template path returns
// instantly. Greeting send (Telegram API) is a separate ~300ms call.

import type { ITelegramClient } from './types.ts'

export type ProactiveGreetingDeps = {
  telegram: ITelegramClient
  /** Test seam — defaults to global fetch. */
  fetchImpl?: typeof fetch
  /** Test seam — pin "now" so transcripts are stable. */
  now?: () => Date
}

export type ProactiveGreetingInput = {
  /** Customer's Telegram chat_id (numeric string, validated upstream). */
  chatId: string
  /** Customer's own bot token (per Pair-flow Option A). */
  botToken: string
  /** Soul.md content rendered for this customer. Used as system prompt
   *  so the greeting matches their persona. May be empty/null — falls
   *  back to a generic template. */
  soulMdText: string | null
  /** Customer's display name (for the template fallback). */
  customerName: string
  /** Customer's freshly-minted OpenRouter sub-key. May be null when the
   *  call is from the admin rescue path (no plaintext key access).
   *  Falls back to template when null. */
  openrouterApiKey: string | null
  /** Model to use for the greeting. Defaults to a cheap chat model. */
  model?: string
}

export type ProactiveGreetingResult = {
  ok: boolean
  /** Which path produced the greeting that was sent. */
  source: 'llm' | 'template' | 'send_failed'
  /** The text we sent (or attempted to send). */
  text?: string
  /** Filled when ok=false. */
  error?: string
}

const DEFAULT_MODEL = 'deepseek/deepseek-chat'
const LLM_TIMEOUT_MS = 8_000
const OR_BASE_URL = 'https://openrouter.ai/api/v1'

const GREETING_USER_PROMPT =
  'Sapa pengguna untuk pertama kali sebagai dirimu. ' +
  'Maks 2 kalimat. Bahasa Indonesia santai. Singkat saja, perkenalkan dirimu, ' +
  'dan tanya satu hal kecil yang relevan. Jangan minta perintah formal.'

/**
 * Send the proactive greeting. Best-effort — never throws. Logs LLM
 * fallback to console for monitoring but the response is "ok" as long
 * as Telegram accepted SOMETHING (template fallback included).
 */
export async function sendProactiveGreeting(
  input: ProactiveGreetingInput,
  deps: ProactiveGreetingDeps,
): Promise<ProactiveGreetingResult> {
  // Validate chat_id format (digits-only) — defense-in-depth even though
  // upstream callers also validate. Telegram's API accepts numeric or
  // @username; we only support numeric here.
  if (!/^\d+$/.test(input.chatId)) {
    return {
      ok: false,
      source: 'send_failed',
      error: `invalid chat_id (not digits): ${input.chatId.slice(0, 30)}`,
    }
  }
  if (!input.botToken || input.botToken.length < 10) {
    return {
      ok: false,
      source: 'send_failed',
      error: 'missing or invalid bot token',
    }
  }

  // ── Try LLM first ──
  let text: string | null = null
  let source: 'llm' | 'template' = 'template'
  // Skip LLM call when the key is the mock prefix produced by
  // MockLlmKeyMinter (dev + test runs). Without this the test suite
  // would make real OpenRouter HTTP requests during every
  // complete-onboarding spec run, causing 401s + log spam + flaky
  // tests on a network blip. Production keys never start with sk-mock-.
  const isMockKey =
    typeof input.openrouterApiKey === 'string' &&
    input.openrouterApiKey.startsWith('sk-mock-')
  if (input.openrouterApiKey && input.soulMdText && !isMockKey) {
    try {
      text = await callOpenRouter({
        apiKey: input.openrouterApiKey,
        model: input.model ?? DEFAULT_MODEL,
        systemPrompt: input.soulMdText,
        userPrompt: GREETING_USER_PROMPT,
        timeoutMs: LLM_TIMEOUT_MS,
        fetchImpl: deps.fetchImpl ?? fetch,
      })
      if (text && text.length > 0) {
        source = 'llm'
      }
    } catch (e) {
      console.error(
        `[proactive-greeting] OpenRouter failed, using template: ${errMsg(e)}`,
      )
      text = null
    }
  }

  // ── Fallback template ──
  if (!text) {
    text = renderGreetingTemplate(input.customerName)
    source = 'template'
  }

  // ── Send via customer's bot ──
  try {
    await deps.telegram.sendMessageAs(input.botToken, input.chatId, text)
    return { ok: true, source, text }
  } catch (e) {
    console.error(
      `[proactive-greeting] sendMessageAs failed for chat=${input.chatId}: ${errMsg(e)}`,
    )
    return {
      ok: false,
      source: 'send_failed',
      text,
      error: errMsg(e),
    }
  }
}

/**
 * Pre-baked Indonesian greeting template. Used when SOUL.md is missing,
 * OpenRouter key is unavailable (admin rescue path), or the LLM call
 * fails/times out. Calm-premium voice per CLAUDE.md brand guide.
 */
export function renderGreetingTemplate(customerName: string): string {
  const safeName = (customerName ?? '').trim() || 'kamu'
  // Two sentences, no exclamation marks, no banned words. Mentions the
  // customer's name so it's clear the agent is paired correctly.
  return (
    `Halo ${safeName}, agent kamu sudah aktif dan siap membantu. ` +
    `Coba ceritakan satu hal yang lagi kamu kerjain — biar aku tahu mulai dari mana.`
  )
}

/**
 * Single-shot OpenRouter chat-completion call. Returns the assistant
 * message content (trimmed) or throws. Honors timeoutMs via AbortController.
 */
async function callOpenRouter(args: {
  apiKey: string
  model: string
  systemPrompt: string
  userPrompt: string
  timeoutMs: number
  fetchImpl: typeof fetch
}): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), args.timeoutMs)
  try {
    const r = await args.fetchImpl(`${OR_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${args.apiKey}`,
        'content-type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: args.model,
        max_tokens: 120,
        temperature: 0.6,
        messages: [
          { role: 'system', content: args.systemPrompt },
          { role: 'user', content: args.userPrompt },
        ],
      }),
    })
    if (!r.ok) {
      const tail = (await r.text().catch(() => '')).slice(0, 200)
      throw new Error(`openrouter http=${r.status}: ${tail}`)
    }
    const data = (await r.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('openrouter returned empty/malformed content')
    }
    return content.trim()
  } finally {
    clearTimeout(timer)
  }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e).slice(0, 300)
}
