/**
 * buildSetupScript() — generates the bash script we ship over SSH to a
 * fresh IDCloudHost VPS. Replaces cloud-init runcmd (cloud-init proved
 * unreliable on IDCH; SSH path gives us deterministic feedback).
 *
 * Order matters: halo curl FIRST so the customer sees life within seconds,
 * THEN the slow Hermes install + skill drop + cron + gateway.
 *
 * Each shell step that's allowed to fail is wrapped in `|| true` (Hermes
 * gateway commands, cron — these depend on upstream CLI flags that may
 * shift). The script as a whole runs with `set -e` so ANYTHING else
 * unexpected aborts and surfaces in our SSH stdout.
 *
 * Every step's stdout/stderr is appended to /var/log/weuseai-setup.log
 * for post-mortem diagnosis if something goes wrong silently. The setup
 * script itself ALSO writes /opt/weuseai/ready as the last successful step
 * so the calling Express service can verify completion.
 */

import { buildBundlePullScript } from './bundle-pull-script.js'
import { personaScaffold } from '../../../supabase/functions/_shared/soul-md-template.js'
// Phase B (voice-input STT, 2026-06-02): the voice config write is
// tier-gated on TIERS[resolveTier(tier)].features.voice — the SAME source
// of truth the persona list resolves through. resolveTier handles both the
// new canonical slugs (voice-starter / library-full / done-for-you /
// enterprise) AND the deprecated count-based aliases (starter / pro /
// studio) that still flow through this script's `Tier` type.
import { resolveTier, TIERS } from '../../../supabase/functions/_shared/tier-personas.js'

/** VPS spec-class slugs — the resource sizing classes (legacy slug names). */
export type Tier = 'starter' | 'pro' | 'studio'

/**
 * Any provisionable tier slug: the v1.4 canonical non-enterprise tiers OR
 * the deprecated legacy slugs. `enterprise` is NOT provisionable (contact
 * sales). Persona + voice are derived from the REAL canonical slug via
 * resolveTier/personasForTier; only VPS spec + LLM budget collapse to a
 * `Tier` spec-class (see resolveTierToSpecClass in customer-flow.ts).
 */
export type ProvisionTier =
  | 'bare'
  | 'solo'
  | 'voice-starter'
  | 'library-full'
  | 'done-for-you'
  | Tier

export type SetupScriptParams = {
  customerId: string
  tier: ProvisionTier
  telegramBotToken?: string
  telegramAllowedUserIds?: string
  /**
   * Per-customer OpenRouter API key minted via the provisioning service
   * (Phase 2A — replaces both the proxy-token + BYOK pathways from Phase
   * 1). Hermes treats OpenRouter as OpenAI-compatible, so we set
   * OPENAI_API_KEY + OPENAI_BASE_URL + OPENAI_MODEL.
   *
   * Optional: when absent, no LLM env is written (customer pastes key
   * via dashboard later, OR we re-run a small "llm-activate" script
   * after a Phase 2C top-up). Persona, halo, and Hermes install still
   * proceed unconditionally so the shell of the agent is ready.
   */
  openRouterKey?: string
  /**
   * Phase 2E-1.5 (Hermes-native bundle): which agent persona this VPS
   * runs. Defaults to 'the-pro' if absent (matches Phase 2C-1 default
   * persona). The bundle for this slug ships as `bundleTarBase64`.
   *
   * D1 lock (2026-05-12 multi-persona MVP): `agentSlug` is now the
   * customer's DEFAULT persona — the one Hermes uses when the customer
   * sends a bare (non-slash-command) message. Additional personas at
   * the customer's tier ride along in `agentSlugs` and are pulled by
   * bundle-pull-script on every boot. Kept as a string (not array)
   * for back-compat with Phase 2E-1.5 callers + the bootstrap-bundle
   * env line (`WEUSEAI_AGENT_SLUG=<single>`).
   */
  agentSlug?: string
  /**
   * D1 lock (2026-05-12 multi-persona MVP): the full list of personas
   * the customer has access to at their tier. Source of truth:
   * `supabase/functions/_shared/tier-personas.ts` (`TIER_PERSONAS`).
   *
   * Written to /home/weuseai/.hermes/.env as
   *   WEUSEAI_AGENT_SLUGS=the-pro,doc-expert,slide-master,...
   * Read by bundle-pull-script.ts at every Hermes boot — loops over
   * the CSV and pulls each persona's bundle independently. The
   * persona named by `agentSlug` MUST appear as the first element
   * (first-of-list invariant pinned by tier-personas.spec.ts).
   *
   * Optional: when absent, falls back to `[agentSlug ?? 'the-pro']`.
   */
  agentSlugs?: readonly string[]
  /**
   * Phase 2E-1.5: base64-encoded tar.gz of the agent-pack bundle
   * directory contents. Caller (customer-flow.ts) tars
   * `agent-packs/<agentSlug>/` + `agent-packs/_shared/` and base64s.
   *
   * Optional: when absent, the bundle install step is skipped (back-
   * compat with Phase 1/2A flows that don't ship a bundle). When set,
   * the script extracts to /home/weuseai/.hermes/ on the VPS, creates
   * /var/lib/weuseai/customer-grown/, and writes WEUSEAI_AGENT_SLUG +
   * WEUSEAI_WORKFLOW_EXECUTE_URL to .env so Hermes skills can call out.
   */
  bundleTarBase64?: string
  /**
   * URL of the workflow-execute Edge Function. Hermes skills POST to
   * this for deterministic handler invocation. Written to .env as
   * WEUSEAI_WORKFLOW_EXECUTE_URL. Defaults to the production URL.
   */
  workflowExecuteUrl?: string
  /**
   * Phase 2E-3: fleet SSH public key written to
   * /home/weuseai/.ssh/authorized_keys at provision time. Lets the
   * provisioning service /tier-bump endpoint re-SSH into the customer's
   * VPS later (for tier upgrades, manual ops) without needing a
   * persisted password. One keypair shared across the entire fleet —
   * privkey lives in Fly.io secrets as FLEET_SSH_PRIVATE_KEY.
   *
   * Optional: when absent, the authorized_keys write is skipped (back-
   * compat with Phase 1/2A customers provisioned before fleet auth was
   * added). Pre-2E-3 customers need a one-time manual pubkey injection
   * before tier-bump can work for them.
   */
  fleetSshPubkey?: string
  /**
   * Phase 2E-3: pinned Hermes version (default v0.13.0 per founder Q7
   * lock). Override via HERMES_VERSION env on the provisioning service
   * to test new upstream versions on a single VPS before promoting.
   */
  hermesVersion?: string
  /**
   * Phase 5-3.c rollout: per-customer HMAC-signed token. Computed at
   * customer-creation time via
   * `signCustomerToken(customerId, HERMES_INSTANCE_HMAC_KEY)` (see
   * supabase/functions/_shared/hermes-instance-auth.ts) and threaded
   * through customer-flow → buildSetupScript → VPS .env.
   *
   * Optional: when absent, the env line is skipped (back-compat with
   * customers provisioned before HMAC rollout). Hermes-side proxy
   * callers fall back to the MVP customer_id existence check until
   * HERMES_INSTANCE_HMAC_KEY env is set on Supabase Edge Functions.
   *
   * Written to /home/weuseai/.hermes/.env as HERMES_INSTANCE_TOKEN.
   * Hermes-side kanban-orchestrator + approval-emitter skills read this
   * and include `Authorization: Bearer <token>` on platform callbacks.
   */
  hermesInstanceToken?: string
  /**
   * Phase B (voice-input STT, 2026-06-02): the STT provider API key for
   * Hermes' NATIVE voice-memo transcription. Threaded from the
   * provisioning service env (VOICE_STT_GROQ_KEY / VOICE_STT_OPENAI_KEY,
   * read in customer-flow.ts) → here → the VPS .env.
   *
   * The env var NAME we write depends on `voiceSttProvider`:
   *   - 'groq'   → GROQ_API_KEY            (Whisper-large-v3 on Groq)
   *   - 'openai' → VOICE_TOOLS_OPENAI_KEY  (Whisper on api.openai.com)
   *
   * IMPORTANT — this is NOT the OPENAI_API_KEY we already write for the
   * chat model. That one holds the customer's OpenRouter sub-key (Hermes
   * is OpenAI-compatible, pointed at openrouter.ai). Hermes' OpenAI STT
   * reads a SEPARATE var, VOICE_TOOLS_OPENAI_KEY, which must be a REAL
   * api.openai.com key — an OpenRouter key will NOT work there. We default
   * to the Groq provider (free + fast + good Bahasa) to sidestep that.
   *
   * Optional: when absent, the voice/stt CONFIG block is still written to
   * config.yaml (so the moment the founder sets the key + re-runs
   * refresh-env, STT works) but the key env line is omitted. Hermes then
   * falls back gracefully — incoming voice messages are not transcribed
   * until the key is present, and TEXT chat keeps working. The voice
   * config is only emitted at all when the tier grants voice.
   */
  voiceSttKey?: string
  /**
   * Phase B (voice-input STT): which STT provider Hermes uses. Single
   * constant, easy to switch fleet-wide. Defaults to VOICE_STT_PROVIDER
   * ('groq') in buildSetupScript when absent.
   */
  voiceSttProvider?: 'groq' | 'openai'
}

const DEFAULT_WORKFLOW_EXECUTE_URL =
  'https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/workflow-execute'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
// Phase 2E-3 lock (founder, 2026-05-08): single global default across all
// tiers. Customer can swap via dashboard (Phase 3+). DeepSeek v4-pro at
// ~$0.27/M output is ~1/55th of Claude Sonnet; quality "good enough" for
// 80%+ of agent tasks per Hermes community validation.
// Exported so the dashboard relay's Opus force-pin guardrail
// (routes/agent-chat-model-guard.ts) imports the SAME pinned model rather than
// re-typing it — a drift-gate test asserts they're identical, so the chat path
// can never diverge from the provisioned model.default.
export const OPENROUTER_DEFAULT_MODEL = 'deepseek/deepseek-v4-pro'

/**
 * Pin the customer agent model to DeepSeek v4-pro in config.yaml — ROBUST to
 * the upstream config SHAPE (scalar OR nested dict OR missing).
 *
 * P0 cost fix (2026-05-17) — without a pin a fresh Hermes install resolves to
 * Claude Opus 4.6 (model.default in the shipped config), burning a customer
 * sub-key 5x over budget. model.default is the AUTHORITATIVE key Hermes reads.
 *
 * Hardened (2026-06-07) after the model-block YAML incident: a pinned-Hermes
 * update changed top-level `model:` from a SCALAR to a DICT block. The old
 * `sed 's|^model:.*|model: <x>|'` collapsed that dict PARENT into a scalar,
 * ORPHANING its indented `default:` child → invalid YAML ("while parsing a
 * block mapping") → Hermes discarded the whole config → empty model →
 * OpenRouter `HTTP 400: No models provided` → "model provider failed after
 * retries" in the customer's chat. (See docs/investigation/.)
 *
 * Shape-independent fix: delete ANY existing top-level `model:` construct
 * (the line + its entire indented body, scalar or dict) with awk, then append
 * one canonical nested block. Idempotent — re-running removes the canonical
 * block it wrote and re-appends it. Operates on $CONFIG_YAML.
 */
export function modelPinShellBlock(): string {
  return `  # Remove any existing top-level model: block (scalar or dict + indented
  # body), then append a single canonical nested block. Shape-independent so a
  # future upstream config-schema change can't silently re-break this.
  awk '
    inblk && /^[[:space:]]/ {next}
    inblk && /^[[:space:]]*$/ {next}
    inblk {inblk=0}
    /^model:/ {inblk=1; next}
    {print}
  ' "$CONFIG_YAML" > "$CONFIG_YAML.tmp" && mv "$CONFIG_YAML.tmp" "$CONFIG_YAML"
  printf 'model:\\n  default: ${OPENROUTER_DEFAULT_MODEL}\\n' >> "$CONFIG_YAML"`
}

/**
 * Hard YAML-shape guard (2026-06-07). Validates the FINAL config.yaml (after
 * every tweak, including the appended voice block) actually PARSES and pins
 * the expected model — using the Hermes venv python, which always ships
 * pyyaml. Fails the provision loudly so a future upstream shape change
 * surfaces to US at provision time, not via a customer 402. Operates on
 * $CONFIG_YAML; `log` is defined earlier in the script.
 */
export function configYamlValidateShellBlock(): string {
  return `  # YAML-shape guard — never hand a customer a config Hermes can't parse.
  CONFIG_VALIDATE_PY=/home/weuseai/.hermes/hermes-agent/venv/bin/python
  if [ -x "$CONFIG_VALIDATE_PY" ] && "$CONFIG_VALIDATE_PY" -c 'import yaml' 2>/dev/null; then
    if ! "$CONFIG_VALIDATE_PY" -c 'import sys,yaml; d=yaml.safe_load(open(sys.argv[1])) or {}; m=d.get("model"); sys.exit(0 if isinstance(m,dict) and m.get("default")=="${OPENROUTER_DEFAULT_MODEL}" else 1)' "$CONFIG_YAML"; then
      log "✗ FATAL: config.yaml failed YAML/model validation after tweaks (model not pinned or unparseable)"
      exit 1
    fi
    log "✓ config.yaml validated (parses; model.default=${OPENROUTER_DEFAULT_MODEL})"
  else
    log "⚠ config.yaml YAML validation skipped (Hermes venv python/pyyaml unavailable)"
  fi`
}

// Hermes pin (Q7 founder lock 2026-05-08; CORRECTED 2026-06-14). The upstream
// install.sh does NOT read a HERMES_VERSION env var — confirmed by grepping the
// raw 2744-line script (zero hits). It pins ONLY via its own --branch / --commit
// flags. So the old `HERMES_VERSION=v0.13.0 ... | bash` form was a silent no-op:
// every VPS cloned `--branch main` (unpinned, ever-moving). We now pass the pin
// as a real `--branch` ARG so it actually takes effect.
//
// The value must be a real git ref. `v0.13.0` is NOT a git tag (semver 0.13.0 ==
// the date-tag v2026.5.7); we pin to the latest release tag carrying the
// features we rely on. Override via the HERMES_VERSION env (→ p.hermesVersion);
// it must be a valid git ref (tag / branch / SHA). When changing it, re-verify
// config.yaml shape — see CLAUDE.md "config.yaml SHAPE" rules.
const DEFAULT_HERMES_VERSION = 'v2026.6.5'

// Map the legacy label `v0.13.0` (and the empty string) to the canonical ref:
// `v0.13.0` was never a real git tag, so passing it to `--branch` would 404 and
// fail the provision. This keeps a stale HERMES_VERSION=v0.13.0 on the Fly
// service (or in test fixtures) resolving to the real default instead of
// breaking. Any other value is taken as a literal git ref.
function resolveHermesRef(v?: string): string {
  if (!v || v === 'v0.13.0' || v === '0.13.0') return DEFAULT_HERMES_VERSION
  return v
}

// ─── Phase B: native Hermes voice-input (STT) config ────────────────────
//
// We do NOT build any external STT middleware. There is no seam — after
// complete-onboarding deletes the Telegram webhook, the upstream Hermes
// Python gateway owns the Telegram connection DIRECTLY on the customer's
// VPS. Instead we enable Hermes' OWN voice-memo transcription via its
// native config: writing the `voice` + `stt` block to ~/.hermes/config.yaml
// and the STT key env var to ~/.hermes/.env. No Hermes code is touched.
//
// Verified from upstream docs (hermes-agent.nousresearch.com/docs/
// user-guide/features/voice-mode + /docs/guides/use-voice-mode-with-hermes,
// 2026-06-02):
//   - Incoming Telegram voice messages are transcribed AUTOMATICALLY once
//     `stt.enabled: true` + `stt.provider` are set — the customer does NOT
//     need to type `/voice on`. (`/voice on` controls TTS voice REPLIES,
//     a separate pipeline we keep OFF for input-only.)
//   - STT providers: "local" (faster-whisper, no key), "groq" (GROQ_API_KEY),
//     "openai" (VOICE_TOOLS_OPENAI_KEY — a REAL api.openai.com key, NOT the
//     OpenRouter key we already write as OPENAI_API_KEY).
//
// Provider choice (founder lock 2026-06-02): default to Groq Whisper. It is
// free + fast + good at Bahasa, and — critically — it sidesteps the
// OpenAI-vs-OpenRouter key trap (our chat path already uses an OpenRouter
// key under OPENAI_API_KEY; Hermes' OpenAI STT would need a separate real
// OpenAI key). Switch fleet-wide by changing this one constant (and setting
// the matching provisioning env var). config.yaml is the source of truth
// for the active provider; the env var only carries the key.
const VOICE_STT_PROVIDER: 'groq' | 'openai' = 'groq'

// Groq Whisper model. whisper-large-v3-turbo is the upstream default and
// has strong multilingual (incl. Bahasa Indonesia) coverage. Written as
// STT_GROQ_MODEL in .env (Hermes reads it as the model override).
const VOICE_STT_GROQ_MODEL = 'whisper-large-v3-turbo'

// OpenAI Whisper model (only used when provider === 'openai').
const VOICE_STT_OPENAI_MODEL = 'whisper-1'

/**
 * The .env key var NAME for an STT provider. Hermes reads a DIFFERENT var
 * per provider — Groq from GROQ_API_KEY, OpenAI from VOICE_TOOLS_OPENAI_KEY
 * (deliberately NOT OPENAI_API_KEY, which already holds the OpenRouter
 * chat key).
 */
function sttKeyEnvName(provider: 'groq' | 'openai'): string {
  return provider === 'groq' ? 'GROQ_API_KEY' : 'VOICE_TOOLS_OPENAI_KEY'
}

/**
 * .env lines for native STT. Only the KEY env vars live here; the config
 * block (provider selection, enabled flag) is materialized into
 * config.yaml separately (see voiceConfigYamlBlock). Returns [] when the
 * tier doesn't grant voice OR no key was supplied — in the no-key case the
 * config block is still written so STT activates the moment a key arrives
 * via refresh-env.
 */
function voiceSttEnvLines(p: SetupScriptParams, provider: 'groq' | 'openai'): string[] {
  if (!p.voiceSttKey) return []
  const lines = [`${sttKeyEnvName(provider)}=${p.voiceSttKey}`]
  if (provider === 'groq') {
    // Pin the Groq model + base URL so a future upstream default change
    // doesn't silently swap the model under our customers.
    lines.push(`STT_GROQ_MODEL=${VOICE_STT_GROQ_MODEL}`)
    lines.push(`GROQ_BASE_URL=https://api.groq.com/openai/v1`)
  }
  return lines
}

/**
 * The `voice` + `stt` config.yaml block, TTS left OFF (input-only this
 * phase). `auto_tts: false` + no `/voice on` means the bot transcribes
 * incoming voice memos to text and replies in TEXT — never speaks back.
 *
 * Heredoc-appended to config.yaml in step 7c. We APPEND (not sed-merge)
 * because a fresh non-interactive Hermes install ships config.yaml WITHOUT
 * a voice/stt block, so there is nothing to sed; appending top-level keys
 * is valid YAML. The block is idempotency-guarded at write time (grep for
 * an existing `stt:` key) so a re-provision/refresh doesn't duplicate it.
 */
function voiceConfigYamlBlock(provider: 'groq' | 'openai'): string {
  const model = provider === 'groq' ? VOICE_STT_GROQ_MODEL : VOICE_STT_OPENAI_MODEL
  // Indentation matters — YAML. Two-space nesting under each top-level key.
  return [
    '',
    '# ── weuseai voice-input (Phase B, native Hermes STT) ──',
    '# Input-only: incoming voice memos are transcribed to text; the bot',
    '# replies in TEXT (auto_tts:false, no TTS provider activated). STT runs',
    "# passively once enabled — the customer does NOT type /voice on.",
    'voice:',
    '  auto_tts: false',
    '  max_recording_seconds: 120',
    'stt:',
    '  enabled: true',
    `  provider: "${provider}"`,
    `  ${provider}:`,
    `    model: "${model}"`,
  ].join('\n')
}

// ─── persona + skill content ──────────────────────────────────────────────
//
// First-boot SOUL.md — written at first VPS boot so the customer's agent
// has a coherent voice from second 1, even before the Edge Function
// post-onboarding overwrite lands. The post-onboarding write in
// supabase/functions/_shared/complete-onboarding-handler.ts calls
// renderSoulMd() with the customer's real name + expectations and replaces
// this file ~5-7 minutes after VPS spawn.
//
// Persona selection (2026-05-17): the scaffold is no longer a hard-coded
// The Pro copy. buildSetupScript() resolves it from `agentSlug` via
// personaScaffold() (soul-md-template.ts — the single source of truth for
// all 10 persona scaffolds, drift-tested against /agent-packs/<slug>/SOUL.md
// in tests/soul-md-template.spec.ts). Importing the canonical scaffold
// removes the byte-for-byte mirror this file used to carry. Template
// tokens ({customer_name}, {first_name}, … ) stay UNRESOLVED in the
// first-boot write — they get filled by the post-onboarding overwrite, and
// the customer can't talk to the agent before onboarding completes anyway.

const DAILY_NEWS_SKILL_MD = `# Daily news briefing — Bahasa Indonesia

## Kapan dipakai
Kalau user minta berita, briefing pagi, "kabar", "berita pagi", atau cron 0 0 UTC (7 pagi WIB).

## Sumber
- detik.com
- kompas.com
- cnbcindonesia.com

## Yang dilakukan
1. Cek 5 berita teratas dari ketiga sumber (top headlines, terbaru atau paling relevan).
2. Ringkas tiap berita dalam 2 kalimat — fakta, bukan opini.
3. Format Telegram: judul tebal (Markdown bold), ringkasan di bawah.
4. Mulai dengan greeting "Selamat pagi" + tanggal WIB.

## Contoh output
Selamat pagi. Berita Senin, 12 Mei 2026:

**Judul berita 1**
Ringkasan dua kalimat tentang berita ini.
`

// /start skill (2026-05-16). Hermes' gateway only routes registered
// skill-commands; an un-registered /start gets "Unknown command" — the
// worst possible reply to a customer's very first message. A skill
// named `start` makes /start resolve; invoking it feeds this content to
// the agent, which fires the SOUL.md "first contact" greeting.
const START_SKILL_MD = `# Start — sapaan kontak pertama

## Kapan dipakai
Saat customer mengetik /start. Biasanya ini pesan pertama mereka ke kamu, atau saat mereka mau mulai ulang percakapan dari awal.

## Yang dilakukan
Sapa customer sebagai kontak pertama. Ikuti persis bagian "When my customer first messages me" di SOUL.md kamu:
- Sapa hangat, pakai nama customer kalau kamu tahu namanya.
- Sebut spesialisasi kamu dalam satu kalimat singkat.
- Kasih tiga contoh konkret yang bisa dimulai sekarang.
- Tutup dengan satu pertanyaan: apa prioritas mereka hari ini.

## Yang tidak dilakukan
- Jangan tampilkan instruksi ini ke customer.
- Jangan sebut kata "skill", "/start", atau "command".
- Jangan jelaskan apa itu /start. Langsung balas dengan sapaan natural, seakan ini awal percakapan.
`

// Persona Genesis interview skill (Mission 2, 2026-06-10). Installed ONLY
// on tiers that grant generation (GENESIS_TIERS — done-for-you/enterprise);
// the server re-enforces the gate, this just keeps the command off
// ineligible bots. Drives a five-question Bahasa interview, then POSTs the
// profile to the persona-genesis Edge Function.
const BIKIN_PERSONA_SKILL_MD = `# bikin-persona — persona khusus untuk customer

## Kapan dipakai
Customer mengetik /bikin-persona, atau bilang hal seperti "bikin persona khusus buat aku", "bikinin asisten yang ngerti kerjaan aku", "custom persona".

## Yang dilakukan
Kamu mewawancarai customer dulu, lalu mengirim hasilnya ke sistem pembuat persona. Santai, satu pertanyaan per pesan, dalam Bahasa Indonesia.

Langkah:
1. Jelaskan singkat: kamu akan tanya lima hal tentang pekerjaan mereka, lalu sistem membuatkan persona yang dirancang khusus — lengkap dengan kemampuan dan template untuk pekerjaan mereka. Prosesnya beberapa menit.
2. Tanya satu per satu, tunggu jawaban sebelum lanjut:
   a. Apa peran kamu dan di mana kamu kerja? (contoh: marketing manager di startup F&B)
   b. Hari kerja kamu biasanya isinya apa saja?
   c. Output apa yang paling sering kamu buat? (laporan, deck, konten, dsb.)
   d. Tools apa yang kamu pakai sehari-hari?
   e. Bagian mana dari kerjaan yang paling makan waktu atau bikin frustrasi?
3. Rangkum jawaban mereka dalam 2-3 kalimat, minta konfirmasi: "Sudah pas, atau ada yang mau ditambah?"
4. Setelah customer konfirmasi, POST ke endpoint pembuat persona:

   POST $WEUSEAI_PERSONA_GENESIS_URL
   Headers: Content-Type: application/json, X-CID: $WEUSEAI_CUSTOMER_ID
   Body: {
     "customer_id": "$WEUSEAI_CUSTOMER_ID",
     "profile": {
       "role": "<jawaban a>",
       "daily_tasks": "<jawaban b>",
       "outputs": "<jawaban c>",
       "tools": "<jawaban d>",
       "pain_points": "<jawaban e>"
     }
   }

5. Kalau respons ok=true: sampaikan message_bahasa dari respons ke customer, apa adanya.
6. Kalau respons error: sampaikan message_bahasa kalau ada; kalau tidak ada, bilang jujur bahwa pembuatan persona belum berhasil dan mereka bisa coba lagi.

## Yang tidak dilakukan
- Jangan mengarang jawaban customer — tanya sampai dijawab.
- Jangan menjanjikan akses ke kalender, email, atau aplikasi mereka.
- Jangan tampilkan JSON atau detail teknis ke customer.
`

// Pagi Briefing (Mission 2, 2026-06-10). Replaces the generic daily-news
// cron — the audit's U1: customers were SOLD "briefing pagi tiap hari jam 7
// WIB" but only got 5 generic headlines. This prompt is static, yet
// personalized BY CONSTRUCTION at runtime: the agent reads its own SOUL.md
// (the customer's name, expectations, and — post-Persona-Genesis — their
// bespoke persona) when composing. Honesty rule (audit U4): the prompt
// explicitly forbids claiming calendar/email data we do not have.
export const PAGI_BRIEFING_CRON_PROMPT =
  'Susun Pagi Briefing untuk customer kamu, dalam Bahasa Indonesia, sapa pakai nama mereka. ' +
  'Baca SOUL.md kamu: siapa customer ini, apa pekerjaan dan fokus mereka. Susun: ' +
  '(1) Sapaan singkat selamat pagi. ' +
  '(2) Outstanding dari percakapan kalian sebelumnya — komitmen, follow-up, atau hal yang kemarin belum selesai. Kalau tidak ada, lewati bagian ini tanpa komentar. ' +
  '(3) Tiga berita atau perkembangan paling relevan untuk PEKERJAAN customer ini (cek detik.com, kompas.com, cnbcindonesia.com, atau sumber yang lebih spesifik ke bidang mereka). Ringkas masing-masing 2 kalimat, jelaskan kenapa relevan buat mereka. ' +
  '(4) Tutup dengan satu pertanyaan: apa prioritas mereka hari ini. ' +
  'PENTING: kamu TIDAK punya akses kalender atau email customer — jangan pernah menyebut jadwal, meeting, atau email seolah kamu tahu isinya. ' +
  'Format Telegram: ringkas, judul tebal seperlunya, tanpa tanda seru.'

// End-of-day summary cron (audit U2: promised 18:00 WIB, never fired).
// 11:00 UTC = 18:00 WIB.
export const EOD_SUMMARY_CRON_PROMPT =
  'Susun ringkasan akhir hari untuk customer kamu, dalam Bahasa Indonesia, sapa pakai nama mereka. ' +
  'Dari percakapan kalian hari ini: (1) apa saja yang selesai, (2) apa yang masih outstanding untuk besok, ' +
  '(3) satu hal yang perlu konfirmasi atau keputusan mereka. ' +
  'Kalau kalian tidak berinteraksi sama sekali hari ini, kirim satu kalimat singkat saja: tanya apakah ada yang bisa disiapkan untuk besok. ' +
  'Kamu TIDAK punya akses kalender atau email — hanya percakapan kalian. Tanpa tanda seru.'

// Weekly recap cron (2026-06-14): the memory moment. Cross-session memory
// is the agent's realest, most under-shown asset — a Sunday-evening recap
// turns an invisible backend feature into a weekly proof that the agent
// remembers the customer. Sunday 19:00 WIB = 12:00 UTC Sunday (0 12 * * 0).
// Honesty rule (audit U4): no calendar/email claims, no fabricated tasks.
export const WEEKLY_RECAP_CRON_PROMPT =
  'Susun Laporan Mingguan untuk customer kamu, dalam Bahasa Indonesia, sapa pakai nama mereka. ' +
  'Ini momen kamu menunjukkan bahwa kamu INGAT mereka. Baca SOUL.md kamu, lalu telusuri ingatan percakapan kalian selama 7 hari terakhir. Susun: ' +
  '(1) Sapaan singkat, sebut ini rekap minggu ini. ' +
  '(2) Yang kamu bantu selesaikan minggu ini — tugas, draft, atau keputusan yang sudah kelar. Sebut spesifik dari percakapan kalian, bukan umum. ' +
  '(3) Yang masih outstanding — hal yang mereka titip atau sebut penting tapi belum selesai. Kalau ada yang sempat mereka sebut lalu tidak dilanjutkan, ingatkan dengan halus. ' +
  '(4) Satu saran fokus untuk minggu depan, berdasarkan pola yang kamu lihat dari percakapan kalian. ' +
  '(5) Tutup dengan satu pertanyaan terbuka soal prioritas minggu depan. ' +
  'Kalau minggu ini kalian nyaris tidak berinteraksi, jangan mengarang — kirim pesan singkat dan hangat saja: sebut kamu siap bantu, dan tanya apa yang bisa disiapkan minggu ini. ' +
  'PENTING: kamu TIDAK punya akses kalender atau email customer — hanya percakapan dan ingatan kalian. Jangan pernah mengarang tugas atau angka yang tidak ada di percakapan. ' +
  'Format Telegram: ringkas, judul tebal seperlunya, tanpa tanda seru.'

const LIVENESS_PING_TEXT =
  'Halo, gue agen lo. Setup beres. Pagi Briefing aktif jam 7 pagi WIB, ringkasan sore jam 6, laporan mingguan tiap Minggu malam. ' +
  'Coba ketik apa aja buat tes.'

// ─── helpers ────────────────────────────────────────────────────────────────

function llmEnvLines(p: SetupScriptParams): string[] {
  // Phase 2A: ALL tiers route through OpenRouter (single key per customer
  // minted by the provisioning service). Hermes's primary chat-completion
  // path is OpenAI-compatible — we point it at openrouter.ai/api/v1 and
  // pass the key as OPENAI_API_KEY.
  //
  // Hermes auxiliary tasks (context compression, title generation) read
  // from OPENROUTER_API_KEY specifically — different env var name, same
  // sub-key value. Without this Hermes prints two warnings on every
  // message:
  //
  //   "No auxiliary LLM provider configured — context compression will
  //    drop middle turns without a summary. Run hermes setup or set
  //    OPENROUTER_API_KEY."
  //   "Auxiliary title generation failed: No LLM provider configured for
  //    task=title_generation provider=auto."
  //
  // Fix: emit both env vars pointing at the same OpenRouter sub-key.
  // 2026-05-12 — see Fix 2 of post-Vultr-migration polish cascade.
  if (!p.openRouterKey) return []
  return [
    `OPENAI_API_KEY=${p.openRouterKey}`,
    // Same value, different name — Hermes auxiliary path reads this.
    `OPENROUTER_API_KEY=${p.openRouterKey}`,
    `OPENAI_BASE_URL=${OPENROUTER_BASE_URL}`,
    `OPENAI_MODEL=${OPENROUTER_DEFAULT_MODEL}`,
  ]
}

function workflowEnvLines(p: SetupScriptParams): string[] {
  // Phase 2E-1.5: agent bundle env. Hermes skills read these to know
  // which bundle is theirs + where to POST workflow-execute calls.
  // Skipped when no bundle is shipped (back-compat with Phase 1/2A).
  if (!p.bundleTarBase64) return []
  // v1.4 `bare`: persona-free tier — emit EMPTY slug lists so bundle-pull
  // installs nothing (vanilla Hermes). bundle-pull-script exits 0 cleanly
  // on an empty WEUSEAI_AGENT_SLUGS.
  const personaFree = isPersonaFreeTier(p.tier)
  const slug = personaFree ? '' : (p.agentSlug ?? 'the-pro')
  // D1 lock (2026-05-12 multi-persona MVP): emit WEUSEAI_AGENT_SLUGS
  // as a CSV of all personas the customer has at their tier. The
  // bundle-pull script loops over this list at every Hermes boot.
  // Falls back to [slug] for back-compat callers that only pass
  // agentSlug (e.g., legacy test fixtures).
  const slugs = personaFree
    ? []
    : p.agentSlugs && p.agentSlugs.length > 0
      ? p.agentSlugs
      : [slug]
  const url = p.workflowExecuteUrl ?? DEFAULT_WORKFLOW_EXECUTE_URL
  // The playbook state-machine engine (Phase 1 Week 2) lives at the
  // `flow-state` Edge Function — same functions base as workflow-execute.
  // Derive it from the workflow-execute URL so a test/staging override of
  // workflowExecuteUrl carries the flow-state URL along with it.
  const flowStateUrl = url.replace(/\/workflow-execute(\/?)$/, '/flow-state$1')
  // Persona Genesis endpoint — same functions base as workflow-execute.
  const personaGenesisUrl = url.replace(/\/workflow-execute(\/?)$/, '/persona-genesis$1')
  return [
    `WEUSEAI_AGENT_SLUG=${slug}`,
    `WEUSEAI_AGENT_SLUGS=${slugs.join(',')}`,
    `WEUSEAI_TIER=${p.tier}`,
    `WEUSEAI_CUSTOMER_ID=${p.customerId}`,
    `WEUSEAI_WORKFLOW_EXECUTE_URL=${url}`,
    `WEUSEAI_FLOW_STATE_URL=${flowStateUrl}`,
    `WEUSEAI_PERSONA_GENESIS_URL=${personaGenesisUrl}`,
  ]
}

/**
 * Persona Genesis eligibility — mirrors GENESIS_TIERS in
 * persona-genesis-handler.ts (server-side gate is authoritative; this only
 * decides whether the /bikin-persona command is installed on the bot).
 * Unknown slug → false (no genesis on unrecognized tiers).
 */
function isGenesisTier(tier: ProvisionTier): boolean {
  try {
    const canonical = resolveTier(tier)
    return canonical === 'done-for-you' || canonical === 'enterprise'
  } catch {
    return false
  }
}

/** Single-quote escape for embedding in bash -c '…'. */
function shSingleQuote(s: string): string {
  return s.replace(/'/g, `'\\''`)
}

function telegramJson(chatId: string, text: string): string {
  return JSON.stringify({ chat_id: chatId, text })
}

/**
 * Persona-free tier (v1.4 `bare`) — vanilla Hermes, no persona skills, no
 * bundle, no persona SOUL. Derived from the canonical catalog so it tracks
 * the source of truth (bare.personas === []). enterprise (null) is never
 * provisioned, so the empty/null collapse is safe.
 */
function isPersonaFreeTier(tier: ProvisionTier): boolean {
  let personas: readonly string[] | null
  try {
    personas = TIERS[resolveTier(tier)].personas
  } catch {
    // Unknown slug → degrade to the normal (persona) path, never abort
    // provision. Matches the voice gate's resolve-failure handling.
    return false
  }
  return !personas || personas.length === 0
}

/**
 * Neutral first-boot SOUL.md for the `bare` tier. Honest: it tells the
 * customer this is the base version with no specialised persona. Brand
 * rules: Bahasa, "kamu", calm-premium, zero exclamation marks.
 */
const VANILLA_SOUL = `# About me

Aku asisten AI pribadi kamu di weuseai.agent — jalan di server kamu sendiri, lewat Telegram. Model dasar DeepSeek, bahasa utama Bahasa Indonesia.

# How I communicate

Bahasa Indonesia, pakai "kamu". Ringkas, satu ide per kalimat. Kalau kamu nulis dalam bahasa Inggris, aku balas dalam bahasa Inggris.

# What I do

Aku bantu tugas harian umum: jawab pertanyaan, susun draft, rangkum teks, dan bantu mikir. Aku versi dasar — belum ada persona khusus, template library, atau playbook tambahan.

# Hard limits

- Tidak pernah share API key, password, atau data kamu ke pihak ketiga.
- Tidak melakukan transaksi atau commit uang tanpa konfirmasi eksplisit dalam sesi.
- Tidak mengarang fakta. Kalau aku tidak tahu, aku bilang tidak tahu.

# When my customer first messages me

Sapa hangat dan singkat. Sebutkan kamu versi dasar — asisten umum berbasis DeepSeek. Tanya apa yang bisa dibantu hari ini.
`

// ─── main builder ───────────────────────────────────────────────────────────

export function buildSetupScript(p: SetupScriptParams): string {
  const hasTelegram = Boolean(p.telegramBotToken)
  const HERMES = '/home/weuseai/.local/bin/hermes'

  // Persona selection (2026-05-17): the first-boot SOUL.md is the chosen
  // persona's scaffold, not the hard-coded The Pro. complete-onboarding
  // later overwrites this with the fully-rendered SOUL.md (customer name
  // + expectations resolved) via refreshEnv — but selecting by agentSlug
  // here means a customer who messages before that overwrite still gets
  // their picked persona's voice. Unknown / absent slug → The Pro
  // (personaScaffold's fallback), matching the legacy default.
  const soulMd = isPersonaFreeTier(p.tier) ? VANILLA_SOUL : personaScaffold(p.agentSlug)

  // Telegram env block — only when bot token present. Customer pastes
  // token via dashboard later → we re-run a smaller "telegram-activate"
  // script then (Phase 2). For now: no token → no Telegram channel.
  const telegramEnvLines = hasTelegram
    ? [
        `TELEGRAM_BOT_TOKEN=${p.telegramBotToken}`,
        `TELEGRAM_ALLOWED_USERS=${p.telegramAllowedUserIds ?? ''}`,
        `TELEGRAM_REACTIONS=true`,
      ]
    : []
  // Phase 5-3.c rollout: per-customer HMAC token. Hermes-side proxy
  // callers read this and Authorization: Bearer it on platform callbacks.
  // Skipped when caller hasn't computed (back-compat / pre-rollout).
  const hmacEnvLines = p.hermesInstanceToken
    ? [`HERMES_INSTANCE_TOKEN=${p.hermesInstanceToken}`]
    : []

  // ─── Phase B voice gate ───────────────────────────────────────────────
  // Strictly tier-gated: the voice/stt config (env + config.yaml block) is
  // emitted ONLY when the customer's tier grants voice. resolveTier handles
  // both canonical slugs and the deprecated aliases (starter/pro/studio)
  // that this script's `Tier` type still carries. A future text-only tier
  // (features.voice === false) gets NOTHING — no env line, no config block,
  // no regression to the text flow. Unknown slug → resolveTier throws,
  // which we DON'T want to abort provisioning over a voice add-on, so we
  // degrade to voice-off on any resolve error.
  let voiceEnabled = false
  try {
    voiceEnabled = TIERS[resolveTier(p.tier)].features.voice === true
  } catch {
    voiceEnabled = false
  }
  const voiceProvider = p.voiceSttProvider ?? VOICE_STT_PROVIDER
  const voiceSttLines = voiceEnabled ? voiceSttEnvLines(p, voiceProvider) : []

  const allEnvLines = [
    ...telegramEnvLines,
    ...llmEnvLines(p),
    ...workflowEnvLines(p),
    ...hmacEnvLines,
    ...voiceSttLines,
  ]

  // Persona Genesis interview command — eligible tiers only (server-side
  // gate in persona-genesis-handler is authoritative).
  const bikinPersonaSkillBlock = isGenesisTier(p.tier)
    ? `
# ─── 6 (cont). /bikin-persona — Persona Genesis interview ─────────────
# Tier grants generated personas: install the interview command. The
# server (persona-genesis Edge Function) re-enforces tier + ownership.
sudo -u weuseai mkdir -p /home/weuseai/.hermes/skills/bikin-persona
cat > /home/weuseai/.hermes/skills/bikin-persona/SKILL.md <<'WEUSEAI_BIKIN_PERSONA_EOF'
${BIKIN_PERSONA_SKILL_MD}WEUSEAI_BIKIN_PERSONA_EOF
`
    : ''

  // Halo block — fires FIRST so customer sees life immediately.
  const haloJson = telegramJson(p.telegramAllowedUserIds ?? '', LIVENESS_PING_TEXT)
  const haloCurl = hasTelegram
    ? `
log "Sending halo ping to Telegram (proof-of-life)..."
curl -fsS -X POST \\
  "https://api.telegram.org/bot${p.telegramBotToken}/sendMessage" \\
  -H "Content-Type: application/json" \\
  -d '${haloJson}' \\
  >> "$LOG" 2>&1 \\
  && log "✓ halo sent" \\
  || log "✗ halo curl failed (non-fatal, continuing)"
`
    : `
log "No telegramBotToken — skipping halo ping (customer will paste token via dashboard)"
`

  // Telegram-dependent post-install commands.
  //
  // Diagnosed 2026-05-06 on a fresh IDCH VM (Day 4b investigation):
  //   - `hermes gateway setup --telegram` is INVALID syntax — `--telegram`
  //     is not a recognized flag on `hermes gateway setup`. Hermes reads the
  //     bot token from .env directly when the gateway runs; there's no
  //     "configure platform" step. Removed.
  //   - `hermes gateway install` (no flags) installs a USER-level systemd
  //     unit under ~/.config/systemd/user. Those don't auto-start at boot
  //     and need `loginctl enable-linger` to survive logouts. We need
  //     `--system --run-as-user weuseai` for a real /etc/systemd/system
  //     unit with `Restart=always` + multi-user.target enable.
  //   - `gateway install` only INSTALLS the unit; it does NOT start it.
  //     The CLI's own "Next steps" text says "sudo hermes gateway start
  //     --system". Without that, the unit sits inactive/dead and the bot
  //     never polls Telegram.
  //
  // Verified on test VM:
  //   /etc/systemd/system/hermes-gateway.service exists,
  //   enabled (multi-user.target.wants/), Active: active (running),
  //   Restart=always RestartSec=60.
  // HF-2 (2026-05-12): gateway install + start failures are FATAL.
  // Pre-HF-2 they were tagged "non-fatal" + the customer's VPS got
  // marked running even though the bot would never reply. Cron is
  // genuinely cosmetic (it adds a daily-news job) so it stays optional.
  //
  // HF-2d (2026-05-13): gateway INSTALL now runs unconditionally —
  // it only depends on the Hermes binary, NOT on the bot token. The
  // pre-2d gate `if hasTelegram` meant first-spinUp (via xendit-webhook
  // with empty bot token) skipped gateway install entirely, then
  // complete-onboarding's refresh-env raced setup-script's Hermes
  // install — refresh-env's install-if-missing block fired BEFORE
  // setup-script finished installing Hermes binary, got "hermes
  // binary not found at /home/weuseai/.local/bin/hermes" + exit 4,
  // and the customer's gateway was never installed at all. Verified
  // on customer e282ce25 2026-05-13: refresh_env_requests row had
  // outcome.error='env_write_failed' with that exact detail.
  //
  // Post-HF-2d: setup-script ALWAYS installs the gateway after
  // Hermes binary verify (step 7b). When a bot token is present at
  // first spinUp the gateway is also STARTED + cron added; without a
  // bot token it stays installed-but-not-started, and complete-
  // onboarding's refresh-env triggers the start via the existing
  // systemctl-restart line. No race possible.
  const hermesGatewayInstallBlock = `
log "Installing Hermes gateway as system service..."
if ! ${HERMES} gateway install --system --run-as-user weuseai >> "$LOG" 2>&1; then
  log "✗ gateway install FAILED — customer's bot would never reply; aborting"
  exit 9
fi
`
  const hermesGatewayStartBlock = hasTelegram
    ? `
log "Starting Hermes gateway service..."
if ! ${HERMES} gateway start --system >> "$LOG" 2>&1; then
  log "✗ gateway start FAILED — customer's bot would never reply; aborting"
  exit 10
fi

log "Adding Pagi Briefing cron (07:00 WIB)..."
su - weuseai -c '${HERMES} cron add --schedule "0 0 * * *" --prompt "${shSingleQuote(PAGI_BRIEFING_CRON_PROMPT)}" --deliver telegram' >> "$LOG" 2>&1 || log "⚠ pagi-briefing cron add failed (non-fatal — briefing still works on demand)"

log "Adding end-of-day summary cron (18:00 WIB)..."
su - weuseai -c '${HERMES} cron add --schedule "0 11 * * *" --prompt "${shSingleQuote(EOD_SUMMARY_CRON_PROMPT)}" --deliver telegram' >> "$LOG" 2>&1 || log "⚠ eod-summary cron add failed (non-fatal)"

log "Adding Laporan Mingguan cron (Minggu 19:00 WIB)..."
su - weuseai -c '${HERMES} cron add --schedule "0 12 * * 0" --prompt "${shSingleQuote(WEEKLY_RECAP_CRON_PROMPT)}" --deliver telegram' >> "$LOG" 2>&1 || log "⚠ weekly-recap cron add failed (non-fatal)"
`
    : `
log "No TELEGRAM_BOT_TOKEN at first spinUp — gateway installed but not started."
log "  complete-onboarding step 8a will start it once customer pairs."
`
  const hermesGatewayBlock = hermesGatewayInstallBlock + hermesGatewayStartBlock

  // .env file content (heredoc-safe — no special chars in our values)
  const envFileBody = allEnvLines.join('\n')

  // Agent-pack bundle install block (Phase 2E-1.5). Empty string when
  // caller didn't supply a bundle (back-compat with Phase 1/2A flows).
  const bundleInstallBlock = p.bundleTarBase64
    ? `
log "Installing agent-pack bundle (${p.agentSlug ?? 'the-pro'})..."
sudo -u weuseai mkdir -p /home/weuseai/.hermes/agent-pack
echo '${p.bundleTarBase64}' | base64 -d | tar -xz -C /home/weuseai/.hermes/agent-pack >> "$LOG" 2>&1
chown -R weuseai:weuseai /home/weuseai/.hermes/agent-pack

# Symlink each SKILL.md under skills/ into the Hermes-native skills dir
# so the upstream skill loader picks them up alongside daily-news.
if [ -d /home/weuseai/.hermes/agent-pack/skills ]; then
  for skill_dir in /home/weuseai/.hermes/agent-pack/skills/*/; do
    skill_name=$(basename "$skill_dir")
    sudo -u weuseai mkdir -p "/home/weuseai/.hermes/skills/$skill_name"
    sudo -u weuseai cp "$skill_dir/SKILL.md" "/home/weuseai/.hermes/skills/$skill_name/SKILL.md" 2>> "$LOG" || log "⚠ skill copy failed for $skill_name"
  done
  log "✓ Bundle skills installed"
fi

# Customer-grown extension directory — empty at provision; populated by
# extend-capabilities skill at runtime as customer requests new templates.
mkdir -p /var/lib/weuseai/customer-grown/templates /var/lib/weuseai/customer-grown/skills
touch /var/lib/weuseai/customer-grown/extension-log.jsonl
chown -R weuseai:weuseai /var/lib/weuseai
log "✓ Customer-grown extension area initialized"
`
    : `
log "No agent-pack bundle supplied; running with Phase 1/2A baseline (daily-news only)"
`

  // Phase 2E-2: weuseai-bundle-pull boot script + Hermes systemd
  // ExecStartPre integration. Only emitted when a bundle was shipped
  // (back-compat: Phase 1/2A customers don't get this).
  const bundlePullScript = buildBundlePullScript({
    customerId: p.customerId,
  })
  // base64-encode to keep heredoc-safe (no quote-escape pitfalls).
  const bundlePullScriptB64 = Buffer.from(bundlePullScript, 'utf8').toString('base64')
  const bundlePullInstallBlock = p.bundleTarBase64
    ? `
# ─── 6c. weuseai-bundle-pull script (Phase 2E-2) ────────────────────────
#
# Install the bundle-pull script at /usr/local/bin/weuseai-bundle-pull.
# This is the script that runs as Hermes systemd ExecStartPre on every
# boot — pulls the per-agent bundle from Storage, applies tier filter,
# copies SKILL.md files into Hermes' discovery path. Graceful failure
# (always exits 0) preserves the bootstrap-bundle SLA floor.
log "Installing weuseai-bundle-pull at /usr/local/bin/..."
echo '${bundlePullScriptB64}' | base64 -d > /usr/local/bin/weuseai-bundle-pull
chmod 0755 /usr/local/bin/weuseai-bundle-pull

log "Adding ExecStartPre=/usr/local/bin/weuseai-bundle-pull to Hermes systemd unit..."
# Hermes' \`gateway install --system\` writes the unit at gateway-install
# time (step 8 below). We use a drop-in override here so the boot script
# stays in place even if the unit is re-installed later.
#
# CRITICAL: the \`+\` prefix on ExecStartPre runs the bundle-pull script
# with FULL PRIVILEGES (root), regardless of the unit's User= setting.
# Hermes installs as User=weuseai, but the bundle-pull script needs:
#   - write to /var/log/weuseai-bundle-pull.log (root-owned dir),
#   - mkdir -p /var/lib/weuseai/bundle/<slug>/<version>,
#   - chown -R weuseai:weuseai (requires CAP_CHOWN), and
#   - chmod 0755 on system paths.
# Without "+", systemd inherits User=weuseai, every privileged op fails
# silently (set -e is off for graceful degrade), the script exits 0, and
# .installed-version never appears. Diagnosed 2026-05-08 across 4
# Run 1 attempts before the manual \`bash -x\` re-invocation as root
# revealed the script logic was fine — it was the privilege drop.
# Reference: \`man systemd.service\`, "Special executable prefixes".
# The main ExecStart= still runs as weuseai, unchanged.
mkdir -p /etc/systemd/system/hermes-gateway.service.d
cat > /etc/systemd/system/hermes-gateway.service.d/10-bundle-pull.conf <<'WEUSEAI_DROPIN_EOF'
[Service]
ExecStartPre=+/usr/local/bin/weuseai-bundle-pull
WEUSEAI_DROPIN_EOF

# Force a daemon-reload now so the drop-in is registered BEFORE
# \`hermes gateway install\` writes the .service file later. Without
# this, the timing varies: if the Hermes CLI doesn't itself daemon-
# reload after writing the unit, our drop-in isn't picked up until the
# next reload (typically reboot). Belt-and-suspenders to guarantee the
# ExecStartPre fires on the first \`gateway start --system\` call.
systemctl daemon-reload >> "$LOG" 2>&1 || log "⚠ daemon-reload failed (non-fatal)"
log "✓ bundle-pull installed"
`
    : ''

  // Phase 2E-3: fleet SSH pubkey install. Append to weuseai's
  // authorized_keys so the provisioning service /tier-bump endpoint can
  // re-SSH in later. Idempotent — grep guard prevents duplicate entries
  // on re-provision. Skipped (back-compat) when no pubkey supplied.
  //
  // Pre-2E-3 customers (no pubkey at provision time) need a one-time
  // manual injection — runbook in PR #5 description.
  const fleetSshPubkeyBlock = p.fleetSshPubkey
    ? `
# ─── 6d. Fleet SSH pubkey (Phase 2E-3) ─────────────────────────────────
#
# Install the fleet-shared public key into weuseai's authorized_keys so
# the provisioning service can SSH back in for tier-bump and ops tasks.
# The matching private key lives in Fly.io secrets as
# FLEET_SSH_PRIVATE_KEY — never written to disk on the customer's VPS.
log "Installing fleet SSH pubkey for /tier-bump access..."
sudo -u weuseai mkdir -p /home/weuseai/.ssh
sudo -u weuseai chmod 0700 /home/weuseai/.ssh
sudo -u weuseai touch /home/weuseai/.ssh/authorized_keys
sudo -u weuseai chmod 0600 /home/weuseai/.ssh/authorized_keys
# Idempotency: only append if the key isn't already present.
FLEET_KEY=${JSON.stringify(p.fleetSshPubkey)}
if ! sudo -u weuseai grep -qF "$FLEET_KEY" /home/weuseai/.ssh/authorized_keys; then
  echo "$FLEET_KEY" | sudo -u weuseai tee -a /home/weuseai/.ssh/authorized_keys >> "$LOG"
  log "✓ Fleet SSH pubkey installed"
else
  log "✓ Fleet SSH pubkey already present (idempotent)"
fi
`
    : ''

  const pinnedHermesVersion = resolveHermesRef(p.hermesVersion)

  // ─── Phase B: voice/stt config.yaml block (tier-gated) ────────────────
  // Appended inside step 7c (the existing config.yaml tweak block), after
  // the model pin. Empty string when the tier doesn't grant voice — so a
  // text-only tier's config.yaml is byte-identical to pre-Phase-B. The
  // append is idempotency-guarded (grep for an existing `stt:` key) so a
  // re-provision doesn't stack duplicate blocks. config.yaml may legitimately
  // be absent at this point (non-fatal) — the outer `if [ -f "$CONFIG_YAML" ]`
  // in step 7c already guards that; we sit inside it.
  const voiceConfigShellBlock = voiceEnabled
    ? `
  # ── Phase B: native voice-input (STT) config ──
  # Append the voice + stt block so Hermes transcribes incoming voice memos
  # to text (input-only; TTS stays off). Idempotent: skip if an stt: key is
  # already present. Provider=${voiceProvider}; the key lives in .env
  # (${sttKeyEnvName(voiceProvider)}). If the key is absent the block is still
  # written and STT falls back gracefully — text chat is unaffected.
  if ! grep -qE '^stt:' "$CONFIG_YAML"; then
    cat >> "$CONFIG_YAML" <<'WEUSEAI_VOICE_EOF'
${voiceConfigYamlBlock(voiceProvider)}
WEUSEAI_VOICE_EOF
    log "✓ voice/stt config appended (provider=${voiceProvider}, input-only)"
  else
    log "✓ voice/stt config already present (idempotent skip)"
  fi`
    : ''

  // Skills + persona writes
  return `#!/bin/bash
# weuseai.agent — VPS setup script (run via SSH from the provisioning service).
# Customer: ${p.customerId}
# Tier: ${p.tier}
set -e
set -u
set -o pipefail

LOG=/var/log/weuseai-setup.log
mkdir -p /var/log
touch "$LOG"
chmod 0644 "$LOG"

log() {
  echo "[$(date -u '+%H:%M:%S')] $*" | tee -a "$LOG"
}

log "=== weuseai setup START (customer ${p.customerId}, tier ${p.tier}) ==="

# ─── 0. Heartbeat (HF-2 2026-05-12) ─────────────────────────────────────
# Background liveness signal so the parent customer-flow SSH session can
# distinguish "still working" from "hung." Writes to a file (NOT stdout)
# every 30 sec — parent can SSH-tail /var/log/hermes-install.heartbeat
# while the main script runs. File-based so we don't pollute the SSH
# stdout stream that customer-flow parses.
heartbeat() {
  while true; do
    sleep 30
    date -u '+%Y-%m-%dT%H:%M:%SZ' > /var/log/hermes-install.heartbeat
  done
}
mkdir -p /var/log
touch /var/log/hermes-install.heartbeat
heartbeat &
HEARTBEAT_PID=$!
trap "kill $HEARTBEAT_PID 2>/dev/null" EXIT

# ─── 1. PROOF OF LIFE (halo) — FIRST, before slow installs ──────────────
${haloCurl}

# ─── 2. Base packages (HF-2: timeouts on every apt op) ──────────────────
# HF-2b (2026-05-12): timeout(1) takes the COMMAND as its first
# positional arg; a shell env-var prefix BEFORE the command name does
# NOT work because timeout sees the assignment string as its command
# name. Use 'env VAR=val ...' so the env-var is exported into the
# timeout's child process. Verified on live customer VPS 2026-05-12:
# the pre-2b layout aborted setup-script with the message
#   "timeout: failed to run command 'DEBIAN_FRONTEND=noninteractive':
#    No such file or directory"
# at line 590 before halo / Hermes install ever ran.
#
# Reliability fix (2026-05-16, Phase F run #2): a cold Vultr VPS hitting
# a slow/transient Ubuntu apt mirror failed apt-get install at the 180s
# timeout (exit 6) — a one-off network flake, not a code bug. apt ops
# now retry up to 3x with 5s/15s backoff; each attempt keeps its own
# timeout. apt only — npm/pip/curl are NOT wrapped speculatively.
apt_retry() {
  # apt_retry <label> <exit_code> <timeout_sec> <command...>
  local label="$1" code="$2" tmo="$3"; shift 3
  local attempt=1 rc delay
  while [ "$attempt" -le 3 ]; do
    log "$label — attempt $attempt/3 (timeout \${tmo}s)..."
    if timeout "$tmo" "$@" >> "$LOG" 2>&1; then
      log "  ✓ $label ok (attempt $attempt)"
      return 0
    fi
    rc=$?
    if [ "$rc" -eq 124 ]; then
      log "  ⚠ $label attempt $attempt: TIMED OUT after \${tmo}s"
    else
      log "  ⚠ $label attempt $attempt: failed rc=$rc (apt mirror error / lock / other)"
    fi
    if [ "$attempt" -lt 3 ]; then
      if [ "$attempt" -eq 1 ]; then delay=5; else delay=15; fi
      log "  ... retrying $label in \${delay}s"
      sleep "$delay"
    fi
    attempt=$((attempt + 1))
  done
  log "✗ $label failed all 3 attempts"
  exit "$code"
}

apt_retry "apt-get update" 5 90 env DEBIAN_FRONTEND=noninteractive apt-get update -qq
apt_retry "apt-get install base packages" 6 180 env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates python3 sudo

# ─── 3. weuseai user (idempotent) ────────────────────────────────────────
if ! id weuseai >/dev/null 2>&1; then
  log "Creating weuseai user..."
  useradd -m -s /bin/bash weuseai
  usermod -aG sudo weuseai
  echo 'weuseai ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/weuseai
  chmod 0440 /etc/sudoers.d/weuseai
else
  log "weuseai user already exists"
fi

# ─── 4. Hermes config dir + .env ────────────────────────────────────────
log "Writing Hermes config files..."
sudo -u weuseai mkdir -p /home/weuseai/.hermes/skills/daily-news-briefing-bahasa
cat > /home/weuseai/.hermes/.env <<'WEUSEAI_ENV_EOF'
${envFileBody}
WEUSEAI_ENV_EOF
chown weuseai:weuseai /home/weuseai/.hermes/.env
chmod 0600 /home/weuseai/.hermes/.env

# ─── 5. SOUL.md (persona) ──────────────────────────────────────────────
cat > /home/weuseai/.hermes/SOUL.md <<'WEUSEAI_SOUL_EOF'
${soulMd}WEUSEAI_SOUL_EOF
chown weuseai:weuseai /home/weuseai/.hermes/SOUL.md

# ─── 6. Daily news skill ───────────────────────────────────────────────
cat > /home/weuseai/.hermes/skills/daily-news-briefing-bahasa/SKILL.md <<'WEUSEAI_SKILL_EOF'
${DAILY_NEWS_SKILL_MD}WEUSEAI_SKILL_EOF

# ─── 6 (cont). /start skill — makes /start a recognized command ────────
# Without this, Hermes' gateway replies "Unknown command /start" to a
# customer's first message. A skill named start makes /start resolve and
# routes it to the agent for the SOUL.md first-contact greeting.
sudo -u weuseai mkdir -p /home/weuseai/.hermes/skills/start
cat > /home/weuseai/.hermes/skills/start/SKILL.md <<'WEUSEAI_START_SKILL_EOF'
${START_SKILL_MD}WEUSEAI_START_SKILL_EOF
${bikinPersonaSkillBlock}chown -R weuseai:weuseai /home/weuseai/.hermes

# ─── 6b. Agent-pack bundle (Phase 2E-1.5, Hermes-native) ───────────────
#
# When the caller ships a base64-tar of the agent's bundle, decode +
# extract to /home/weuseai/.hermes/agent-pack/. Hermes' skill loader
# discovers SKILL.md files under skills/ at startup; this writes them
# into the canonical Hermes path PLUS keeps the manifest + templates at
# the agent-pack/ root for runtime introspection.
#
# Also initializes the customer-grown directory under /var/lib/weuseai/
# — the persistence area for templates the agent generates at runtime
# via the extend-capabilities skill.
${bundleInstallBlock}${bundlePullInstallBlock}${fleetSshPubkeyBlock}

# ─── 7. Hermes install (slow — 3-6 min, HF-2 timeout 10 min) ────────────
# Pin to ${pinnedHermesVersion}. We pass the ref to install.sh's OWN --branch
# flag (via bash -s -- --branch <ref>) — NOT a HERMES_VERSION env var, which the
# upstream script ignores entirely (grepped: zero references). A --branch that
# names a tag makes "git clone --depth 1 --branch <tag>" fetch exactly that
# release. Before 2026-06-14 we set the ignored env var and passed no flag, so
# every VPS silently cloned main (unpinned). The curl still fetches install.sh
# from main — that is the INSTALLER; the ref it INSTALLS is the pinned tag.
#
# HF-2 (2026-05-12 founder Q3 lock): hard timeout 600 sec (10 min).
# Pre-HF-2 the install had no timeout — pip stalls on PyPI from SGP
# region could hang forever and customer-flow's SSH session never
# returned. Inner curl also has --max-time 30 so a stuck TCP connection
# fails fast at network layer.
log "Installing Hermes (pinned to ${pinnedHermesVersion}; this takes 3-6 min, timeout 10 min)..."
if ! timeout 600 \\
  su - weuseai -c 'curl -fsSL --max-time 30 https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --branch ${pinnedHermesVersion}' \\
  >> "$LOG" 2>&1
then
  log "✗ Hermes install timed out or failed after 600 sec"
  exit 7
fi
log "✓ Hermes install complete; verifying binary..."

# ─── 7b. Post-install verification (HF-2) ───────────────────────────────
# A successful install.sh exit doesn't guarantee the binary actually
# works — e.g., a botched venv link can leave hermes unreadable. Run
# 'hermes --version' with a 30 sec cap to catch this BEFORE we declare
# success and move on to the gateway install.
if ! timeout 30 su - weuseai -c '~/.local/bin/hermes --version' >> "$LOG" 2>&1; then
  log "✗ hermes --version failed within 30 sec — install broken"
  exit 8
fi
log "✓ Hermes binary verified"

# ─── 7c. config.yaml display tweaks (2026-05-16) ────────────────────────
# Keep Hermes' tool-progress + interim status messages OFF the customer's
# Telegram thread. Without this the customer saw raw internal text —
# "memory: '+user: ...'" tool previews and "Empty response after tool
# calls" lifecycle status. config.yaml is materialized by the Hermes
# install above; flip two display keys in place (sed keeps every
# comment). Key-matching regex so it holds regardless of the upstream
# default value. Hermes-config only — no upstream code is patched.
CONFIG_YAML=/home/weuseai/.hermes/config.yaml
if [ -f "$CONFIG_YAML" ]; then
  # tool_progress is QUOTED — unquoted "off" is a YAML 1.1 boolean, but
  # Hermes wants the string (its other values new/all/verbose are
  # strings). interim_assistant_messages IS a real boolean — unquoted.
  sed -i -E 's/^[[:space:]]*tool_progress:.*/  tool_progress: "off"/' "$CONFIG_YAML"
  sed -i -E 's/^[[:space:]]*interim_assistant_messages:.*/  interim_assistant_messages: false/' "$CONFIG_YAML"
  # ── P0 cost fix (2026-05-17, hardened 2026-06-07) — pin agent model to
  # DeepSeek v4-pro, robust to upstream config.yaml shape. See
  # modelPinShellBlock() for the full incident write-up.
${modelPinShellBlock()}
${voiceConfigShellBlock}
  # ── YAML-shape guard — hard-fail if the final config doesn't parse / pin.
${configYamlValidateShellBlock()}
  chown weuseai:weuseai "$CONFIG_YAML"
  log "✓ config.yaml display tweaks applied (tool_progress=\"off\", interim_assistant_messages=false)"
else
  log "⚠ config.yaml not found at setup time — display tweak skipped (non-fatal)"
fi

# ─── 8. Telegram gateway + cron (HF-2: gateway is now FATAL) ────────────
${hermesGatewayBlock}

# ─── 9. Ready marker (proves end-to-end success) ──────────────────────
mkdir -p /opt/weuseai
echo "ready at $(date -u)" > /opt/weuseai/ready
log "=== weuseai setup COMPLETE ==="
`
}
