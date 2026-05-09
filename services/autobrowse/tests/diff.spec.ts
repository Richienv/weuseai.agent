import { test } from 'node:test'
import assert from 'node:assert/strict'

import { diffSpecs } from '../src/iterate/diff.ts'
import { synthesize } from '../src/synthesize/index.ts'
import { tokopediaSearchSession } from './_helpers/fixtures.ts'

test('diffSpecs: identical specs → empty diff', () => {
  const sessions = [
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'a', productTitle: 'A', productPrice: 'X' }),
    tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'b', productTitle: 'B', productPrice: 'Y' }),
  ]
  const a = synthesize(sessions)
  const b = synthesize(sessions)
  const diff = diffSpecs(a, b)
  assert.equal(diff.selectorChanges.length, 0)
  assert.equal(diff.parametersAdded.length, 0)
  assert.equal(diff.parametersRemoved.length, 0)
  assert.equal(diff.outputAdded.length, 0)
  assert.equal(diff.outputRemoved.length, 0)
})

test('diffSpecs: output selector kind change → recorded as selector change', () => {
  const before = synthesize([
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'a', productTitle: 'A', productPrice: 'X' }),
  ])
  const after = synthesize([
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'a', productTitle: 'A', productPrice: 'X' }),
  ])
  // Mutate after.output[0].selector
  after.output[0].selector = { kind: 'css', value: 'h1.new-title' }
  const diff = diffSpecs(before, after)
  assert.equal(diff.selectorChanges.length, 1)
  assert.equal(diff.selectorChanges[0].field, after.output[0].name)
  assert.equal(diff.selectorChanges[0].after.kind, 'css')
})

test('diffSpecs: parameter added → reported in parametersAdded', () => {
  const a = synthesize([
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'a', productTitle: 'A', productPrice: 'X' }),
    tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'b', productTitle: 'B', productPrice: 'Y' }),
  ])
  const b = JSON.parse(JSON.stringify(a)) as typeof a
  b.parameters.push({
    name: 'extra_filter',
    type: 'string',
    required: false,
    description: 'new filter parameter',
    examples: ['promo'],
  })
  const diff = diffSpecs(a, b)
  assert.equal(diff.parametersAdded.length, 1)
  assert.equal(diff.parametersAdded[0].name, 'extra_filter')
  assert.equal(diff.parametersRemoved.length, 0)
})

test('diffSpecs: parameter removed → reported in parametersRemoved', () => {
  const a = synthesize([
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'a', productTitle: 'A', productPrice: 'X' }),
    tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'b', productTitle: 'B', productPrice: 'Y' }),
  ])
  const b = JSON.parse(JSON.stringify(a)) as typeof a
  b.parameters = []
  const diff = diffSpecs(a, b)
  assert.equal(diff.parametersRemoved.length, 1)
  assert.equal(diff.parametersRemoved[0].name, 'search_query')
})

test('diffSpecs: step selector kind change → reported as step_N_<kind>', () => {
  const a = synthesize([
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'a', productTitle: 'A', productPrice: 'X' }),
    tokopediaSearchSession({ sessionIdx: 2, searchQuery: 'b', productTitle: 'B', productPrice: 'Y' }),
  ])
  const b = JSON.parse(JSON.stringify(a)) as typeof a
  // Mutate the type step selector (index 1).
  if (b.steps[1].kind === 'type') {
    b.steps[1].selector = { kind: 'css', value: '.new-search-input' }
  }
  const diff = diffSpecs(a, b)
  assert.ok(diff.selectorChanges.some((c) => c.field === 'step_1_type'))
})

test('diffSpecs: output added (after has more output fields)', () => {
  const a = synthesize([
    tokopediaSearchSession({ sessionIdx: 1, searchQuery: 'a', productTitle: 'A', productPrice: 'X' }),
  ])
  const b = JSON.parse(JSON.stringify(a)) as typeof a
  b.output.push({
    name: 'seller_name',
    type: 'string',
    selector: { kind: 'testid', value: 'seller-name' },
    description: 'Seller name',
    always_present: true,
  })
  const diff = diffSpecs(a, b)
  assert.equal(diff.outputAdded.length, 1)
  assert.equal(diff.outputAdded[0].name, 'seller_name')
})
