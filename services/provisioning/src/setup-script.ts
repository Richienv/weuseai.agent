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
  /**
   * Phase 2E-1.5 (Hermes-native bundle): which agent persona this VPS
   * runs. Defaults to 'the-pro' if absent (matches Phase 2C-1 default
   * persona). The bundle for this slug ships as `bundleTarBase64`.
   */
  agentSlug?: string
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
}

const DEFAULT_WORKFLOW_EXECUTE_URL =
  'https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/workflow-execute'

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

function workflowEnvLines(p: SetupScriptParams): string[] {
  // Phase 2E-1.5: agent bundle env. Hermes skills read these to know
  // which bundle is theirs + where to POST workflow-execute calls.
  // Skipped when no bundle is shipped (back-compat with Phase 1/2A).
  if (!p.bundleTarBase64) return []
  const slug = p.agentSlug ?? 'the-pro'
  const url = p.workflowExecuteUrl ?? DEFAULT_WORKFLOW_EXECUTE_URL
  return [
    `WEUSEAI_AGENT_SLUG=${slug}`,
    `WEUSEAI_CUSTOMER_ID=${p.customerId}`,
    `WEUSEAI_WORKFLOW_EXECUTE_URL=${url}`,
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
  const allEnvLines = [
    ...telegramEnvLines,
    ...llmEnvLines(p),
    ...workflowEnvLines(p),
  ]

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
mkdir -p /etc/systemd/system/hermes-gateway.service.d
cat > /etc/systemd/system/hermes-gateway.service.d/10-bundle-pull.conf <<'WEUSEAI_DROPIN_EOF'
[Service]
ExecStartPre=/usr/local/bin/weuseai-bundle-pull
WEUSEAI_DROPIN_EOF
log "✓ bundle-pull installed"
`
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
${bundleInstallBlock}${bundlePullInstallBlock}

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
