-- One active VPS per customer (security audit H4 + M1, 2026-06-14).
--
-- There was NO uniqueness constraint on vps_instances.customer_id (the
-- "unique post-PR #75 hardening" comment in index.ts was false). That let the
-- check-then-create race in spinUpCustomer insert two active rows for one
-- customer on concurrent PAID-webhook retries → two live ~$5/mo VMs for one
-- payment (M1), which then made findActiveVPSByCustomer().maybeSingle() throw
-- and strand the customer (un-tearable, un-re-spinnable) (H4).
--
-- This partial unique index makes the DB reject the second concurrent insert,
-- so a customer can never have more than one row in an active state. A racing
-- second spin-up now fails loudly instead of silently double-billing; its
-- orphaned VM is reaped by the existing cleanup tooling
-- (scripts/cleanup-orphan-vms.ts).
--
-- Safe to apply: prod was verified (2026-06-14) to have ZERO customers with >1
-- active row (3 active rows / 3 distinct customers). The dedup CTE below is a
-- defensive no-op today — it keeps the most-recent active row per customer and
-- downgrades any older duplicate to 'failed' so the index creation can never
-- fail even if a duplicate slips in before this migration applies. (It only
-- touches DB rows; a still-running orphan VM must be reaped separately.)

with ranked as (
  select id, row_number() over (
    partition by customer_id order by created_at desc
  ) as rn
  from vps_instances
  where status in ('provisioning', 'running')
)
update vps_instances v
set status = 'failed'
from ranked r
where v.id = r.id and r.rn > 1;

create unique index if not exists vps_instances_one_active_per_customer
  on vps_instances (customer_id)
  where status in ('provisioning', 'running');
