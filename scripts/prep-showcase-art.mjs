#!/usr/bin/env node
/*
 * Downscale the four showcase engravings to the size the landing actually needs.
 *
 *   node scripts/prep-showcase-art.mjs [sourceDir]      # default: ~/Downloads
 *
 * Reads sc-duit / sc-jualan / sc-dokumen / sc-pribadi (any of .jpg/.jpeg/.png/.webp)
 * from sourceDir and writes 760x428 JPEG q0.8 into assets/.
 *
 * WHY THE SIZE IS FIXED
 * The originals are ~1672x941 at ~885 KB. Four of them at ~5x their display size,
 * each sitting under a `mix-blend-mode:color` layer and a scrim with an infinite
 * sweep animation on top, pegged the main thread and made the page
 * non-interactive. Shipping anything larger re-creates that. 760x428 is 2x the
 * 380x214 display box — enough for retina, and nothing more.
 *
 * Uses macOS `sips` (preinstalled) so this adds no dependency to the repo.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, mkdtempSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, homedir } from 'node:os';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = process.argv[2] || join(homedir(), 'Downloads');
const NAMES = ['sc-duit', 'sc-jualan', 'sc-dokumen', 'sc-pribadi'];
const EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG'];
const W = 760, H = 428;

const find = (base) => {
  for (const e of EXTS) {
    const p = join(SRC_DIR, base + e);
    if (existsSync(p)) return p;
  }
  return null;
};

const missing = NAMES.filter((n) => !find(n));
if (missing.length) {
  console.error(`\nTidak ketemu di ${SRC_DIR}:`);
  for (const m of missing) console.error(`  ${m}.jpg  (atau .png / .jpeg / .webp)`);
  console.error(`\nSimpan keempatnya dengan nama itu, lalu jalankan lagi.\n`);
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'sc-art-'));
let total = 0;
console.log('');
for (const name of NAMES) {
  const src = find(name);
  const work = join(tmp, name + '.jpg');
  copyFileSync(src, work);
  // resampleHeightWidth stretches to exactly WxH. The sources are 16:9, same as
  // the target, so nothing is distorted; a non-16:9 source would letterbox-stretch
  // and that is worth seeing rather than silently cropping.
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80',
    '--resampleHeightWidth', String(H), String(W), work, '--out', work],
    { stdio: 'ignore' });
  const out = join(REPO, 'assets', `${name}.jpg`);
  copyFileSync(work, out);
  const kb = statSync(out).size / 1024;
  total += kb;
  const dim = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', out])
    .toString().match(/pixelWidth: (\d+)[\s\S]*pixelHeight: (\d+)/);
  console.log(`  assets/${name}.jpg  ${dim[1]}x${dim[2]}  ${kb.toFixed(0)} KB`);
}
console.log(`\n  total ${total.toFixed(0)} KB untuk empat gambar\n`);
if (total > 700) {
  console.error('  PERINGATAN: lebih berat dari ~480 KB yang diharapkan. Periksa sumbernya.\n');
}
