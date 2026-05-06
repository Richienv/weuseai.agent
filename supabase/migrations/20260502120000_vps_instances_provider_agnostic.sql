-- Make vps_instances provider-agnostic.
--
-- Phase 1 ships with IDCloudHost as the only provider, but locking the
-- column name to one provider blocks (a) future Vultr/AWS/etc. trials and
-- (b) the retry worker from inserting rows with vps_id from a different
-- provider after a Phase-2 switch.
--
-- Changes:
--   * Add `vps_id text` — provider-agnostic ID, populated by all new code.
--   * Add `provider text not null default 'idcloudhost'` — distinguishes
--     rows so the retry worker / dashboard knows which API to call.
--   * Drop NOT NULL on `idcloudhost_vps_id`. Kept for backfill of historical
--     rows; new code reads/writes `vps_id` instead. Will be dropped entirely
--     in Phase 3 once no caller references it.
--
-- DEPLOY ORDER: this migration is forward-compatible. Old code that writes
-- only `idcloudhost_vps_id` continues to work (default provider = idcloudhost
-- backfills the new column on read). Safe to apply before deploying the
-- updated provisioning service.

alter table vps_instances
  add column if not exists vps_id text;

alter table vps_instances
  add column if not exists provider text not null default 'idcloudhost';

alter table vps_instances
  alter column idcloudhost_vps_id drop not null;

comment on column vps_instances.idcloudhost_vps_id is
  'DEPRECATED 2026-05-02: read/write `vps_id` + `provider` instead. '
  'Will be dropped in Phase 3 once historical rows are backfilled.';

-- Index on (provider, vps_id) — retry worker / lookup queries hit this.
create index if not exists vps_instances_provider_vps_id_idx
  on vps_instances(provider, vps_id);
