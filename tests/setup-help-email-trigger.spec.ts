// Phase A2 PR 4 — setup-help email at 24h stuck.
//
// Extension to retry-pending-provisions-handler: when a row has been in
// pending_provision status for >=24h AND we haven't yet sent the
// setup-help email for that subscription, fire a notifier that ships
// the setup-help.md template. Dedup via setup_help_email_sent_at column
// on subscriptions, exposed on PendingProvisionRow.
//
// The retry behavior itself is unchanged — same MIN_RETRY / MAX_ATTEMPTS
// cadence. The setup-help email is an ADDITIONAL signal layered on top.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  retryPendingProvisionsHandler,
  SETUP_HELP_AGE_MS,
  type PendingProvisionRow,
  type RetryAttempt,
  type RetryHandlerDeps,
  type SetupHelpNotification,
} from '../supabase/functions/_shared/retry-pending-provisions-handler.ts'
import type {
  IProvisioningClient,
  SpinUpResult,
} from '../supabase/functions/_shared/types.ts'

const FIXED_NOW = new Date('2026-06-01T12:00:00.000Z')

// ─── helpers ────────────────────────────────────────────────────────────

function makeProvisioning(opts: { result?: SpinUpResult } = {}): IProvisioningClient {
  return {
    async spinUp(_input) {
      return opts.result ?? { ok: true, jobId: 'job_test' }
    },
  }
}

function rowAge(hoursAgo: number, over: Partial<PendingProvisionRow> = {}): PendingProvisionRow {
  return {
    subscription_id: 'sub_test',
    customer_id: 'cust_test',
    tier: 'pro',
    always_on_enabled: false,
    subscription_started_at: new Date(
      FIXED_NOW.getTime() - hoursAgo * 60 * 60 * 1000,
    ).toISOString(),
    setup_help_email_sent_at: null,
    ...over,
  }
}

type SetupHelpState = {
  notifySetupHelpCalls: SetupHelpNotification[]
  setupHelpMarked: string[]
}

function makeDeps(opts: {
  stale?: PendingProvisionRow[]
  spinUpResult?: SpinUpResult
  notifySetupHelp?: (
    n: SetupHelpNotification,
  ) => Promise<{ ok: boolean; detail?: string }>
} = {}): RetryHandlerDeps & { setupHelp: SetupHelpState } {
  const setupHelp: SetupHelpState = {
    notifySetupHelpCalls: [],
    setupHelpMarked: [],
  }
  return {
    setupHelp,
    async findStalePendingProvisions() {
      return opts.stale ?? []
    },
    async findLatestAttempt() {
      return null
    },
    async buildSpinUpInput(r) {
      return {
        customerId: r.customer_id,
        tier: r.tier,
        telegramChatId: 'chat_test',
        telegramBotToken: 'tok_test',
        openrouterApiKey: 'sk-test',
        soulMdContent: '# Test',
        alwaysOnEnabled: r.always_on_enabled,
      }
    },
    async insertAttempt(input) {
      return { id: 'attempt_test' }
    },
    provisioning: makeProvisioning({ result: opts.spinUpResult }),
    now: () => FIXED_NOW,
    log: () => {},
    notifySetupHelp:
      opts.notifySetupHelp ??
      (async (n) => {
        setupHelp.notifySetupHelpCalls.push(n)
        return { ok: true }
      }),
    markSetupHelpSent: async (subscription_id) => {
      setupHelp.setupHelpMarked.push(subscription_id)
    },
  }
}

// ─── threshold ──────────────────────────────────────────────────────────

test('SETUP_HELP_AGE_MS is 24 hours', () => {
  assert.equal(SETUP_HELP_AGE_MS, 24 * 60 * 60 * 1000)
})

// ─── happy path ─────────────────────────────────────────────────────────

test('row stale 25h with no setup-help email yet → fires notifier + marks sent', async () => {
  const deps = makeDeps({
    stale: [rowAge(25, { subscription_id: 'sub_old' })],
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.setup_help_emails_sent, 1)
  assert.equal(deps.setupHelp.notifySetupHelpCalls.length, 1)
  assert.equal(deps.setupHelp.notifySetupHelpCalls[0].subscription_id, 'sub_old')
  assert.equal(deps.setupHelp.notifySetupHelpCalls[0].customer_id, 'cust_test')
  assert.deepEqual(deps.setupHelp.setupHelpMarked, ['sub_old'])
})

// ─── threshold gate ─────────────────────────────────────────────────────

test('row stale only 1h → no setup-help email (under 24h threshold)', async () => {
  const deps = makeDeps({
    stale: [rowAge(1)],
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.setup_help_emails_sent, 0)
  assert.equal(deps.setupHelp.notifySetupHelpCalls.length, 0)
  assert.equal(deps.setupHelp.setupHelpMarked.length, 0)
})

test('row stale 24h exactly → fires (>=)', async () => {
  const deps = makeDeps({ stale: [rowAge(24)] })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.setup_help_emails_sent, 1)
})

// ─── dedup ──────────────────────────────────────────────────────────────

test('row already has setup_help_email_sent_at → does NOT re-send', async () => {
  const deps = makeDeps({
    stale: [
      rowAge(48, {
        setup_help_email_sent_at: '2026-05-31T12:00:00.000Z',
      }),
    ],
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.setup_help_emails_sent, 0)
  assert.equal(deps.setupHelp.notifySetupHelpCalls.length, 0)
})

// ─── notifier failure ──────────────────────────────────────────────────

test('notifier failure does NOT mark sent (retries next tick)', async () => {
  const deps = makeDeps({
    stale: [rowAge(25)],
    notifySetupHelp: async () => ({ ok: false, detail: 'resend 503' }),
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.setup_help_emails_sent, 0)
  assert.equal(r.setup_help_email_failures, 1)
  assert.deepEqual(deps.setupHelp.setupHelpMarked, [])
})

test('thrown notifier rejection is captured, NOT a crash', async () => {
  const deps = makeDeps({
    stale: [rowAge(25)],
    notifySetupHelp: async () => {
      throw new Error('boom')
    },
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.setup_help_emails_sent, 0)
  assert.equal(r.setup_help_email_failures, 1)
})

// ─── back-compat ────────────────────────────────────────────────────────

test('handler works WITHOUT notifySetupHelp dep (optional, back-compat)', async () => {
  // Build deps but omit notifySetupHelp + markSetupHelpSent
  const deps: RetryHandlerDeps = {
    async findStalePendingProvisions() {
      return [rowAge(25)]
    },
    async findLatestAttempt() {
      return null
    },
    async buildSpinUpInput(r) {
      return {
        customerId: r.customer_id,
        tier: r.tier,
        telegramChatId: 'chat',
        telegramBotToken: 'tok',
        openrouterApiKey: 'sk',
        soulMdContent: '# Test',
        alwaysOnEnabled: false,
      }
    },
    async insertAttempt() {
      return { id: 'a1' }
    },
    provisioning: makeProvisioning(),
    now: () => FIXED_NOW,
    log: () => {},
    // intentionally NO notifySetupHelp / markSetupHelpSent
  }
  // Should not throw, retry still happens
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.retried, 1)
  assert.equal(r.setup_help_emails_sent, 0)
})

// ─── doesn't block retry ────────────────────────────────────────────────

test('setup-help email path does NOT block the retry attempt', async () => {
  // Row is 25h old, never been retried (latest = null), notifier fails.
  // Retry should still fire.
  const deps = makeDeps({
    stale: [rowAge(25)],
    notifySetupHelp: async () => ({ ok: false, detail: 'fail' }),
  })
  const r = await retryPendingProvisionsHandler(deps)
  assert.equal(r.setup_help_email_failures, 1)
  assert.equal(r.retried, 1) // spin-up still attempted
})
