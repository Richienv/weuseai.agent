/**
 * Minimal USTAR tar.gz writer — Persona Genesis packager.
 *
 * The customer VPS extracts these with GNU `tar -xzf`, so beyond the
 * round-trip checks we verify the binary header layout (magic, checksum,
 * size field) against the USTAR spec.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildTar,
  buildTarGz,
  gunzipBytes,
  parseTar,
} from '../supabase/functions/_shared/tar-gz.ts'

const ENTRIES = [
  { path: 'manifest.json', content: '{"agent_slug":"custom-x"}' },
  { path: 'SOUL.md', content: '# About me\n\nAku asisten kamu.\n' },
  { path: 'skills/morning-update/SKILL.md', content: '# skill\n\nisi skill yang cukup panjang.\n' },
  { path: 'templates/laporan-harian.md', content: '# Template\n\n{tanggal}\n' },
]

test('tar → parse round-trip preserves paths + content exactly', () => {
  const tar = buildTar(ENTRIES)
  const back = parseTar(tar)
  assert.deepEqual(back, ENTRIES)
})

test('tar.gz → gunzip → parse round-trip', async () => {
  const gz = await buildTarGz(ENTRIES)
  // gzip magic bytes
  assert.equal(gz[0], 0x1f)
  assert.equal(gz[1], 0x8b)
  const back = parseTar(await gunzipBytes(gz))
  assert.deepEqual(back, ENTRIES)
})

test('USTAR header: magic, checksum and 512-alignment are correct', () => {
  const tar = buildTar([{ path: 'a.txt', content: 'hello' }])
  // magic at 257
  assert.equal(new TextDecoder().decode(tar.subarray(257, 262)), 'ustar')
  // archive length = header + 1 padded block + 2 end blocks
  assert.equal(tar.length, 512 + 512 + 1024)
  // checksum: recompute with checksum field as spaces
  const block = tar.slice(0, 512)
  const stored = parseInt(new TextDecoder().decode(block.subarray(148, 156)).replace(/\0.*$/, '').trim(), 8)
  for (let i = 148; i < 156; i++) block[i] = 0x20
  let sum = 0
  for (let i = 0; i < 512; i++) sum += block[i]
  assert.equal(stored, sum)
})

test('real GNU/BSD tar can list and extract our archive', async () => {
  const gz = await buildTarGz(ENTRIES)
  const dir = mkdtempSync(join(tmpdir(), 'weuseai-tar-'))
  try {
    const file = join(dir, 'bundle.tar.gz')
    writeFileSync(file, gz)
    execFileSync('tar', ['-xzf', file, '-C', dir])
    const soul = readFileSync(join(dir, 'SOUL.md'), 'utf8')
    assert.equal(soul, ENTRIES[1].content)
    const skill = readFileSync(join(dir, 'skills/morning-update/SKILL.md'), 'utf8')
    assert.equal(skill, ENTRIES[2].content)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('UTF-8 (Bahasa + diacritics) survives the round trip', async () => {
  const entries = [{ path: 'SOUL.md', content: 'Sapa customer pakai nama — André, Putri. Émojis: 🙂' }]
  const back = parseTar(await gunzipBytes(await buildTarGz(entries)))
  assert.deepEqual(back, entries)
})

test('path longer than 100 bytes throws (bundle paths are short by design)', () => {
  assert.throws(() => buildTar([{ path: 'x/'.repeat(60) + 'f.md', content: 'a' }]))
})
