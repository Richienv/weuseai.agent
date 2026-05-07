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

export type Tier = 'starter' | 'pro' | 'studio'

export type SetupScriptParams = {
  customerId: string
  tier: Tier
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
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const OPENROUTER_DEFAULT_MODEL = 'deepseek/deepseek-chat'

// ─── persona + skill content ──────────────────────────────────────────────
//
// The Pro persona scaffold — written at first VPS boot so the customer's
// agent has a coherent voice from second 1, even before the Edge Function
// post-onboarding overwrite lands. The post-onboarding write at
// supabase/functions/_shared/complete-onboarding-handler.ts:105 calls
// renderSoulMd() with the customer's real name + expectations and replaces
// this file ~5-7 minutes after VPS spawn.
//
// Source of truth: /agent-packs/the-pro/SOUL.md
// Mirrored byte-for-byte here AND in
// supabase/functions/_shared/soul-md-template.ts (THE_PRO_SCAFFOLD const).
// Drift between the .md and the soul-md-template.ts copy is caught by the
// test in tests/soul-md-template.spec.ts; drift between THIS file and the
// .md is left as a manual review step (provisioning service doesn't have
// runtime fs access to /agent-packs/).
//
// Variables {customer_name}, {first_name}, {user_expectations_verbatim},
// {connected_apps_list} are LEFT UNRESOLVED in this initial write — they
// get filled by the post-onboarding overwrite. Keeping them as literal
// tokens in the first-boot SOUL.md is acceptable because the customer
// won't talk to the agent before onboarding completes anyway (the welcome
// page polls until status=active, then redirects to onboarding).

const SOUL_MD = `# About me

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

const DAILY_NEWS_CRON_PROMPT =
  'Cek 5 berita teratas dari detik.com, kompas.com, cnbcindonesia.com. ' +
  'Ringkas tiap berita 2 kalimat. ' +
  'Format Telegram: judul tebal, ringkasan di bawah. ' +
  'Mulai dengan Selamat pagi WIB greeting.'

const LIVENESS_PING_TEXT =
  'Halo, gue agen lo. Setup beres. Daily briefing aktif jam 7 pagi tiap hari WIB. ' +
  'Coba ketik apa aja buat tes.'

// ─── helpers ────────────────────────────────────────────────────────────────

function llmEnvLines(p: SetupScriptParams): string[] {
  // Phase 2A: ALL tiers route through OpenRouter (single key per customer
  // minted by the provisioning service). Hermes is OpenAI-compatible — we
  // just point it at openrouter.ai/api/v1 and pass the key as OPENAI_API_KEY.
  if (!p.openRouterKey) return []
  return [
    `OPENAI_API_KEY=${p.openRouterKey}`,
    `OPENAI_BASE_URL=${OPENROUTER_BASE_URL}`,
    `OPENAI_MODEL=${OPENROUTER_DEFAULT_MODEL}`,
  ]
}

/** Single-quote escape for embedding in bash -c '…'. */
function shSingleQuote(s: string): string {
  return s.replace(/'/g, `'\\''`)
}

function telegramJson(chatId: string, text: string): string {
  return JSON.stringify({ chat_id: chatId, text })
}

// ─── main builder ───────────────────────────────────────────────────────────

export function buildSetupScript(p: SetupScriptParams): string {
  const hasTelegram = Boolean(p.telegramBotToken)
  const HERMES = '/home/weuseai/.local/bin/hermes'

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
  const allEnvLines = [...telegramEnvLines, ...llmEnvLines(p)]

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
  const hermesGatewayBlock = hasTelegram
    ? `
log "Installing Hermes gateway as system service..."
${HERMES} gateway install --system --run-as-user weuseai >> "$LOG" 2>&1 || log "✗ gateway install failed (non-fatal)"

log "Starting Hermes gateway service..."
${HERMES} gateway start --system >> "$LOG" 2>&1 || log "✗ gateway start failed (non-fatal)"

log "Adding daily-news cron..."
su - weuseai -c '${HERMES} cron add --schedule "0 0 * * *" --prompt "${shSingleQuote(DAILY_NEWS_CRON_PROMPT)}" --deliver telegram' >> "$LOG" 2>&1 || log "✗ cron add failed (non-fatal)"
`
    : ''

  // .env file content (heredoc-safe — no special chars in our values)
  const envFileBody = allEnvLines.join('\n')

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

# ─── 1. PROOF OF LIFE (halo) — FIRST, before slow installs ──────────────
${haloCurl}

# ─── 2. Base packages ─────────────────────────────────────────────────────
log "Updating apt..."
DEBIAN_FRONTEND=noninteractive apt-get update -qq >> "$LOG" 2>&1
log "Installing base packages..."
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates python3 sudo >> "$LOG" 2>&1

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
${SOUL_MD}WEUSEAI_SOUL_EOF
chown weuseai:weuseai /home/weuseai/.hermes/SOUL.md

# ─── 6. Daily news skill ───────────────────────────────────────────────
cat > /home/weuseai/.hermes/skills/daily-news-briefing-bahasa/SKILL.md <<'WEUSEAI_SKILL_EOF'
${DAILY_NEWS_SKILL_MD}WEUSEAI_SKILL_EOF
chown -R weuseai:weuseai /home/weuseai/.hermes

# ─── 7. Hermes install (slow — 3-6 min) ────────────────────────────────
log "Installing Hermes (this takes 3-6 min)..."
su - weuseai -c 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash' >> "$LOG" 2>&1
log "✓ Hermes install complete"

# ─── 8. Telegram gateway + cron (best-effort — || true on each) ──────────
${hermesGatewayBlock}

# ─── 9. Ready marker (proves end-to-end success) ──────────────────────
mkdir -p /opt/weuseai
echo "ready at $(date -u)" > /opt/weuseai/ready
log "=== weuseai setup COMPLETE ==="
`
}
