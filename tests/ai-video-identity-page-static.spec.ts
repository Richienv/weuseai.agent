/**
 * Static gate for the customer Karakter page (Verified Identity Lane, Phase 3).
 *
 * Pure source-grep, no browser: brand-voice locks (banned words, zero
 * exclamation marks), the five step ids, asset references that resolve to
 * real files, the exact `ai-video-identity` action contract the page speaks,
 * the capability header, and the callback + not_paid handling.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

const html = read('ai-video-identity.html')
const js = read('assets/ai-video-identity.js')
const apiJs = read('assets/ai-video-identity-api.js')
const mediaJs = read('assets/ai-video-identity-media.js')
const css = read('assets/ai-video-identity.css')
const welcomeHtml = read('ai-video-welcome.html')
const welcomeCopyHtml = read('ai-video/welcome.html')
const welcomeJs = read('assets/ai-video-welcome.js')
const allJs = js + '\n' + apiJs + '\n' + mediaJs

const BANNED = ['basically', 'just', 'literally', 'honestly', 'kind of', 'pretty much', 'revolutionary', 'disrupt', '10x', 'game-changer', 'next-level']

const htmlText = html
  .replace(/<!doctype[^>]*>/i, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<[^>]+>/g, ' ')

// Every user-visible string in the modules lives in a quote or template literal.
const jsStrings = (source: string) => [...source.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map((m) => m[0])

test('identity page: no banned brand words in customer-facing copy', () => {
  for (const word of BANNED) {
    const re = new RegExp(`\\b${word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i')
    assert.doesNotMatch(htmlText, re, `banned word "${word}" in ai-video-identity.html`)
    for (const literal of jsStrings(allJs)) {
      assert.doesNotMatch(literal, re, `banned word "${word}" in a JS string: ${literal}`)
    }
  }
})

test('identity page: zero exclamation marks in customer-facing copy', () => {
  assert.equal((htmlText.match(/!/g) || []).length, 0, 'ai-video-identity.html text must not shout')
  for (const literal of jsStrings(allJs)) {
    assert.ok(!literal.includes('!'), `exclamation mark inside a JS string: ${literal}`)
  }
})

test('identity page: Bahasa, kamu register, noindex, phone viewport', () => {
  assert.match(html, /<html lang="id">/)
  assert.match(html, /name="robots" content="noindex, nofollow"/)
  assert.match(html, /viewport-fit=cover/)
  assert.match(htmlText, /\bkamu\b/)
  assert.doesNotMatch(htmlText, /\bAnda\b/)
})

test('identity page: the five step sections and the paid gate exist', () => {
  for (const id of ['gate', 'step-consent', 'step-verify', 'step-upload', 'step-processing', 'step-ready']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`)
  }
  for (const step of ['1', '2', '3', '4', '5']) {
    assert.match(html, new RegExp(`class="card step" id="step-[a-z]+" data-step="${step}"`), `step ${step} card`)
  }
  assert.match(html, /aria-live="polite"/, 'status line announces progress')
  assert.match(html, /aria-label="Langkah membuat karakter"/, 'stepper is labelled')
})

test('identity page: consent step names BytePlus (ByteDance), retention, and requires the checkbox', () => {
  assert.match(htmlText, /BytePlus \(ByteDance\)/)
  assert.match(htmlText, /30 hari/)
  assert.match(htmlText, /minta hapus/)
  assert.match(html, /id="consent-check"[^>]*type="checkbox"/)
  assert.match(html, /id="display-name"[^>]*maxlength="80"/)
  assert.match(js, /consentCheck\.checked/, 'start is gated behind the checkbox')
  assert.match(apiJs, /CONSENT_VERSION = 'v1'/)
  assert.match(js, /consent_version: CONSENT_VERSION/)
  assert.doesNotMatch(html + allJs, /bypass/i, 'never say bypass')
})

test('identity page: script and stylesheet references resolve to real files', () => {
  const refs = [...html.matchAll(/(?:href|src)="(\/assets\/[^"?]+)(?:\?[^"]*)?"/g)].map((m) => m[1])
  const local = refs.filter((ref) => /\.(css|js)$/.test(ref))
  assert.ok(local.includes('/assets/ai-video-identity.css'), 'stylesheet is linked')
  assert.ok(local.includes('/assets/ai-video-identity.js'), 'module is linked')
  for (const ref of local) {
    assert.ok(existsSync(new URL(`.${ref}`, root)), `${ref} does not exist`)
  }
  const imports = [...allJs.matchAll(/from '(\/assets\/[^']+)'/g)].map((m) => m[1])
  assert.ok(imports.includes('/assets/ai-video-identity-media.js'))
  assert.ok(imports.includes('/assets/ai-video-identity-api.js'))
  for (const ref of imports) {
    assert.ok(existsSync(new URL(`.${ref}`, root)), `${ref} does not exist`)
  }
  assert.match(html, /type="module" src="\/assets\/ai-video-identity\.js/)
  assert.doesNotMatch(html, /react|babel|unpkg/i, 'vanilla module, no React or build step')
})

test('identity page: matches the welcome look (dark theme, Inter body, Instrument Serif heading, welcome tokens)', () => {
  assert.match(css, /--bg: #0a0a0a/)
  assert.match(css, /--ink: #f5f5f5/)
  assert.match(css, /--accent: #E5322D/)
  assert.match(css, /--gs-1: #111111/)
  assert.match(css, /--ease-out: cubic-bezier\(0\.23, 1, 0\.32, 1\)/)
  assert.match(css, /font-family: "Inter"/)
  assert.match(css, /font-family: "Instrument Serif"/)
  assert.match(html, /family=Inter/)
  assert.match(html, /family=Instrument\+Serif/)
  assert.match(html, /name="supabase-functions-origin"/)
})

test('identity page: speaks the exact ai-video-identity action contract', () => {
  assert.match(apiJs, /\$\{endpointOrigin\}\/ai-video-identity/)
  assert.match(apiJs, /headers\['x-ai-video-capability'\] = token/)
  assert.match(apiJs, /body: JSON\.stringify\(\{ action, \.\.\.fields \}\)/)
  const calls = [...allJs.matchAll(/callIdentity\('([a-z_]+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual(
    [...new Set(calls)],
    ['confirm', 'list', 'register', 'restart', 'revoke', 'start', 'status', 'upload_sign'],
    'only the eight contract actions are called',
  )
  assert.match(js, /callIdentity\('start', \{ display_name: displayName, consent_version: CONSENT_VERSION \}\)/)
  assert.match(js, /callIdentity\('restart', \{ identity_id: identityId \}\)/)
  assert.match(js, /callIdentity\('confirm', \{ nonce \}\)/)
  assert.match(js, /callIdentity\('upload_sign', \{ identity_id: current\.id, slot, content_type: check\.contentType, bytes: file\.size \}\)/)
  assert.match(js, /callIdentity\('register', \{ identity_id: current\.id, path: signed\.path, asset_type: spec\.assetType, slot \}\)/)
  assert.match(js, /callIdentity\('status', \{ identity_id: identityId \}\)/)
  assert.match(js, /callIdentity\('revoke', \{ identity_id: current\.id \}\)/)
  assert.match(js, /putWithProgress\(signed\.upload_url, headers, file/)
  assert.match(js, /POLL_MS = 15_000/, 'status polls every 15 s')
})

test('identity page: slots, asset types, and client-side media limits', () => {
  assert.match(js, /full_body: \{ label: 'Foto seluruh badan', assetType: 'Image'/)
  assert.match(js, /close_up: \{ label: 'Foto wajah dekat', assetType: 'Image'/)
  assert.match(js, /voice: \{ label: 'Klip suara', assetType: 'Audio'/)
  assert.match(js, /REQUIRED_SLOTS = \['full_body', 'close_up'\]/)
  assert.match(mediaJs, /IMAGE_MAX_BYTES = 30 \* 1024 \* 1024/)
  assert.match(mediaJs, /IMAGE_MIN_SIDE = 300/)
  assert.match(mediaJs, /IMAGE_MAX_SIDE = 6000/)
  assert.match(mediaJs, /IMAGE_MIN_RATIO = 0\.4/)
  assert.match(mediaJs, /IMAGE_MAX_RATIO = 2\.5/)
  assert.match(mediaJs, /AUDIO_MAX_BYTES = 15 \* 1024 \* 1024/)
  assert.match(mediaJs, /AUDIO_MIN_SECONDS = 2/)
  assert.match(mediaJs, /AUDIO_MAX_SECONDS = 30/)
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif,\.heic,\.heif"/)
  assert.match(htmlText, /satu wajah/)
  assert.doesNotMatch(allJs, /admin\/assets\/studio-media/, 'root page does not pull the admin bundle')
})

test('identity page: callback, not_paid gate, and Bahasa reason codes', () => {
  assert.match(js, /params\.get\('stage'\) === 'callback'/)
  assert.match(js, /params\.get\('n'\)/)
  assert.doesNotMatch(js, /bytedToken|resultCode/, 'ignores the other callback query params')
  assert.match(js, /window\.location\.assign\(h5Link\)/, 'H5 link opens as top-level navigation')
  assert.doesNotMatch(html + js, /<iframe|createElement\('iframe'\)/, 'never iframes the BytePlus page')
  assert.match(js, /code === 'not_paid'/)
  assert.match(html, /href="\/ai-video\/welcome"/)
  assert.match(html, /href="\/ai-video"/)
  for (const code of ['not_paid', 'consent_required', 'verification_expired', 'verification_failed', 'identity_asset_cap', 'ark_quota_exceeded', 'ark_rate_limited', 'face_mismatch', 'multiple_faces', 'asset_failed', 'ark_unavailable', 'invalid_media', 'liveness_billing_blocked']) {
    assert.match(allJs, new RegExp(code), `error code ${code} is handled`)
  }
  assert.match(apiJs, /face_mismatch: 'Wajah di foto tidak cocok dengan hasil verifikasi\.'/)
  assert.match(apiJs, /multiple_faces: 'Terdeteksi lebih dari satu wajah di foto\.'/)
  assert.match(apiJs, /asset_failed: 'Foto tidak memenuhi syarat\./)
  assert.match(apiJs, /liveness_billing_blocked: 'Verifikasi wajah sedang ditutup\. BytePlus mulai menagih pemeriksaan ini\.'/)
  assert.match(htmlText, /1 sampai 10 menit/)
  assert.match(htmlText, /30 menit/)
  assert.match(js, /sessionStorage\.setItem\(STORE\.id, identity\.id\)/, 'identity_id persists across reload and callback return')
  assert.match(js, /sessionStorage\.setItem\(STORE\.step, String\(step\)\)/, 'step persists across reload')
  assert.match(js, /window\.confirm\(/, 'revoke asks first')
})

test('welcome receipt: paid customers get a Buat Karakter link, both served copies stay identical', () => {
  assert.match(welcomeHtml, /id="identity-link" hidden href="\/ai-video-identity">Buat Karakter</)
  assert.equal(welcomeHtml, welcomeCopyHtml, 'ai-video/welcome.html must mirror ai-video-welcome.html')
  assert.match(welcomeJs, /identityLink\.hidden = stage !== 'complete'/)
})
