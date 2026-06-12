// Landing build — precompile the app at COMMIT time (Mission: Apple-feel
// speed pass, 2026-06-11).
//
// Why this exists: the landing used to ship 255KB of raw JSX compiled in
// the visitor's browser by @babel/standalone (~2.6MB) plus Tailwind's
// runtime JIT (~400KB of JS doing codegen on the main thread). On the
// mid-range Android + 4G our customers use, that was seconds of blank
// screen. This script does both jobs ONCE, here, and the artifacts are
// committed — Vercel stays a purely static host (no build step to break
// deploys, which froze production once already; see PR #236).
//
// Outputs (committed):
//   assets/app.js  — esbuild-minified compile of assets/app.jsx
//   assets/tw.css  — Tailwind CSS for exactly the classes the page uses
//
// Freshness is enforced by tests/landing-build.spec.ts: edit app.jsx or
// page classes → rerun `node scripts/build-landing.mjs` → commit both.

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, statSync } from 'node:fs'

const TAILWIND_VERSION = '3.4.17' // pinned — determinism for the drift test

// ── 1. JSX → minified JS ──────────────────────────────────────────────
execFileSync('npx', [
  'esbuild', 'assets/app.jsx',
  '--loader:.jsx=jsx',
  '--jsx=transform',          // classic React.createElement (UMD React)
  '--minify',
  '--target=es2018',
  '--charset=utf8',
  '--legal-comments=none',
  '--outfile=assets/app.js',
], { stdio: 'inherit' })

// ── 2. Tailwind classes → static stylesheet ───────────────────────────
mkdirSync('build', { recursive: true })
writeFileSync('build/tw.input.css', '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n')
writeFileSync('build/tw.config.cjs', `// Mirrors the former inline tailwind.config on index.html (now removed).
module.exports = {
  content: ['./index.html', './assets/app.jsx', './assets/persona-details.js'],
  theme: {
    extend: {
      fontFamily: {
        heading: ["'Instrument Serif'", 'serif'],
        body: ["'Inter'", 'sans-serif'],
        mono: ["'JetBrains Mono'", 'monospace'],
        hanzi: ["'Noto Serif SC'", 'serif'],
      },
      colors: {
        foreground: 'hsl(0 0% 100%)',
        'muted-foreground': 'hsla(0, 0%, 100%, 0.7)',
        border: 'hsla(0, 0%, 100%, 0.2)',
      },
    },
  },
}
`)
execFileSync('npx', [
  '-y', `tailwindcss@${TAILWIND_VERSION}`,
  '-c', 'build/tw.config.cjs',
  '-i', 'build/tw.input.css',
  '-o', 'assets/tw.css',
  '--minify',
], { stdio: 'inherit' })

const js = statSync('assets/app.js').size
const css = statSync('assets/tw.css').size
console.log(`built: assets/app.js ${(js / 1024).toFixed(0)}KB · assets/tw.css ${(css / 1024).toFixed(0)}KB`)
