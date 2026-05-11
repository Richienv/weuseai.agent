// onboarding.html step 4 submit error mapping — IDCloudHost capacity path.
//
// 2026-05-11 honest-error fix: when complete-onboarding returns
// `vps_capacity_exhausted` (a transient platform issue, not a customer
// mistake), the popup must say "Server VPS lagi penuh — bukan kesalahan
// kamu" instead of the generic "Belum jadi. Ada kendala teknis." which
// reads as "you did something wrong."
// See docs/investigation/2026-05-11-pair-failure.md.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const ONBOARDING = path.join(ROOT, 'onboarding.html')

test('step 4 submit error handler maps vps_capacity_exhausted → honest copy', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // The branch must exist before the generic 502/503/500 fallthrough.
  // Check (a) the error code is recognized + (b) the friendly copy is
  // emitted via showSubmitError.
  assert.match(
    src,
    /data\?\.error\s*===\s*['"]vps_capacity_exhausted['"]/,
    'must recognize vps_capacity_exhausted error code from handler',
  )
  assert.match(
    src,
    /Server VPS lagi penuh\. Ini bukan kesalahan kamu/,
    'must surface the honest "not your fault" copy',
  )
  // The honest copy must NOT use the banned brand words from CLAUDE.md
  // (just / basically / literally / honestly / etc).
  const honestCopyMatch = src.match(/Server VPS lagi penuh[^']*'/)
  assert.ok(honestCopyMatch, 'must find the honest copy string literal')
  for (const banned of ['basically', 'just', 'literally', 'honestly']) {
    assert.equal(
      new RegExp(`\\b${banned}\\b`, 'i').test(honestCopyMatch[0]),
      false,
      `banned brand word "${banned}" present in honest copy: ${honestCopyMatch[0]}`,
    )
  }
})

test('vps_capacity_exhausted branch comes BEFORE the generic 502/503/500 fallthrough', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // Order matters: the specific error code must be matched before the
  // generic "Ada kendala teknis" fallthrough, otherwise the friendly
  // copy never fires.
  const specificIdx = src.indexOf("data?.error === 'vps_capacity_exhausted'")
  const fallthroughIdx = src.indexOf("// 502 / 503 / 500 / unknown")
  assert.ok(specificIdx > 0, 'vps_capacity_exhausted branch must exist')
  assert.ok(fallthroughIdx > 0, 'generic fallthrough comment must still exist')
  assert.ok(
    specificIdx < fallthroughIdx,
    `vps_capacity_exhausted branch (idx ${specificIdx}) must precede the ` +
      `502/503/500 fallthrough comment (idx ${fallthroughIdx})`,
  )
})
