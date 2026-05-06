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

// ─── persona + skill content (mirrored from old cloud-init.ts) ──────────────

const SOUL_MD = `Lo asisten AI berbahasa Indonesia. Tone: casual lo/gue, ringkas, gak basa-basi.
Tugas utama: kasih briefing harian + bantu user produktif.
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
