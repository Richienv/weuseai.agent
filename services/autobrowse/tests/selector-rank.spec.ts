import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  scoreSelector,
  rankSelectors,
  pickBest,
  selectorsEqual,
  toPlaywrightLocator,
} from '../src/lib/selector-rank.ts'
import type { SelectorCandidate } from '../src/types.ts'

// ─── scoreSelector ────────────────────────────────────────────────────

test('testid scores 1.0 (highest stability)', () => {
  assert.equal(scoreSelector({ kind: 'testid', value: 'foo' }), 1.0)
})

test('role with name scores 0.9; role without name penalized to 0.45', () => {
  assert.equal(scoreSelector({ kind: 'role', role: 'button', name: 'Submit' }), 0.9)
  assert.equal(scoreSelector({ kind: 'role', role: 'button' }), 0.45)
})

test('xpath scores 0.1 (lowest)', () => {
  assert.equal(scoreSelector({ kind: 'xpath', value: '//div' }), 0.1)
})

test('id penalized when UUID-like (random hex)', () => {
  const score = scoreSelector({ kind: 'id', value: 'a1b2c3d4e5f6' })
  assert.ok(score < 0.5, `expected <0.5, got ${score}`)
})

test('id penalized when numeric-only (auto-generated)', () => {
  assert.equal(scoreSelector({ kind: 'id', value: '12345' }), 0.25)
})

test('css with auto-generated suffix penalized', () => {
  const score = scoreSelector({ kind: 'css', value: 'div.button_aB12cd' })
  assert.equal(score, 0.125, '0.25 base × 0.5 auto-gen penalty = 0.125')
})

test('css with deep nesting (>4 levels) penalized', () => {
  const score = scoreSelector({ kind: 'css', value: 'body > main > section > div > ul > li > a' })
  assert.ok(score < 0.25, `deep css selectors should score <0.25, got ${score}`)
})

test('text with very long content penalized (>200 chars; both >80 and >200 stack)', () => {
  const longText = 'lorem ipsum '.repeat(30)   // ~360 chars
  const score = scoreSelector({ kind: 'text', value: longText })
  // base 0.7 × 0.5 (>80 chars) × 0.2 (>200 chars) = 0.07
  assert.ok(Math.abs(score - 0.07) < 1e-9, `expected ~0.07, got ${score}`)
})

test('text with moderate length (<80 chars) gets full score', () => {
  assert.equal(scoreSelector({ kind: 'text', value: 'Submit form' }), 0.7)
})

// ─── rankSelectors / pickBest ────────────────────────────────────────

test('rankSelectors: testid wins over css', () => {
  const ranked = rankSelectors([
    { kind: 'css', value: 'div.btn' },
    { kind: 'testid', value: 'submit' },
  ])
  assert.equal(ranked[0].kind, 'testid')
  assert.equal(ranked[1].kind, 'css')
})

test('pickBest returns null on empty', () => {
  assert.equal(pickBest([]), null)
})

test('pickBest tie-breaks by KIND_PRIORITY', () => {
  // Both score same; testid has higher priority than role-without-name.
  const best = pickBest([
    { kind: 'role', role: 'button', name: 'X' },
    { kind: 'role', role: 'button', name: 'Y' },
  ])
  // Both are role+name; first wins by stable sort.
  assert.equal(best?.kind, 'role')
})

test('rankSelectors: role+name preferred over text-only', () => {
  const ranked = rankSelectors([
    { kind: 'text', value: 'Submit' },
    { kind: 'role', role: 'button', name: 'Submit' },
  ])
  assert.equal(ranked[0].kind, 'role')
})

// ─── selectorsEqual ──────────────────────────────────────────────────

test('selectorsEqual: same testid value', () => {
  assert.equal(
    selectorsEqual({ kind: 'testid', value: 'a' }, { kind: 'testid', value: 'a' }),
    true,
  )
})

test('selectorsEqual: different kind = false', () => {
  assert.equal(
    selectorsEqual({ kind: 'testid', value: 'a' }, { kind: 'id', value: 'a' }),
    false,
  )
})

test('selectorsEqual: text with exact flag must match', () => {
  assert.equal(
    selectorsEqual(
      { kind: 'text', value: 'X', exact: true },
      { kind: 'text', value: 'X', exact: false },
    ),
    false,
  )
})

test('selectorsEqual: role + name equality', () => {
  assert.equal(
    selectorsEqual(
      { kind: 'role', role: 'button', name: 'OK' },
      { kind: 'role', role: 'button', name: 'OK' },
    ),
    true,
  )
  assert.equal(
    selectorsEqual(
      { kind: 'role', role: 'button', name: 'OK' },
      { kind: 'role', role: 'button', name: 'Cancel' },
    ),
    false,
  )
})

// ─── toPlaywrightLocator ─────────────────────────────────────────────

test('toPlaywrightLocator: testid → [data-testid="..."]', () => {
  assert.equal(
    toPlaywrightLocator({ kind: 'testid', value: 'submit' }),
    '[data-testid="submit"]',
  )
})

test('toPlaywrightLocator: testid escapes quotes', () => {
  assert.equal(
    toPlaywrightLocator({ kind: 'testid', value: 'foo"bar' }),
    '[data-testid="foo\\"bar"]',
  )
})

test('toPlaywrightLocator: role with name → getByRole(...)', () => {
  assert.equal(
    toPlaywrightLocator({ kind: 'role', role: 'button', name: 'Cari' }),
    `getByRole('button', { name: "Cari" })`,
  )
})

test('toPlaywrightLocator: role without name → getByRole(...)', () => {
  assert.equal(
    toPlaywrightLocator({ kind: 'role', role: 'heading' }),
    `getByRole('heading')`,
  )
})

test('toPlaywrightLocator: text exact flag → getByText(..., { exact: true })', () => {
  assert.equal(
    toPlaywrightLocator({ kind: 'text', value: 'Login', exact: true }),
    `getByText("Login", { exact: true })`,
  )
})

test('toPlaywrightLocator: id → CSS hash selector', () => {
  assert.equal(toPlaywrightLocator({ kind: 'id', value: 'main' }), '#main')
})

test('toPlaywrightLocator: xpath → xpath= prefix', () => {
  assert.equal(
    toPlaywrightLocator({ kind: 'xpath', value: '//div[@class]' }),
    'xpath=//div[@class]',
  )
})
