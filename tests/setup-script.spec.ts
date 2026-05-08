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

test('script: runs Hermes install.sh as weuseai (pinned to upstream main)', () => {
  const s = buildSetupScript(baseParams)
  assert.match(
    s,
    /su - weuseai -c ['"][^'"]*curl -fsSL https:\/\/raw\.githubusercontent\.com\/NousResearch\/hermes-agent\/main\/scripts\/install\.sh \| bash/,
    'install.sh as weuseai',
  )
})

test('script: gateway install + start + cron — best-effort (failure tolerated)', () => {
  const s = buildSetupScript(baseParams)
  // Each hermes management command: tolerated failure so a CLI flag rename
  // upstream doesn't kill the whole script. The crucial halo already fired.
  // Tolerance via `|| true` OR `|| log "..."` (logs the failure but exits 0).
  const lines = s.split('\n').filter(l => l.match(/hermes (gateway|cron)/))
  assert.ok(lines.length >= 3, `at least 3 hermes mgmt commands, got ${lines.length}`)
  for (const l of lines) {
    assert.match(l, /\|\|\s*(true|log\s)/, `tolerant: ${l.trim()}`)
  }
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
  assert.match(s, /OPENAI_MODEL=deepseek\/deepseek-chat/, 'default model')
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
  assert.match(s, /ExecStartPre=\/usr\/local\/bin\/weuseai-bundle-pull/)
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
