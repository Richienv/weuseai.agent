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

test('index.html ships the compiled stack — never the runtime compilers', () => {
  const html = read('index.html').toString()
  // What must be there:
  assert.ok(html.includes('<script src="/assets/app.js" defer></script>'), 'compiled app referenced')
  assert.ok(html.includes('<link rel="stylesheet" href="/assets/tw.css">'), 'static tailwind referenced')
  // What must NEVER come back (each one re-adds seconds on 4G):
  assert.ok(!html.includes('babel'), 'Babel-standalone must not return to the landing')
  assert.ok(!html.includes('cdn.tailwindcss.com'), 'Tailwind runtime JIT must not return')
  assert.ok(!html.includes('hls.min.js'), 'hls.js is lazy-loaded from app.js, not the head')
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
  for (const banned of ['Sorted', 'emails', 'GST', 'PR #142', 'Auto-publish']) {
    assert.ok(!jsx.includes(banned), `stale fabricated demo content: "${banned}"`)
  }
  assert.ok(jsx.includes('Pagi Briefing — dikirim otomatis'), 'honest demo script present')
  assert.ok(jsx.includes('Aku tidak mengirim apa pun tanpa kamu setujui'), 'approval-gate line present')
})
