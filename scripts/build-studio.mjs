// Studio compile — same rule as the landing: never ship Babel to the browser.
// Source: admin/assets/ai-video-generate.jsx
// Output: admin/assets/ai-video-generate.js
//
// Vercel stays a static host. Rerun this script after editing the jsx.

import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'

execFileSync('npx', [
  'esbuild', 'admin/assets/ai-video-generate.jsx',
  '--loader:.jsx=jsx',
  '--bundle',
  '--format=iife',
  '--jsx=transform',
  '--minify',
  '--target=es2018',
  '--charset=utf8',
  '--legal-comments=none',
  '--outfile=admin/assets/ai-video-generate.js',
], { stdio: 'inherit' })

const js = statSync('admin/assets/ai-video-generate.js').size
console.log(`built: admin/assets/ai-video-generate.js ${(js / 1024).toFixed(0)}KB`)
