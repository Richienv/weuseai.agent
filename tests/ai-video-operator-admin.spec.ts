import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// Studio-scope pins only. The sales-desk, nav, and admin.css pins land with
// the ops-desk commit that carries admin/ai-video.html and the sidebar work.

const generateHtml = readFileSync(new URL('../admin/ai-video-generate.html', import.meta.url), 'utf8')
const generateJsx = readFileSync(new URL('../admin/assets/ai-video-generate.jsx', import.meta.url), 'utf8')
const generate = generateHtml + generateJsx
const action = readFileSync(new URL('../api/admin/customer-action.ts', import.meta.url), 'utf8')
const data = readFileSync(new URL('../api/admin/customer-data.ts', import.meta.url), 'utf8')
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')

test('compiled studio js stays fresh with the jsx', () => {
  const before = readFileSync(new URL('../admin/assets/ai-video-generate.js', import.meta.url))
  execFileSync('node', ['scripts/build-studio.mjs'], {
    cwd: new URL('..', import.meta.url),
    stdio: 'pipe',
  })
  const after = readFileSync(new URL('../admin/assets/ai-video-generate.js', import.meta.url))
  assert.ok(before.equals(after), 'admin/assets/ai-video-generate.js is stale — rerun node scripts/build-studio.mjs')
})

test('studio ships a precompiled local runtime, never Babel on the desk', () => {
  assert.doesNotMatch(generateHtml, /babel/)
  assert.doesNotMatch(generateHtml, /unpkg\.com/)
  assert.match(generateHtml, /\/assets\/vendor\/react\.production\.min\.js/)
  assert.match(generateHtml, /\/admin\/assets\/ai-video-generate\.js/)
  assert.match(vercel, /\/admin\/assets\/:path\*/)
  assert.match(vercel, /max-age=31536000/)
})

test('studio rides the existing admin rails, no new Vercel functions', () => {
  assert.match(vercel, /\/admin\/ai-video-generate\.html/)
  assert.match(data, /ai-video-generate/)
  assert.match(action, /ai_video_generate_start/)
  assert.match(action, /ai_video_generate_submit/)
  assert.match(action, /ai_video_generate_upload/)
  assert.match(action, /ai_video_generate_cancel/)
  assert.match(action, /ai_video_generate_save_library/)
  assert.match(action, /ai_video_prompt_save/)
  assert.match(action, /ai_video_character_save/)
  assert.match(action, /ai_video_prompt_compile/)
  assert.match(action, /ai_video_generate_list_uploads/)
  // Vercel Node cannot boot a raw supabase/functions .ts import — that 500s
  // every customer-data resource and Studio comes back empty after refresh.
  const generateStore = readFileSync(new URL('../api/_shared/admin-ai-video-generate.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(generateStore, /supabase\/functions\/_shared\/monid-client/)
  assert.doesNotMatch(data, /monid-client\.ts/)
  assert.match(generateStore, /from '\.\/monid-run\.js'/)
  // Queued errors are real jobs until the worker resolves them to a terminal state.
  assert.match(generateStore, /status=in\.\(queued,submitted,running\)/)
  assert.match(generateStore, /SEEDANCE_25_PROMPT_HINT/)
  assert.match(generateStore, /monid_prompt_limit/)
})

test('simple studio keeps runtime local and isolates its stylesheet from the other admin pages', () => {
  assert.match(generateHtml, /studio-simple\.css/)
  assert.doesNotMatch(generateHtml, /admin-shared\.js/)
  assert.doesNotMatch(generateJsx, /Satu take|SKILL_MODES|studio-checklist|studio-modes/)
})

test('simple studio unlocks Seedance 2.5 without restoring the operator desk', () => {
  const media = readFileSync(new URL('../admin/assets/studio-media.js', import.meta.url), 'utf8')
  assert.match(generateHtml, /phone-1/)
  assert.match(generateJsx, /\[4, 6, 8, 10, 15, 30\]/)
  assert.match(generateJsx, /21:9/)
  assert.match(generateJsx, /ikut frame/)
  assert.match(generateJsx, /generate_audio: generateAudio/)
  assert.match(generateJsx, /Frame awal/)
  assert.match(generateJsx, /Frame akhir/)
  assert.match(generateJsx, /Pasang sebagai/)
  assert.match(generateJsx, /Ambil frame terakhir/)
  assert.match(generateJsx, /Upload video/)
  assert.match(media, /VIDEO_ACCEPT/)
  assert.match(media, /kind === 'video'/)
  assert.doesNotMatch(generateJsx, /last_frame|end_image|video_extension|SKILL_MODES|Satu take|Vault/)
  assert.doesNotMatch(media, /last_frame|end_image/)
})

test('an uncertain start stays pending and never sends a second start POST', () => {
  const startPosts = generateJsx.match(/post\('ai_video_generate_start'/g) ?? []
  assert.equal(startPosts.length, 1)
  assert.match(generateJsx, /\(readPending\(\) \|\| initial\.pendingRequestId\) \? 'submission_unknown' : ''/)
  assert.match(generateJsx, /pendingRef\.current && body\.jobs\.find\(\(row\) => row\.client_request_id === pendingRef\.current\)/)
  assert.match(generateJsx, /if \(disabled \|\| submittingRef\.current \|\| pendingRef\.current\) return/)
  assert.match(generateJsx, /if \(problem\.uncertain && !pendingRef\.current\) return/)
})

test('studio page never embeds merchant secrets or hype copy', () => {
  assert.doesNotMatch(generate, /MODELARK_MERCHANT_API_KEY/)
  assert.doesNotMatch(generate, /MONID_API_KEY/)
  assert.doesNotMatch(generate, /SEEDANCE_OPERATOR_MODEL_ID/)
  assert.doesNotMatch(generate, /sk-[A-Za-z0-9]/)
  assert.doesNotMatch(generate, /Generate sekarang!|Siap pakai!/)
})
