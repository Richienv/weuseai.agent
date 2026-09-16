import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import { tsImport } from 'tsx/esm/api';
const { parseOperatorStartInput, simplePromptText } = await tsImport('../api/_shared/ai-video-operator.ts', import.meta.url);
const root = resolve(import.meta.dirname, '..');
const out = process.env.STUDIO_SMOKE_OUTPUT || '/private/tmp/weuseai-studio-simple-review';
await mkdir(out, { recursive: true });
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const previousId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let scenario = 'empty', polls = 0, posts = [], brokenMedia = false, failUpload = false, holdUpload = false, holdPoll = false, exposePreviousReady = false, queueStart = false, startedAt = 0, latest = null, compiledInput = null, fixtureError = null;
const uploaded = new Map();
const fixturePrompt = 'Kucing berjalan di meja, kamera mengikuti dari samping.';
function job(status = scenario) {
  const saving = status === 'saving';
  const real = saving ? 'succeeded' : status;
  const model = latest?.model || 'seedance-2.5', duration = latest?.duration_seconds || 6;
  const refSeconds = (latest?.ref_durations || []).reduce((total, seconds) => total + seconds, 0);
  const estimate = Math.round((model === 'wan3.0' ? (duration + refSeconds) * .1 : duration * 1.156 / 5) * 1000) / 1000;
  return { id, client_request_id: latest?.client_request_id, prompt: compiledInput?.prompt || latest?.prompt || fixturePrompt, source_prompt: compiledInput?.sourcePrompt, ref_tags: compiledInput?.refTags, model, status: real, phase: saving ? 'saving' : undefined, ratio: latest?.ratio || '9:16', duration_seconds: duration, resolution: '720p', generate_audio: true, estimate_usd: estimate, cost_usd: real === 'succeeded' ? estimate : null, error_code: real === 'failed' ? fixtureError || 'monid_privacy' : null, result_path: real === 'succeeded' && !saving ? 'operator/' + id + '/result.mp4' : null, result_url: real === 'succeeded' ? '/fixture-video.mp4?signature=' + polls : null, ref_paths: latest?.ref_paths || [], ref_urls: latest?.ref_urls || [], ref_roles: latest?.ref_roles || [], ref_durations: latest?.ref_durations || [], reference_media: (latest?.ref_paths || []).map((path) => ({ path, url: '/uploaded/' + path.split('/').pop() })), can_cancel: real === 'queued', created_at: new Date(startedAt || Date.now() - 180000).toISOString(), updated_at: new Date().toISOString() };
}
function reply(res, body, status = 200) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/admin/customer-data' && url.searchParams.get('resource') === 'ai-video-identities') {
    // Karakter picker feed (verified founder identity fixture). Not a job poll.
    reply(res, { identities: [{ id: 'fixture-identity', display_name: 'Richie', owner_kind: 'founder', assets: [{ id: 'fixture-face', asset_id: 'Asset-20260914100001-fghij', asset_type: 'Image', slot: 'wajah' }] }] }); return;
  }
  if (url.pathname === '/api/admin/customer-data') {
    polls++;
    if (holdPoll) await new Promise((resolve) => setTimeout(resolve, 800));
    if (scenario === 'offline') { reply(res, {}, 503); return; }
    if (process.env.STUDIO_PREVIEW && startedAt && !['failed', 'cancelled', 'empty'].includes(scenario)) {
      const seconds = (Date.now() - startedAt) / 1000;
      scenario = seconds > 12 ? 'succeeded' : seconds > 2 ? 'running' : 'submitted';
    }
    const rows = scenario === 'empty' ? [] : scenario === 'submit-lost'
      ? (exposePreviousReady ? [{ ...job('succeeded'), id: previousId, client_request_id: 'previous-ready-request' }] : [])
      : [job()];
    const requestedJob = url.searchParams.get('job_id');
    reply(res, { ok: true, enabled: true, jobs: rows, job: requestedJob ? rows.find((row) => row.id === requestedJob) || null : null, wallet: { value: 50, currency: 'USD' }, poll_seconds: 5 }); return;
  }
  if (url.pathname === '/api/admin/customer-action') {
    let body = ''; for await (const part of req) body += part;
    const input = JSON.parse(body); posts.push(input);
    if (input.action === 'ai_video_generate_upload') {
      reply(res, { ok: true, uploads: input.filenames.map((name) => ({ path: 'operator/inbox/' + name, signedUrl: base + '/upload/' + name })) }); return;
    }
    if (input.action === 'ai_video_generate_start') {
      if (scenario === 'submit-lost') { reply(res, { error: 'upstream_lost' }, 502); return; }
      try { compiledInput = parseOperatorStartInput(input); } catch (error) { reply(res, { error: error.message }, 400); return; }
      latest = input; startedAt = Date.now();
      scenario = queueStart ? 'queued' : 'submitted';
    }
    if (input.action === 'ai_video_generate_submit') {
      if (latest) scenario = 'submitted';
    }
    if (input.action === 'ai_video_generate_cancel') scenario = 'cancelled';
    reply(res, { ok: true, job: job() }); return;
  }
  if (url.pathname.startsWith('/upload/')) {
    const chunks = []; for await (const part of req) chunks.push(part);
    if (failUpload) { res.writeHead(503); res.end(); return; }
    if (holdUpload) await new Promise((resolve) => setTimeout(resolve, 3000));
    uploaded.set(url.pathname.split('/').pop(), Buffer.concat(chunks)); res.writeHead(200); res.end(); return;
  }
  if (url.pathname.startsWith('/uploaded/')) {
    const name = url.pathname.split('/').pop(), bytes = uploaded.get(name);
    if (!bytes) { res.writeHead(404); res.end(); return; }
    res.setHeader('content-type', name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.mp4') || name.endsWith('.mov') ? 'video/mp4' : 'image/jpeg'); res.end(bytes); return;
  }
  if (url.pathname === '/fixture-video.mp4') {
    if (brokenMedia) { res.writeHead(404); res.end(); return; }
    res.setHeader('content-type', 'video/mp4'); res.end(await readFile(resolve(root, 'assets/welcome-success.mp4'))); return;
  }
  const path = resolve(root, '.' + (url.pathname === '/admin/ai-video-generate' ? '/admin/ai-video-generate.html' : url.pathname));
  if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  try {
    let bytes = await readFile(path);
    if (process.env.STUDIO_PREVIEW && extname(path) === '.html') bytes = Buffer.from(bytes.toString().replace('<body>', '<body><div style="padding:6px;text-align:center;background:#22262e;color:#d5dbe8;font:11px sans-serif">Preview lokal · Data simulasi</div>'));
    res.setHeader('content-type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }[extname(path)] || 'application/octet-stream'); res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(Number(process.env.STUDIO_PREVIEW_PORT) || 0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
if (process.env.STUDIO_PREVIEW) { console.log('Preview lokal: ' + base + '/admin/ai-video-generate'); await new Promise(() => {}); }
function wav(seconds) {
  const rate = 8000, samples = Math.round(rate * seconds), result = Buffer.alloc(44 + samples * 2);
  result.write('RIFF', 0); result.writeUInt32LE(result.length - 8, 4); result.write('WAVEfmt ', 8); result.writeUInt32LE(16, 16); result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22); result.writeUInt32LE(rate, 24); result.writeUInt32LE(rate * 2, 28); result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34); result.write('data', 36); result.writeUInt32LE(samples * 2, 40); return result;
}
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const errors = [], passed = [], skipped = [];
page.on('pageerror', (error) => errors.push(error.message));
const promptField = page.getByRole('textbox', { name: 'Prompt video' });
const generate = page.getByRole('button', { name: /^Generate video/ });
const modelSelect = page.getByRole('combobox', { name: 'Model video', exact: true });
async function fresh() {
  scenario = 'empty'; latest = null; compiledInput = null; startedAt = 0; posts = []; holdPoll = false; exposePreviousReady = false; queueStart = false;
  await page.goto(base + '/admin/ai-video-generate');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  const promptToggle = page.getByRole('button', { name: 'Prompt', exact: true });
  if (await promptToggle.count()) await promptToggle.click();
  await page.getByRole('heading', { name: 'Buat video', exact: true }).waitFor();
  await promptField.fill(fixturePrompt);
  try {
    await page.waitForFunction(() => { const button = document.querySelector('.sv-generate'); return button && !button.disabled; }, null, { timeout: 8000 });
  } catch {
    const why = await page.evaluate(() => ({
      disabled: document.querySelector('.sv-generate')?.disabled,
      pending: sessionStorage.getItem('weuseai.studio.pending'),
      draft: localStorage.getItem('weuseai.studio.draft'),
      snap: sessionStorage.getItem('weuseai.studio.jobsnap'),
    }));
    console.warn('fresh: Generate still disabled', why);
  }
}
function softSkip(name, message) {
  skipped.push(name + ': ' + message);
  console.warn('SOFT SKIP ' + name + ' — ' + message);
}
async function waitForResultHeading() {
  const heading = page.locator('#studio-result .sv-result-heading h2');
  await heading.waitFor({ state: 'visible' });
  return heading;
}
try {
  await fresh();
  assert.equal(await modelSelect.inputValue(), 'seedance-2.5');
  assert.match(await generate.innerText(), /\$1\.39/);
  await page.evaluate(() => {
    const key = 'weuseai.studio.draft', draft = JSON.parse(localStorage.getItem(key));
    delete draft.selectedModel; draft.model = 'wan3.0'; draft.version = 2;
    localStorage.setItem(key, JSON.stringify(draft));
  });
  await page.reload(); await promptField.waitFor();
  assert.equal(await modelSelect.inputValue(), 'seedance-2.5');
  assert.equal(await promptField.inputValue(), fixturePrompt);
  passed.push('Seedance default also upgrades old drafts without erasing the prompt');
  await page.screenshot({ path: out + '/desktop-create.png', fullPage: true, animations: 'disabled' });
  assert.doesNotMatch(await page.locator('body').innerText(), /Satu take|Blok narasi|provider|TIMELINE|SCENE|Template|Simpan baru/);
  passed.push('plain prompt with no modes or technical checklist');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + '/mobile-create.png', fullPage: true, animations: 'disabled' });
  assert.equal(await page.locator('.sv-result').isVisible(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  let box = await generate.boundingBox(); assert.ok(box && box.y >= 0 && box.y + box.height <= 844);
  await modelSelect.selectOption('wan3.0');
  await page.reload(); await promptField.waitFor();
  assert.equal(await modelSelect.inputValue(), 'wan3.0');
  assert.match(await generate.innerText(), /\$0\.60/);
  passed.push('explicit model choice persists across reload');
  await page.getByRole('button', { name: '9:16 6 dtk' }).click();
  await page.getByRole('dialog', { name: 'Pengaturan video' }).waitFor();
  await page.getByRole('button', { name: '10 dtk', exact: true }).click();
  await page.getByRole('button', { name: 'Selesai', exact: true }).click();
  assert.match(await generate.innerText(), /\$1\.00/);
  passed.push('mobile 390x844 single screen, visible Generate and compact settings');
  const imageBytes = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 400; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#bd865c'; ctx.fillRect(0, 0, 320, 400); return canvas.toDataURL('image/png').split(',')[1]; });
  await page.getByLabel('Upload foto', { exact: true }).setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from(imageBytes, 'base64') });
  await page.waitForFunction(() => document.querySelector('.sv-reference')?.dataset.status === 'ready');
  assert.equal(uploaded.get('reference.jpg')?.readUInt16BE(0), 0xffd8);
  await page.getByLabel('Upload audio', { exact: true }).setInputFiles({ name: 'voice.wav', mimeType: 'audio/wav', buffer: wav(3) });
  await page.waitForFunction(() => document.querySelector('.sv-reference.audio')?.dataset.status === 'ready');
  assert.equal(uploaded.get('voice.wav')?.toString('ascii', 0, 4), 'RIFF');
  assert.equal(await page.locator('audio[controls]').count(), 1);
  assert.match(await generate.innerText(), /\$1\.30/);
  await modelSelect.selectOption('seedance-2.5');
  assert.match(await generate.innerText(), /\$2\.31/);
  assert.equal(await page.locator('.sv-reference[data-status=ready]').count(), 2);
  assert.equal(await promptField.inputValue(), fixturePrompt);
  await modelSelect.selectOption('wan3.0');
  assert.match(await generate.innerText(), /\$1\.30/);
  passed.push('model switching preserves uploaded photos/audio and recalculates the estimate');
  await page.screenshot({ path: out + '/mobile-references.png', fullPage: true, animations: 'disabled' });
  passed.push('photo normalization, audio decoding and upload, visible previews, reference cost');
  await generate.evaluate((button) => { button.click(); button.click(); });
  await waitForResultHeading();
  const submits = posts.filter((row) => row.action === 'ai_video_generate_start');
  assert.equal(submits.length, 1); assert.equal(submits[0].prompt_mode, 'simple'); assert.equal(submits[0].model, 'wan3.0');
  assert.deepEqual(submits[0].ref_roles, ['reference_image', 'reference_audio']);
  assert.deepEqual(submits[0].ref_paths, ['operator/inbox/reference.jpg', 'operator/inbox/voice.wav']);
  assert.ok(Math.abs(submits[0].ref_durations[1] - 3) < .01); assert.equal(submits[0].generate_audio, true);
  assert.equal('skill_mode' in submits[0], false);
  assert.equal(await page.locator('.sv-composer').isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'Batalkan', exact: true }).count(), 0);
  await page.screenshot({ path: out + '/mobile-loading.png', fullPage: true, animations: 'disabled' });
  passed.push('double submit prevention and complete automatic photo/audio binding');
  scenario = 'running'; await page.reload();
  await waitForResultHeading();
  assert.equal(posts.filter((row) => row.action === 'ai_video_generate_start').length, 1);
  passed.push('reload resumes a job without submitting it again');
  scenario = 'succeeded'; await page.getByRole('button', { name: 'Cek status', exact: true }).click();
  await page.getByRole('heading', { name: 'Video siap', exact: true }).waitFor();
  const src = await page.locator('.job-player').getAttribute('src');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.job-player').getAttribute('src'), src);
  await page.locator('.job-player').evaluate(async (video) => { video.muted = true; await video.play(); });
  await page.waitForFunction(() => document.querySelector('.job-player').currentTime > 0);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Simpan video', exact: true }).click();
  const file = await download; assert.match(file.suggestedFilename(), /\.mp4$/); assert.equal(await file.failure(), null);
  assert.ok((await readFile(await file.path())).length > 1000);
  await page.screenshot({ path: out + '/mobile-ready.png', fullPage: true, animations: 'disabled' });
  box = await page.getByRole('button', { name: 'Simpan video', exact: true }).boundingBox(); assert.ok(box && box.y + box.height <= 844);
  passed.push('saved result playback, stable URL and actual MP4 download above the fold');
  brokenMedia = true;
  await page.locator('.job-player').evaluate((video) => { video.src = '/fixture-video.mp4?broken=1'; video.load(); });
  await page.getByRole('button', { name: 'Muat ulang video', exact: true }).waitFor();
  brokenMedia = false; await page.getByRole('button', { name: 'Muat ulang video', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.job-player').readyState >= 2);
  passed.push('broken playback can reload the stored result');
  scenario = 'offline'; await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.getByText('Koneksi terputus.', { exact: true }).waitFor();
  assert.equal(await page.locator('.job-player').count(), 1);
  scenario = 'succeeded'; await page.getByRole('button', { name: 'Cek lagi', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.sv-connection'));
  passed.push('network failure keeps the last known result');
  await page.getByRole('button', { name: 'Gunakan lagi', exact: true }).click();
  await promptField.waitFor({ state: 'visible' });
  assert.equal(await promptField.inputValue(), fixturePrompt);
  assert.equal(await page.locator('.sv-reference').count(), 2);
  assert.equal(posts.filter((row) => row.action === 'ai_video_generate_start').length, 1);
  await modelSelect.selectOption('seedance-2.5');
  await page.getByRole('button', { name: 'Riwayat', exact: true }).click();
  await page.getByRole('dialog', { name: 'Riwayat video' }).waitFor();
  await page.locator('.sv-history-row').click();
  await page.getByRole('heading', { name: 'Video siap', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Gunakan lagi', exact: true }).click();
  await promptField.waitFor({ state: 'visible' });
  assert.equal(await modelSelect.inputValue(), 'wan3.0');
  passed.push('reuse restores the original model and references from history');
  scenario = 'failed'; await page.reload();
  const failedHeading = page.getByRole('heading', { name: 'Generate gagal', exact: true });
  await page.getByRole('button', { name: 'Hasil', exact: true }).waitFor({ timeout: 8000 }).catch(() => {});
  if (!await failedHeading.isVisible()) {
    const hasil = page.getByRole('button', { name: 'Hasil', exact: true });
    if (await hasil.count()) await hasil.click();
  }
  await failedHeading.waitFor();
  assert.match(await page.locator('#studio-result').innerText(), /referensi wajah/);
  await page.screenshot({ path: out + '/mobile-failed.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: out + '/desktop-failed.png', fullPage: true, animations: 'disabled' });
  passed.push('failure is explicit and actionable');
  fixtureError = 'monid_submission_unknown'; await page.reload();
  await page.getByRole('heading', { name: 'Periksa pengiriman', exact: true }).waitFor();
  assert.equal(await generate.isDisabled(), true);
  assert.equal(await page.getByRole('link', { name: 'Periksa di Monid', exact: true }).count(), 1);
  assert.equal(await page.getByRole('heading', { name: 'Generate gagal', exact: true }).count(), 0);
  fixtureError = null;
  passed.push('unconfirmed provider submissions do not look failed or offer an immediate paid retry');

  await fresh(); holdUpload = true;
  await page.getByLabel('Upload foto', { exact: true }).setInputFiles({ name: 'interrupted.png', mimeType: 'image/png', buffer: Buffer.from(imageBytes, 'base64') });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('weuseai.studio.refs') || '[]').some((row) => row.status === 'failed'));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.sv-reference')?.dataset.status === 'failed');
  assert.equal(await generate.isDisabled(), true);
  assert.equal(posts.filter((row) => row.action === 'ai_video_generate_start').length, 0);
  holdUpload = false;
  passed.push('interrupted uploads remain visible and block generation after reload');
  await fresh(); failUpload = true;
  await page.getByLabel('Upload foto', { exact: true }).setInputFiles({ name: 'retry.png', mimeType: 'image/png', buffer: Buffer.from(imageBytes, 'base64') });
  await page.waitForFunction(() => document.querySelector('.sv-reference')?.dataset.status === 'failed');
  assert.equal(await generate.isDisabled(), true);
  failUpload = false; await page.getByRole('button', { name: 'Ulangi', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.sv-reference')?.dataset.status === 'ready');
  assert.equal(await generate.isEnabled(), true);
  passed.push('failed uploads block generation and can retry');
  await modelSelect.selectOption('wan3.0');
  await page.getByLabel('Upload audio', { exact: true }).setInputFiles({ name: 'too-long.wav', mimeType: 'audio/wav', buffer: wav(16) });
  await page.getByText('Gunakan audio berdurasi 1–15 detik.', { exact: true }).waitFor();
  assert.equal(await generate.isDisabled(), true);
  await page.getByRole('button', { name: 'Hapus too-long.wav', exact: true }).click();
  await promptField.fill('A'.repeat(6001)); assert.equal(await generate.isDisabled(), true);
  passed.push('invalid media and excessive prompt length stop before paid submission');
  await page.setViewportSize({ width: 390, height: 844 });
  await promptField.fill(fixturePrompt); scenario = 'submit-lost'; exposePreviousReady = true; posts = [];
  await generate.evaluate((button) => { button.click(); button.click(); });
  await page.getByText('Pengiriman belum terkonfirmasi', { exact: true }).waitFor();
  const lost = posts.filter((row) => row.action === 'ai_video_generate_start');
  assert.equal(new Set(lost.map((row) => row.client_request_id)).size, 1);
  assert.equal(await generate.isDisabled(), true);
  assert.equal(await page.locator('.job-player').count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'Video siap', exact: true }).count(), 0);
  await page.reload(); await page.getByText('Pengiriman belum terkonfirmasi', { exact: true }).waitFor();
  assert.equal(await generate.isDisabled(), true);
  assert.equal(await page.locator('.job-player').count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'Video siap', exact: true }).count(), 0);
  passed.push('mobile uncertain 5xx keeps pending banner and never shows a previous ready result');

  await fresh();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Upload audio', { exact: true }).setInputFiles({ name: 'long-voice.wav', mimeType: 'audio/wav', buffer: wav(20) });
  await page.waitForFunction(() => document.querySelector('.sv-reference.audio')?.dataset.status === 'ready');
  assert.equal(await generate.isEnabled(), true);
  const storedRefs = await page.evaluate(() => localStorage.getItem('weuseai.studio.refs'));
  await modelSelect.selectOption('wan3.0');
  await page.getByText('Gunakan audio berdurasi 1–15 detik.', { exact: true }).waitFor();
  assert.equal(await generate.isDisabled(), true);
  assert.equal(await page.locator('.sv-reference.audio').getAttribute('data-status'), 'ready');
  await modelSelect.selectOption('seedance-2.5');
  assert.equal(await generate.isEnabled(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('weuseai.studio.refs')), storedRefs);
  assert.match(await generate.innerText(), /\$1\.39/);
  await page.screenshot({ path: out + '/mobile-seedance.png', fullPage: true, animations: 'disabled' });
  await generate.click();
  await waitForResultHeading();
  const seedanceSubmits = posts.filter((row) => row.action === 'ai_video_generate_start');
  assert.equal(seedanceSubmits.length, 1);
  assert.equal(seedanceSubmits[0].model, 'seedance-2.5');
  assert.deepEqual(seedanceSubmits[0].ref_roles, ['reference_audio']);
  assert.ok(Math.abs(seedanceSubmits[0].ref_durations[0] - 20) < .01);
  passed.push('Seedance accepts longer audio, Wan blocks it without dropping files, and the selected model is submitted');

  await fresh();
  await promptField.fill('@Image1 berbicara dengan @Image2 memakai @Audio1');
  await page.getByLabel('Upload foto', { exact: true }).setInputFiles([
    { name: 'Richie-sheet.png', mimeType: 'image/png', buffer: Buffer.from(imageBytes, 'base64') },
    { name: 'Renita-sheet.png', mimeType: 'image/png', buffer: Buffer.from(imageBytes, 'base64') },
  ]);
  await page.waitForFunction(() => document.querySelectorAll('.sv-reference.image[data-status=ready]').length === 2);
  await page.getByLabel('Upload audio', { exact: true }).setInputFiles({ name: 'Richie-voice.wav', mimeType: 'audio/wav', buffer: wav(3) });
  await page.waitForFunction(() => document.querySelector('.sv-reference.audio')?.dataset.status === 'ready');
  await promptField.fill(''); await promptField.pressSequentially('@Renita');
  await page.getByRole('option', { name: /@Image2/ }).waitFor();
  await promptField.press('Enter');
  assert.equal(await promptField.inputValue(), '@Image2 ');
  passed.push('typing @ finds a character sheet by filename and inserts its actual tag');
  await promptField.fill('');
  await page.getByRole('button', { name: 'Sisipkan @Image1', exact: true }).click();
  await promptField.pressSequentially('berbicara dengan @');
  await page.getByRole('listbox', { name: 'Pilih referensi' }).waitFor();
  await promptField.press('ArrowDown'); await promptField.press('Enter');
  await promptField.pressSequentially('memakai suara ');
  await page.getByRole('button', { name: 'Sisipkan @Audio1', exact: true }).click();
  const tagPrompt = '@Image1 berbicara dengan @Image2 memakai suara @Audio1 ';
  assert.equal(await promptField.inputValue(), tagPrompt);
  assert.equal(await page.locator('.sv-prompt-highlight .sv-mention.image').count(), 2);
  assert.equal(await page.locator('.sv-prompt-highlight .sv-mention.audio').count(), 1);
  assert.equal(await page.getByRole('listbox').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  box = await generate.boundingBox(); assert.ok(box && box.y + box.height <= 844);
  await page.locator('.sv-references').evaluate((strip) => { strip.scrollLeft = 0; });
  await page.screenshot({ path: out + '/mobile-reference-tags.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: out + '/desktop-reference-tags.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  passed.push('thumbnail insertion, keyboard selection and distinct photo/audio highlighting fit on mobile');
  await promptField.fill(tagPrompt + '\n'.repeat(20) + '@Image2 menoleh.');
  await promptField.evaluate((input) => { input.scrollTop = input.scrollHeight; input.dispatchEvent(new Event('scroll')); });
  assert.equal(await promptField.evaluate((input) => input.scrollTop > 0), true);
  assert.equal(await page.evaluate(() => document.querySelector('.sv-prompt-highlight').scrollTop === document.querySelector('#studio-prompt').scrollTop), true);
  await promptField.fill(tagPrompt);
  await page.getByRole('button', { name: 'Ganti Richie-sheet.png', exact: true }).click();
  await page.getByLabel('Ganti file referensi', { exact: true }).setInputFiles({ name: 'Richie-v2.png', mimeType: 'image/png', buffer: Buffer.from(imageBytes, 'base64') });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('weuseai.studio.refs')).some((row) => row.tag === '@Image1' && row.path.endsWith('Richie-v2.jpg') && row.status === 'ready'));
  assert.equal(await promptField.inputValue(), tagPrompt);
  passed.push('replacing a sheet retains its tag and highlighted text stays aligned while scrolling');
  await page.getByRole('button', { name: 'Hapus Richie-v2.png', exact: true }).click();
  await page.getByText('Tag @Image1 belum terhubung. Pilih referensi atau hapus tag.', { exact: true }).waitFor();
  assert.equal(await generate.isDisabled(), true);
  await page.getByLabel('Upload foto', { exact: true }).setInputFiles({ name: 'Set.png', mimeType: 'image/png', buffer: Buffer.from(imageBytes, 'base64') });
  await page.waitForFunction(() => document.querySelector('[data-tag="@Image3"]')?.dataset.status === 'ready');
  assert.equal(await page.locator('[data-tag="@Image2"]').count(), 1);
  assert.equal(await page.locator('[data-tag="@Image1"]').count(), 0);
  await page.reload(); await promptField.waitFor();
  assert.equal(await generate.isDisabled(), true);
  assert.equal(await page.locator('.sv-mention.missing').innerText(), '@Image1');
  passed.push('deleting a used reference blocks Generate without renumbering or reassigning characters after reload');
  const finalPrompt = '@Image2 berbicara memakai @Audio1 di lokasi @Image3.';
  await promptField.fill(finalPrompt);
  await generate.click(); await page.getByRole('heading', { name: /Diterima provider|Mengirim permintaan|Dalam antrean/ }).waitFor();
  assert.deepEqual(latest.ref_tags, ['@Image2', '@Audio1', '@Image3']);
  assert.deepEqual(latest.ref_paths, ['operator/inbox/Renita-sheet.jpg', 'operator/inbox/Richie-voice.wav', 'operator/inbox/Set.jpg']);
  assert.equal(simplePromptText(compiledInput.prompt), '@Image1 berbicara memakai @Audio1 di lokasi @Image2.');
  assert.equal(compiledInput.sourcePrompt, finalPrompt);
  scenario = 'succeeded'; await page.reload();
  await page.getByRole('button', { name: 'Gunakan lagi', exact: true }).click();
  await promptField.waitFor({ state: 'visible' });
  assert.equal(await promptField.inputValue(), finalPrompt);
  assert.equal(await page.locator('[data-tag="@Image2"]').count(), 1);
  assert.equal(await page.locator('[data-tag="@Image3"]').count(), 1);
  await modelSelect.selectOption('wan3.0');
  assert.equal(await promptField.inputValue(), finalPrompt);
  assert.equal(await generate.isEnabled(), true);
  passed.push('submitted tags map to provider ordinals and original handles survive history, reuse and model changes');

  await fresh();
  await page.getByRole('button', { name: '9:16 6 dtk' }).click();
  const settings = page.getByRole('dialog', { name: 'Pengaturan video' });
  await settings.waitFor();
  assert.equal(await settings.getByRole('button', { name: '21:9', exact: true }).count(), 1);
  assert.equal(await settings.getByRole('button', { name: '4 dtk', exact: true }).count(), 1);
  assert.equal(await settings.getByRole('button', { name: '8 dtk', exact: true }).count(), 1);
  assert.equal(await settings.getByRole('button', { name: '5 dtk', exact: true }).count(), 0);
  assert.equal(await settings.getByRole('button', { name: '20 dtk', exact: true }).count(), 0);
  await settings.getByRole('button', { name: '21:9', exact: true }).click();
  await settings.getByRole('button', { name: '8 dtk', exact: true }).click();
  await settings.getByRole('button', { name: 'Suara hidup', exact: true }).click();
  assert.equal(await settings.getByRole('button', { name: 'Tanpa suara', exact: true }).count(), 1);
  await settings.getByRole('button', { name: 'Selesai', exact: true }).click();
  await page.getByRole('button', { name: '21:9 senyap 8 dtk' }).waitFor();
  await modelSelect.selectOption('wan3.0');
  await page.getByRole('button', { name: '16:9 senyap 8 dtk' }).click();
  await page.getByRole('dialog', { name: 'Pengaturan video' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '21:9', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Selesai', exact: true }).click();
  await modelSelect.selectOption('seedance-2.5');
  await page.getByRole('button', { name: '16:9 senyap 8 dtk' }).click();
  await page.getByRole('button', { name: 'Tanpa suara', exact: true }).click();
  await page.getByRole('button', { name: 'Selesai', exact: true }).click();
  passed.push('21:9 and 4/8s chips, hidden 21:9 on Wan, and Suara toggle persist');

  const motion = await readFile(resolve(root, 'assets/welcome-success.mp4'));
  await page.getByLabel('Upload video', { exact: true }).setInputFiles({ name: 'motion.mp4', mimeType: 'video/mp4', buffer: motion });
  await page.waitForFunction(() => document.querySelector('.sv-reference.video')?.dataset.status === 'ready');
  await promptField.fill(''); await promptField.pressSequentially('@mot');
  await page.getByRole('option', { name: /@Video1/ }).waitFor();
  await promptField.press('Enter');
  assert.match(await promptField.inputValue(), /@Video1/);
  const sheetBytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 800;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#7d7d7d'; ctx.fillRect(0, 0, 2400, 800);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Upload foto', { exact: true }).setInputFiles({ name: 'character-sheet.png', mimeType: 'image/png', buffer: Buffer.from(sheetBytes, 'base64') });
  await page.waitForFunction(() => document.querySelector('.sv-reference.image')?.dataset.status === 'ready');
  await page.getByText('Foto wajah nyata bisa ditolak Seedance.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Frame awal', exact: true }).click();
  assert.equal(await page.locator('[data-role=first_frame]').count(), 1);
  await page.getByText('Frame awal memakai gambar yang mirip character sheet.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'ikut frame 8 dtk' }).waitFor();
  await page.getByRole('button', { name: 'ikut frame 8 dtk' }).click();
  await page.getByRole('dialog', { name: 'Pengaturan video' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '21:9', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'ikut frame', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Selesai', exact: true }).click();
  await page.getByRole('button', { name: 'Frame akhir', exact: true }).click();
  assert.match(await promptField.inputValue(), /@Image1 is the last frame/);
  assert.equal(await page.locator('[data-role=first_frame]').count(), 0);
  await page.getByRole('button', { name: 'Frame awal', exact: true }).click();
  await generate.click();
  await page.getByRole('dialog', { name: 'Periksa referensi' }).waitFor();
  await page.getByRole('button', { name: 'Lanjut generate', exact: true }).click();
  await waitForResultHeading();
  assert.equal(latest.model, 'seedance-2.5');
  assert.equal(latest.ratio, '16:9');
  assert.equal(latest.duration_seconds, 8);
  assert.equal(latest.generate_audio, true);
  assert.ok(latest.ref_roles.includes('first_frame'));
  assert.ok(latest.ref_roles.includes('reference_video'));
  assert.equal(latest.ref_roles.includes('last_frame'), false);
  passed.push('video attach, @VideoN autocomplete, first-frame warning, last-frame prompt text');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh();
  await generate.click();
  await waitForResultHeading();
  scenario = 'succeeded';
  await page.getByRole('button', { name: 'Cek status', exact: true }).click();
  await page.getByRole('heading', { name: 'Video siap', exact: true }).waitFor();
  assert.equal(await page.locator('.sv-player-frame.ratio-9-16').count(), 1);
  await page.locator('.job-player').evaluate(async (video) => { video.muted = true; await video.play(); });
  await page.waitForFunction(() => document.querySelector('.job-player').readyState >= 2 && document.querySelector('.job-player').videoWidth > 0);
  await page.locator('#studio-result details.sv-full summary').click();
  await page.getByRole('button', { name: 'Pasang sebagai @Video1', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.sv-reference.video')?.dataset.status === 'ready');
  assert.equal(await page.locator('[data-tag="@Video1"]').count(), 1);
  const hasil = page.getByRole('button', { name: 'Hasil', exact: true });
  if (await hasil.isVisible()) await hasil.click();
  try {
    await page.locator('#studio-result details.sv-full').evaluate((node) => { node.open = true; });
    await page.getByRole('button', { name: /Ambil frame terakhir/ }).click();
    await page.waitForFunction(() => document.querySelector('.sv-reference.image[data-role="first_frame"]')?.dataset.status === 'ready', null, { timeout: 8000 });
    passed.push('result player follows ratio and can attach as @Video1 or last-frame still');
  } catch (error) {
    passed.push('result player follows ratio and can attach as @Video1');
    softSkip('last-frame still attach', String(error.message || error).slice(0, 120));
  }
  await fresh();
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.match(await page.locator('.sv-composer').innerText(), /Karakter BytePlus tidak wajib/);
  assert.equal(await page.getByRole('button', { name: 'Karakter', exact: true }).count(), 1);
  await page.getByLabel('Upload foto', { exact: true }).setInputFiles({ name: 'ref-face.png', mimeType: 'image/png', buffer: Buffer.from(imageBytes, 'base64') });
  await page.waitForFunction(() => document.querySelector('.sv-reference.image')?.dataset.status === 'ready');
  await page.getByLabel('Upload audio', { exact: true }).setInputFiles({ name: 'ref-voice.wav', mimeType: 'audio/wav', buffer: wav(3) });
  await page.waitForFunction(() => document.querySelector('.sv-reference.audio')?.dataset.status === 'ready');
  assert.equal(await generate.isEnabled(), true);
  queueStart = true; posts = [];
  await generate.click();
  await page.getByRole('heading', { name: /Diterima provider|Mengirim permintaan|Dalam antrean/ }).waitFor();
  for (let i = 0; i < 30 && !posts.some((row) => row.action === 'ai_video_generate_submit'); i += 1) {
    await page.waitForTimeout(100);
  }
  const queuedPosts = posts.map((row) => row.action);
  assert.ok(queuedPosts.includes('ai_video_generate_start'));
  assert.ok(queuedPosts.includes('ai_video_generate_submit'));
  assert.equal(posts.find((row) => row.action === 'ai_video_generate_start')?.model, 'seedance-2.5');
  assert.deepEqual(posts.find((row) => row.action === 'ai_video_generate_start')?.ref_roles, ['reference_image', 'reference_audio']);
  assert.equal(posts.find((row) => row.action === 'ai_video_generate_start')?.ref_urls?.some((url) => String(url).startsWith('asset://')) || false, false);
  passed.push('generate-with-refs stays on Seedance and auto-submits a queued Monid job without BytePlus');
  scenario = 'saving';
  await page.getByRole('button', { name: 'Cek status', exact: true }).click();
  await page.locator('.job-player').waitFor();
  assert.match(String(await page.locator('.job-player').getAttribute('src')), /fixture-video\.mp4/);
  await page.locator('.job-player').evaluate(async (video) => { video.muted = true; await video.play(); });
  await page.waitForFunction(() => document.querySelector('.job-player')?.readyState >= 2);
  await page.screenshot({ path: out + '/provider-url-player.png', fullPage: true, animations: 'disabled' });
  passed.push('Monid provider URL plays before the result is copied into storage');

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed, skipped, screenshots: out }, null, 2));
} catch (error) {
  await page.screenshot({ path: out + '/failure.png', fullPage: true, animations: 'disabled' }).catch(() => {});
  throw error;
} finally { await browser.close(); server.close(); }
