/**
 * Cloud-init template for customer VPS first boot.
 *
 * Phase 1 spec (2026-05-02):
 *   1. apt update + base packages
 *   2. Install upstream Hermes Agent via NousResearch installer
 *   3. Write ~/.hermes/.env (Telegram + LLM creds, chmod 0600)
 *   4. Write ~/.hermes/SOUL.md — Bahasa lo/gue persona
 *   5. Drop ~/.hermes/skills/daily-news-briefing-bahasa/SKILL.md
 *   6. `hermes gateway setup --telegram` + `hermes gateway install` (systemd)
 *   7. `hermes cron add` for the daily briefing at 7 WIB
 *   8. Liveness ping to Telegram so the customer sees "Halo, gue agen lo..."
 *
 * Telegram-dependent steps (3.telegram-block, 6, 7, 8) are skipped when
 * `telegramBotToken` is absent — the VPS still spawns and Hermes runs;
 * the dashboard surfaces the missing-token state and re-runs the gateway
 * setup once the customer pastes a token. The persona + skill drop happen
 * unconditionally so the agent is fully shaped the moment a channel arrives.
 */

export type Tier = 'starter' | 'pro' | 'studio'

export type CloudInitParams = {
  customerId: string
  telegramBotToken?: string
  telegramAllowedUserIds?: string  // comma-separated chat IDs
  tier: Tier
  llmProxyToken?: string      // Starter only
  llmProxyUrl?: string        // Starter only
  customerLlmApiKey?: string  // Pro/Studio BYOK only
  customerLlmProvider?: 'deepseek' | 'openrouter' | 'openai' | 'glm'
}

// ─── persona + skill content ────────────────────────────────────────────────

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

**Judul berita 2**
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

// ─── env file content ───────────────────────────────────────────────────────

function llmEnvLines(p: CloudInitParams): string[] {
  if (p.tier === 'starter') {
    return [
      `OPENAI_API_BASE=${p.llmProxyUrl ?? ''}`,
      `OPENAI_API_KEY=${p.llmProxyToken ?? ''}`,
      `HERMES_DEFAULT_MODEL=deepseek-chat`,
    ]
  }
  switch (p.customerLlmProvider) {
    case 'deepseek':
      return [`DEEPSEEK_API_KEY=${p.customerLlmApiKey ?? ''}`]
    case 'openrouter':
      return [`OPENROUTER_API_KEY=${p.customerLlmApiKey ?? ''}`]
    case 'openai':
      return [`OPENAI_API_KEY=${p.customerLlmApiKey ?? ''}`]
    case 'glm':
      return [`ZAI_API_KEY=${p.customerLlmApiKey ?? ''}`]
    default:
      return []
  }
}

// ─── shell-escape helpers ───────────────────────────────────────────────────

/** Single-quote escape for embedding in `bash -c '…'`. Needs no $-interp. */
function shSingleQuote(s: string): string {
  return s.replace(/'/g, `'\\''`)
}

/** JSON-safe payload for Telegram API body. */
function telegramBody(chatId: string, text: string): string {
  return JSON.stringify({ chat_id: chatId, text })
}

/** Indent a multi-line block by N spaces, for YAML pipe-content blocks. */
function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.length ? pad + line : line))
    .join('\n')
}

// ─── main builder ───────────────────────────────────────────────────────────

export function buildCloudInit(params: CloudInitParams): string {
  const hasTelegram = Boolean(params.telegramBotToken)

  // ── env file lines ──
  const telegramEnvLines = hasTelegram
    ? [
        `TELEGRAM_BOT_TOKEN=${params.telegramBotToken}`,
        `TELEGRAM_ALLOWED_USERS=${params.telegramAllowedUserIds ?? ''}`,
        `TELEGRAM_REACTIONS=true`,
      ]
    : []
  const envLines = [...telegramEnvLines, ...llmEnvLines(params)]
  const envBlock = indent(envLines.join('\n'), 6)

  // ── Telegram-dependent runcmd entries ──
  // hermes gateway commands run as the `weuseai` user. `gateway setup
  // --telegram` reads the env file we wrote (TELEGRAM_BOT_TOKEN +
  // TELEGRAM_ALLOWED_USERS), and `gateway install` writes its own systemd
  // unit (we don't ship a custom one — Hermes manages its own service).
  const telegramRuncmd = hasTelegram
    ? [
        `  - su - weuseai -c 'hermes gateway setup --telegram'`,
        `  - su - weuseai -c 'hermes gateway install'`,
        `  - su - weuseai -c 'hermes cron add --schedule "0 0 * * *" --prompt "${shSingleQuote(
          DAILY_NEWS_CRON_PROMPT,
        )}" --deliver telegram'`,
        `  - sleep 8`,
        `  - >`,
        `    curl -fsS -X POST`,
        `    "https://api.telegram.org/bot${params.telegramBotToken}/sendMessage"`,
        `    -H "Content-Type: application/json"`,
        `    -d '${telegramBody(
          params.telegramAllowedUserIds ?? '',
          LIVENESS_PING_TEXT,
        )}'`,
      ]
    : []

  // ── write_files entries ──
  const writeFiles = [
    `  - path: /home/weuseai/.hermes/.env`,
    `    permissions: '0600'`,
    `    owner: weuseai:weuseai`,
    `    content: |`,
    envBlock,
    ``,
    `  - path: /home/weuseai/.hermes/SOUL.md`,
    `    permissions: '0644'`,
    `    owner: weuseai:weuseai`,
    `    content: |`,
    indent(SOUL_MD, 6),
    ``,
    `  - path: /home/weuseai/.hermes/skills/daily-news-briefing-bahasa/SKILL.md`,
    `    permissions: '0644'`,
    `    owner: weuseai:weuseai`,
    `    content: |`,
    indent(DAILY_NEWS_SKILL_MD, 6),
  ].join('\n')

  return `#cloud-config
package_update: true
package_upgrade: false
packages:
  - curl
  - ca-certificates
  - python3
  - sudo

users:
  - name: weuseai
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    home: /home/weuseai
    groups: users

write_files:
${writeFiles}

runcmd:
  - mkdir -p /home/weuseai/.hermes/skills/daily-news-briefing-bahasa
  - chown -R weuseai:weuseai /home/weuseai
  - su - weuseai -c 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash'
${telegramRuncmd.join('\n')}
  - mkdir -p /opt/weuseai
  - echo "ready" > /opt/weuseai/ready
`
}
