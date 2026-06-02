/**
 * voice-rates.ts — STT (speech-to-text) rate constants for FUTURE
 * per-customer voice-cost estimation. Phase B (2026-06-02).
 *
 * ── Why this is rate constants only, NOT live per-customer tracking ──
 *
 * Hermes owns the Telegram message path on each customer VPS and calls the
 * STT provider (Groq / OpenAI Whisper) INTERNALLY with our fleet key. The
 * transcription request never crosses our infrastructure — we have no seam
 * to count minutes per customer in real time. Hermes does not export STT
 * usage anywhere we currently scrape (no per-message usage line in the
 * gateway log we tail via /customer-progress; verified against the
 * setup-script log shape). So per-customer STT cost is NOT observable in
 * our stack today.
 *
 * What IS available: the AGGREGATE spend on the provider dashboard
 * (console.groq.com / platform.openai.com) for the single fleet key. That
 * is the honest source of truth for total STT cost right now.
 *
 * This module exists so that WHEN we later add a per-customer minute
 * counter (e.g. a Hermes-side skill that logs duration to workflow-execute,
 * or an upstream usage hook), the rate math has a single home and we never
 * hardcode a price inline. Until then: do NOT fabricate per-customer
 * numbers from these — they are an estimation input, not a measurement.
 *
 * Rates are USD per MINUTE of audio, current as of 2026-06-02. Update when
 * the provider changes pricing.
 */

export type SttProvider = 'groq' | 'openai'

/**
 * USD per minute of transcribed audio, per provider.
 *
 *  - groq:   whisper-large-v3-turbo, billed per audio-hour. ~$0.04/hr at
 *            list price → ~$0.00067/min. Our default provider (cheap + fast).
 *  - openai: whisper-1, $0.006 per minute (api.openai.com list price).
 *
 * These are LIST prices for rough budgeting only; the authoritative spend
 * is the provider dashboard for the fleet key.
 */
export const STT_USD_PER_MINUTE: Readonly<Record<SttProvider, number>> = {
  groq: 0.00067,
  openai: 0.006,
}

/**
 * Rough USD estimate for `minutes` of audio on `provider`. For FUTURE use
 * once a per-customer minute counter exists upstream. Returns 0 for a
 * non-positive duration. This is an estimate, never a billed amount.
 */
export function estimateSttCostUsd(provider: SttProvider, minutes: number): number {
  if (!(minutes > 0)) return 0
  return minutes * STT_USD_PER_MINUTE[provider]
}
