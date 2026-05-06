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
  /**
   * Optional crypt(3) SHA-512 hash for the `weuseai` user's password
   * (e.g. `openssl passwd -6 <plain>`). When set, weuseai becomes
   * password-login-able for SSH support / customer dashboard. Phase 1
   * design will store the plaintext (encrypted) in vps_instances; for
   * now leave undefined unless caller explicitly wants SSH.
   */
  weuseaiPasswdHash?: string
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

  // ── Defensive setup script ──
  //
  // History: 2026-05-04 incident — a complex inline runcmd left a VM in a
  // state where sshd refused connections, with no way to diagnose
  // post-mortem. Defensive design now ships ALL setup logic as a
  // `/usr/local/bin/weuseai-setup.sh` script with these properties:
  //
  //   - `set +e` + step() wrapper → continue past any failure, log per-step
  //   - `exec >> /var/log/setup.log 2>&1` → every byte captured for grep
  //   - sshd guard FIRST → guarantees re-entry path before risky steps
  //   - Telegram halo curl SECOND → proof-of-life signal lands even if
  //     Hermes install hangs/dies for the next 5 minutes
  //   - Hermes install + gateway + cron AFTER halo → best-effort, logged
  //   - Ready marker last
  //
  // Customer-visible Halo text drift (says "Setup beres" before Hermes
  // install completes) is acceptable for Phase 1 — Phase 2 will gate the
  // ready-state message on Hermes /health.
  const HERMES = '/home/weuseai/.local/bin/hermes'
  const telegramJson = hasTelegram
    ? telegramBody(params.telegramAllowedUserIds ?? '', LIVENESS_PING_TEXT)
    : ''
  const setupScriptLines = [
    `#!/bin/bash`,
    `# Generated by buildCloudInit() — do not edit on the VM, changes are lost`,
    `# on next reinstall. All setup steps are best-effort; failures are`,
    `# logged here so SSH-disabled VMs can be diagnosed via VNC console:`,
    `#   sudo cat /var/log/setup.log | grep FAILED`,
    `set +e`,
    `exec >> /var/log/setup.log 2>&1`,
    `echo "=== weuseai-setup.sh starting at $(date -u +%FT%TZ) ==="`,
    ``,
    `step() {`,
    `  local name="$1"`,
    `  shift`,
    `  echo "--- $(date -u +%H:%M:%S) START: $name"`,
    `  if "$@"; then`,
    `    echo "--- $(date -u +%H:%M:%S) OK: $name"`,
    `  else`,
    `    echo "--- $(date -u +%H:%M:%S) FAILED: $name (exit $?)"`,
    `  fi`,
    `}`,
    ``,
    `# 1. SSHd guard FIRST — never lock ourselves out of the VM`,
    `step "ensure-ssh-running" bash -c 'systemctl enable ssh && systemctl restart ssh'`,
    ``,
  ]
  if (hasTelegram) {
    // Halo BEFORE Hermes install: even a 5-min hung install yields a
    // Telegram message proving cloud-init reached runcmd + outbound NAT
    // works + Telegram creds are valid.
    setupScriptLines.push(
      `# 2. Telegram halo — proof of life BEFORE the slow Hermes install`,
      `step "telegram-halo-ping" curl -fsS -X POST \\`,
      `  "https://api.telegram.org/bot${params.telegramBotToken}/sendMessage" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${telegramJson}'`,
      ``,
    )
  }
  setupScriptLines.push(
    `# 3. Hermes install (long-running, 3-6 min)`,
    `step "hermes-install" bash -c "su - weuseai -c 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash'"`,
    ``,
  )
  if (hasTelegram) {
    setupScriptLines.push(
      `# 4-6. Hermes Telegram + cron — best-effort; failures logged`,
      `step "hermes-gateway-setup" bash -c "su - weuseai -c '${HERMES} gateway setup --telegram'"`,
      `step "hermes-gateway-install" bash -c "su - weuseai -c '${HERMES} gateway install'"`,
      `step "hermes-cron-add" bash -c "su - weuseai -c '${HERMES} cron add --schedule \\"0 0 * * *\\" --prompt \\"${shSingleQuote(
        DAILY_NEWS_CRON_PROMPT,
      )}\\" --deliver telegram'"`,
      ``,
    )
  }
  setupScriptLines.push(
    `# 7. Ready marker (always written, even if earlier steps failed)`,
    `mkdir -p /opt/weuseai`,
    `date -u +%FT%TZ > /opt/weuseai/ready`,
    `echo "=== weuseai-setup.sh DONE at $(date -u +%FT%TZ) ==="`,
  )
  const setupScript = setupScriptLines.join('\n')

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
    ``,
    `  - path: /usr/local/bin/weuseai-setup.sh`,
    `    permissions: '0755'`,
    `    owner: root:root`,
    `    content: |`,
    indent(setupScript, 6),
  ].join('\n')

  // Users block — `- default` FIRST preserves the distro/IDCloudHost-default
  // user (e.g. `liren` on IDCloudHost). Without it, cloud-init replaces the
  // default user list and SSH access via the dashboard-managed user breaks.
  // weuseai gets an optional password hash so support can SSH directly when
  // diagnostics are needed.
  const weuseaiPasswdLines = params.weuseaiPasswdHash
    ? [
        `    lock_passwd: false`,
        `    passwd: '${params.weuseaiPasswdHash}'`,
      ]
    : []
  const weuseaiBlock = [
    `  - default`,
    `  - name: weuseai`,
    `    sudo: ALL=(ALL) NOPASSWD:ALL`,
    `    shell: /bin/bash`,
    `    home: /home/weuseai`,
    `    groups: users`,
    ...weuseaiPasswdLines,
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
${weuseaiBlock}

write_files:
${writeFiles}

runcmd:
  - mkdir -p /home/weuseai/.hermes/skills/daily-news-briefing-bahasa
  - chown -R weuseai:weuseai /home/weuseai
  - bash /usr/local/bin/weuseai-setup.sh
`
}
