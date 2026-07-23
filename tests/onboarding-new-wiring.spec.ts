/**
 * Onboarding wiring + copy contract for the DC-runtime redesign
 * (`onboarding-new.html`).
 *
 * WHY: the live vanilla-JS `onboarding.html` is pinned by SEVEN source-grep
 * drift gates (onboarding-step1-profile-save, onboarding-pair-code-loading,
 * onboarding-pair-code-reassurance, onboarding-pending-provision-copy,
 * onboarding-capacity-error-copy, onboarding-wrong-bot-link, and the
 * onboarding half of welcome-bot-username-link). Those gates grep vanilla-JS
 * symbols (`id="f-email"`, `saveStep1Profile`, `data-reset-bot-link`,
 * `renderPairingCode`, `showSubmitError`, …) that the DC rewrite renames or
 * replaces with `{{ }}` bindings — so a straight file swap turns all seven RED
 * even though NO behaviour is lost.
 *
 * This gate re-expresses every load-bearing contract for the DC file, so:
 *   (a) onboarding-new.html cannot regress before the swap, and
 *   (b) at swap time it becomes the onboarding.html contract with a one-line
 *       FILE repoint (see scripts/swap-onboarding-live.sh), and the seven old
 *       gates are deleted (their vanilla-JS shape no longer exists).
 *
 * It asserts BEHAVIOUR (endpoints, refs, handlers) + the honesty-locked COPY,
 * not the DOM order or the exact hook names — those are implementation detail.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { personasForTier } from '../supabase/functions/_shared/tier-personas.ts'

// SWAP: change to '../onboarding.html' when onboarding-new.html is promoted.
const FILE = '../onboarding-new.html'
const html = readFileSync(new URL(FILE, import.meta.url), 'utf8')
const has = (s: string) => assert.ok(html.includes(s), `${FILE} missing: ${s}`)
const absent = (s: string) => assert.ok(!html.includes(s), `${FILE} must NOT contain: ${s}`)

// ─── backend wiring: every endpoint the paid funnel depends on ─────────
test('all onboarding backend endpoints are wired', () => {
  for (const ep of [
    '/functions/v1/customer-onboarding-info',
    '/functions/v1/validate-bot-token',
    '/functions/v1/reset-bot-pairing',
    '/functions/v1/rotate-pairing-code',
    '/functions/v1/save-onboarding-profile',
    '/functions/v1/genesis-distill',
    '/functions/v1/complete-onboarding',
  ]) has(ep)
  has("new URLSearchParams(location.search).get('cid')") // ?cid= contract
  has("'X-CID': CID") // RLS scope header on the reads
})

// ─── step-1 profile capture (replaces onboarding-step1-profile-save) ───
test('welcome screen captures WhatsApp + email + name and persists the profile', () => {
  has('waRef')
  has('emailRef')
  has('nameRef')
  has('save-onboarding-profile')          // saveProfile POSTs it
  has("customer-onboarding-info")          // email is server-sourced, not localStorage
  absent('onboarding_checkout_email')       // the old global-key mismatch bug must stay gone
  has("'onboarding_wa_' + CID")            // WA persistence is CID-scoped
  // email field is deliberately editable (Option A: so display_name persists),
  // but browser autofill stays OFF (the 2026-05-17 stale-autofill hardening).
  has('autocomplete="off" ref="{{ emailRef }}"')
})

// ─── pairing code render + slow/expiry reassurance ─────────────────────
test('pairing code renders reactively with a slow-network guard and expiry reassurance', () => {
  has('{{ code }}')                         // 6-cell reactive render
  has('Kode kadaluarsa dalam:')            // countdown label
  has('{{ expiry }}')
  has('PAIR_CODE_SLOW_MS')                  // the 10s slow-network guard (restored)
  has('demi keamanan')                      // auto-rotate reassurance (why the code changes)
  has('/pair {{ pairCmd }}')               // the /pair command
  has('copyPair')                           // copy-code handler
})

// ─── wrong-bot recovery + bot deep-link (onboarding-wrong-bot-link) ────
test('bot handle display, Ganti-bot recovery, and the t.me deep-link are wired', () => {
  has('@{{ botHandle }}')                   // username display
  has('resetBot')                           // recovery handler
  has('reset-bot-pairing')                  // hitting the right endpoint
  has('Ganti bot')                          // recovery copy
  has('role="button" tabindex="0" style="color:#ff8a72') // Ganti-bot is keyboard-focusable
  has("'https://t.me/' + encodeURIComponent(h)") // deep-link, guarded (never a bare t.me/)
  absent("'https://t.me/'\n")               // no bare-fallback landmine
})

// ─── complete-onboarding error map + capacity honesty copy ─────────────
test('the final-submit error map is complete and the capacity copy is honest', () => {
  for (const err of [
    'already_onboarded', 'telegram_not_paired', 'no_bot_token',
    'expectations_too_short', 'expectations_too_long', 'invalid_input',
    'invalid_whatsapp', 'tier_does_not_grant_persona', 'vps_capacity_exhausted',
  ]) has(err)
  has('Sistem infrastruktur sedang ramai')  // the honest capacity lead-in
  absent('Server VPS')                        // the dishonest pre-fix phrasing must stay gone
  has('setiap 3 menit')
  has('dalam 30 menit')
  has('Stay di halaman ini atau cek email untuk update.') // restored closing instruction
  has('Hubungi tim via WhatsApp')            // a WA escape valve on the config screen
  has('wa.me/6282154902561')
})

// ─── persona mirror (replaces the tier-personas onboarding assertion) ──
test('PERSONA_META mirrors every canonical slug + display name', () => {
  const NAMES: Record<string, string> = {
    'the-pro': 'The Pro', 'doc-expert': 'Doc Expert', 'slide-master': 'Slide Master',
    'deep-researcher': 'Deep Researcher', 'trade-pro': 'Trade Pro',
    'project-conductor': 'Project Conductor', 'video-producer': 'Video Producer',
    'social-conductor': 'Social Conductor', 'web-app-builder': 'Web Creator',
    'business-agent': 'Business Director',
  }
  for (const slug of personasForTier('library-full')) {
    has(`'${slug}'`)
    has(NAMES[slug])
  }
})

// ─── brand voice on the customer-facing copy ───────────────────────────
test('no banned words in the onboarding copy', () => {
  // JS operators (if (!x)) are fine; we scan the human-facing strings.
  for (const w of ['basically', 'literally', 'revolutionary', 'game-changer', 'next-level', '10x']) {
    assert.ok(!html.toLowerCase().includes(w), `banned word "${w}" in onboarding copy`)
  }
  absent(' Anda ')
})
