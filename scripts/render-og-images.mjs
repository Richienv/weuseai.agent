#!/usr/bin/env node
/**
 * render-og-images.mjs — render per-page Open Graph images (1200x630) to assets/.
 *
 * Kenapa: semua halaman dulu memakai satu og-image.png yang sama, jadi share
 * link harga / FAQ / use-cases previewnya identik. Skrip ini merender preview
 * bertema per halaman dengan gaya yang sama persis: latar #0a0a0a, pendar merah
 * radial dari kanan bawah, grid halus, wordmark di kiri atas, judul besar
 * Plus Jakarta Sans 800, sub abu-abu, pil di bawah.
 *
 * Semua teks di sini DIAMBIL VERBATIM dari isi halaman terkait. Tidak ada angka
 * atau klaim yang dikarang.
 *
 * Jalankan ulang kapan saja:
 *   node scripts/render-og-images.mjs
 *   node scripts/render-og-images.mjs harga faq     # subset
 *
 * Butuh Playwright (sudah terpasang global di mesin dev).
 */

import { writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const OUT_DIR = path.join(REPO, 'assets');

const WIDTH = 1200;
const HEIGHT = 630;
const MAX_BYTES = 250 * 1024;

// Urutan sengaja: instalasi global lebih dulu, karena itu yang punya browser
// binary terunduh di mesin dev ini. `playwright` dari node_modules repo dipakai
// sebagai cadangan.
const PLAYWRIGHT_CANDIDATES = [
  'file:///opt/homebrew/lib/node_modules/playwright/index.mjs',
  'file:///usr/local/lib/node_modules/playwright/index.mjs',
  'playwright',
];

/**
 * Tiap entri = satu gambar. `title` dipecah per baris supaya patahannya
 * terkontrol (bukan hasil word-wrap yang acak).
 *
 * Sumber teks:
 *  - harga     : index.html / assets/app.jsx section Pricing
 *  - faq       : faq.html <h1> + .sub
 *  - use-cases : use-cases.html <h1> + sub-copy
 */
const SPECS = [
  {
    key: 'harga',
    file: 'og-harga.png',
    eyebrow: 'HARGA',
    title: [
      { text: 'Pilih ukuran', accent: false },
      { text: 'tim kamu.', accent: true },
    ],
    sub: 'Bayar setup sekali. Hosting transparan,\nbisa pause kapan saja.',
    pills: ['weuseai.id/#pricing', 'Berhenti kapan saja'],
  },
  {
    key: 'faq',
    file: 'og-faq.png',
    eyebrow: 'FAQ',
    title: [
      { text: 'Pertanyaan yang', accent: false },
      { text: 'sering muncul.', accent: true },
    ],
    sub: 'Jawaban jujur, sebelum kamu mulai.\nSetup, keamanan data, dan biaya.',
    pills: ['weuseai.id/faq', 'Tanpa janji berlebihan'],
  },
  {
    key: 'use-cases',
    file: 'og-use-cases.png',
    eyebrow: 'USE CASES',
    title: [
      { text: '40 cara AI bikin', accent: false },
      { text: 'hidup kamu lebih enak.', accent: true },
    ],
    sub: 'Buat 8 profesi — agen properti, anak kuliahan,\ncontent creator, pemilik UMKM, dan lainnya.',
    pills: ['weuseai.id/use-cases', '40 skenario nyata'],
    titleSize: 76,
  },
];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function template(spec) {
  const titleSize = spec.titleSize || 84;
  const titleHtml = spec.title
    .map(
      (line) =>
        `<span class="line${line.accent ? ' accent' : ''}">${esc(line.text)}</span>`,
    )
    .join('');
  const subHtml = esc(spec.sub).split('\n').join('<br>');
  const pillsHtml = spec.pills
    .map((p) => `<span class="pill">${esc(p)}</span>`)
    .join('');

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;800&family=JetBrains+Mono:wght@400;500&display=block" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}
  body{
    background:#0a0a0a;
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;
    position:relative;
  }
  /* pendar merah radial dari kanan bawah */
  .glow{
    position:absolute;inset:0;
    background:radial-gradient(120% 120% at 100% 100%,
      rgba(229,50,45,0.38) 0%,
      rgba(229,50,45,0.17) 26%,
      rgba(229,50,45,0.055) 48%,
      rgba(10,10,10,0) 68%);
  }
  /* grid halus */
  .grid{
    position:absolute;inset:0;
    background-image:
      linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px);
    background-size:60px 60px;
    mask-image:linear-gradient(to bottom right, rgba(0,0,0,0.55), rgba(0,0,0,1));
    -webkit-mask-image:linear-gradient(to bottom right, rgba(0,0,0,0.55), rgba(0,0,0,1));
  }
  .frame{position:absolute;inset:0;padding:64px 78px;display:flex;flex-direction:column}
  /* wordmark */
  .top{display:flex;align-items:center;justify-content:space-between}
  .mark{display:flex;align-items:center;gap:18px}
  .badge{
    width:44px;height:44px;border-radius:12px;
    background:linear-gradient(150deg,#F0544F,#E5322D 55%,#B71F1B);
    box-shadow:0 0 34px rgba(229,50,45,0.55);
    display:flex;align-items:center;justify-content:center;
  }
  .badge svg{width:22px;height:22px}
  .wordmark{font-size:31px;font-weight:800;letter-spacing:-0.035em;color:#f5f2ef}
  .wordmark .dot{color:#E5322D}
  .eyebrow{
    font-family:'JetBrains Mono',ui-monospace,monospace;
    font-size:14px;font-weight:500;letter-spacing:0.22em;
    color:rgba(245,242,239,0.42);text-transform:uppercase;
  }
  .body{flex:1;display:flex;flex-direction:column;justify-content:center;padding-bottom:8px}
  h1{
    font-size:${titleSize}px;font-weight:800;line-height:1.02;
    letter-spacing:-0.045em;color:#f5f2ef;display:flex;flex-direction:column;
  }
  h1 .accent{color:#E5322D}
  .sub{
    margin-top:30px;font-size:25px;font-weight:400;line-height:1.42;
    letter-spacing:-0.012em;color:rgba(245,242,239,0.56);max-width:800px;
  }
  .pills{display:flex;gap:14px;align-items:center}
  .pill{
    font-family:'JetBrains Mono',ui-monospace,monospace;
    font-size:15px;color:rgba(245,242,239,0.78);
    padding:11px 22px;border-radius:999px;
    border:1px solid rgba(245,242,239,0.16);
    background:rgba(245,242,239,0.045);
  }
</style></head>
<body>
  <div class="glow"></div>
  <div class="grid"></div>
  <div class="frame">
    <div class="top">
      <div class="mark">
        <div class="badge"><svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2.6l2.15 5.7 5.7 2.15-5.7 2.15L12 18.3l-2.15-5.7-5.7-2.15 5.7-2.15z"/></svg></div>
        <div class="wordmark">weuseai<span class="dot">.agent</span></div>
      </div>
      <div class="eyebrow">${esc(spec.eyebrow)}</div>
    </div>
    <div class="body">
      <h1>${titleHtml}</h1>
      <div class="sub">${subHtml}</div>
    </div>
    <div class="pills">${pillsHtml}</div>
  </div>
</body></html>`;
}

// Impor sekaligus launch: sebuah instalasi playwright bisa ada tapi browser
// binary-nya belum terunduh, jadi satu-satunya bukti nyata adalah launch sukses.
async function launchBrowser() {
  let lastErr;
  for (const c of PLAYWRIGHT_CANDIDATES) {
    try {
      const mod = await import(c);
      if (!mod?.chromium) continue;
      return await mod.chromium.launch();
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    'Playwright tidak bisa dipakai. Coba `npx playwright install`. Detail terakhir: ' +
      (lastErr?.message || 'unknown'),
  );
}

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const specs = wanted.length
    ? SPECS.filter((s) => wanted.includes(s.key) || wanted.includes(s.file))
    : SPECS;

  if (!specs.length) {
    console.error(
      'Tidak ada spec cocok. Pilihan: ' + SPECS.map((s) => s.key).join(', '),
    );
    process.exitCode = 1;
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });

  let oversize = 0;
  for (const spec of specs) {
    const html = template(spec);
    await page.setContent(html, { waitUntil: 'networkidle' });
    // beri waktu webfont selesai dipakai sebelum capture
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);

    const buf = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    });
    const out = path.join(OUT_DIR, spec.file);
    await writeFile(out, buf);
    const { size } = await stat(out);
    const kb = (size / 1024).toFixed(1);
    const ok = size <= MAX_BYTES;
    if (!ok) oversize++;
    console.log(
      `${ok ? 'ok  ' : 'BESAR'} assets/${spec.file}  ${WIDTH}x${HEIGHT}  ${kb} KB${ok ? '' : `  (batas ${MAX_BYTES / 1024} KB)`}`,
    );
  }

  await browser.close();

  if (oversize) {
    console.error(
      `\n${oversize} berkas melewati batas ${MAX_BYTES / 1024} KB. Kurangi gradien / grid.`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
