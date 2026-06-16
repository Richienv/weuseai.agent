// redact-for-log — the chat relay's logging scrubber (security audit / dashboard
// spec §3.5). slog/structured-log.ts spreads caller fields RAW; the chat path
// carries the VPS IP, the per-customer API_SERVER_KEY, and raw SSH/upstream
// stderr — none of which may ever reach a log drain. This strips sensitive keys
// and scrubs IP-shaped tokens from any free text, then emits a structured line
// with ONLY the safe survivors.
//
// Web-platform only — NO imports. Runs in Deno (Edge Functions) and Node ≥18.

export type LogLevel = 'info' | 'warn' | 'error'

// Keys whose VALUES are always secret — replaced wholesale, never scrubbed-and-kept.
const SENSITIVE_KEYS = new Set([
  'ip', 'ip_address', 'vps_ip', 'host',
  'apikey', 'api_key', 'api_server_key', 'api_server_key_cipher',
  'authorization', 'bearer', 'token', 'session_token',
  'key', 'secret', 'password', 'private_key', 'fleet_ssh_private_key',
  'openrouter_key', 'openrouter_api_key',
])

// IP-shaped tokens in free text (e.g. SSH/curl stderr). Intentionally greedy on
// the v4 dotted-quad + bracketed/colon v6 forms — over-redaction of a log is
// always safe; leaking a VPS IP is not.
const IPV4_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
const IPV6_RE = /\b(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}\b/g

/** Scrub IP-shaped tokens out of arbitrary text (e.g. captured stderr). */
export function scrubText(s: unknown): string {
  return String(s).replace(IPV4_RE, '[ip]').replace(IPV6_RE, '[ip6]')
}

/**
 * Redact a flat fields bag for logging: sensitive keys → "[redacted]";
 * every string value is IP-scrubbed; non-strings pass through. Returns a NEW
 * object — never mutates the caller's.
 */
export function redactForLog(fields?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!fields) return out
  for (const k of Object.keys(fields)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) { out[k] = '[redacted]'; continue }
    const v = fields[k]
    out[k] = typeof v === 'string' ? scrubText(v) : v
  }
  return out
}

/**
 * Emit ONE structured, redacted JSON log line. Use this — NOT raw slog — on any
 * chat-relay path that has touched an IP / key / upstream stderr. Never throws
 * (logging must not break the caller).
 */
export function slogRedacted(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
  let line: string
  try {
    line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...redactForLog(fields) },
      (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  } catch {
    line = JSON.stringify({ ts: new Date().toISOString(), level, event, _redact_error: 'unserialisable' })
  }
  // eslint-disable-next-line no-console
  console[level](line)
}
