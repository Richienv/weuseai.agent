// Reusable CustomerSnapshot fixtures for derive tests.
//
// Each scenario corresponds to a real onboarding state we'd want to
// diagnose:
//   - notFound:           id doesn't exist
//   - preCheckout:        customer row but no invoice
//   - paymentPending:     invoice exists, status=pending
//   - paymentExpired:     invoice expired (failed_hard payment)
//   - paidNoVps:          paid but no VPS row (failed_retryable provisioning)
//   - paidVpsProvisioning: VPS booting
//   - paidVpsRunningNoSoul: VPS up, /onboarding incomplete
//   - bundleAllOk:        SOUL.md + all pulls success but no Telegram pair
//   - bundleStorageFail:  one pull = storage_unavailable (failed_hard)
//   - paired:             Telegram chat_id present but no usage yet
//   - healthy:            everything green

import type { CustomerSnapshot } from '../../src/types.ts'

const ID = '11111111-1111-4111-8111-111111111111'
const NOW_ISO = '2026-05-10T12:00:00.000Z'
const HOUR_AGO = '2026-05-10T11:00:00.000Z'
const TWO_HOURS_AGO = '2026-05-10T10:00:00.000Z'

export const baseCustomer = {
  id: ID,
  email: 'budi@toko-dapur.id',
  display_name: 'Budi Santoso',
  telegram_chat_id: null,
  telegram_bot_token: null,
  soul_md_text: null,
  bundle_versions: {},
  bundle_update_policy: 'pin' as const,
  pairing_code: null,
  pairing_code_expires_at: null,
  created_at: TWO_HOURS_AGO,
}

export function notFound(): CustomerSnapshot {
  return {
    customer: null,
    subscription: null,
    setupInvoice: null,
    vps: null,
    bundlePulls: [],
    firstMessageAt: null,
    recentMessageCount: 0,
  }
}

export function preCheckout(): CustomerSnapshot {
  return {
    customer: { ...baseCustomer },
    subscription: null,
    setupInvoice: null,
    vps: null,
    bundlePulls: [],
    firstMessageAt: null,
    recentMessageCount: 0,
  }
}

export function paymentPending(): CustomerSnapshot {
  return {
    ...preCheckout(),
    subscription: subPro('pending'),
    setupInvoice: {
      id: 'inv-1',
      status: 'pending',
      amount_idr: 1_200_000,
      paid_at: null,
      created_at: HOUR_AGO,
    },
  }
}

export function paymentExpired(): CustomerSnapshot {
  return {
    ...preCheckout(),
    subscription: subPro('failed'),
    setupInvoice: {
      id: 'inv-1',
      status: 'expired',
      amount_idr: 1_200_000,
      paid_at: null,
      created_at: HOUR_AGO,
    },
  }
}

export function paidNoVps(): CustomerSnapshot {
  return {
    customer: { ...baseCustomer },
    subscription: subPro('active'),
    setupInvoice: paidInvoice(),
    vps: null,
    bundlePulls: [],
    firstMessageAt: null,
    recentMessageCount: 0,
  }
}

export function paidVpsProvisioning(): CustomerSnapshot {
  return {
    ...paidNoVps(),
    vps: {
      id: 'vps-1',
      status: 'provisioning',
      ip_address: null,
      region: 'jakarta',
      created_at: HOUR_AGO,
    },
  }
}

export function paidVpsRunningNoSoul(): CustomerSnapshot {
  return {
    ...paidNoVps(),
    vps: {
      id: 'vps-1',
      status: 'running',
      ip_address: '103.31.32.33',
      region: 'jakarta',
      created_at: HOUR_AGO,
    },
  }
}

export function bundleAllOk(): CustomerSnapshot {
  return {
    customer: {
      ...baseCustomer,
      soul_md_text: '# SOUL.md\n...persona body...',
      bundle_versions: { 'doc-expert': '1.0.0', 'the-pro': '1.0.0' },
      pairing_code: '482917',
    },
    subscription: subPro('active'),
    setupInvoice: paidInvoice(),
    vps: vpsRunning(),
    bundlePulls: [
      {
        agent_slug: 'doc-expert',
        version_requested: '1.0.0',
        version_installed: '1.0.0',
        status: 'success',
        error_detail: null,
        attempted_at: HOUR_AGO,
      },
      {
        agent_slug: 'the-pro',
        version_requested: '1.0.0',
        version_installed: '1.0.0',
        status: 'success',
        error_detail: null,
        attempted_at: HOUR_AGO,
      },
    ],
    firstMessageAt: null,
    recentMessageCount: 0,
  }
}

export function bundleStorageFail(): CustomerSnapshot {
  return {
    ...bundleAllOk(),
    bundlePulls: [
      {
        agent_slug: 'doc-expert',
        version_requested: '1.0.0',
        version_installed: null,
        status: 'storage_unavailable',
        error_detail: 'no space left on device',
        attempted_at: HOUR_AGO,
      },
      {
        agent_slug: 'the-pro',
        version_requested: '1.0.0',
        version_installed: '1.0.0',
        status: 'success',
        error_detail: null,
        attempted_at: HOUR_AGO,
      },
    ],
  }
}

export function pairedNoMessages(): CustomerSnapshot {
  const all = bundleAllOk()
  if (all.customer) {
    all.customer.telegram_bot_token = '123456789:abcXYZ'
    all.customer.telegram_chat_id = '987654321'
  }
  return all
}

export function healthy(): CustomerSnapshot {
  const paired = pairedNoMessages()
  paired.firstMessageAt = TWO_HOURS_AGO
  paired.recentMessageCount = 42
  return paired
}

// ─── helpers ───────────────────────────────────────────────────────────

function subPro(
  status: 'pending' | 'active' | 'paused' | 'canceled' | 'failed',
): CustomerSnapshot['subscription'] {
  return {
    id: 'sub-1',
    tier: 'pro',
    status,
    always_on_enabled: false,
    hosting_active: status === 'active',
    started_at: TWO_HOURS_AGO,
    next_billing_at: null,
  }
}

function paidInvoice(): CustomerSnapshot['setupInvoice'] {
  return {
    id: 'inv-1',
    status: 'paid',
    amount_idr: 1_200_000,
    paid_at: HOUR_AGO,
    created_at: TWO_HOURS_AGO,
  }
}

function vpsRunning(): CustomerSnapshot['vps'] {
  return {
    id: 'vps-1',
    status: 'running',
    ip_address: '103.31.32.33',
    region: 'jakarta',
    created_at: HOUR_AGO,
  }
}

export const FIXTURE_NOW = NOW_ISO
