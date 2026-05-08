// customer-tier-bump-handler — Phase 2E-3.
//
// Spec: docs/plans/2026-05-08-phase-2e-3-spec.md (Q2 = via provisioning service).
//
// Pure handler. Triggered by xendit-webhook on `invoice.paid` with
// metadata.tier_upgrade=true. Updates customers.tier in DB, calls the
// provisioning service `/tier-bump` endpoint to SSH-restart the VPS,
// inserts an audit row in tier_change_events, returns success/failure
// for the caller to log + retry as needed.
//
// I/O is injected (DB writer, provisioning client, telegram notifier)
// so the handler stays unit-testable.

import { WORKFLOW_TIERS, type WorkflowTier } from './workflow-types.ts'

// ─── input shape ────────────────────────────────────────────────────────

export type TierBumpInput = {
  customer_id: string                 // uuid
  target_tier: WorkflowTier               // 'starter' | 'pro' | 'studio'
  /** Set when triggered by xendit-webhook; null on manual admin bumps. */
  xendit_invoice_id?: string | null
  reason: 'xendit_invoice_paid' | 'manual_admin' | 'downgrade_request'
}

// ─── output shape ───────────────────────────────────────────────────────

export type TierBumpResult =
  | {
      ok: true
      body: {
        from_tier: WorkflowTier
        to_tier: WorkflowTier
        completed_at: string
        event_id: string
      }
    }
  | {
      ok: false
      status: number
      error: string
      detail?: string
      // Set when we got far enough to insert a tier_change_events row;
      // lets the caller stitch retries to the same audit thread.
      event_id?: string
    }

// ─── injected deps ──────────────────────────────────────────────────────

export type CustomerLookupResult =
  | {
      ok: true
      current_tier: WorkflowTier
      vps_host: string | null  // null when customer hasn't provisioned a VPS yet
    }
  | { ok: false; error: string }

export type AuditInsertResult =
  | { ok: true; event_id: string }
  | { ok: false; error: string }

export type TierBumpDeps = {
  /** Look up the customer's current tier + VPS host. */
  lookupCustomer: (customer_id: string) => Promise<CustomerLookupResult>
  /** Update customers.tier. Caller wraps in a transaction if needed. */
  updateCustomerTier: (
    customer_id: string,
    target_tier: WorkflowTier,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  /** Insert a row into tier_change_events. Returns the new id. */
  insertAuditRow: (row: {
    customer_id: string
    from_tier: WorkflowTier
    to_tier: WorkflowTier
    reason: TierBumpInput['reason']
    xendit_invoice_id: string | null
  }) => Promise<AuditInsertResult>
  /** Mark the audit row complete (or set error_detail on failure). */
  markAuditComplete: (
    event_id: string,
    completion: { completed_at: string } | { error_detail: string },
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  /** Call the provisioning service /tier-bump endpoint. */
  callProvisioningTierBump: (args: {
    customer_id: string
    target_tier: WorkflowTier
    vps_host: string
  }) => Promise<{ ok: true; restarted_at: string } | { ok: false; error: string }>
  /** Notify the customer via Telegram. Best-effort — failure is logged but doesn't fail the bump. */
  notifyCustomer?: (args: {
    customer_id: string
    target_tier: WorkflowTier
  }) => Promise<{ ok: true } | { ok: false; error: string }>
}

// ─── input validation ───────────────────────────────────────────────────

const VALID_TIERS: WorkflowTier[] = ['starter', 'pro', 'studio']
const VALID_REASONS: TierBumpInput['reason'][] = [
  'xendit_invoice_paid',
  'manual_admin',
  'downgrade_request',
]

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validate(input: TierBumpInput): { ok: true } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'body must be an object' }
  }
  if (typeof input.customer_id !== 'string' || !UUID_RE.test(input.customer_id)) {
    return { ok: false, error: 'invalid customer_id (expected uuid)' }
  }
  if (!VALID_TIERS.includes(input.target_tier)) {
    return {
      ok: false,
      error: `invalid target_tier (expected one of ${VALID_TIERS.join(', ')})`,
    }
  }
  if (!VALID_REASONS.includes(input.reason)) {
    return {
      ok: false,
      error: `invalid reason (expected one of ${VALID_REASONS.join(', ')})`,
    }
  }
  if (
    input.reason === 'xendit_invoice_paid' &&
    (typeof input.xendit_invoice_id !== 'string' ||
      input.xendit_invoice_id.length === 0)
  ) {
    return {
      ok: false,
      error: 'xendit_invoice_id required when reason=xendit_invoice_paid',
    }
  }
  return { ok: true }
}

// ─── handler ────────────────────────────────────────────────────────────

export async function customerTierBumpHandler(
  input: TierBumpInput,
  deps: TierBumpDeps,
): Promise<TierBumpResult> {
  const v = validate(input)
  if (!v.ok) {
    return { ok: false, status: 400, error: 'invalid_input', detail: v.error }
  }

  // 1. Look up current tier + VPS host.
  const customer = await deps.lookupCustomer(input.customer_id)
  if (!customer.ok) {
    return {
      ok: false,
      status: 404,
      error: 'customer_not_found',
      detail: customer.error,
    }
  }
  const fromTier = customer.current_tier
  // Idempotency: if the customer is already at the target tier, this
  // is a no-op success (xendit-webhook can fire twice on retry).
  if (fromTier === input.target_tier) {
    return {
      ok: true,
      body: {
        from_tier: fromTier,
        to_tier: input.target_tier,
        completed_at: new Date().toISOString(),
        event_id: 'noop-already-at-target',
      },
    }
  }

  // 2. Insert audit row BEFORE the side effects so we have a paper
  // trail even if subsequent steps fail.
  const audit = await deps.insertAuditRow({
    customer_id: input.customer_id,
    from_tier: fromTier,
    to_tier: input.target_tier,
    reason: input.reason,
    xendit_invoice_id: input.xendit_invoice_id ?? null,
  })
  if (!audit.ok) {
    return {
      ok: false,
      status: 500,
      error: 'audit_insert_failed',
      detail: audit.error,
    }
  }

  // 3. Update DB tier.
  const updated = await deps.updateCustomerTier(input.customer_id, input.target_tier)
  if (!updated.ok) {
    await deps.markAuditComplete(audit.event_id, { error_detail: `db_update_failed: ${updated.error}` })
    return {
      ok: false,
      status: 500,
      error: 'db_update_failed',
      detail: updated.error,
      event_id: audit.event_id,
    }
  }

  // 4. Call provisioning service /tier-bump (SSH + sed + restart).
  // Skip when no VPS host yet (customer paid for upgrade BEFORE
  // provisioning their VPS — rare, but possible). The DB tier update
  // is enough; future provisioning will pick up the new tier from
  // customers.tier directly.
  if (!customer.vps_host) {
    const completed_at = new Date().toISOString()
    await deps.markAuditComplete(audit.event_id, { completed_at })
    return {
      ok: true,
      body: {
        from_tier: fromTier,
        to_tier: input.target_tier,
        completed_at,
        event_id: audit.event_id,
      },
    }
  }

  const provResult = await deps.callProvisioningTierBump({
    customer_id: input.customer_id,
    target_tier: input.target_tier,
    vps_host: customer.vps_host,
  })
  if (!provResult.ok) {
    await deps.markAuditComplete(audit.event_id, {
      error_detail: `provisioning_call_failed: ${provResult.error}`,
    })
    return {
      ok: false,
      status: 502,
      error: 'provisioning_call_failed',
      detail: provResult.error,
      event_id: audit.event_id,
    }
  }

  // 5. Mark audit complete.
  const completed_at = provResult.restarted_at
  await deps.markAuditComplete(audit.event_id, { completed_at })

  // 6. Best-effort customer notification.
  if (deps.notifyCustomer) {
    try {
      await deps.notifyCustomer({
        customer_id: input.customer_id,
        target_tier: input.target_tier,
      })
    } catch {
      // Swallow — notification failure doesn't block the bump.
    }
  }

  return {
    ok: true,
    body: {
      from_tier: fromTier,
      to_tier: input.target_tier,
      completed_at,
      event_id: audit.event_id,
    },
  }
}
