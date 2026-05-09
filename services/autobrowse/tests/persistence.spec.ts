import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  paths,
  ensureDirs,
  loadCaptures,
  writeSpec,
  readSpec,
  nextSessionIndex,
} from '../src/lib/persistence.ts'
import { synthesize } from '../src/synthesize/index.ts'
import { tokopediaSearchSession } from './_helpers/fixtures.ts'

async function makeTmpBase(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), 'autobrowse-test-'))
}

test('paths: defaults to ~/.weuseai/autobrowse/<slug>/', () => {
  const p = paths('test-slug')
  assert.match(p.baseDir, /weuseai\/autobrowse\/test-slug$/)
  assert.match(p.capturesDir, /captures$/)
  assert.match(p.synthesizedDir, /synthesized$/)
  assert.match(p.iteratedDir, /iterated$/)
  assert.match(p.graduatedDir, /graduated$/)
})

test('paths: baseOverride wins', () => {
  const p = paths('test-slug', '/custom/base')
  assert.equal(p.baseDir, '/custom/base')
  assert.equal(p.capturesDir, '/custom/base/captures')
})

test('ensureDirs: creates all 4 subdirs', async () => {
  const base = await makeTmpBase()
  const p = paths('test-slug', base)
  await ensureDirs(p)
  for (const d of [p.capturesDir, p.synthesizedDir, p.iteratedDir, p.graduatedDir]) {
    const stat = await fs.stat(d)
    assert.equal(stat.isDirectory(), true)
  }
  await fs.rm(base, { recursive: true })
})

test('loadCaptures: reads all *.session.json in lex order', async () => {
  const base = await makeTmpBase()
  const p = paths('test-slug', base)
  await ensureDirs(p)
  const a = tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'a', productTitle: 'A', productPrice: 'X' })
  const b = tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'b', productTitle: 'B', productPrice: 'Y' })
  // Override the slug to match
  a.skillSlug = 'test-slug'
  b.skillSlug = 'test-slug'
  await fs.writeFile(join(p.capturesDir, 'test-slug-1.session.json'), JSON.stringify(a))
  await fs.writeFile(join(p.capturesDir, 'test-slug-2.session.json'), JSON.stringify(b))
  const loaded = await loadCaptures(p)
  assert.equal(loaded.length, 2)
  assert.equal(loaded[0].sessionId, a.sessionId)
  assert.equal(loaded[1].sessionId, b.sessionId)
  await fs.rm(base, { recursive: true })
})

test('loadCaptures: returns empty array when capturesDir missing', async () => {
  const base = await makeTmpBase()
  const p = paths('test-slug', base)
  // ensureDirs NOT called
  const loaded = await loadCaptures(p)
  assert.deepEqual(loaded, [])
  await fs.rm(base, { recursive: true })
})

test('writeSpec + readSpec round-trip', async () => {
  const base = await makeTmpBase()
  const p = paths('test-slug', base)
  await ensureDirs(p)
  const spec = synthesize([
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'q', productTitle: 'T', productPrice: 'P' }),
  ])
  spec.skillSlug = 'test-slug'
  await writeSpec(p.synthesizedSpec, spec)
  const loaded = await readSpec(p.synthesizedSpec)
  assert.equal(loaded.skillSlug, 'test-slug')
  assert.equal(loaded.steps.length, spec.steps.length)
  await fs.rm(base, { recursive: true })
})

test('nextSessionIndex: empty dir → 1', async () => {
  const base = await makeTmpBase()
  const p = paths('test-slug', base)
  await ensureDirs(p)
  assert.equal(await nextSessionIndex(p, 'test-slug'), 1)
  await fs.rm(base, { recursive: true })
})

test('nextSessionIndex: max idx + 1 from existing files', async () => {
  const base = await makeTmpBase()
  const p = paths('test-slug', base)
  await ensureDirs(p)
  await fs.writeFile(join(p.capturesDir, 'test-slug-1.session.json'), '{}')
  await fs.writeFile(join(p.capturesDir, 'test-slug-3.session.json'), '{}')
  await fs.writeFile(join(p.capturesDir, 'test-slug-7.session.json'), '{}')
  assert.equal(await nextSessionIndex(p, 'test-slug'), 8)
  await fs.rm(base, { recursive: true })
})

test('nextSessionIndex: ignores non-matching files', async () => {
  const base = await makeTmpBase()
  const p = paths('test-slug', base)
  await ensureDirs(p)
  await fs.writeFile(join(p.capturesDir, 'other-slug-99.session.json'), '{}')
  await fs.writeFile(join(p.capturesDir, 'test-slug-1.session.json'), '{}')
  await fs.writeFile(join(p.capturesDir, 'test-slug-x.session.json'), '{}')   // non-numeric
  assert.equal(await nextSessionIndex(p, 'test-slug'), 2)
  await fs.rm(base, { recursive: true })
})
