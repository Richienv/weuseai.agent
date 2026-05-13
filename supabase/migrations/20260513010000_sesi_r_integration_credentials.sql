-- Sesi R Phase 0 (2026-05-13): BYO third-party credential storage.
--
-- One row per (customer, integration) pair. Stores AES-256-GCM ciphertext
-- + IV + auth tag of the customer's third-party API key (Xendit, Meta
-- WhatsApp Cloud API, OnlinePajak). Plaintext NEVER stored. Decryption
-- happens server-side only inside the integration-proxy Edge Function;
-- the customer's VPS never sees raw credentials.
--
-- Revocation = setting revoked_at. Soft delete preserves audit trail in
-- audit_log. To re-add a revoked credential, DELETE the row first then
-- INSERT — the unique constraint on (customer_id, integration) prevents
-- accidental duplicates.
--
-- key_version is reserved for future encryption-key rotation. Today all
-- rows write key_version = 1.
--
-- RLS: same pattern as customers/subscriptions/consent_events post-Sesi
-- D pass-1/2/3. service_role bypasses; anon JWT cannot read at all.
-- All access must go through Edge Functions with X-CID enforcement.

create table if not exists integration_credentials (
  id              bigserial primary key,
  customer_id     uuid not null references customers(id) on delete cascade,
  integration     text not null check (integration in (
    'xendit',
    'whatsapp_cloud_api',
    'onlinepajak'
  )),
  credential_label text,
  ciphertext      text not null,
  iv              text not null,
  auth_tag        text not null,
  key_version     int  not null default 1,
  created_at      timestamptz not null default now(),
  last_validated_at timestamptz,
  revoked_at      timestamptz,
  unique (customer_id, integration)
);

create index if not exists idx_integration_credentials_customer
  on integration_credentials(customer_id, integration)
  where revoked_at is null;

-- RLS: anon JWT must not see ciphertext at all. service_role bypasses.
-- Edge Functions running as service_role enforce X-CID before reading.
alter table integration_credentials enable row level security;

-- Deny-all policy for anon — matches Sesi D pass-3 pattern.
drop policy if exists "integration_credentials anon deny" on integration_credentials;
create policy "integration_credentials anon deny" on integration_credentials
  for all
  to anon
  using (false)
  with check (false);

-- Sanity: comment for future archaeologists.
comment on table integration_credentials is
  'Sesi R Phase 0 (2026-05-13): BYO third-party API keys, AES-256-GCM at rest. '
  'See docs/plans/2026-05-13-sesi-r-indonesian-integrations.md for context.';

comment on column integration_credentials.key_version is
  'Reserved for INTEGRATION_ENCRYPTION_KEY rotation. v1 = launch.';

comment on column integration_credentials.revoked_at is
  'Soft delete. Edge Functions treat revoked_at IS NOT NULL as "credential gone". '
  'Customer can re-add (DELETE then INSERT) to rotate.';
