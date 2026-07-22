-- ──────────────────────────────────────────────────────────────────
-- 20260723000000_access_codes.sql
--
-- Access-code redemption ("comped" checkout).
--
-- Some B2B clients pay the founder OUTSIDE the system (bank transfer,
-- invoice, barter). Instead of sending them through Xendit, the founder
-- hands them an 8-character ACCESS CODE. Entering that code at checkout
-- must behave EXACTLY like a paid invoice: customer activated on the
-- code's tier, VPS spun up, same /welcome landing.
--
-- Three tables + one column:
--   access_codes             the mintable codes (tier + always_on live
--                            HERE, never on the request body)
--   access_code_redemptions  audit ledger — who burned which code
--   access_code_attempts     per-IP throttle log (hashed IP only)
--   subscriptions.source     tells comped revenue apart from paid
--
-- CODE FORMAT (mirrors the edge handler's CODE_RE):
--   alphabet ABCDEFGHJKMNPQRSTVWXYZ23456789 (30 chars — I, L, O, U, 0
--   and 1 dropped so codes survive being read aloud on a call), length
--   8, keyspace ~6.56e11. Stored normalized (uppercase, no dash);
--   displayed as XXXX-XXXX.
--
-- RLS: all three tables are service-role only (RLS on, zero policies =
-- default deny) PLUS an explicit REVOKE from anon/authenticated. These
-- rows are effectively bearer credentials — an anon SELECT on
-- access_codes would hand out free subscriptions.
--
-- Also fixes a live bug on manual_provisions.tier — see section 5.
--
-- Idempotent.
-- ──────────────────────────────────────────────────────────────────

-- ─── 1. access_codes ─────────────────────────────────────────────

create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  -- Normalized storage form: 8 chars, uppercase, no dash. UNIQUE so the
  -- claim UPDATE below can key on it and so a minting script can't
  -- accidentally issue the same code twice.
  code text not null unique,
  -- Tier the code grants. Source of truth for the subscription insert —
  -- the redeem handler NEVER reads a tier off the request body, or a
  -- client could comp itself into done-for-you. No 'enterprise': that
  -- tier is quoted per-deal and never self-serve.
  tier text not null,
  -- Human label for the founder's own ledger ("PT Sinar Jaya — Jul").
  label text,
  -- Always-on hosting flag, same story as tier: it comes from the code
  -- row, not the request.
  always_on boolean not null default false,
  -- Single-use by default. A multi-seat client gets one code with a
  -- higher max_redemptions instead of N codes.
  max_redemptions int not null default 1,
  -- Bumped by the atomic claim UPDATE. The pair
  -- (redeemed_count < max_redemptions) IS the single-use guard — it is
  -- enforced inside one statement so two simultaneous POSTs of the same
  -- code cannot both win.
  redeemed_count int not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  notes text,

  constraint access_codes_tier_chk
    check (tier in ('bare', 'solo', 'voice-starter', 'library-full', 'done-for-you')),
  constraint access_codes_max_redemptions_chk
    check (max_redemptions > 0),
  constraint access_codes_redeemed_count_chk
    check (redeemed_count >= 0)
);

-- The claim path filters on revoked_at / expires_at after hitting the
-- unique index on code, so no extra index is needed for redemption. This
-- one serves the founder's admin listing ("newest codes first").
create index if not exists idx_access_codes_created_at
  on public.access_codes (created_at desc);

comment on table public.access_codes is
  'Mintable 8-char access codes that comp a customer onto a tier without Xendit. '
  'Bearer credentials — service-role only.';
comment on column public.access_codes.code is
  'Normalized form: uppercase, no dash, alphabet ABCDEFGHJKMNPQRSTVWXYZ23456789, length 8. Displayed as XXXX-XXXX.';
comment on column public.access_codes.tier is
  'Tier granted on redemption. Read from this row only — never from the request body. No enterprise (quoted per-deal).';
comment on column public.access_codes.always_on is
  'Always-on hosting granted on redemption. Same rule as tier: server-side source of truth.';
comment on column public.access_codes.redeemed_count is
  'Incremented by the atomic claim UPDATE (redeemed_count < max_redemptions). This is the concurrency guard against double-redeeming one code.';

-- ─── 2. access_code_redemptions ──────────────────────────────────
--
-- One row per successful burn. The founder needs to answer "who used
-- the code I gave PT Sinar Jaya" without reconstructing it from
-- subscription timestamps, and a comped subscription that later
-- disputes anything is traced back through here.

create table if not exists public.access_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  access_code_id uuid not null references public.access_codes(id) on delete cascade,
  -- Nullable on purpose: keep the audit row even if a customer or
  -- subscription is later deleted. A burn that lost its customer is
  -- still evidence the code was spent.
  customer_id uuid references public.customers(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  -- Denormalized snapshot of the email used at redemption time, so the
  -- ledger survives a customer row disappearing.
  email text,
  redeemed_at timestamptz not null default now()
);

create index if not exists idx_access_code_redemptions_code
  on public.access_code_redemptions (access_code_id, redeemed_at desc);

create index if not exists idx_access_code_redemptions_customer
  on public.access_code_redemptions (customer_id, redeemed_at desc);

comment on table public.access_code_redemptions is
  'Audit ledger: one row per successful access-code redemption. Service-role only.';
comment on column public.access_code_redemptions.email is
  'Email snapshot at redemption time — kept so the ledger stays readable if the customer row is removed.';

-- ─── 3. access_code_attempts ─────────────────────────────────────
--
-- Throttle log. The keyspace is ~6.56e11 so brute force is not the main
-- worry, but without a limiter an attacker can grind codes for free and
-- we would never see it. This is the first rate limiter in the repo.
--
-- NO-ORACLE RULE: unknown, malformed, expired, revoked and exhausted all
-- return the same 400 invalid_code, so the attempts log is the only
-- place that distinguishes anything — and even here we store just ok
-- true/false, never the attempted code (a leaked table would otherwise
-- become a list of near-miss guesses).
--
-- PRIVACY: ip_hash is sha256(ip + pepper), computed in the edge function.
-- A raw IP is personal data under UU PDP and never lands here.

create table if not exists public.access_code_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  ok boolean not null default false,
  attempted_at timestamptz not null default now()
);

-- Exactly the shape of the throttle read:
--   count(*) where ip_hash = $1 and ok = false and attempted_at >= $2
create index if not exists idx_access_code_attempts_ip_time
  on public.access_code_attempts (ip_hash, attempted_at desc);

comment on table public.access_code_attempts is
  'Per-IP redemption attempt log backing the 10-attempts-per-15-minutes throttle. Service-role only.';
comment on column public.access_code_attempts.ip_hash is
  'sha256 hash of the client IP. NEVER a raw IP — hashing happens in the edge function before insert.';

-- ─── 4. RLS + grants (service-role only) ─────────────────────────
--
-- RLS on with zero policies = default deny for anon and authenticated.
-- The REVOKE is the belt-and-braces half (mirrors consent_events): if a
-- future migration ever adds a loose "USING (true)" policy by mistake,
-- the missing table grant still blocks it. service_role bypasses RLS by
-- design; the redeem edge function uses SUPABASE_SERVICE_ROLE_KEY.

alter table public.access_codes            enable row level security;
alter table public.access_code_redemptions enable row level security;
alter table public.access_code_attempts    enable row level security;

revoke all on public.access_codes            from anon, authenticated;
revoke all on public.access_code_redemptions from anon, authenticated;
revoke all on public.access_code_attempts    from anon, authenticated;

grant all on public.access_codes            to service_role;
grant all on public.access_code_redemptions to service_role;
grant all on public.access_code_attempts    to service_role;

-- ─── 5. subscriptions.source ─────────────────────────────────────
--
-- Comped-vs-paid. Everything that exists today came through Xendit, so
-- the default backfills every current row correctly and the column can
-- be NOT NULL from day one.
--
--   xendit        paid through the invoice flow (default)
--   access_code   comped via a redeemed access code (paid off-system)
--   manual_admin  provisioned by hand from /admin/manual-provision
--
-- Revenue reporting must exclude source <> 'xendit' or MRR will be
-- overstated by every comped B2B client.

alter table public.subscriptions
  add column if not exists source text not null default 'xendit';

alter table public.subscriptions
  drop constraint if exists subscriptions_source_chk;

alter table public.subscriptions
  add constraint subscriptions_source_chk
  check (source in ('xendit', 'access_code', 'manual_admin'));

comment on column public.subscriptions.source is
  'How this subscription was created: xendit (paid invoice) | access_code (comped, paid off-system) | manual_admin (hand-provisioned). Exclude non-xendit rows from MRR.';

-- ─── 6. BUGFIX: manual_provisions.tier still on the legacy CHECK ──
--
-- 20260528000000_manual_provisions.sql created the column with an inline
-- check (tier in ('starter','pro','studio')) — Postgres auto-named it
-- manual_provisions_tier_check. subscriptions.tier was widened to the
-- v1.4 slugs in 20260701120000, but this one was missed, so every admin
-- manual-provision on a canonical tier (e.g. library-full) fails on the
-- audit insert after the customer + subscription rows are already
-- written. Widen it to the same set subscriptions.tier allows, minus
-- nothing: canonical v1.4 plus the three legacy aliases still present on
-- old rows.

alter table public.manual_provisions
  drop constraint if exists manual_provisions_tier_check;

alter table public.manual_provisions
  add constraint manual_provisions_tier_check
  check (tier in (
    'bare', 'solo', 'voice-starter', 'library-full', 'done-for-you', 'enterprise',
    'starter', 'pro', 'studio'
  ));

comment on column public.manual_provisions.tier is
  'Tier at provision time. Accepts the v1.4 canonical slugs plus the legacy starter/pro/studio aliases — widened 2026-07-23 after the original CHECK blocked every canonical-tier manual provision.';

-- ─── 7. The atomic single-use claim (THE concurrency guard) ─────────
--
-- PostgREST cannot express this: the SET references its own column
-- (redeemed_count + 1) and the filter compares two columns
-- (redeemed_count < max_redemptions). So the claim lives here, as ONE
-- statement, which is what makes it atomic.
--
-- Concurrency proof (READ COMMITTED): two simultaneous claims on a
-- single-use code both match the WHERE; the second blocks on the row
-- lock, and when the first commits Postgres re-evaluates the predicate
-- against the NEW row version — redeemed_count (1) < max_redemptions (1)
-- is now false, so the second matches ZERO rows and returns nothing.
-- The handler reads that empty result as `invalid_code`. No double spend.
--
-- Returns nothing for unknown, revoked, expired AND exhausted alike —
-- the single null path is what gives the endpoint its no-oracle property.

create or replace function public.claim_access_code(p_code text, p_now timestamptz)
returns table (id uuid, code text, tier text, always_on boolean, label text)
language sql
security definer
set search_path = public
as $$
  update public.access_codes
     set redeemed_count = redeemed_count + 1
   where code = p_code
     and revoked_at is null
     and (expires_at is null or expires_at > p_now)
     and redeemed_count < max_redemptions
  returning id, code, tier, always_on, label;
$$;

-- Compensating release. Used when a redemption fails AFTER the claim (or
-- turns out to be a duplicate), so a client never loses a single-use code
-- to our own downstream error. greatest(...,0) makes a double-release a
-- no-op rather than a way to mint extra redemptions.
create or replace function public.release_access_code(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.access_codes
     set redeemed_count = greatest(redeemed_count - 1, 0)
   where id = p_id;
$$;

-- CRITICAL: a SECURITY DEFINER function is NOT protected by the
-- default-deny RLS on access_codes, and Postgres grants EXECUTE to PUBLIC
-- by default. Without these revokes an anon caller could POST
-- /rest/v1/rpc/claim_access_code directly and burn or probe every code —
-- bypassing the throttle, the consent gate and the audit trail entirely.
revoke all on function public.claim_access_code(text, timestamptz) from public, anon, authenticated;
revoke all on function public.release_access_code(uuid) from public, anon, authenticated;
grant execute on function public.claim_access_code(text, timestamptz) to service_role;
grant execute on function public.release_access_code(uuid) to service_role;
