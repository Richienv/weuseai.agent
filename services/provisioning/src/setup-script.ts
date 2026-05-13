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
}

const DEFAULT_WORKFLOW_EXECUTE_URL =
  'https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/workflow-execute'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
// Phase 2E-3 lock (founder, 2026-05-08): single global default across all
// tiers. Customer can swap via dashboard (Phase 3+). DeepSeek v4-pro at
// ~$0.27/M output is ~1/55th of Claude Sonnet; quality "good enough" for
// 80%+ of agent tasks per Hermes community validation.
const OPENROUTER_DEFAULT_MODEL = 'deepseek/deepseek-v4-pro'

// Phase 2E-3 lock (Q7, founder 2026-05-08): default Hermes version pinned
// to a known-good upstream tag. Override via HERMES_VERSION env at
// provision time. See docs/runbooks/hermes-upgrade-test.md.
const DEFAULT_HERMES_VERSION = 'v0.13.0'

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
  const slug = p.agentSlug ?? 'the-pro'
  // D1 lock (2026-05-12 multi-persona MVP): emit WEUSEAI_AGENT_SLUGS
  // as a CSV of all personas the customer has at their tier. The
  // bundle-pull script loops over this list at every Hermes boot.
  // Falls back to [slug] for back-compat callers that only pass
  // agentSlug (e.g., legacy test fixtures).
  const slugs = p.agentSlugs && p.agentSlugs.length > 0 ? p.agentSlugs : [slug]
  const url = p.workflowExecuteUrl ?? DEFAULT_WORKFLOW_EXECUTE_URL
  return [
    `WEUSEAI_AGENT_SLUG=${slug}`,
    `WEUSEAI_AGENT_SLUGS=${slugs.join(',')}`,
    `WEUSEAI_TIER=${p.tier}`,
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
  // Phase 5-3.c rollout: per-customer HMAC token. Hermes-side proxy
  // callers read this and Authorization: Bearer it on platform callbacks.
  // Skipped when caller hasn't computed (back-compat / pre-rollout).
  const hmacEnvLines = p.hermesInstanceToken
    ? [`HERMES_INSTANCE_TOKEN=${p.hermesInstanceToken}`]
    : []
  const allEnvLines = [
    ...telegramEnvLines,
    ...llmEnvLines(p),
    ...workflowEnvLines(p),
    ...hmacEnvLines,
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

log "Adding daily-news cron (optional, cosmetic)..."
su - weuseai -c '${HERMES} cron add --schedule "0 0 * * *" --prompt "${shSingleQuote(DAILY_NEWS_CRON_PROMPT)}" --deliver telegram' >> "$LOG" 2>&1 || log "⚠ cron add failed (truly optional — daily-news skill still works on demand)"
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

  const pinnedHermesVersion = p.hermesVersion ?? DEFAULT_HERMES_VERSION

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
log "Updating apt (timeout 90 sec)..."
if ! timeout 90 env DEBIAN_FRONTEND=noninteractive apt-get update -qq >> "$LOG" 2>&1; then
  log "✗ apt-get update timed out or failed after 90 sec"
  exit 5
fi
log "Installing base packages (timeout 180 sec)..."
if ! timeout 180 env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates python3 sudo >> "$LOG" 2>&1; then
  log "✗ apt-get install timed out or failed after 180 sec"
  exit 6
fi

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
${bundleInstallBlock}${bundlePullInstallBlock}${fleetSshPubkeyBlock}

# ─── 7. Hermes install (slow — 3-6 min, HF-2 timeout 10 min) ────────────
# Phase 2E-3 Q7 lock: pin to ${pinnedHermesVersion} by default; the install.sh
# script reads the HERMES_VERSION env var if present. When the override
# isn't honoured by upstream, the install pulls main — at the time of
# locking (2026-05-08), main IS v0.13.0+ so the default still gets us
# v0.13.0 features. Override flow: set HERMES_VERSION on the
# provisioning service to test a new tag on the next provisioned VPS.
#
# HF-2 (2026-05-12 founder Q3 lock): hard timeout 600 sec (10 min).
# Pre-HF-2 the install had no timeout — pip stalls on PyPI from SGP
# region could hang forever and customer-flow's SSH session never
# returned. Inner curl also has --max-time 30 so a stuck TCP connection
# fails fast at network layer.
log "Installing Hermes (pinned to ${pinnedHermesVersion}; this takes 3-6 min, timeout 10 min)..."
if ! timeout 600 \\
  su - weuseai -c 'HERMES_VERSION=${pinnedHermesVersion} curl -fsSL --max-time 30 https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | HERMES_VERSION=${pinnedHermesVersion} bash' \\
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

# ─── 8. Telegram gateway + cron (HF-2: gateway is now FATAL) ────────────
${hermesGatewayBlock}

# ─── 9. Ready marker (proves end-to-end success) ──────────────────────
mkdir -p /opt/weuseai
echo "ready at $(date -u)" > /opt/weuseai/ready
log "=== weuseai setup COMPLETE ==="
`
}
