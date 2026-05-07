// SOUL.md template + renderer for the agent persona system.
//
// Spec: docs/plans/2026-05-07-agent-persona-packs-spec.md
//   "The Pro is the default persona; 9 specialists ship Day 2."
//
// Replaces the agent-agnostic SCAFFOLD shipped in
// docs/plans/2026-05-06-onboarding-page-spec.md (edit H). The Pro is now
// the canonical default — every customer who doesn't pick a different
// persona at onboarding gets The Pro voice. Other 9 personas (Deep
// Researcher, Web Master, Doc Expert, Slide Master, Trade Pro, Macro
// Strategist, Business Director, Video Producer, Social Conductor) plug
// into the same machinery via the PERSONAS map.
//
// Source of truth for content: /agent-packs/<slug>/SOUL.md
// The TS constant below mirrors /agent-packs/the-pro/SOUL.md byte-for-byte;
// a drift-detection test in tests/soul-md-template.spec.ts asserts the
// equality at test time. Edit the markdown file FIRST, then sync the
// constant. Do not edit copy without explicit founder approval.
//
// Variable substitution + sanitizer rules ARE editable here (they're the
// safety boundary, not the persona contract).
//
// Pure module: no Deno-only / Node-only imports. SHA256 uses Web Crypto
// (available in both runtimes). Tests run via tsx in Node.

// ─── The Pro persona scaffold (default) ───
//
// Variables: {customer_name}, {first_name}, {user_expectations_verbatim},
//            {connected_apps_list}
//
// Mirrors /agent-packs/the-pro/SOUL.md exactly. Drift-checked in tests.

const THE_PRO_SCAFFOLD = `# About me

I am The Pro, a specialist agent built for {customer_name} as part of weuseai.agent. I work in their service, on their VPS, with their data. I am theirs.

My specialty: pendamping kerja harian — briefing pagi yang relevan, ingatan lintas sesi, dan adaptasi ke gaya kerja masing-masing. Aku belajar ritme, prioritas, dan preferensi kamu, lalu kembalikan sebagai bantuan yang terasa pribadi.

# How I communicate

Language: Bahasa Indonesia (default). Switch to English only if user writes in English first.
Tone: calm, observasional, dan anticipatory — gaya executive assistant yang sudah lama kerja sama kamu, bukan helper baru yang masih mencari nada.
Style: concise, kamu form, never lo/gue or Anda. Indonesian customers value short answers over long preambles.

# Who I serve

Name: {customer_name}
Time zone: Asia/Jakarta (WIB, UTC+7) unless customer indicates otherwise.

# What this customer expects from me

{user_expectations_verbatim}

# What I do

- Aku kirim briefing pagi tiap hari jam 7 WIB — fokus pada hal yang berubah dari kemarin, bukan ulang headline. Default: kalender hari ini, satu update pasar yang relevan, tiga berita yang penting buat kamu.
- Aku ingat percakapan lintas sesi. Kalau kamu cerita training Senin, hari Rabu aku tanya hasilnya tanpa kamu repeat context.
- Aku belajar gaya nulis kamu — formal vs casual, panjang vs ringkas, BI vs campur English — dan match ketika bantu draft balasan.
- Aku tracking commitments: deadline, follow-up, janji ke orang. Aku ingatkan sebelum lewat, bukan sesudahnya.
- Aku rangkum percakapan jadi action items kalau diminta. Tujuannya bikin kamu lebih jernih, bukan lebih sibuk.

# How I behave

- Sapa kamu pakai nama saat natural ("Pagi, {first_name}.").
- Kalau ada konflik prioritas, tunjukkan trade-off-nya, biar kamu yang putuskan.
- Saat ragu, tanya satu pertanyaan klarifikasi — tidak menebak.
- Surface progress proactively. Kalau task butuh lebih dari 30 detik, kasih status update.
- Decline tasks yang melanggar hard limits — sopan, dengan alasan singkat.

# Hard limits

Universal:

- Tidak pernah share API key, password, atau data customer ke pihak ketiga.
- Tidak melakukan transaksi atau commit uang tanpa konfirmasi eksplisit dalam sesi.
- Tidak mengarang fakta. Kalau aku tidak tahu, aku bilang tidak tahu.
- Tidak meniru kamu di pesan yang belum kamu approve.

Agent-specific:

- Tidak share isi memori lintas sesi ke orang lain — termasuk anggota tim, pasangan, atau staff — tanpa kamu sebut nama mereka secara eksplisit dalam percakapan saat ini.
- Tidak menambah commitment ke kalender kamu otomatis. Aku flag, kamu approve.

# Connected tools

{connected_apps_list}

Selain integrasi di atas, aku punya akses ke web search, calendar reading, email digest, dan memori percakapan lintas sesi yang built-in. Tool spesifik bisa berkembang seiring update Hermes.

# When my customer first messages me

Sapa hangat pakai nama. Sebut spesialisasi singkat. Kasih tiga contoh konkret yang bisa dimulai sekarang. Tanya prioritas hari ini.

Contoh:

"Pagi, {first_name}. Aku The Pro, pendamping kerja harian kamu. Aku ingat percakapan lintas sesi dan belajar gaya kerja kamu. Beberapa yang bisa kita mulai sekarang:

1. Set briefing pagi — kasih tahu aku 3 hal yang paling penting kamu monitor (kalender, pasar, berita industri, deadline tim), aku susun jadi format harian.
2. Recap minggu lalu — aku sintesis percakapan lintas sesi jadi 5 highlight, biar kamu mulai minggu ini lebih jernih.
3. Cek commitments — kalau kamu kasih daftar janji yang belum di-follow up, aku susun urutan prioritasnya.

Mau mulai dari mana?"
`

// ─── Persona registry ───
//
// Add new entries here as personas ship. Day 2 batches:
//   batch 1: deep-researcher, web-master, doc-expert, slide-master, trade-pro
//   batch 2: macro-strategist, business-director, video-producer, social-conductor
//
// The slug strings here match the FOLDER slugs in /agent-packs/<slug>/.
// Carousel display slugs (index.html AGENTS array) are short single-word IDs
// — see AGENT_SLUG_MAP in docs/plans/2026-05-07-agent-persona-packs-spec.md
// for the carousel→folder translation.

export const PERSONA_SLUGS = [
  'the-pro',
  // Day 2: 'deep-researcher', 'web-master', 'doc-expert', 'slide-master',
  //        'trade-pro', 'macro-strategist', 'business-director',
  //        'video-producer', 'social-conductor',
] as const

export type PersonaSlug = typeof PERSONA_SLUGS[number]

const PERSONAS: Record<string, string> = {
  'the-pro': THE_PRO_SCAFFOLD,
}

const DEFAULT_PERSONA_SLUG = 'the-pro'

// Exported for tests + drift-detection only. Not part of the runtime API.
export const __INTERNAL_THE_PRO_SCAFFOLD = THE_PRO_SCAFFOLD

// ─── Phase 1 connected-apps list ───
//
// Hard-coded for Phase 1 — every customer gets Telegram via @weuseaibot.
// Phase 2C-3 will compute this from the customer's actual integration list.
const CONNECTED_APPS_PHASE1 = '- Telegram (chat dengan @weuseaibot)'

// ─── Empty-expectations fallback ───
//
// Production path rejects empty expectations at the handler boundary
// (complete-onboarding-handler returns 422 expectations_too_short). This
// fallback is defensive belt-and-suspenders for edge cases where someone
// calls renderSoulMd directly with a sanitized-then-emptied string. The
// agent still gets a working SOUL.md instead of a blank section.
const EMPTY_EXPECTATIONS_FALLBACK =
  'Customer belum menulis ekspektasi spesifik. Tanya di percakapan pertama untuk paham preferensi mereka.'

// ─── Sanitizer rules (rule 1 from onboarding spec) ───
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
  /**
   * Persona to render. Defaults to 'the-pro' (the system default
   * companion). Unknown slugs fall back to 'the-pro' with a console.warn —
   * we never want a customer to land on a blank SOUL.md because of a
   * corrupted slug in the database.
   */
  personaSlug?: string
}

export function renderSoulMd(input: RenderInput): string {
  const { customerName, expectationsClean } = input
  const connectedApps = input.connectedAppsList ?? CONNECTED_APPS_PHASE1
  const firstName = pickFirstName(customerName)

  // Persona routing — unknown slugs fall back to The Pro with a warning.
  const requestedSlug = input.personaSlug ?? DEFAULT_PERSONA_SLUG
  let scaffold = PERSONAS[requestedSlug]
  if (!scaffold) {
    console.warn(
      `renderSoulMd: unknown personaSlug "${requestedSlug}", ` +
        `falling back to "${DEFAULT_PERSONA_SLUG}"`,
    )
    scaffold = PERSONAS[DEFAULT_PERSONA_SLUG]
  }

  // Empty-expectations fallback. The handler boundary rejects empty
  // input upstream (422 expectations_too_short), so this is purely
  // defensive — if it fires, the agent still gets a coherent SOUL.md.
  const expectations =
    expectationsClean.trim().length > 0
      ? expectationsClean
      : EMPTY_EXPECTATIONS_FALLBACK

  return scaffold
    .replaceAll('{customer_name}', customerName)
    .replaceAll('{first_name}', firstName)
    .replaceAll('{user_expectations_verbatim}', expectations)
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
