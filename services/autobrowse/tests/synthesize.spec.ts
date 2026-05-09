import { test } from 'node:test'
import assert from 'node:assert/strict'

import { synthesize } from '../src/synthesize/index.ts'
import { tokopediaSearchSession, singleClickSession } from './_helpers/fixtures.ts'

test('synthesize: 3 sessions of Tokopedia search → SkillSpec with search_query param + product title/price outputs', () => {
  const spec = synthesize(
    [
      tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'iphone', productTitle: 'iPhone 14', productPrice: 'Rp 15jt' }),
      tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'macbook', productTitle: 'MacBook Pro', productPrice: 'Rp 30jt' }),
      tokopediaSearchSession({ sessionIdx: 3, searchQuery: 'airpods', productTitle: 'AirPods', productPrice: 'Rp 3jt' }),
    ],
    { displayName: 'Tokopedia Product Search', triggerPhrases: ['cari produk di tokopedia'] },
  )
  assert.equal(spec.skillSlug, 'tokopedia-product-search')
  assert.equal(spec.displayName, 'Tokopedia Product Search')
  assert.equal(spec.sourceSessionCount, 3)
  assert.deepEqual(spec.triggerPhrases, ['cari produk di tokopedia'])

  // search_query parameter detected
  assert.equal(spec.parameters.length, 1)
  assert.equal(spec.parameters[0].name, 'search_query')

  // 2 outputs: product title + product price
  assert.equal(spec.output.length, 2)
  const names = spec.output.map((o) => o.name).sort()
  assert.deepEqual(names, ['product_price', 'product_title'])

  // Steps include navigate + type + click + wait + click + extract + extract = 7
  assert.equal(spec.steps.length, 7)
  assert.equal(spec.steps[0].kind, 'navigate')
  assert.equal(spec.steps[1].kind, 'type')
  assert.equal(spec.steps[2].kind, 'click')
  assert.equal(spec.steps[6].kind, 'extract')
})

test('synthesize: rejects mismatched skill slugs across sessions', () => {
  const a = singleClickSession('skill-a')
  const b = singleClickSession('skill-b')
  assert.throws(() => synthesize([a, b]), /must share skillSlug/)
})

test('synthesize: empty session list throws', () => {
  assert.throws(() => synthesize([]), /at least one capture/)
})

test('synthesize: prefers data-testid over CSS in steps[].selector (search input)', () => {
  const spec = synthesize([
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'a', productTitle: 'A', productPrice: 'X' }),
    tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'b', productTitle: 'B', productPrice: 'Y' }),
  ])
  // The type step (idx 1) — its selector should be the testid one (highest stability).
  const typeStep = spec.steps[1]
  assert.equal(typeStep.kind, 'type')
  if (typeStep.kind === 'type') {
    assert.equal(typeStep.selector.kind, 'testid')
    if (typeStep.selector.kind === 'testid') {
      assert.equal(typeStep.selector.value, 'search-input')
    }
  }
})

test('synthesize: extract output selectors prefer data-testid (product price)', () => {
  const spec = synthesize([
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'a', productTitle: 'A', productPrice: 'X' }),
    tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'b', productTitle: 'B', productPrice: 'Y' }),
  ])
  const priceOutput = spec.output.find((o) => o.name === 'product_price')
  assert.ok(priceOutput)
  assert.equal(priceOutput!.selector.kind, 'testid')
})

test('synthesize: notes track session count + literal detection + divergence', () => {
  const spec = synthesize([
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'fixed', productTitle: 'A', productPrice: 'X' }),
    tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'fixed', productTitle: 'B', productPrice: 'Y' }),
  ])
  assert.ok(spec.notes.some((n) => n.includes('2 session')))
  assert.ok(spec.notes.some((n) => n.includes('literal')))
})

test('synthesize: selector confidence reflects coverage across sessions', () => {
  const spec = synthesize([
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'a', productTitle: 'A', productPrice: 'X' }),
    tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'b', productTitle: 'B', productPrice: 'Y' }),
  ])
  // Every step is in both sessions → confidence 1.0 across the board.
  for (const key of Object.keys(spec.selectorConfidence)) {
    assert.equal(spec.selectorConfidence[key], 1.0)
  }
})

test('synthesize: outputs marked always_present when ALL sessions extracted them', () => {
  const spec = synthesize([
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'a', productTitle: 'A', productPrice: 'X' }),
    tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'b', productTitle: 'B', productPrice: 'Y' }),
  ])
  for (const o of spec.output) assert.equal(o.always_present, true)
})

test('synthesize: spec.version is locked to autobrowse/skill-spec/v1', () => {
  const spec = synthesize([singleClickSession('test-slug')])
  assert.equal(spec.version, 'autobrowse/skill-spec/v1')
})
