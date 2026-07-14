# Trigger: consolidate admin audit logging

> Mechanical trigger doc — referenced from
> `docs/design/2026-05-10-vps-config-refresh.md` (Q2 default).

## What

Per-function ad-hoc audit logging is acceptable while we have ≤2 admin
Edge Functions. Once **a third admin Edge Function lands that needs
audit**, consolidate them all into a shared `admin_audit_log` table.

## Trigger condition

Count current admin Edge Functions writing audit-style records:

| Function | Audit shape today | Notes |
|---|---|---|
| `customer-tier-bump` | Inline `console.log` + Telegram alert | Existing, Phase 2E-3 |
| `admin-customer-vps-refresh` | Will write directly to `refresh_env_requests` (full outcome row) | Track 3c, this cascade — first to use the dedup-table-as-audit-log pattern |
| `pdf-render` | None today | Pre-existing, may add audit later |

**Trigger fires when:** any new admin Edge Function lands needing
audit logging, **AND** the count of "admin fns with their own ad-hoc
audit table or pattern" reaches 3.

## What to do when triggered

1. Create a new migration: `admin_audit_log` table with shape:
   ```sql
   CREATE TABLE admin_audit_log (
     id            bigserial PRIMARY KEY,
     created_at    timestamptz NOT NULL DEFAULT now(),
     admin_actor   text NOT NULL,         -- bearer-token-derived (or 'service' for system calls)
     fn_name       text NOT NULL,         -- e.g. 'customer-tier-bump'
     customer_id   uuid,                  -- nullable (some admin actions aren't customer-scoped)
     reason        text,                  -- free-text, supplied by caller
     outcome       jsonb,                 -- full response body
     duration_ms   int                    -- handler runtime
   );
   CREATE INDEX admin_audit_log_customer_idx ON admin_audit_log (customer_id, created_at DESC);
   CREATE INDEX admin_audit_log_fn_idx ON admin_audit_log (fn_name, created_at DESC);
   ```

2. Add a shared `_shared/admin-audit-log.ts` helper:
   ```ts
   export async function logAdminAction(opts: {
     supabase: SupabaseClient
     adminActor: string
     fnName: string
     customerId?: string
     reason?: string
     outcome: unknown
     durationMs: number
   }): Promise<void> { /* insert row */ }
   ```

3. Migrate existing per-function audit:
   - `customer-tier-bump`: replace `console.log` + Telegram alert
     with `logAdminAction()` + (keep Telegram alert for ops visibility).
   - `admin-customer-vps-refresh`: switch from "write to
     refresh_env_requests" → "log to admin_audit_log AND write to
     refresh_env_requests (still needed for idempotency dedup)".
     The two tables become orthogonal — one is "what happened" (log),
     one is "have I seen this request_id" (dedup).
   - The new third admin fn: use `logAdminAction()` from day one.

4. Add an admin observability endpoint or page that reads
   `admin_audit_log` and shows recent admin actions with filters
   (by customer, by fn, by date).

## Why a trigger doc instead of building it now

The shared `admin_audit_log` is designed-for-many-callers infrastructure.
At 2 admin functions it's premature — the inline-per-function pattern
is fine and KISS. At 3 functions the maintenance cost of "look in 3
places to know what an admin did" exceeds the cost of building the
shared layer. The trigger condition is observable and unambiguous;
when it fires, do the work.

This pattern (ad-hoc until N=3, then consolidate) is documented per
`docs/design/2026-05-10-vps-config-refresh.md` Q2.

## Status

- 2026-05-10: Trigger documented. Currently 2 admin fns
  (`customer-tier-bump` exists, `admin-customer-vps-refresh` ships in
  Track 3c). Next admin fn lands → consolidate.
