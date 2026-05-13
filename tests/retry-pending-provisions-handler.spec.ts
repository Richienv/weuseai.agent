/**
 * Sesi A D1 (2026-05-13): retry-pending-provisions handler tests.
 *
 * Audit doc: docs/audit/2026-05-13-customer-flow-hardening.md §P1-CF-6 Phase 2.
 *
 * Coverage matrix:
 *   1. Happy path                  — first-attempt spin-up succeeds
 *   2. Capacity-still-exhausted    — Vultr+DO double-fail → leave in pending,
 *                                     audit row outcome=capacity_exhausted
 *   3. Repeated failure backoff    — recent attempt < MIN_RETRY_INTERVAL_MS
 *                                     → skipped_recent, no spin-up call
 *   4. Max-retries exhausted       — attempt count >= MAX_ATTEMPTS → mark
 *                                     exhausted, no spin-up call
 *   5. Already-exhausted row       — outcome='exhausted' present → no-op
 *   6. Empty stale list            — handler exits clean with zero counts
 *   7. buildSpinUpInput null       — defensive: missing customer data →
 *                                     count as failed attempt, log warning
 *   8. Non-capacity error          — 5xx/network → outcome=other_error,
 *                                     still counts toward MAX_ATTEMPTS
 *   9. Telemetry log calls         — log fn invoked per outcome
 *
 * Manual override (founder DM bot command) flagged for future cascade —
 * not in D1 scope.
 *
 * Pure handler — no Deno, no Supabase. All deps mocked.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  retryPendingProvisionsHandler,
  PENDING_STALE_AGE_MS,
  MIN_RETRY_INTERVAL_MS,
  MAX_ATTEMPTS,
  type PendingProvisionRow,
  type RetryAttempt,
  type RetryHandlerDeps,
} from '../supabase/functions/_shared/retry-pending-provisions-handler.ts'
import type {
  IProvisioningClient,
  SpinUpInput,
  SpinUpResult,
} from '../supabase/functions/_shared/types.ts'

// ─── Test fixtures ──────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-05-13T12:00:00Z')

function row(overrides: Partial<PendingProvisionRow> = {}): PendingProvisionRow {
  return {
    subscription_id: 'sub_test',
    customer_id: 'cust_test',
    tier: 'pro',
    always_on_enabled: false,
    subscription_started_at: '2026-05-13T11:50:00Z',  // 10 min before FIXED_NOW
    ...overrides,
  }
}

function attempt(overrides: Partial<RetryAttempt> = {}): RetryAttempt {
  return {
    subscription_id: 'sub_test',
    attempted_at: '2026-05-13T11:55:00Z',  // 5 min before FIXED_NOW (> 3 min gap)
    attempt_number: 1,
    outcome: 'capacity_exhausted',
    ...overrides,
  }
}

function makeProvisioning(opts: {
  result?: SpinUpResult
  calls?: SpinUpInput[]
} = {}): IProvisioningClient {
  return {
    async spinUp(input) {
      opts.calls?.push(input)
      return opts.result ?? { ok: true, jobId: 'job_test' }
    },
  }
}

type DepState = {
  stale: PendingProvisionRow[]
  latestByRow: Map<string, RetryAttempt | null>
  spinUpInputs: Map<string, SpinUpInput | null>
  attempts: Array<{ subscription_id: string; attempt_number: number; outcome: string; detail?: string }>
  logs: Array<{ msg: string; extra?: Record<string, unknown> }>
  spinUpCalls: SpinUpInput[]
}

function makeDeps(opts: {
  stale?: PendingProvisionRow[]
  latest?: Record<string, RetryAttempt | null>
  spinUpInputs?: Record<string, SpinUpInput | null>
  spinUpResult?: SpinUpResult
} = {}): RetryHandlerDeps & { state: DepState } {
  const state: DepState = {
    stale: opts.stale ?? [],
    latestByRow: new Map(Object.entries(opts.latest ?? {})),
    spinUpInputs: new Map(Object.entries(opts.spinUpInputs ?? {})),
    attempts: [],
    logs: [],
    spinUpCalls: [],
  }
  return {
    state,
    async findStalePendingProvisions() {
      return state.stale
    },
    async findLatestAttempt(subId) {
      return state.latestByRow.has(subId) ? state.latestByRow.get(subId)! : null
    },
    async buildSpinUpInput(r) {
      if (state.spinUpInputs.has(r.subscription_id)) {
        return state.spinUpInputs.get(r.subscription_id)!
      }
      // Default: a valid input for every row, unless overridden.
      return {
        customerId: r.customer_id,
        tier: r.tier,
        telegramChatId: 'chat_test',
        telegramBotToken: 'tok_test',
        openrouterApiKey: 'sk-test',
        soulMdContent: '# Test persona',
        alwaysOnEnabled: r.always_on_enabled,
      }
    },
    async insertAttempt(input) {
      state.attempts.push({
        subscription_id: input.subscription_id,
        attempt_number: input.attempt_number,
        outcome: input.outcome,
        detail: input.detail,
      })
      return { id: `attempt_${state.attempts.length}` }
    },
    provisioning: makeProvisioning({
      result: opts.spinUpResult,
      calls: state.spinUpCalls,
    }),
    now: () => FIXED_NOW,
    log: (msg, extra) => {
      state.logs.push({ msg, extra })
    },
  }
}

// ─── 1. Happy path ──────────────────────────────────────────────────

test('D1: happy path — first-attempt spin-up succeeds for one stale row', async () => {
  const deps = makeDeps({
    stale: [row({ subscription_id: 'sub_1', customer_id: 'cust_1' })],
    latest: { sub_1: null },
    spinUpResult: { ok: true, jobId: 'job_xyz' },
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.scanned, 1)
  assert.equal(r.retried, 1)
  assert.equal(r.exhausted, 0)
  assert.equal(r.skipped_recent, 0)
  assert.equal(r.skipped_invalid, 0)
  // One spin-up call dispatched
  assert.equal(deps.state.spinUpCalls.length, 1)
  // One attempt row written with outcome=spin_up_ok
  assert.equal(deps.state.attempts.length, 1)
  assert.equal(deps.state.attempts[0].outcome, 'spin_up_ok')
  assert.equal(deps.state.attempts[0].attempt_number, 1)
})

// ─── 2. Capacity still exhausted ────────────────────────────────────

test('D1: capacity-still-exhausted — outcome=capacity_exhausted, row stays in pending', async () => {
  const deps = makeDeps({
    stale: [row({ subscription_id: 'sub_capacity' })],
    latest: { sub_capacity: null },
    spinUpResult: {
      ok: false,
      status: 503,
      body: 'Vultr POST /v2/instances -> 503: plan and region combination is unavailable',
    },
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.retried, 1)
  assert.equal(deps.state.spinUpCalls.length, 1)
  assert.equal(deps.state.attempts[0].outcome, 'capacity_exhausted')
  // Worker does NOT mutate subscription.status — that stays pending_provision
  // until the customer-readiness probe sees it active or the next retry succeeds.
})

// ─── 3. Skipped-recent backoff ──────────────────────────────────────

test('D1: recent attempt (< MIN_RETRY_INTERVAL_MS ago) → skipped_recent, no spin-up', async () => {
  const deps = makeDeps({
    stale: [row({ subscription_id: 'sub_recent' })],
    latest: {
      sub_recent: attempt({
        subscription_id: 'sub_recent',
        // 1 min before FIXED_NOW — gap = 60_000 < MIN_RETRY_INTERVAL_MS (180_000)
        attempted_at: '2026-05-13T11:59:00Z',
        outcome: 'capacity_exhausted',
      }),
    },
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.skipped_recent, 1)
  assert.equal(r.retried, 0)
  assert.equal(deps.state.spinUpCalls.length, 0)
  assert.equal(deps.state.attempts.length, 0, 'no new attempt row written')
})

test('D1: attempt exactly at MIN_RETRY_INTERVAL_MS boundary → proceeds (>=, not >)', async () => {
  const deps = makeDeps({
    stale: [row({ subscription_id: 'sub_at_boundary' })],
    latest: {
      sub_at_boundary: attempt({
        // Exactly 3 min before FIXED_NOW → gap = 180_000 = MIN_RETRY_INTERVAL_MS
        // Handler condition is `gap < MIN_RETRY_INTERVAL_MS` so this proceeds.
        attempted_at: '2026-05-13T11:57:00Z',
        outcome: 'capacity_exhausted',
      }),
    },
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.retried, 1)
})

// ─── 4. Max retries exhausted ───────────────────────────────────────

test('D1: max attempts reached → mark exhausted, no spin-up call', async () => {
  const deps = makeDeps({
    stale: [row({ subscription_id: 'sub_max' })],
    latest: {
      sub_max: attempt({
        // 5 min ago — well past MIN_RETRY_INTERVAL_MS gap
        attempted_at: '2026-05-13T11:55:00Z',
        attempt_number: MAX_ATTEMPTS,  // ATTEMPT 6 already done
      }),
    },
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.exhausted, 1)
  assert.equal(r.retried, 0)
  assert.equal(deps.state.spinUpCalls.length, 0, 'no further spin-up after exhaustion')
  assert.equal(deps.state.attempts.length, 1)
  assert.equal(deps.state.attempts[0].outcome, 'exhausted')
  assert.equal(deps.state.attempts[0].attempt_number, MAX_ATTEMPTS + 1)
})

test('D1: attempt 6 succeeds is NOT exhausted (just last successful attempt)', async () => {
  const deps = makeDeps({
    stale: [row({ subscription_id: 'sub_last' })],
    latest: {
      sub_last: attempt({
        attempted_at: '2026-05-13T11:55:00Z',
        attempt_number: MAX_ATTEMPTS - 1,  // attempt 5 already done; this is attempt 6
        outcome: 'capacity_exhausted',
      }),
    },
    spinUpResult: { ok: true, jobId: 'job_last' },
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.retried, 1)
  assert.equal(r.exhausted, 0)
  assert.equal(deps.state.attempts[0].outcome, 'spin_up_ok')
  assert.equal(deps.state.attempts[0].attempt_number, MAX_ATTEMPTS)
})

// ─── 5. Already-exhausted row ───────────────────────────────────────

test('D1: already-exhausted row → no-op, terminal state', async () => {
  const deps = makeDeps({
    stale: [row({ subscription_id: 'sub_done' })],
    latest: {
      sub_done: attempt({
        attempted_at: '2026-05-13T10:00:00Z',
        attempt_number: MAX_ATTEMPTS + 1,
        outcome: 'exhausted',
      }),
    },
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.scanned, 1)
  assert.equal(r.retried, 0)
  assert.equal(r.exhausted, 0, 'already exhausted — should NOT re-mark')
  assert.equal(deps.state.spinUpCalls.length, 0)
  assert.equal(deps.state.attempts.length, 0)
})

// ─── 6. Empty stale list ────────────────────────────────────────────

test('D1: zero stale rows → clean exit with zero counts', async () => {
  const deps = makeDeps({ stale: [] })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.scanned, 0)
  assert.equal(r.retried, 0)
  assert.equal(r.exhausted, 0)
  assert.equal(deps.state.spinUpCalls.length, 0)
})

// ─── 7. buildSpinUpInput null ───────────────────────────────────────

test('D1: buildSpinUpInput returns null → counts as failed attempt with detail', async () => {
  const deps = makeDeps({
    stale: [row({ subscription_id: 'sub_bad_input' })],
    latest: { sub_bad_input: null },
    spinUpInputs: { sub_bad_input: null },
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.skipped_invalid, 1)
  assert.equal(r.retried, 0)
  assert.equal(deps.state.spinUpCalls.length, 0, 'no spin-up when input is null')
  // Still writes an attempt row so we don't loop forever on broken row.
  assert.equal(deps.state.attempts.length, 1)
  assert.equal(deps.state.attempts[0].outcome, 'other_error')
  assert.ok(
    deps.state.attempts[0].detail?.includes('buildSpinUpInput'),
    'detail must explain why the row was skipped',
  )
})

// ─── 8. Non-capacity error ──────────────────────────────────────────

test('D1: non-capacity 5xx error → outcome=other_error, counts toward MAX_ATTEMPTS', async () => {
  const deps = makeDeps({
    stale: [row({ subscription_id: 'sub_5xx' })],
    latest: { sub_5xx: null },
    spinUpResult: {
      ok: false,
      status: 502,
      body: 'upstream timeout',
    },
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.retried, 1)
  assert.equal(deps.state.attempts[0].outcome, 'other_error')
  assert.ok(deps.state.attempts[0].detail?.includes('status=502'))
})

test('D1: network-style "Compute resources temporarily unavailable" maps to capacity', async () => {
  // This is the verbatim IDCloudHost body kept defensively by
  // isProviderCapacityError (PR #90 retired the adapter but kept the
  // substring match). Even though IDCH is gone, a stale error message
  // shape might still appear from a future replica replay — handler
  // must classify it correctly.
  const deps = makeDeps({
    stale: [row({ subscription_id: 'sub_idch' })],
    latest: { sub_idch: null },
    spinUpResult: {
      ok: false,
      status: 500,
      body: '{"errors":{"Error":"Compute resources temporarily unavailable"}}',
    },
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(deps.state.attempts[0].outcome, 'capacity_exhausted')
  void r
})

// ─── 9. Mixed batch — exercises the per-row outcome aggregation ─────

test('D1: mixed batch of 4 stale rows produces accurate aggregate counts', async () => {
  const deps = makeDeps({
    stale: [
      row({ subscription_id: 'sub_ok' }),
      row({ subscription_id: 'sub_cap' }),
      row({ subscription_id: 'sub_recent' }),
      row({ subscription_id: 'sub_exhausted' }),
    ],
    latest: {
      sub_ok: null,
      sub_cap: null,
      sub_recent: attempt({
        attempted_at: '2026-05-13T11:59:30Z',  // 30 s ago — recent
        outcome: 'capacity_exhausted',
      }),
      sub_exhausted: attempt({
        attempt_number: MAX_ATTEMPTS + 1,
        outcome: 'exhausted',
      }),
    },
  })
  // First-call provisioning result — sub_ok hits this (success)
  deps.provisioning = {
    spinUp: async (input) => {
      deps.state.spinUpCalls.push(input)
      if (input.customerId === 'cust_test') {
        // Both sub_ok and sub_cap have the same customer_id in this
        // fixture — disambiguate via call order. First call = OK,
        // second = capacity.
        return deps.state.spinUpCalls.length === 1
          ? { ok: true, jobId: 'j1' }
          : { ok: false, status: 503, body: 'out of stock' }
      }
      return { ok: true, jobId: 'jx' }
    },
  }
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.scanned, 4)
  assert.equal(r.retried, 2, 'sub_ok + sub_cap got spin-up retries')
  assert.equal(r.skipped_recent, 1, 'sub_recent gated by MIN_RETRY_INTERVAL_MS')
  // sub_exhausted already terminal → no-op, not counted in `exhausted`
  // (that counter is for THIS-tick exhaustions).
  assert.equal(r.exhausted, 0)
  assert.equal(r.outcomes.find((o) => o.subscription_id === 'sub_exhausted')?.outcome, 'exhausted')
})

// ─── 10. Telemetry log calls ────────────────────────────────────────

test('D1: log fn called per outcome with structured payload', async () => {
  const deps = makeDeps({
    stale: [
      row({ subscription_id: 'sub_log_1' }),
      row({ subscription_id: 'sub_log_2' }),
    ],
    latest: {
      sub_log_1: null,
      sub_log_2: attempt({ attempt_number: MAX_ATTEMPTS, outcome: 'capacity_exhausted' }),
    },
    spinUpResult: { ok: true, jobId: 'j_log' },
  })
  await retryPendingProvisionsHandler(deps)
  // We expect at least one log call per processed row.
  const subIdsLogged = new Set(
    deps.state.logs
      .map((l) => l.extra?.subscription_id)
      .filter(Boolean) as string[],
  )
  assert.ok(subIdsLogged.has('sub_log_1'), 'sub_log_1 attempt logged')
  assert.ok(subIdsLogged.has('sub_log_2'), 'sub_log_2 exhausted logged')
})

// ─── 11. Tunable-constant exports (drift gate) ──────────────────────

test('D1: exported tunable constants match A3 customer-facing promise', () => {
  // A3 PR #101 customer copy: "Kami coba lagi setiap 3 menit. Kalau
  // dalam 30 menit belum berhasil…" — these constants must keep that
  // promise. 6 attempts × 3 min cadence = ~18 min worst case, well
  // under the 30-min ceiling.
  assert.equal(PENDING_STALE_AGE_MS, 3 * 60_000, 'PENDING_STALE_AGE_MS must be 3 min (A3 copy)')
  assert.equal(MIN_RETRY_INTERVAL_MS, 3 * 60_000, 'MIN_RETRY_INTERVAL_MS must be 3 min (A3 copy)')
  assert.equal(MAX_ATTEMPTS, 6, 'MAX_ATTEMPTS must be 6 (audit §P1-CF-6 Phase 2)')
})

// ─── 12-15. Phase 4: founder Telegram alert on exhaustion ───────────
//
// Audit doc §Phase 4 — Telemetry, founder-DM alerts for P1-class
// failures. retry-exhausted is the canonical P1-class signal: a
// paying customer's VPS never came up after 6 attempts (~18 min) and
// the founder has to step in manually.
//
// Contract:
//   - When a row hits the `exhausted` branch, deps.notifyFounder is
//     called with a structured text payload (CID + sub_id + tag).
//   - Non-exhausted outcomes (spin_up_ok, capacity_exhausted under
//     MAX_ATTEMPTS, skipped_recent) do NOT call notifyFounder.
//   - notifyFounder is optional — handler still ships without it
//     wired (back-compat for tests + local-stub deploys).
//   - notifyFounder throws are swallowed — telemetry failures must
//     never abort the worker tick.

test('Phase 4: exhausted outcome triggers notifyFounder with cid + sub_id + audit tag', async () => {
  const founderMessages: string[] = []
  const deps = makeDeps({
    stale: [row({ subscription_id: 'sub_exh_test', customer_id: 'cust_exh_test' })],
    latest: {
      sub_exh_test: attempt({
        subscription_id: 'sub_exh_test',
        attempted_at: '2026-05-13T11:55:00Z',
        attempt_number: MAX_ATTEMPTS,
        outcome: 'capacity_exhausted',
      }),
    },
  })
  deps.notifyFounder = async (text: string) => {
    founderMessages.push(text)
  }
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.exhausted, 1, 'this tick exhausted one row')
  assert.equal(founderMessages.length, 1, 'exactly one founder alert')
  const msg = founderMessages[0]
  assert.ok(
    msg.includes('cust_exh_test'),
    'alert must include customer_id so founder can find the row fast',
  )
  assert.ok(
    msg.includes('sub_exh_test'),
    'alert must include subscription_id for unambiguous lookup',
  )
  assert.ok(
    /\[retry-worker\]|\[provisioning alert\]|retry.*exhausted/i.test(msg),
    'alert must carry a recognizable tag for founder DM filtering',
  )
  assert.ok(
    /exhausted/i.test(msg),
    'alert must say "exhausted" so the severity is obvious at a glance',
  )
})

test('Phase 4: non-exhausted outcomes do NOT call notifyFounder', async () => {
  const founderMessages: string[] = []
  // 3 rows that hit non-exhausted branches:
  //   sub_ok_phase4       → spin_up_ok
  //   sub_cap_phase4      → capacity_exhausted (attempt 1, still has retries left)
  //   sub_recent_phase4   → skipped_recent (gated by MIN_RETRY_INTERVAL_MS)
  const deps = makeDeps({
    stale: [
      row({ subscription_id: 'sub_ok_phase4', customer_id: 'cust_a' }),
      row({ subscription_id: 'sub_cap_phase4', customer_id: 'cust_b' }),
      row({ subscription_id: 'sub_recent_phase4', customer_id: 'cust_c' }),
    ],
    latest: {
      sub_ok_phase4: null,
      sub_cap_phase4: null,
      sub_recent_phase4: attempt({
        // 30 s ago — recent
        attempted_at: '2026-05-13T11:59:30Z',
        outcome: 'capacity_exhausted',
      }),
    },
  })
  // First spin-up returns ok, second returns capacity-exhausted.
  let calls = 0
  deps.provisioning = {
    spinUp: async (input) => {
      calls += 1
      deps.state.spinUpCalls.push(input)
      return calls === 1
        ? { ok: true, jobId: 'j_phase4' }
        : { ok: false, status: 503, body: 'plan and region combination is unavailable' }
    },
  }
  deps.notifyFounder = async (text: string) => {
    founderMessages.push(text)
  }
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.exhausted, 0, 'no exhaustion this tick')
  assert.equal(
    founderMessages.length,
    0,
    'notifyFounder must NOT fire for non-exhausted outcomes — would spam founder DM',
  )
})

test('Phase 4: back-compat — handler runs without notifyFounder wired', async () => {
  // Test stub + local-deno deploys ship without notifyFounder (it
  // requires TELEGRAM_BOT_TOKEN + RICHIE_CHAT_ID env vars). The
  // worker must complete cleanly when the dep is undefined, even when
  // a row reaches the exhausted branch.
  const deps = makeDeps({
    stale: [row({ subscription_id: 'sub_no_alert' })],
    latest: {
      sub_no_alert: attempt({
        attempted_at: '2026-05-13T11:55:00Z',
        attempt_number: MAX_ATTEMPTS,
        outcome: 'capacity_exhausted',
      }),
    },
  })
  // Explicitly no deps.notifyFounder = ...
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.exhausted, 1, 'exhaustion still recorded')
  assert.equal(deps.state.attempts.length, 1, 'audit row still written')
  assert.equal(deps.state.attempts[0].outcome, 'exhausted')
})

test('Phase 4: notifyFounder throw is swallowed — worker tick continues', async () => {
  // Telegram API down / rate-limited / DNS failure must NOT abort
  // the tick. The exhausted-row audit log is the source of truth;
  // founder DM is a nicety on top.
  const deps = makeDeps({
    stale: [
      row({ subscription_id: 'sub_throw_a' }),
      row({ subscription_id: 'sub_throw_b' }),
    ],
    latest: {
      sub_throw_a: attempt({
        attempted_at: '2026-05-13T11:55:00Z',
        attempt_number: MAX_ATTEMPTS,
        outcome: 'capacity_exhausted',
      }),
      sub_throw_b: attempt({
        attempted_at: '2026-05-13T11:55:00Z',
        attempt_number: MAX_ATTEMPTS,
        outcome: 'capacity_exhausted',
      }),
    },
  })
  let invocations = 0
  deps.notifyFounder = async (_text: string) => {
    invocations += 1
    throw new Error('telegram api unreachable')
  }
  const r = await retryPendingProvisionsHandler(deps)
  // Both rows still recorded as exhausted despite the alerts throwing.
  assert.equal(r.exhausted, 2, 'both rows exhausted regardless of alert failures')
  assert.equal(invocations, 2, 'both alerts were attempted')
  assert.equal(deps.state.attempts.length, 2, 'both audit rows written')
})
