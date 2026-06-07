/**
 * Drift gate for the config.yaml model-pin generator (incident 2026-06-07).
 *
 * Root cause that this guards against: a pinned-Hermes update changed the
 * top-level `model:` key in the fresh-install config.yaml from a SCALAR to a
 * DICT block (`model:` parent with an indented `default: <opus>` child). The
 * old generator did `sed 's|^model:.*|model: deepseek/...|'`, which collapsed
 * that dict PARENT into a scalar while leaving the indented child behind —
 * producing invalid YAML ("while parsing a block mapping"). Hermes then
 * discarded the entire config, ran with an EMPTY model, and every OpenRouter
 * request failed `HTTP 400: No models provided` → the customer saw
 * "the model provider failed after retries".
 *
 * The fix must be SHAPE-INDEPENDENT: remove any existing top-level `model:`
 * construct (scalar OR dict + its indented body) and append one canonical
 * nested block. These tests run the REAL generator bash against every shape.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildSetupScript,
  modelPinShellBlock,
} from '../services/provisioning/src/setup-script.ts'

const PINNED = 'deepseek/deepseek-v4-pro'

const GEN_PARAMS = {
  customerId: 'cust-cfgyaml-test',
  tier: 'pro' as const,
  telegramBotToken: '12345:abc',
  telegramAllowedUserIds: '987654',
  openRouterKey: 'sk-or-v1-harness',
  bundleTarBase64: 'fake-bundle-b64',
  fleetSshPubkey: 'ssh-ed25519 AAAAdummy',
  hermesVersion: 'v0.13.0',
}

// Run the production model-pin bash against a config.yaml fixture; return the
// resulting file text.
function runModelPin(initial: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cfgyaml-'))
  const cfg = join(dir, 'config.yaml')
  writeFileSync(cfg, initial)
  const script = `set -e\nCONFIG_YAML='${cfg}'\n${modelPinShellBlock()}\n`
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' })
  const out = readFileSync(cfg, 'utf8')
  rmSync(dir, { recursive: true, force: true })
  assert.equal(r.status, 0, `bash failed (${r.status}): ${r.stderr}`)
  return out
}

// Structural validity: encodes the EXACT failure signature (a scalar
// `key: value` line immediately followed by a more-indented line = an orphaned
// block mapping) plus confirms the canonical pinned block.
function assertValidModelBlock(yaml: string) {
  const lines = yaml.split('\n')
  const modelLines = lines.filter((l) => /^model:/.test(l))
  assert.equal(modelLines.length, 1, `exactly one top-level model: (got ${modelLines.length})`)
  assert.ok(!/^model:[ \t]+\S/m.test(yaml), 'model: must NOT be a scalar (the 2026-06-07 bug shape)')
  assert.match(yaml, /^model:\n {2}default: deepseek\/deepseek-v4-pro$/m, 'canonical model.default block')
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\S.*:\s+\S/.test(lines[i]) && /^\s+\S/.test(lines[i + 1])) {
      assert.fail(`orphaned indent after scalar mapping: "${lines[i]}" -> "${lines[i + 1]}"`)
    }
  }
}

// Current upstream shape: model is a DICT with an opus default child.
const NESTED_FRESH = `# Hermes Agent CLI Configuration
model:
  # Default model to use (can be overridden with --model flag)
  # Both "default" and "model" work as the key name here.
  default: "anthropic/claude-opus-4.6"

  # Inference provider selection comment
terminal:
  scrollback: 1000
`

// Already-corrupted shape (a VPS that the buggy sed already ran on): scalar
// model with orphaned indented children.
const SCALAR_BROKEN = `model: deepseek/deepseek-v4-pro
  # Default model to use
  default: "anthropic/claude-opus-4.6"
terminal:
  scrollback: 1000
`

// No model key at all.
const NO_MODEL = `terminal:
  scrollback: 1000
display:
  tool_progress: "off"
`

test('model-pin: nested dict (current upstream) -> valid canonical deepseek block', () => {
  const out = runModelPin(NESTED_FRESH)
  assertValidModelBlock(out)
  assert.ok(!/anthropic\/claude-opus/.test(out), 'opus default must be removed')
  assert.match(out, /^terminal:$/m, 'sibling top-level keys preserved')
})

test('model-pin: already-broken scalar+orphan -> repaired to valid canonical', () => {
  assertValidModelBlock(runModelPin(SCALAR_BROKEN))
})

test('model-pin: missing model key -> canonical block appended', () => {
  assertValidModelBlock(runModelPin(NO_MODEL))
})

test('model-pin: idempotent across repeated provisions', () => {
  const twice = runModelPin(runModelPin(NESTED_FRESH))
  assertValidModelBlock(twice)
  assert.equal((twice.match(/^model:/gm) || []).length, 1, 'no duplicate model: blocks')
})

// Authoritative real-parser check when ruby/psych is available (it ships with
// macOS + GitHub ubuntu runners). Skips cleanly if absent — the structural
// assertions above are the always-on guarantee.
test('model-pin: output parses as YAML with model.default pinned (ruby)', () => {
  const probe = spawnSync('ruby', ['-ryaml', '-e', 'puts 1'], { encoding: 'utf8' })
  if (probe.status !== 0) { console.log('  (skipped: ruby/psych unavailable)'); return }
  const out = runModelPin(NESTED_FRESH)
  const dir = mkdtempSync(join(tmpdir(), 'cfgyaml-'))
  const cfg = join(dir, 'c.yaml')
  writeFileSync(cfg, out)
  const r = spawnSync(
    'ruby',
    ['-ryaml', '-e',
      `d=YAML.load_file(ARGV[0]); raise "bad model" unless d["model"].is_a?(Hash) && d["model"]["default"]=="${PINNED}"; puts "PARSE_OK"`,
      cfg],
    { encoding: 'utf8' },
  )
  rmSync(dir, { recursive: true, force: true })
  assert.equal(r.status, 0, `ruby parse/assert failed: ${r.stderr}`)
  assert.match(r.stdout, /PARSE_OK/)
})

// Generator-level drift gate: the fragile scalar-collapsing sed must never
// reappear, and the robust path + hard validation must be present.
test('generator: buildSetupScript drops the scalar-collapsing model sed', () => {
  const s = buildSetupScript(GEN_PARAMS as any)
  assert.ok(!/sed -i -E 's\|\^model:\.\*\|/.test(s), 'must not collapse model: via sed (the bug)')
  assert.match(s, /awk '/, 'uses awk block-removal')
  assert.match(s, /printf 'model:\\n {2}default: deepseek\/deepseek-v4-pro\\n'/, 'appends canonical block')
  assert.match(s, /failed YAML\/model validation/, 'hard YAML-shape validation guard present')
})
