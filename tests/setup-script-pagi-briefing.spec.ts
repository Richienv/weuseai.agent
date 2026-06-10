/**
 * Mission 2 setup-script surface — Pagi Briefing + EOD crons + the
 * /bikin-persona Persona Genesis interview skill.
 *
 * Pins: (1) the 07:00 WIB cron now carries the REAL briefing prompt, not
 * the generic 5-headline news prompt (audit U1); (2) an 18:00 WIB
 * end-of-day cron exists (audit U2); (3) the prompts are HONEST — they
 * forbid claiming calendar/email access (audit U4); (4) /bikin-persona is
 * installed only on genesis tiers; (5) the genesis URL env line ships.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildSetupScript,
  PAGI_BRIEFING_CRON_PROMPT,
  EOD_SUMMARY_CRON_PROMPT,
  type SetupScriptParams,
} from '../services/provisioning/src/setup-script.ts'

function params(tier: SetupScriptParams['tier']): SetupScriptParams {
  return {
    customerId: 'cid-test-1234',
    tier,
    telegramBotToken: '8630424948:AAGmM1ND-test',
    telegramAllowedUserIds: '6805409051',
    openRouterKey: 'sk-or-test',
    // Real flows always ship the bootstrap bundle; the workflow env block
    // (incl. WEUSEAI_PERSONA_GENESIS_URL) is gated on it.
    bundleTarBase64: 'dGVzdA==',
  } as SetupScriptParams
}

// ─── crons ───────────────────────────────────────────────────────────────

test('07:00 WIB cron carries the Pagi Briefing prompt (not generic news)', () => {
  const s = buildSetupScript(params('done-for-you'))
  assert.match(s, /cron add --schedule "0 0 \* \* \*"/)
  assert.ok(s.includes('Susun Pagi Briefing'), 'real briefing prompt present')
  assert.ok(!s.includes('Cek 5 berita teratas dari detik.com, kompas.com, cnbcindonesia.com. Ringkas tiap berita 2 kalimat'), 'old generic news prompt removed')
})

test('18:00 WIB end-of-day cron exists (0 11 * * * UTC)', () => {
  const s = buildSetupScript(params('done-for-you'))
  assert.match(s, /cron add --schedule "0 11 \* \* \*"/)
  assert.ok(s.includes('ringkasan akhir hari'))
})

test('briefing prompts are honest: explicitly no calendar/email claims', () => {
  for (const prompt of [PAGI_BRIEFING_CRON_PROMPT, EOD_SUMMARY_CRON_PROMPT]) {
    assert.match(prompt, /TIDAK punya akses kalender/)
  }
})

test('briefing prompts obey brand rules (no exclamation, no banned words, kamu-register)', () => {
  const banned = ['basically', 'just', 'literally', 'honestly', 'revolutionary', 'game-changer']
  for (const prompt of [PAGI_BRIEFING_CRON_PROMPT, EOD_SUMMARY_CRON_PROMPT]) {
    assert.equal((prompt.match(/!/g) ?? []).length, 0, 'zero exclamation marks')
    for (const w of banned) {
      assert.ok(!prompt.toLowerCase().includes(w), `banned word "${w}"`)
    }
    assert.ok(!/\bAnda\b/.test(prompt), 'no Anda')
  }
})

// ─── /bikin-persona gating ───────────────────────────────────────────────

test('bikin-persona skill installs on done-for-you', () => {
  const s = buildSetupScript(params('done-for-you'))
  assert.ok(s.includes('skills/bikin-persona'))
  assert.ok(s.includes('WEUSEAI_BIKIN_PERSONA_EOF'))
})

test('legacy pro (alias of done-for-you) also gets bikin-persona', () => {
  const s = buildSetupScript(params('pro'))
  assert.ok(s.includes('skills/bikin-persona'))
})

for (const tier of ['bare', 'solo', 'voice-starter', 'library-full', 'starter', 'studio'] as const) {
  test(`bikin-persona NOT installed on ${tier}`, () => {
    const s = buildSetupScript(params(tier))
    assert.ok(!s.includes('skills/bikin-persona'), `${tier} must not get the genesis command`)
  })
}

test('WEUSEAI_PERSONA_GENESIS_URL env line ships (derived from workflow-execute base)', () => {
  const s = buildSetupScript(params('done-for-you'))
  assert.match(s, /WEUSEAI_PERSONA_GENESIS_URL=.*\/persona-genesis/)
})

test('bikin-persona SKILL.md instructs the X-CID-bound POST', () => {
  const s = buildSetupScript(params('done-for-you'))
  assert.ok(s.includes('POST $WEUSEAI_PERSONA_GENESIS_URL'))
  assert.ok(s.includes('X-CID: $WEUSEAI_CUSTOMER_ID'))
})

test('generated script stays bash-clean for genesis + non-genesis tiers (bash -n)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weuseai-setup-'))
  try {
    for (const tier of ['done-for-you', 'solo'] as const) {
      const file = join(dir, `setup-${tier}.sh`)
      writeFileSync(file, buildSetupScript(params(tier)))
      execFileSync('bash', ['-n', file])
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
