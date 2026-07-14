-- Item 3 (2026-05-18 consult): per-customer LLM cost monitoring.
--
-- A read-only view joining each customer to their OpenRouter sub-key
-- spend cap and most-recent usage snapshot. The api/admin/observability/
-- cost.ts function reads this view for the customer list + caps, then
-- live-refreshes spend from the OpenRouter management API.
--
-- The view is computed; it carries no RLS of its own. Pre-PG15 views run
-- security-definer (as the owner, bypassing the base tables' RLS), so we
-- explicitly REVOKE it from anon + authenticated — only the service-role
-- key (used server-side by the admin function) may read it. Same
-- fail-closed posture as the X-CID gates (Sesi D pass-3).

create or replace view customer_llm_cost as
select
  c.id                                as customer_id,
  c.email,
  c.display_name,
  k.openrouter_key_hash,
  k.credit_limit_usd_cents,
  s.total_cost_usd_cents              as latest_cost_usd_cents,
  s.snapshot_at                       as latest_snapshot_at,
  case
    when k.credit_limit_usd_cents > 0 then
      round(
        100.0 * coalesce(s.total_cost_usd_cents, 0)
          / k.credit_limit_usd_cents,
        1
      )
    else null
  end                                 as pct_used,
  (
    k.credit_limit_usd_cents > 0
    and coalesce(s.total_cost_usd_cents, 0)
          >= 0.70 * k.credit_limit_usd_cents
  )                                   as alert_70
from customers c
join customer_openrouter_keys k
  on k.customer_id = c.id
left join lateral (
  select u.total_cost_usd_cents, u.snapshot_at
  from llm_usage_snapshots u
  where u.customer_id = c.id
  order by u.snapshot_at desc
  limit 1
) s on true;

comment on view customer_llm_cost is
  'Per-customer LLM spend vs OpenRouter sub-key cap. Service-role only — '
  'read by api/admin/observability/cost.ts. Item 3, 2026-05-18 consult.';

-- Fail-closed: a definer-rights view would otherwise expose customer PII
-- (email) past the base tables' RLS. Only service-role may read it.
revoke all on customer_llm_cost from anon, authenticated;
