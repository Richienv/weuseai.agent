// properDeleteWebhook — verified delete-webhook with retry.
//
// Replaces the old `safeDeleteWebhook` (in complete-onboarding-handler)
// which silently swallowed all errors and never verified the webhook
// was actually cleared. Founder e2e on customer e282ce25 hit the silent
// failure: bot kept replying with REPLY_ALREADY_PAIRED to every message
// because Telegram still routed updates to our pair-customer-bot-webhook.
//
// Contract:
//   1. Call deleteWebhook on the customer's bot token.
//   2. Call getWebhookInfo to verify .url is empty.
//   3. On any failure (deleteWebhook throws, or getWebhookInfo reports
//      url still set), retry up to 3 attempts total with exponential
//      backoff (2s / 4s after attempt 1 / 2).
//   4. EXCEPT 401 (bot token revoked) — that's a permanent failure,
//      retry would only repeat. Return immediately.
//   5. Returns a structured result so the caller can decide whether to
//      block onboarding or surface a non-fatal warning.
//
// Web Platform APIs only — runs in Deno (Edge Function) and Node ≥18
// (test runner via tsx).

/** Subset of ITelegramClient that this helper depends on. Splitting it
 *  out lets tests stub two methods without implementing the full
 *  ITelegramClient surface. The production TelegramBotClient implements
 *  both (added in this PR). */
export interface ITelegramWebhookOps {
  deleteWebhook(botToken: string): Promise<void>
  getWebhookInfo(botToken: string): Promise<{ url: string }>
}

export type ProperDeleteWebhookOpts = {
  /** Test seam — production passes a real `setTimeout` wrapper. */
  sleepMs?: (ms: number) => Promise<void> | void
  /** Hard cap on attempts. Default 3. */
  maxAttempts?: number
}

export type ProperDeleteWebhookResult = {
  ok: boolean
  /** How many attempts were made (1-based). */
  attempts: number
  /** ISO timestamp of the verifying getWebhookInfo call (only on ok). */
  verifiedAt?: string
  /** Last error seen (only on !ok). */
  finalError?: string
}

const DEFAULT_BACKOFF_MS = [2000, 4000, 8000] as const

export async function properDeleteWebhook(
  client: ITelegramWebhookOps,
  botToken: string,
  opts: ProperDeleteWebhookOpts = {},
): Promise<ProperDeleteWebhookResult> {
  const maxAttempts = opts.maxAttempts ?? 3
  const sleep =
    opts.sleepMs ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))

  let lastError: string | undefined
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.deleteWebhook(botToken)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastError = msg
      // 401 = bot token revoked / invalid. Retrying won't help; the
      // operator needs to investigate (token rotated, customer
      // re-pasted a different token via reset-bot-pairing, etc.).
      if (/-> 401/.test(msg) || /\b401\b/.test(msg)) {
        return { ok: false, attempts: attempt, finalError: msg }
      }
      // Transient — backoff and retry (unless this was the last
      // attempt). Skip the verify call this iteration.
      if (attempt < maxAttempts) {
        await sleep(DEFAULT_BACKOFF_MS[attempt - 1])
        continue
      }
      return { ok: false, attempts: attempt, finalError: msg }
    }

    // deleteWebhook returned without throwing. Verify Telegram
    // actually cleared it.
    let info: { url: string }
    try {
      info = await client.getWebhookInfo(botToken)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastError = `verify failed: ${msg}`
      if (attempt < maxAttempts) {
        await sleep(DEFAULT_BACKOFF_MS[attempt - 1])
        continue
      }
      return { ok: false, attempts: attempt, finalError: lastError }
    }

    if (info.url && info.url.length > 0) {
      lastError = `webhook url still set after deleteWebhook: ${info.url.slice(0, 100)}`
      if (attempt < maxAttempts) {
        await sleep(DEFAULT_BACKOFF_MS[attempt - 1])
        continue
      }
      return { ok: false, attempts: attempt, finalError: lastError }
    }

    // url is empty → genuinely cleared.
    return {
      ok: true,
      attempts: attempt,
      verifiedAt: new Date().toISOString(),
    }
  }

  // Loop exited without return — defensive fallthrough (should be
  // unreachable since each branch above returns).
  return {
    ok: false,
    attempts: maxAttempts,
    finalError: lastError ?? 'exhausted attempts',
  }
}
