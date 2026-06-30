/**
 * Landing build artifacts — freshness + structure gate.
 *
 * The landing ships PRECOMPILED artifacts (assets/app.js from
 * assets/app.jsx, assets/tw.css from the page's classes) so visitors never
 * pay for Babel-standalone (~2.6MB) or Tailwind's runtime JIT. Vercel
 * stays a static host — the "build" happens at commit time via
 * `node scripts/build-landing.mjs`.
 *
 * This gate fails when someone edits assets/app.jsx (or page classes) and
 * forgets to rerun the build script — the exact drift that would silently
 * ship a stale page.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url))

test('committed artifacts are FRESH (rebuild reproduces them byte-for-byte)', () => {
  const beforeJs = read('assets/app.js')
  const beforeCss = read('assets/tw.css')
  execFileSync('node', ['scripts/build-landing.mjs'], {
    cwd: new URL('..', import.meta.url),
    stdio: 'pipe',
    timeout: 120_000,
  })
  assert.ok(
    beforeJs.equals(read('assets/app.js')),
    'assets/app.js is stale — rerun `node scripts/build-landing.mjs` and commit it with your app.jsx change',
  )
  assert.ok(
    beforeCss.equals(read('assets/tw.css')),
    'assets/tw.css is stale — rerun `node scripts/build-landing.mjs` and commit it',
  )
})

test('index.html (Konten design landing) ships a LOCAL runtime — never CDN compilers', () => {
  // The landing is the Konten design file, mounted by a vendored DC runtime +
  // vendored React (no unpkg, no in-browser Babel). System CTAs are wired by
  // assets/konten-wiring.js. Each banned dependency re-adds seconds on 4G.
  const html = read('index.html').toString()
  // What must be there:
  assert.ok(html.includes('/assets/vendor/dc-support.js'), 'local DC runtime referenced')
  assert.ok(html.includes('/assets/konten-wiring.js'), 'system wiring referenced')
  // What must NEVER ship on the landing:
  assert.ok(!html.includes('unpkg.com'), 'React/ReactDOM are vendored — no CDN runtime')
  assert.ok(!html.includes('babel'), 'Babel-standalone must not ship on the landing')
  assert.ok(!html.includes('cdn.tailwindcss.com'), 'Tailwind runtime JIT must not return')
  assert.ok(!html.includes('type="text/babel"'), 'no in-browser JSX blocks')
})

test('app.jsx compiles clean and app.js is a sane bundle', () => {
  // Syntax gate for the JSX source (replaces the old in-browser tolerance).
  execFileSync('npx', ['esbuild', 'assets/app.jsx', '--loader:.jsx=jsx', '--jsx=transform', '--outfile=/dev/null'], {
    cwd: new URL('..', import.meta.url),
    stdio: 'pipe',
  })
  const js = read('assets/app.js').toString()
  assert.ok(js.length > 50_000, 'bundle suspiciously small')
  assert.ok(js.includes('createRoot'), 'render entry present')
  assert.ok(!js.includes('import '), 'no ESM imports — UMD globals only')
})

test('demo conversation stays honest (no email/calendar capability claims)', () => {
  const jsx = read('assets/app.jsx').toString()
  // Each string below is a fabricated integration we do NOT have (calendar
  // invites, multi-platform auto-posting, live trend scraping, overnight
  // chat handling). They crept back into the demo once; keep them out.
  for (const banned of [
    'Sorted', 'emails', 'GST', 'PR #142', 'Auto-publish',
    'Calendar update', 'confirmed dalam', 'Live di 6 platform', 'overnight', 'trending apa',
    'Auto-monitor', 'otomatis ke OLX', 'kalender di-sync', 'Otomatis dibaca', '10×',
  ]) {
    assert.ok(!jsx.includes(banned), `stale fabricated demo content: "${banned}"`)
  }
  assert.ok(jsx.includes('Pagi Briefing — dikirim otomatis'), 'honest demo script present')
  assert.ok(jsx.includes('Aku tidak mengirim apa pun tanpa kamu setujui'), 'approval-gate line present')
})
