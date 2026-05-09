/**
 * Q6=C lock guard: provisioning service's DEFAULT_HERMES_VERSION must
 * match the v0.13.x range. If a future commit upgrades to v0.14+
 * unintentionally, this test fails before deploy.
 *
 * Reads the source file (not the compiled output) so test catches
 * drift even when the consuming service hasn't been built.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { HERMES_VERSION_RANGE_RE } from '../src/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SETUP_SCRIPT_PATH = resolve(
  __dirname,
  '../../../services/provisioning/src/setup-script.ts',
)

test('Q6=C: DEFAULT_HERMES_VERSION in setup-script.ts matches v0.13.x range', () => {
  const source = readFileSync(SETUP_SCRIPT_PATH, 'utf8')
  const match = source.match(/DEFAULT_HERMES_VERSION\s*=\s*['"]([^'"]+)['"]/)
  assert.ok(match, 'expected DEFAULT_HERMES_VERSION = "..." in setup-script.ts')
  const version = match![1]
  assert.match(
    version,
    HERMES_VERSION_RANGE_RE,
    `Q6=C locked v0.13.x; setup-script.ts has "${version}". Update either the pin or the spec lock.`,
  )
})

test('HERMES_VERSION_RANGE_RE accepts v0.13.0, v0.13.1, v0.13.99', () => {
  assert.match('v0.13.0', HERMES_VERSION_RANGE_RE)
  assert.match('v0.13.1', HERMES_VERSION_RANGE_RE)
  assert.match('v0.13.99', HERMES_VERSION_RANGE_RE)
  assert.match('0.13.0', HERMES_VERSION_RANGE_RE)   // optional v prefix
})

test('HERMES_VERSION_RANGE_RE rejects out-of-range', () => {
  assert.doesNotMatch('v0.14.0', HERMES_VERSION_RANGE_RE)
  assert.doesNotMatch('v0.12.0', HERMES_VERSION_RANGE_RE)
  assert.doesNotMatch('v1.0.0', HERMES_VERSION_RANGE_RE)
  assert.doesNotMatch('v0.13', HERMES_VERSION_RANGE_RE)   // missing patch
  assert.doesNotMatch('v0.13.x', HERMES_VERSION_RANGE_RE) // not a real tag
})
