-- Verified identity lane: real-person references through the BytePlus
-- ModelArk private asset library (LivenessFace groups), the channel ByteDance
-- sanctions for real faces. One identity row per verified person, a few
-- registered assets per identity, and asset:// refs on operator jobs.
--
-- A verified face is biometric data, sensitive personal data under UU PDP.
-- BytePlus (ByteDance) is the verifier and processor. We store only the
-- group and asset identifiers, an encrypted short-lived session token,
-- consent evidence, and the path of our own Storage copy of the upload.
-- Never the liveness capture, never a plaintext BytedToken.

create table if not exists public.ai_video_identities (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('founder', 'customer')),
  customer_id uuid references public.customers(id) on delete restrict,
  order_id uuid references public.ai_video_orders(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 1 and 80),
  group_id text check (group_id is null or group_id ~ '^[A-Za-z0-9._-]{8,120}$'),
  group_type text not null default 'LivenessFace'
    check (group_type in ('LivenessFace', 'AIGC')),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'failed', 'expired')),
  byted_token_enc text,
  session_expires_at timestamptz,
  callback_nonce_hash text
    check (callback_nonce_hash is null or callback_nonce_hash ~ '^[0-9a-f]{64}$'),
  callback_result_code text
    check (callback_result_code is null or char_length(callback_result_code) between 1 and 32),
  consent_at timestamptz,
  consent_text_version text
    check (consent_text_version is null or char_length(consent_text_version) between 1 and 32),
  verification_billed boolean,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  -- A verified identity always points at a real BytePlus group.
  constraint ai_video_identities_verified_has_group_check
    check (verification_status <> 'verified' or group_id is not null),
  -- Nothing becomes verified without recorded consent (UU PDP explicit consent).
  constraint ai_video_identities_verified_has_consent_check
    check (verification_status <> 'verified' or consent_at is not null),
  -- A customer identity is always attributable to a customer row.
  constraint ai_video_identities_customer_owner_check
    check (owner_kind <> 'customer' or customer_id is not null)
);

comment on table public.ai_video_identities is
  'One verified real person on the BytePlus ModelArk private asset library. Service-role only.';
comment on column public.ai_video_identities.byted_token_enc is
  'AES-256-GCM ciphertext of the 30-minute BytedToken (integration-credential-crypto CredentialCipher JSON). Never plaintext.';
comment on column public.ai_video_identities.callback_nonce_hash is
  'sha256 hex of the single-use nonce in the liveness CallbackURL. Unique while set; cleared after confirm.';
comment on column public.ai_video_identities.verification_billed is
  'reqMeasureInfoValue from GetVisualValidateResult. Liveness is free today; true means BytePlus started billing it.';

create index if not exists ai_video_identities_owner_kind_idx
  on public.ai_video_identities (owner_kind);
create index if not exists ai_video_identities_customer_idx
  on public.ai_video_identities (customer_id)
  where customer_id is not null;
create index if not exists ai_video_identities_order_idx
  on public.ai_video_identities (order_id)
  where order_id is not null;
create unique index if not exists ai_video_identities_group_id_uidx
  on public.ai_video_identities (group_id)
  where group_id is not null;
create unique index if not exists ai_video_identities_nonce_uidx
  on public.ai_video_identities (callback_nonce_hash)
  where callback_nonce_hash is not null;

create table if not exists public.ai_video_identity_assets (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.ai_video_identities(id) on delete cascade,
  asset_id text not null unique check (asset_id ~ '^[A-Za-z0-9._-]{8,120}$'),
  asset_type text not null check (asset_type in ('Image', 'Video', 'Audio')),
  status text not null default 'processing'
    check (status in ('processing', 'active', 'failed')),
  failed_reason text check (failed_reason is null or char_length(failed_reason) between 1 and 400),
  source_path text check (source_path is null or char_length(source_path) between 1 and 512),
  name text check (name is null or char_length(name) between 1 and 64),
  last_checked_at timestamptz,
  last_inference_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz
);

comment on table public.ai_video_identity_assets is
  'BytePlus ModelArk assets registered inside an identity group. source_path is our Storage copy; deleted_at is set after DeleteAsset.';

create index if not exists ai_video_identity_assets_identity_status_idx
  on public.ai_video_identity_assets (identity_id, status);

-- Per-identity caps keep the shared 50-asset Entry quota honest: customers
-- keep at most 2 live assets, founders at most 6. Failed assets still count
-- until they are soft-deleted (they also still occupy BytePlus quota), so the
-- handler must DeleteAsset + set deleted_at before a retry. The parent row is
-- locked so concurrent registrations serialize.
create or replace function public.ai_video_identity_assets_enforce_cap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  kind text;
  live integer;
  cap integer;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.deleted_at is null and old.identity_id = new.identity_id then
      return new;
    end if;
  end if;
  select owner_kind into kind
  from public.ai_video_identities
  where id = new.identity_id
  for update;
  if kind is null then
    raise exception 'identity_not_found';
  end if;
  cap := case kind when 'founder' then 6 else 2 end;
  select count(*) into live
  from public.ai_video_identity_assets
  where identity_id = new.identity_id
    and deleted_at is null
    and id <> new.id;
  if live >= cap then
    raise exception 'identity_asset_cap'
      using detail = format('%s identities keep at most %s live assets', kind, cap);
  end if;
  return new;
end;
$$;

drop trigger if exists ai_video_identity_assets_cap on public.ai_video_identity_assets;
create trigger ai_video_identity_assets_cap
  before insert or update of identity_id, deleted_at
  on public.ai_video_identity_assets
  for each row execute function public.ai_video_identity_assets_enforce_cap();

-- Quota against the BytePlus "Advanced Creation Rights (Entry)" tier:
-- 50 assets and 50 groups for the whole account. alert flips at 40 (80%).
create or replace view public.ai_video_identity_quota
with (security_invoker = true)
as
with counts as (
  select
    (select count(*)::integer from public.ai_video_identity_assets a
      where a.deleted_at is null and a.status <> 'failed') as active_assets,
    (select count(*)::integer from public.ai_video_identities i
      where i.group_id is not null and i.revoked_at is null) as groups
)
select
  active_assets,
  groups,
  50 as asset_limit,
  50 as group_limit,
  (active_assets >= 40 or groups >= 40) as alert
from counts;

comment on view public.ai_video_identity_quota is
  'Account-wide usage vs the BytePlus ModelArk "Advanced Creation Rights (Entry)" limits: 50 assets, 50 groups. alert at 40. Service-role only.';

-- Operator job refs: each ref_urls entry is either an https:// URL or an
-- asset://<id> URI pointing at a registered identity asset. Small immutable
-- helpers keep the CHECKs readable.
create or replace function public.ai_video_ref_urls_ok(p_urls text[])
returns boolean
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    bool_and(u is not null and u ~ '^(https://.+|asset://[A-Za-z0-9._-]{8,120})$'),
    true
  )
  from unnest(p_urls) as u
$$;

create or replace function public.ai_video_ref_urls_has_asset(p_urls text[])
returns boolean
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(bool_or(u like 'asset://%'), false)
  from unnest(p_urls) as u
$$;

alter table public.ai_video_operator_jobs
  drop constraint if exists ai_video_operator_jobs_ref_urls_shape_check,
  drop constraint if exists ai_video_operator_jobs_asset_provider_check;

-- Added NOT VALID so a historical row can never block this migration; new
-- and updated rows are enforced immediately. The guard below validates the
-- history when it is clean and leaves a visible warning when it is not.
alter table public.ai_video_operator_jobs
  add constraint ai_video_operator_jobs_ref_urls_shape_check
    check (public.ai_video_ref_urls_ok(ref_urls)) not valid;

-- asset:// refs only resolve on ModelArk (provider CHECK already allows
-- 'monid' and 'byteplus_modelark' since 20260828010000). No historical row
-- carries asset://, so this one is valid from the start.
alter table public.ai_video_operator_jobs
  add constraint ai_video_operator_jobs_asset_provider_check
    check (not public.ai_video_ref_urls_has_asset(ref_urls) or provider = 'byteplus_modelark');

do $$
begin
  alter table public.ai_video_operator_jobs
    validate constraint ai_video_operator_jobs_ref_urls_shape_check;
exception when check_violation then
  raise warning 'ai_video_operator_jobs_ref_urls_shape_check left NOT VALID: a historical ref_urls entry is neither https:// nor asset://. New rows are still enforced.';
end $$;

-- Consent: reuse the append-only consent_events log (UU PDP Art. 22(1)).
-- consent_type 'ai_video_identity_face' records explicit consent to facial
-- biometric processing by BytePlus (ByteDance) for a customer identity;
-- version carries the consent text version. Founder identities have no
-- customers row, so their consent lives on ai_video_identities.consent_at
-- and consent_text_version, which every identity row also carries.
alter table public.consent_events
  drop constraint if exists consent_events_consent_type_chk;
alter table public.consent_events
  add constraint consent_events_consent_type_chk
    check (consent_type in ('tos', 'marketing', 'ai_video_identity_face'));

comment on column public.consent_events.consent_type is
  'Type of consent: tos (required) | marketing (optional opt-in) | ai_video_identity_face (facial biometric processing by BytePlus for a verified identity).';

-- Lifecycle: customer assets are eligible for deletion once the order is
-- delivered for more than 30 days and the asset has not been used for 30
-- days. This only lists candidates; the ai-video-identity function calls
-- BytePlus DeleteAsset and sets deleted_at. Founder assets are never swept.
create or replace function public.ai_video_identity_gc_candidates()
returns setof public.ai_video_identity_assets
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.*
  from public.ai_video_identity_assets a
  join public.ai_video_identities i on i.id = a.identity_id
  join public.ai_video_orders o on o.id = i.order_id
  where i.owner_kind = 'customer'
    and a.deleted_at is null
    and o.fulfillment_status = 'delivered'
    and coalesce(o.fulfillment_updated_at, o.paid_at, o.updated_at)
      < statement_timestamp() - interval '30 days'
    and (a.last_inference_at is null
      or a.last_inference_at < statement_timestamp() - interval '30 days')
  order by a.created_at asc
$$;

-- Same Vault settings as dispatch_ai_video_operator_worker():
-- ai_video_operator_worker_url (the exact ai-video-render-worker URL) and
-- ai_video_operator_worker_token. The identity function lives in the same
-- project, so its URL is derived by swapping the function slug; there is no
-- new secret to configure. Never put credential values in migrations.
-- A missing setting raises a visible cron failure instead of silently stalling.
create or replace function public.dispatch_ai_video_identity_gc()
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  worker_url text;
  worker_token text;
  gc_url text;
begin
  select decrypted_secret into worker_url from vault.decrypted_secrets where name = 'ai_video_operator_worker_url' limit 1;
  select decrypted_secret into worker_token from vault.decrypted_secrets where name = 'ai_video_operator_worker_token' limit 1;
  if coalesce(worker_url, '') = '' or coalesce(worker_token, '') = '' then
    raise exception 'identity_gc_schedule_unconfigured';
  end if;
  if worker_url !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/ai-video-render-worker$' then
    raise exception 'identity_gc_schedule_invalid_url';
  end if;
  gc_url := regexp_replace(worker_url, '/ai-video-render-worker$', '/ai-video-identity');
  perform net.http_post(
    url := gc_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || worker_token,
      'apikey', worker_token, 'Content-Type', 'application/json'),
    body := '{"action":"gc"}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

-- Tables, view and RPCs are service-role only. No browser gets direct access;
-- capabilities are enforced by Edge Functions.
alter table public.ai_video_identities enable row level security;
alter table public.ai_video_identity_assets enable row level security;
revoke all on table public.ai_video_identities from public, anon, authenticated;
revoke all on table public.ai_video_identity_assets from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_video_identities to service_role;
grant select, insert, update, delete on table public.ai_video_identity_assets to service_role;
revoke all on table public.ai_video_identity_quota from public, anon, authenticated;
grant select on table public.ai_video_identity_quota to service_role;

revoke all on function public.ai_video_identity_assets_enforce_cap() from public, anon, authenticated;
revoke all on function public.ai_video_ref_urls_ok(text[]) from public, anon, authenticated;
revoke all on function public.ai_video_ref_urls_has_asset(text[]) from public, anon, authenticated;
revoke all on function public.ai_video_identity_gc_candidates() from public, anon, authenticated;
revoke all on function public.dispatch_ai_video_identity_gc() from public, anon, authenticated;
grant execute on function public.ai_video_ref_urls_ok(text[]) to service_role;
grant execute on function public.ai_video_ref_urls_has_asset(text[]) to service_role;
grant execute on function public.ai_video_identity_gc_candidates() to service_role;
grant execute on function public.dispatch_ai_video_identity_gc() to service_role;

-- 02:00 WIB nightly (19:00 UTC). Idempotent: drop any earlier schedule first.
select cron.unschedule(jobid) from cron.job where jobname = 'ai_video_identity_gc_nightly';
select cron.schedule('ai_video_identity_gc_nightly', '0 19 * * *', 'select public.dispatch_ai_video_identity_gc()');
