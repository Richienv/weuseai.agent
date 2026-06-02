/**
 * buildSetupScript() — pure function, takes customer config, returns the
 * bash script to run on the VPS over SSH. Same content as the old cloud-init
 * runcmd block, but now self-contained shell with explicit error handling
 * and a logfile per step.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSetupScript } from '../services/provisioning/src/setup-script.ts'

const baseParams = {
  customerId: '4d644821-f6a5-46ba-a410-e1d31184e7eb',
  tier: 'pro' as const,
  telegramBotToken: '8630424948:AAGmM1ND-test',
  telegramAllowedUserIds: '6805409051',
  customerLlmApiKey: 'sk-deepseek-EXAMPLE',
  customerLlmProvider: 'deepseek' as const,
}

test('script: starts with set -e and logs to /var/log/weuseai-setup.log', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /^#!\/bin\/bash/m, 'shebang')
  assert.match(s, /set -[a-z]*e/, 'errexit set')
  assert.match(s, /\/var\/log\/weuseai-setup\.log/, 'logfile path present')
})

test('script: sends halo curl FIRST (proof of life before Hermes install)', () => {
  // Per founder direction 2026-05-04: halo lands within seconds of SSH
  // connect, BEFORE the slow Hermes install. Customer sees life immediately.
  const s = buildSetupScript(baseParams)
  const haloIdx = s.indexOf('api.telegram.org')
  const installIdx = s.indexOf('install.sh')
  assert.ok(haloIdx > 0, 'halo curl present')
  assert.ok(installIdx > 0, 'hermes install present')
  assert.ok(haloIdx < installIdx, `halo (idx=${haloIdx}) must come before install (idx=${installIdx})`)
})

test('script: halo text matches Phase 1 spec', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /Halo, gue agen lo/, 'liveness greeting')
  assert.match(s, /Setup beres/, 'completion phrasing')
  assert.match(s, /jam 7 pagi tiap hari WIB/, 'briefing schedule')
})

test('script: halo curl substitutes bot token + chat id', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /bot8630424948:AAGmM1ND-test\/sendMessage/, 'bot token in URL')
  assert.match(s, /"chat_id":"6805409051"/, 'chat id in JSON body')
})

test('script: apt installs curl + ca-certificates + python3', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /apt-get update/, 'apt update')
  assert.match(s, /apt-get install -y[^\n]*\bcurl\b/, 'curl installed')
  assert.match(s, /apt-get install -y[^\n]*\bca-certificates\b/, 'CA certs')
  assert.match(s, /apt-get install -y[^\n]*\bpython3\b/, 'python3')
})

test('script: creates weuseai user with sudo + home dir', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /useradd -m -s \/bin\/bash weuseai/, 'create user with home + bash')
  assert.match(s, /usermod -aG sudo weuseai|sudo group/, 'sudo group access')
})

test('script: writes /home/weuseai/.hermes/.env (chmod 0600) with creds', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /\/home\/weuseai\/\.hermes\/\.env/, '.env path')
  assert.match(s, /TELEGRAM_BOT_TOKEN=8630424948:AAGmM1ND-test/, 'bot token written')
  assert.match(s, /TELEGRAM_ALLOWED_USERS=6805409051/, 'allowed users')
  assert.match(s, /chmod (?:0)?600 \/home\/weuseai\/\.hermes\/\.env/, '.env locked down')
})

test('script: writes SOUL.md with The Pro persona (post-2C-1 default)', () => {
  // Phase 2C-1 replaced the lo/gue 2-liner with The Pro scaffold. This
  // test was previously asserting the old lo/gue text — updated 2026-05-08
  // (during Phase 2E-2 staging) to match the current default persona.
  const s = buildSetupScript(baseParams)
  assert.match(s, /\/home\/weuseai\/\.hermes\/SOUL\.md/, 'SOUL.md path')
  // The Pro signature line — distinct from any other persona scaffold.
  assert.match(s, /I am The Pro, a specialist agent built for/, 'The Pro identity')
  assert.match(s, /pendamping kerja harian/, 'specialty marker')
  assert.match(s, /calm, observasional, dan anticipatory/, 'tone signature')
  // Defensive: confirm we DON'T accidentally regress to the lo/gue scaffold.
  assert.doesNotMatch(s, /Lo asisten AI berbahasa Indonesia/, 'no lo/gue regression')
  assert.doesNotMatch(s, /casual lo\/gue/, 'no lo/gue tone')
})

test('script: writes daily-news skill SKILL.md', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /\/home\/weuseai\/\.hermes\/skills\/daily-news-briefing-bahasa\/SKILL\.md/, 'skill path')
  assert.match(s, /detik\.com/, 'detik source')
  assert.match(s, /kompas\.com/, 'kompas source')
  assert.match(s, /cnbcindonesia\.com/, 'cnbc source')
  assert.match(s, /Selamat pagi/, 'greeting')
})

test('script: runs Hermes install.sh as weuseai (pinned via HERMES_VERSION env)', () => {
  const s = buildSetupScript(baseParams)
  // Phase 2E-3: install.sh is invoked under `su - weuseai -c ...` with
  // HERMES_VERSION env-prefixed on BOTH curl and bash so upstream picks
  // up the pin if the install.sh script honours it. The default lock is
  // v0.13.0 (founder Q7).
  //
  // HF-2 (2026-05-12 founder Q3 lock): the install.sh invocation is
  // now wrapped in `timeout 600` + the inner curl has --max-time 30.
  // Regex allows both pre- and post-HF-2 layouts; the HF-2-specific
  // hardening is pinned by tests/setup-script-hang-hardening.spec.ts.
  assert.match(
    s,
    /su - weuseai -c ['"]HERMES_VERSION=v0\.13\.0 curl -fsSL (?:--max-time \d+ )?https:\/\/raw\.githubusercontent\.com\/NousResearch\/hermes-agent\/main\/scripts\/install\.sh \| HERMES_VERSION=v0\.13\.0 bash/,
    'install.sh pinned via HERMES_VERSION env',
  )
})

test('script: gateway install + start fail FATAL (HF-2 — was best-effort pre-2026-05-12)', () => {
  const s = buildSetupScript(baseParams)
  // HF-2 (2026-05-12 founder lock): gateway install/start failures are
  // FATAL. Pre-HF-2 they were tagged `|| log "(non-fatal)"` which
  // masked real failures + left customer VPSes marked running with a
  // bot that would never reply. Affirmative check: each command is
  // followed by an explicit `if ! ... ; then ... exit N` block.
  //
  // Cron remains best-effort (cosmetic; daily-news skill works on demand).
  const gatewayInstallLine = s
    .split('\n')
    .find((l) => l.match(/hermes gateway install --system/))
  assert.ok(gatewayInstallLine, 'gateway install line must be present')
  assert.match(
    gatewayInstallLine!,
    /^if ! .*gateway install/,
    `gateway install must be inside an "if ! ... ; then exit" block (HF-2 fatal): ${gatewayInstallLine!.trim()}`,
  )
  const gatewayStartLine = s
    .split('\n')
    .find((l) => l.match(/hermes gateway start --system/))
  assert.ok(gatewayStartLine, 'gateway start line must be present')
  assert.match(
    gatewayStartLine!,
    /^if ! .*gateway start/,
    `gateway start must be inside an "if ! ... ; then exit" block (HF-2 fatal): ${gatewayStartLine!.trim()}`,
  )
  // Cron stays optional (cosmetic).
  const cronLine = s.split('\n').find((l) => l.match(/hermes cron add/))
  assert.ok(cronLine, 'cron add line must be present')
  assert.match(cronLine!, /\|\| log/, 'cron add stays best-effort')
})

test('script: gateway install uses --system --run-as-user (not user-level service)', () => {
  // Day 4b regression guard. User-level systemd units (default of
  // `hermes gateway install` without flags) don't auto-start at boot
  // and don't have `Restart=always` system-wide. We need a real
  // /etc/systemd/system/hermes-gateway.service unit for production —
  // hence --system + --run-as-user weuseai.
  const s = buildSetupScript(baseParams)
  assert.match(
    s,
    /hermes\s+gateway\s+install\s+--system\s+--run-as-user\s+weuseai/,
    'gateway install must use --system --run-as-user',
  )
})

test('script: gateway start --system runs after install (otherwise unit sits dead)', () => {
  // Day 4b regression guard. Upstream hermes CLI design: `gateway install`
  // ONLY installs the unit. Without a follow-up `gateway start --system`,
  // the unit ends up enabled-but-inactive and the bot never polls Telegram.
  // The CLI's own "Next steps" output says: sudo hermes gateway start --system.
  const s = buildSetupScript(baseParams)
  assert.match(
    s,
    /hermes\s+gateway\s+start\s+--system/,
    'gateway start --system must be present after install',
  )
  // Order check: start must come after install, not before.
  const installIdx = s.search(/hermes\s+gateway\s+install/)
  const startIdx = s.search(/hermes\s+gateway\s+start/)
  assert.ok(installIdx >= 0, 'install line found')
  assert.ok(startIdx >= 0, 'start line found')
  assert.ok(startIdx > installIdx, 'start must come after install')
})

test('script: omits invalid `gateway setup --telegram` (Day 4b: not a real flag)', () => {
  // Phase 2A regression: previous version called
  //   hermes gateway setup --telegram
  // which Hermes rejects with "unrecognized arguments: --telegram".
  // The error was swallowed by `|| log` so it looked like the script
  // worked. Removed in 2026-05-06 patch — the bot token is read from
  // .env automatically by the gateway runtime.
  const s = buildSetupScript(baseParams)
  assert.equal(
    /gateway\s+setup\s+--telegram/.test(s),
    false,
    'must not call invalid `gateway setup --telegram`',
  )
})

test('script: writes /opt/weuseai/ready as final step (success marker)', () => {
  const s = buildSetupScript(baseParams)
  assert.match(s, /\/opt\/weuseai\/ready/, 'ready marker')
  // Must be at/near the end — find its position vs install
  const readyIdx = s.lastIndexOf('/opt/weuseai/ready')
  const installIdx = s.indexOf('install.sh')
  assert.ok(readyIdx > installIdx, 'ready marker comes after Hermes install')
})

test('script: uses OpenRouter env for ALL tiers (Phase 2A — single key per customer)', () => {
  const s = buildSetupScript({
    ...baseParams,
    openRouterKey: 'sk-or-v1-customer-key',
  })
  assert.match(s, /OPENAI_API_KEY=sk-or-v1-customer-key/, 'OpenRouter key as OPENAI_API_KEY (Hermes is OpenAI-compatible)')
  assert.match(s, /OPENAI_BASE_URL=https:\/\/openrouter\.ai\/api\/v1/, 'OpenRouter base URL')
  // Phase 2E-3 lock (founder, 2026-05-08): single global default
  // deepseek/deepseek-v4-pro across all tiers. Replaces deepseek-chat.
  assert.match(s, /OPENAI_MODEL=deepseek\/deepseek-v4-pro/, 'default model = deepseek-v4-pro')
})

test('script: NO DeepSeek-direct or proxy-token env (Phase 2A removes both)', () => {
  const s = buildSetupScript({ ...baseParams, openRouterKey: 'sk-or-v1-x' })
  assert.doesNotMatch(s, /DEEPSEEK_API_KEY=/, 'no DeepSeek-direct key')
  assert.doesNotMatch(s, /OPENAI_API_BASE=https:\/\/proxy/, 'no proxy URL')
  assert.doesNotMatch(s, /HERMES_DEFAULT_MODEL=/, 'no Hermes-specific model env (use OPENAI_MODEL)')
})

test('script: omits LLM env block entirely when openRouterKey absent', () => {
  // Edge case — Phase 1 customers without Phase 2A applied yet, OR a
  // re-run on a VM that already has its key written. The setup script
  // should still be runnable; downstream config writes wouldn't include
  // LLM env, customer pastes via dashboard later.
  const s = buildSetupScript({ ...baseParams, openRouterKey: undefined })
  assert.doesNotMatch(s, /OPENAI_API_KEY=/, 'no OPENAI_API_KEY when no key provided')
})

test('script: omits Telegram block when bot token absent', () => {
  const s = buildSetupScript({ ...baseParams, telegramBotToken: undefined })
  assert.doesNotMatch(s, /TELEGRAM_BOT_TOKEN=/, 'no bot token line')
  assert.doesNotMatch(s, /api\.telegram\.org/, 'no halo curl')
  // But persona + install still run:
  assert.match(s, /SOUL\.md/, 'persona still written')
  assert.match(s, /install\.sh/, 'install still runs')
})

// ─── Phase 2E-2: bundle delivery + bundle-pull integration ────────────

// Tiny valid gzip with no actual content (just the magic header + empty
// deflate). Sufficient for setup-script.spec to test the bundle-install
// shell BLOCK shape without a real tarball.
const FAKE_BUNDLE_BASE64 = 'H4sIAAAAAAAAAwMAAAAAAAAAAAA='

test('script (2E-2): includes bundle install block when bundleTarBase64 supplied', () => {
  const s = buildSetupScript({
    ...baseParams,
    bundleTarBase64: FAKE_BUNDLE_BASE64,
    agentSlug: 'doc-expert',
  })
  assert.match(s, /Installing agent-pack bundle \(doc-expert\)/)
  assert.match(s, /base64 -d \| tar -xz -C \/home\/weuseai\/\.hermes\/agent-pack/)
})

test('script (2E-2): customer-grown directory initialized at provision', () => {
  const s = buildSetupScript({
    ...baseParams,
    bundleTarBase64: FAKE_BUNDLE_BASE64,
    agentSlug: 'doc-expert',
  })
  assert.match(s, /mkdir -p \/var\/lib\/weuseai\/customer-grown\/templates \/var\/lib\/weuseai\/customer-grown\/skills/)
  assert.match(s, /touch \/var\/lib\/weuseai\/customer-grown\/extension-log\.jsonl/)
  assert.match(s, /chown -R weuseai:weuseai \/var\/lib\/weuseai/)
})

test('script (2E-2): installs /usr/local/bin/weuseai-bundle-pull', () => {
  const s = buildSetupScript({
    ...baseParams,
    bundleTarBase64: FAKE_BUNDLE_BASE64,
    agentSlug: 'doc-expert',
  })
  assert.match(s, /\/usr\/local\/bin\/weuseai-bundle-pull/)
  assert.match(s, /chmod 0755 \/usr\/local\/bin\/weuseai-bundle-pull/)
})

test('script (2E-2): writes systemd drop-in for ExecStartPre', () => {
  const s = buildSetupScript({
    ...baseParams,
    bundleTarBase64: FAKE_BUNDLE_BASE64,
    agentSlug: 'doc-expert',
  })
  assert.match(s, /\/etc\/systemd\/system\/hermes-gateway\.service\.d\/10-bundle-pull\.conf/)
  // The `+` prefix is REQUIRED — without it the script inherits User=
  // weuseai and silently fails on every privileged op (write to /var/log,
  // chown -R, etc.). Diagnosed 2026-05-08 across 4 live VPS runs. Don't
  // regress this without re-running the full live VPS smoke. See
  // services/provisioning/src/setup-script.ts comment block at the
  // drop-in write for the full failure-mode walkthrough.
  assert.match(s, /ExecStartPre=\+\/usr\/local\/bin\/weuseai-bundle-pull/)
})

test('script (2E-2): writes WEUSEAI_AGENT_SLUG + WEUSEAI_CUSTOMER_ID + WEUSEAI_WORKFLOW_EXECUTE_URL to .env', () => {
  const s = buildSetupScript({
    ...baseParams,
    bundleTarBase64: FAKE_BUNDLE_BASE64,
    agentSlug: 'doc-expert',
  })
  assert.match(s, /WEUSEAI_AGENT_SLUG=doc-expert/)
  assert.match(s, new RegExp(`WEUSEAI_CUSTOMER_ID=${baseParams.customerId}`))
  assert.match(s, /WEUSEAI_WORKFLOW_EXECUTE_URL=https:\/\/gtjgsligllbjcisiyrah/)
})

test('script (Week 2): writes WEUSEAI_FLOW_STATE_URL pointing at the flow-state fn', () => {
  const s = buildSetupScript({
    ...baseParams,
    bundleTarBase64: FAKE_BUNDLE_BASE64,
    agentSlug: 'deep-researcher',
  })
  // Derived from the workflow-execute URL → same functions base, /flow-state.
  assert.match(
    s,
    /WEUSEAI_FLOW_STATE_URL=https:\/\/gtjgsligllbjcisiyrah\.supabase\.co\/functions\/v1\/flow-state/,
  )
})

test('script (Week 2): flow-state URL tracks a workflowExecuteUrl override', () => {
  const s = buildSetupScript({
    ...baseParams,
    bundleTarBase64: FAKE_BUNDLE_BASE64,
    workflowExecuteUrl: 'https://staging.example.co/functions/v1/workflow-execute',
  })
  assert.match(
    s,
    /WEUSEAI_FLOW_STATE_URL=https:\/\/staging\.example\.co\/functions\/v1\/flow-state/,
  )
})

test('script (2E-2): defaults agentSlug to "the-pro" when unspecified', () => {
  const s = buildSetupScript({
    ...baseParams,
    bundleTarBase64: FAKE_BUNDLE_BASE64,
    // No agentSlug — defaults to 'the-pro'
  })
  assert.match(s, /WEUSEAI_AGENT_SLUG=the-pro/)
  assert.match(s, /Installing agent-pack bundle \(the-pro\)/)
})

test('script (2E-2): omits ALL bundle delivery blocks when bundleTarBase64 absent (back-compat)', () => {
  const s = buildSetupScript(baseParams)  // no bundleTarBase64
  assert.doesNotMatch(s, /Installing agent-pack bundle/)
  assert.doesNotMatch(s, /weuseai-bundle-pull/)
  assert.doesNotMatch(s, /\/etc\/systemd\/system\/hermes-gateway\.service\.d/)
  assert.doesNotMatch(s, /WEUSEAI_AGENT_SLUG=/)
  // But Phase 1/2A baseline (DAILY_NEWS_SKILL_MD + SOUL.md) still ships:
  assert.match(s, /SOUL\.md/)
  assert.match(s, /daily-news-briefing-bahasa\/SKILL\.md/)
  // Friendly log line confirms back-compat path
  assert.match(s, /No agent-pack bundle supplied/)
})

test('script (2E-2): embedded bundle-pull script is decodable + structurally valid', () => {
  const s = buildSetupScript({
    ...baseParams,
    bundleTarBase64: FAKE_BUNDLE_BASE64,
    agentSlug: 'doc-expert',
  })
  // Find the base64 line that becomes /usr/local/bin/weuseai-bundle-pull
  const m = /echo '([A-Za-z0-9+/=]+)' \| base64 -d > \/usr\/local\/bin\/weuseai-bundle-pull/.exec(s)
  assert.ok(m, 'expected base64 line for bundle-pull script')
  const decoded = Buffer.from(m![1], 'base64').toString('utf8')
  // Structural markers from the bundle-pull-script generator
  assert.match(decoded, /^#!\/bin\/bash/)
  assert.match(decoded, /bundle-fetch/)
  assert.match(decoded, /enabled_for_tiers/)
  assert.match(decoded, /\/var\/lib\/weuseai\/bundle/)
})

test('script (2E-2): Telegram still wires correctly with bundle present', () => {
  const s = buildSetupScript({
    ...baseParams,
    bundleTarBase64: FAKE_BUNDLE_BASE64,
    agentSlug: 'doc-expert',
    telegramBotToken: '12345:abc',
    telegramAllowedUserIds: '6805409051',
  })
  // Bundle install + Telegram halo + gateway all present in same script
  assert.match(s, /Installing agent-pack bundle/)
  assert.match(s, /api\.telegram\.org\/bot12345:abc\/sendMessage/)
  assert.match(s, /gateway install --system --run-as-user weuseai/)
})

// ─── Phase 2E-3 ──────────────────────────────────────────────────────────

test('script (2E-3): pins Hermes to v0.13.0 by default', () => {
  const s = buildSetupScript({ ...baseParams })
  // Both env-prefix forms present (belt + suspenders for upstream
  // honour — see comment block in setup-script.ts at the install step).
  assert.match(s, /HERMES_VERSION=v0\.13\.0 curl/)
  assert.match(s, /HERMES_VERSION=v0\.13\.0 bash/)
  assert.match(s, /pinned to v0\.13\.0/)
})

test('script (2E-3): hermesVersion override propagates to install command', () => {
  const s = buildSetupScript({ ...baseParams, hermesVersion: 'v0.14.0' })
  assert.match(s, /HERMES_VERSION=v0\.14\.0 curl/)
  assert.match(s, /HERMES_VERSION=v0\.14\.0 bash/)
  assert.doesNotMatch(s, /HERMES_VERSION=v0\.13\.0/)
})

test('script (2E-3): installs fleet SSH pubkey when provided (idempotency-guarded)', () => {
  const fakePubkey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI fake-fleet-key weuseai-fleet'
  const s = buildSetupScript({
    ...baseParams,
    fleetSshPubkey: fakePubkey,
  })
  // The pubkey appears verbatim, JSON-quoted (heredoc-safe).
  assert.match(s, new RegExp(`FLEET_KEY=.*${fakePubkey.split(' ')[1]}`))
  // The grep idempotency guard is present.
  assert.match(s, /grep -qF.*authorized_keys/)
  // The append uses tee -a (not >, which would clobber).
  assert.match(s, /tee -a \/home\/weuseai\/\.ssh\/authorized_keys/)
  // Mode 0600 + 0700 set on .ssh + authorized_keys.
  assert.match(s, /chmod 0700 \/home\/weuseai\/\.ssh/)
  assert.match(s, /chmod 0600 \/home\/weuseai\/\.ssh\/authorized_keys/)
})

test('script (2E-3): omits fleet pubkey block entirely when not supplied (back-compat)', () => {
  const s = buildSetupScript({ ...baseParams })
  assert.doesNotMatch(s, /authorized_keys/)
  assert.doesNotMatch(s, /Fleet SSH pubkey/)
})

test('script (2E-3): JSON-stringifies the pubkey to handle special chars safely', () => {
  // Pubkeys can contain quotes/backslashes if someone misformats them.
  // JSON.stringify protects the bash heredoc from quote-injection.
  const oddKey = 'ssh-rsa AAAA"weird\'comment with $vars and "quotes"'
  const s = buildSetupScript({ ...baseParams, fleetSshPubkey: oddKey })
  // Should appear as a JSON-stringified literal — double quotes inside
  // the value get backslash-escaped; single quotes don't (per JSON spec).
  // Also confirm the raw literal '$vars' is preserved (not shell-expanded).
  assert.match(s, /FLEET_KEY="ssh-rsa AAAA\\"weird'comment with \$vars and \\"quotes\\""/)
})

// ─── P0 cost fix (2026-05-17): customer agents run DeepSeek, not Opus ──
//
// A fresh non-interactive Hermes install left config.yaml's model key
// empty; the agent resolved to Claude Opus 4.6 via OpenRouter and burned
// a customer's $5 sub-key cap to 41% in 3 hours. The setup-script must
// pin BOTH the .env OPENAI_MODEL and the config.yaml top-level model key
// to DeepSeek v4-pro — and must never wire a premium (Claude/Opus) model.

test('P0: setup-script pins .env OPENAI_MODEL to deepseek/deepseek-v4-pro', () => {
  // The .env OpenRouter block only emits when an openRouterKey is passed
  // (the production path — Phase 2A mints one per customer).
  const s = buildSetupScript({ ...baseParams, openRouterKey: 'sk-or-v1-EXAMPLE' })
  assert.match(
    s,
    /OPENAI_MODEL=deepseek\/deepseek-v4-pro/,
    '.env must set OPENAI_MODEL to deepseek/deepseek-v4-pro',
  )
})

test('P0: setup-script pins config.yaml model: to deepseek/deepseek-v4-pro', () => {
  const s = buildSetupScript(baseParams)
  // The config.yaml top-level model key is authoritative for the main
  // agent — the .env var alone is not enough (that was the Opus bug).
  assert.match(
    s,
    /model: deepseek\/deepseek-v4-pro/,
    'setup-script must pin config.yaml model: to deepseek/deepseek-v4-pro',
  )
})

test('P0: setup-script never wires a premium Claude/Opus model', () => {
  const s = buildSetupScript(baseParams)
  assert.equal(
    /claude-opus|claude-sonnet|anthropic\/claude/i.test(s),
    false,
    'customer agents must never be configured with a premium Claude/Opus model',
  )
})

// ─── Phase B (voice-input STT, 2026-06-02): native Hermes voice config ──
//
// We enable Hermes' OWN voice-memo transcription via provisioning config
// (no external STT middleware, no Hermes fork). The voice/stt config is
// written to config.yaml + the STT key to .env, STRICTLY gated on the
// tier's features.voice (resolved via TIERS[resolveTier(tier)]). Default
// provider is Groq (sidesteps the OpenRouter-vs-OpenAI key trap).
//
// Tier note: baseParams.tier is 'pro' (deprecated alias) → resolveTier
// maps it to 'done-for-you', which grants voice. All four current tiers
// grant voice; the gate is real-coded so a FUTURE text-only tier
// (features.voice === false) gets nothing.

test('voice (Phase B): writes GROQ_API_KEY to .env when tier grants voice + key supplied', () => {
  const s = buildSetupScript({ ...baseParams, voiceSttKey: 'gsk_test_EXAMPLE' })
  // Default provider is Groq → key lands under GROQ_API_KEY (NOT the
  // OPENAI_API_KEY chat var, which holds the OpenRouter sub-key).
  assert.match(s, /GROQ_API_KEY=gsk_test_EXAMPLE/, 'Groq STT key written to .env')
  assert.match(s, /STT_GROQ_MODEL=whisper-large-v3-turbo/, 'Groq model pinned')
  assert.match(s, /GROQ_BASE_URL=https:\/\/api\.groq\.com\/openai\/v1/, 'Groq base URL pinned')
})

test('voice (Phase B): appends voice/stt block to config.yaml (input-only, TTS off)', () => {
  const s = buildSetupScript({ ...baseParams, voiceSttKey: 'gsk_test_EXAMPLE' })
  assert.match(s, /^stt:$/m, 'stt: top-level key in config block')
  assert.match(s, /enabled: true/, 'stt enabled')
  assert.match(s, /provider: "groq"/, 'provider selected')
  assert.match(s, /model: "whisper-large-v3-turbo"/, 'provider model set')
  // Input-only: TTS stays OFF so the bot replies in TEXT.
  assert.match(s, /auto_tts: false/, 'auto_tts off — input-only, no voice replies')
  // Guarded append (no duplicate stacking on re-provision).
  assert.match(s, /if ! grep -qE '\^stt:' "\$CONFIG_YAML"; then/, 'idempotency guard present')
})

test('voice (Phase B): never activates TTS / never speaks back (input-only)', () => {
  const s = buildSetupScript({ ...baseParams, voiceSttKey: 'gsk_test_EXAMPLE' })
  // No TTS provider activation, no ELEVENLABS key.
  assert.doesNotMatch(s, /ELEVENLABS_API_KEY=/, 'no TTS key wired')
  assert.doesNotMatch(s, /tts:\n\s+provider:/, 'no active tts provider block')
  // The setup-script never AUTO-SENDS a /voice command (that would need to
  // ride a Telegram sendMessage curl). A `/voice …` token in an explanatory
  // comment is fine; what must not exist is a `/voice tts` being pushed to
  // the chat. Assert no sendMessage body carries a /voice command.
  assert.doesNotMatch(
    s,
    /sendMessage[^\n]*\/voice/,
    'setup-script must not auto-send a /voice command via Telegram',
  )
  // And TTS-for-all (/voice tts) must never appear as an instruction the
  // script would execute (it only appears, if at all, inside a # comment).
  for (const line of s.split('\n')) {
    if (/\/voice (on|tts)/.test(line)) {
      assert.match(line.trimStart(), /^#/, `any /voice mention must be a comment, got: ${line}`)
    }
  }
})

test('voice (Phase B): writes config block even WITHOUT a key (STT activates on later key set)', () => {
  // Consult-accepted: ship config anyway, text fallback active if key
  // missing. The config block lands so STT works the moment a key arrives
  // via refresh-env; only the key env LINE is omitted.
  const s = buildSetupScript({ ...baseParams, voiceSttKey: undefined })
  assert.match(s, /^stt:$/m, 'config block still written without a key')
  assert.match(s, /provider: "groq"/, 'provider still selected')
  assert.doesNotMatch(s, /GROQ_API_KEY=/, 'no key env line when key absent')
})

test('voice (Phase B): resolves deprecated alias tiers (pro/studio/starter all grant voice)', () => {
  for (const tier of ['starter', 'pro', 'studio'] as const) {
    const s = buildSetupScript({ ...baseParams, tier, voiceSttKey: 'gsk_x' })
    assert.match(s, /^stt:$/m, `voice config written for deprecated alias tier "${tier}"`)
    assert.match(s, /GROQ_API_KEY=gsk_x/, `STT key written for "${tier}"`)
  }
})

test('voice (Phase B): openai provider uses VOICE_TOOLS_OPENAI_KEY (NOT the OpenRouter chat var)', () => {
  // When the fleet is flipped to the OpenAI provider, the STT key must land
  // under VOICE_TOOLS_OPENAI_KEY — a REAL api.openai.com key — NOT
  // OPENAI_API_KEY, which already holds the customer's OpenRouter sub-key.
  const s = buildSetupScript({
    ...baseParams,
    openRouterKey: 'sk-or-v1-customer-chat-key',
    voiceSttProvider: 'openai',
    voiceSttKey: 'sk-real-openai-EXAMPLE',
  })
  assert.match(s, /VOICE_TOOLS_OPENAI_KEY=sk-real-openai-EXAMPLE/, 'OpenAI STT key under the dedicated var')
  assert.match(s, /provider: "openai"/, 'config selects openai provider')
  assert.match(s, /model: "whisper-1"/, 'openai whisper model set')
  // The chat OPENAI_API_KEY stays the OpenRouter key, untouched by STT.
  assert.match(s, /OPENAI_API_KEY=sk-or-v1-customer-chat-key/, 'chat key unchanged (still OpenRouter)')
  // The STT key must NOT leak into the chat var.
  assert.doesNotMatch(s, /OPENAI_API_KEY=sk-real-openai-EXAMPLE/, 'STT key must not become the chat key')
})

test('voice (Phase B): tier gate — a text-only tier (features.voice=false) gets NO voice config', () => {
  // No current tier is text-only, so simulate the gate directly against the
  // source of truth: pick any tier whose features.voice is false. If/when a
  // future text-only tier is added this test auto-covers it; today it
  // asserts the gate logic by confirming the voice config is ABSENT for a
  // hypothetical resolver-miss (unknown slug → voice-off, never throws).
  // An unknown tier string degrades to voice-off WITHOUT aborting provision.
  const s = buildSetupScript({
    ...baseParams,
    // @ts-expect-error — intentionally pass an unknown slug to exercise the
    // resolve-failure → voice-off degrade path.
    tier: 'totally-unknown-tier',
    voiceSttKey: 'gsk_x',
  })
  assert.doesNotMatch(s, /^stt:$/m, 'no voice config block for a non-voice / unknown tier')
  assert.doesNotMatch(s, /GROQ_API_KEY=/, 'no STT key for a non-voice / unknown tier')
  // The rest of the script still builds (provision must not abort).
  assert.match(s, /install\.sh/, 'Hermes install still runs')
  assert.match(s, /SOUL\.md/, 'persona still written')
})
