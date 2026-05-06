// SOUL.md template + renderer for the onboarding flow.
//
// Spec: docs/plans/2026-05-06-onboarding-page-spec.md
//   "SOUL.md generation (edit H — locked scaffold)"
//
// The scaffold below is content territory — owned by the founder and
// approved 2026-05-06. Do not edit copy without explicit founder
// approval. Variable substitution + sanitizer rules ARE editable here
// (they're the safety boundary, not the persona contract).
//
// Pure module: no Deno-only / Node-only imports. SHA256 uses Web Crypto
// (available in both runtimes). Tests run via tsx in Node.

// ─── The locked scaffold ───
//
// Variables: {customer_name}, {first_name}, {user_expectations_verbatim},
//            {connected_apps_list}
//
// Everything outside the variables is byte-for-byte fixed by founder.

const SCAFFOLD = `# About me

I am an AI agent built for {customer_name}, a customer of weuseai.agent.
I work in their service, on their VPS, with their data. I am theirs.

# How I communicate

Language: Bahasa Indonesia (default). Switch to English only if the user writes in English first.
Tone: casual but respectful. Use "kamu" — never "lo/gue", never "Anda".
Style: concise and direct. Indonesian customers value short answers over long preambles.

# Who I serve

Name: {customer_name}
Time zone: Asia/Jakarta (WIB, UTC+7) unless the customer indicates otherwise.

# What this customer expects from me

{user_expectations_verbatim}

# How I behave

- Refer to the customer by name when natural ("Pagi, {first_name}.").
- When uncertain, ask one clarifying question rather than guessing.
- Surface progress proactively. If a task takes more than 30 seconds, give a status update.
- Decline tasks that violate my hard limits below — politely, with a brief explanation.

# Hard limits

- Never share API keys, passwords, or customer data with third parties.
- Never make purchases or commit money on the customer's behalf without explicit in-session confirmation.
- Never invent facts. If I don't know something, I say so.
- Never impersonate the customer in messages they did not approve.

# Connected tools

{connected_apps_list}

# When my customer first messages me

If this is our first interaction (no prior conversation with this user):
- Greet warmly using their name.
- Briefly remind them what I can help with — pick 3 examples that fit their stated expectations above.
- Ask how I can help today.
`

// ─── Phase 1 connected-apps list ───
//
// Hard-coded for Phase 1 — every customer gets Telegram via @weuseaibot.
// Phase 2C will compute this from the customer's actual integration list.
const CONNECTED_APPS_PHASE1 = '- Telegram (chat dengan @weuseaibot)'

// ─── Sanitizer rules (rule 1 from spec) ───
//
// 1. Strip C0 control chars except LF (\x0A) and TAB (\x09).
//    Allowing CR (\x0D) too because Windows line endings are common in
//    pasted text from Word/Notepad — we normalize them to LF below.
// 2. Reject obvious template-injection markers.
// 3. Trim leading/trailing whitespace.
//
// This is NOT a security boundary on its own — defense-in-depth assumes
// the LLM downstream also ignores adversarial instructions. Aim is
// "good-faith customers pass, scripted attacks fail loudly".

const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g

// Strings that, if present in user input, would let them break out of
// their { user_expectations_verbatim } slot and inject new template
// sections. Case-insensitive match against unique markers from the
// scaffold.
const INJECTION_MARKERS = [
  '</SOUL>',
  '</persona>',
  '# Hard limits',
  '# Connected tools',
  '# When my customer first messages me',
  '```',
] as const

export type SanitizeOk = { ok: true; clean: string }
export type SanitizeErr = {
  ok: false
  reason: 'template_injection_attempt' | 'expectations_too_short' | 'expectations_too_long'
  marker?: string
}

const MIN_LEN = 1
const MAX_LEN = 600

export function sanitizeExpectations(
  raw: string,
): SanitizeOk | SanitizeErr {
  // Normalize line endings, then strip control chars.
  const normalized = String(raw).replace(/\r\n?/g, '\n').replace(CONTROL_CHARS_RE, '')
  const trimmed = normalized.trim()

  if (trimmed.length < MIN_LEN) {
    return { ok: false, reason: 'expectations_too_short' }
  }
  if (trimmed.length > MAX_LEN) {
    return { ok: false, reason: 'expectations_too_long' }
  }

  // Markers are checked case-insensitively against the trimmed text.
  // We test the lowercased haystack against lowercased needles so we
  // don't miss `# hard limits` etc.
  const haystack = trimmed.toLowerCase()
  for (const m of INJECTION_MARKERS) {
    if (haystack.includes(m.toLowerCase())) {
      return { ok: false, reason: 'template_injection_attempt', marker: m }
    }
  }

  return { ok: true, clean: trimmed }
}

// ─── First-name extraction (rule 3) ───
//
// "First whitespace-delimited token of display_name. If the token is
// ≤ 2 chars OR ends in `.` (e.g. `M.`), fall back to display_name (full
// name) for the greeting line."
export function pickFirstName(displayName: string): string {
  const full = String(displayName).trim()
  if (!full) return ''
  const first = full.split(/\s+/)[0]
  if (first.length <= 2 || first.endsWith('.')) {
    return full
  }
  return first
}

// ─── Renderer ───

export type RenderInput = {
  customerName: string
  expectationsClean: string  // already passed through sanitizeExpectations
  connectedAppsList?: string // optional; defaults to Phase 1 hard-code
}

export function renderSoulMd(input: RenderInput): string {
  const { customerName, expectationsClean } = input
  const connectedApps = input.connectedAppsList ?? CONNECTED_APPS_PHASE1
  const firstName = pickFirstName(customerName)

  return SCAFFOLD
    .replaceAll('{customer_name}', customerName)
    .replaceAll('{first_name}', firstName)
    .replaceAll('{user_expectations_verbatim}', expectationsClean)
    .replaceAll('{connected_apps_list}', connectedApps)
}

// ─── SHA256 audit hash (rule 6) ───
//
// Hex-encoded SHA-256 of the rendered SOUL.md content. UTF-8 encoded
// so Indonesian names with diacritics round-trip correctly.
//
// Web Crypto is available in both Deno and modern Node (≥19) — for
// older Node test environments, the test setup polyfills via node:crypto.

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const buf = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(buf)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}
