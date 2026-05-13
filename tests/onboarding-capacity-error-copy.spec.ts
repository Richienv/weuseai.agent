// onboarding.html step 4 submit error mapping — capacity-exhausted path.
//
// 2026-05-11 honest-error fix: when complete-onboarding returns
// `vps_capacity_exhausted` (a transient platform issue, not a customer
// mistake), the popup must surface a "bukan kesalahan kamu" framing
// instead of the generic "Belum jadi. Ada kendala teknis." which reads
// as "you did something wrong."
//
// 2026-05-13 A3 (audit §P1-CF-6 Phase 1 + §P2-CF-8): copy updated to
// drop the "Server VPS" tech-name leak AND to acknowledge automatic
// retry cadence + 30-min email fallback. Trigger condition unchanged.
//
// See docs/investigation/2026-05-11-pair-failure.md +
// docs/audit/2026-05-13-customer-flow-hardening.md.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const ONBOARDING = path.join(ROOT, 'onboarding.html')

test('step 4 submit error handler maps vps_capacity_exhausted → honest copy (post-A3)', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // The branch must exist before the generic 502/503/500 fallthrough.
  // Check (a) the error code is recognized + (b) the friendly copy is
  // emitted via showSubmitError. Post-A3 the copy uses the
  // "Sistem infrastruktur" lead-in (P2-CF-8 jargon fix) and includes
  // the automatic-retry framing (P1-CF-6 Phase 1).
  assert.match(
    src,
    /data\?\.error\s*===\s*['"]vps_capacity_exhausted['"]/,
    'must recognize vps_capacity_exhausted error code from handler',
  )
  assert.match(
    src,
    /Sistem infrastruktur sedang ramai/,
    'must surface the audit-locked "Sistem infrastruktur" lead-in (post-A3)',
  )
  // Drift gate: the old "Server VPS" leak must NEVER reappear.
  assert.equal(
    /Server VPS lagi penuh/.test(src),
    false,
    'old "Server VPS lagi penuh" copy must not reappear (P2-CF-8 fix)',
  )
  // Brand-voice rules on the new copy literal.
  const honestCopyMatch = src.match(/Sistem infrastruktur sedang ramai[^']*'/)
  assert.ok(honestCopyMatch, 'must find the new audit-locked copy string literal')
  for (const banned of ['basically', 'just', 'literally', 'honestly']) {
    assert.equal(
      new RegExp(`\\b${banned}\\b`, 'i').test(honestCopyMatch[0]),
      false,
      `banned brand word "${banned}" present in capacity copy: ${honestCopyMatch[0]}`,
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
