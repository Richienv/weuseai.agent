// Structured logging — one JSON line per event, dependency-free.
//
// Why this exists: founder alerting used to rely on grepping unstructured
// console.error tails ("ERROR: [provision:abc] ... FAILED ..."). That is
// fragile — a reworded string silently breaks every grep that watched for
// it, and there is no machine-readable shape to filter/aggregate on. This
// helper emits ONE structured JSON line per event so log drains, alert
// rules, and ad-hoc `jq` queries key off stable fields (`event`, `level`,
// `customerId`) instead of brittle prose.
//
// Web-platform only — NO imports. Runs unchanged in Deno (Edge Functions,
// production) and Node ≥18 (the provisioning service + tests). It writes via
// the global `console[level]`, which exists in both runtimes, so it needs no
// runtime-specific logging dependency.
//
// ── Shape ──────────────────────────────────────────────────────────────────
//
//   {"ts":"2026-06-14T...","level":"error","event":"provision.notify_failed",
//    "customerId":"abc","err":"..."}
//
// `ts` (ISO8601) + `level` + `event` are always present; everything in
// `fields` is spread flat alongside them. `event` is a stable dotted name
// (`namespace.thing_happened`) — treat it as the grep/alert key, never the
// free-text message. Put the human detail in fields, not the event name.
//
// ── How to expand this ───────────────────────────────────────────────────
//
//   1. Adopt incrementally. Replace ad-hoc `console.error('ERROR: ...')`
//      call sites with `slog('error', '<namespace>.<event>', { ...fields })`,
//      keeping the SAME information in structured form. Do it file-by-file as
//      you touch the operator-facing log/alert paths; do NOT do a global
//      sweep.
//   2. Name events `namespace.snake_case_event` (e.g. `provision.create_failed`,
//      `sentinel.alert_raised`). Keep the namespace stable per subsystem so
//      one prefix filter catches the whole area.
//   3. Pass identifiers as fields (`customerId`, `vpsId`, `kind`), not baked
//      into a sentence. Errors: pass `err` as a string (`e instanceof Error
//      ? e.message : String(e)`) so the JSON stays flat and serialisable.
//   4. Need richer transport later (ship to a drain, sample, add a
//      request-scoped trace id)? Extend the emit path HERE so every call site
//      upgrades at once. Keep the `slog(level, event, fields?)` signature
//      stable — it is the contract every adopter depends on.

export type LogLevel = 'info' | 'warn' | 'error'

/**
 * Emit a single structured JSON log line: `{ts, level, event, ...fields}`.
 *
 * @param level  One of 'info' | 'warn' | 'error' — routed to the matching
 *               `console` method.
 * @param event  Stable dotted event name (`namespace.event`), the grep/alert
 *               key. NOT a free-text message.
 * @param fields Optional flat bag of structured context (ids, counts, an
 *               `err` string). Spread alongside the base fields.
 */
export function slog(
  level: LogLevel,
  event: string,
  fields?: Record<string, unknown>,
): void {
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  }
  // Logging must NEVER throw (it sits on catch/failure paths — a throw here
  // would escape the caller's catch and lose the original error). JSON.stringify
  // throws on a BigInt or a circular reference, so serialize defensively: a
  // BigInt-safe replacer + a fallback that keeps the event/level signal even if
  // a field can't be serialised. Security audit L5 (2026-06-14).
  let serialized: string
  try {
    serialized = JSON.stringify(line, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    )
  } catch {
    serialized = JSON.stringify({
      ts: line.ts,
      level,
      event,
      _slog_error: 'fields_not_serialisable',
    })
  }
  // console.{info,warn,error} all exist in Deno and Node ≥18.
  console[level](serialized)
}
