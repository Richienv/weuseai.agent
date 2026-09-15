import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.STUDIO_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`create table ai_video_operator_jobs (id uuid primary key, status text not null, provider_task_id text, result_path text, error_code text, attempt int default 0, poll_attempts int default 0, created_at timestamptz default now(), updated_at timestamptz default now(), completed_at timestamptz, lease_until timestamptz);`);
  const migration = await readFile(new URL('../supabase/migrations/20260906010000_ai_video_operator_reliability.sql', import.meta.url), 'utf8');
  await db.exec(migration.split('revoke all on function public.claim_due_ai_video_operator_jobs')[0]);
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await db.query(`insert into ai_video_operator_jobs(id,status,provider_task_id,poll_attempts,updated_at) values ($1,'running','run-1',40,now() - interval '30 seconds')`, [id]);
  assert.equal((await db.query('select * from claim_due_ai_video_operator_jobs(3,300)')).rows.length, 1, 'historical 40-poll job is recoverable');
  await db.query(`update ai_video_operator_jobs set lease_until=null where id=$1`, [id]);
  assert.equal((await db.query('select * from claim_due_ai_video_operator_jobs(3,300)')).rows.length, 0, 'rapid browser polls do not burn the retry budget');
  await db.query(`update ai_video_operator_jobs set lease_until=null, poll_attempts=240,updated_at=now()-interval '30 seconds' where id=$1`, [id]);
  assert.equal((await db.query('select * from claim_due_ai_video_operator_jobs(3,300)')).rows.length, 0);
  const paused = (await db.query(`select status,error_code,provider_task_id from ai_video_operator_jobs where id=$1`, [id])).rows[0];
  assert.equal(paused.status, 'failed'); assert.equal(paused.error_code, 'operator_sync_timeout'); assert.equal(paused.provider_task_id, 'run-1');
  await db.query(`update ai_video_operator_jobs set status='queued',provider_task_id=null,error_code=null,attempt=1,poll_attempts=1 where id=$1`, [id]);
  assert.equal((await db.query('select * from claim_due_ai_video_operator_jobs(3,300)')).rows.length, 0);
  assert.equal((await db.query(`select error_code from ai_video_operator_jobs where id=$1`, [id])).rows[0].error_code, 'monid_submission_unknown');
  const request = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await db.query(`update ai_video_operator_jobs set client_request_id=$1 where id=$2`, [request,id]);
  await assert.rejects(db.query(`insert into ai_video_operator_jobs(id,status,client_request_id) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','queued',$1)`, [request]), /unique/);
  // An active lease is respected even when the poll cap is exhausted.
  await db.query(`update ai_video_operator_jobs set status='running', error_code=null,provider_task_id='run-1',poll_attempts=240,lease_until=now()+interval '2 minutes' where id=$1`, [id]);
  await db.query('select * from claim_due_ai_video_operator_jobs(3,300)');
  assert.equal((await db.query(`select status from ai_video_operator_jobs where id=$1`, [id])).rows[0].status, 'running');
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema vault; create table vault.decrypted_secrets(name text, decrypted_secret text);
    create schema net; create table net.calls(id bigserial primary key, payload jsonb);
    create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int) returns bigint language sql as $$ insert into net.calls(payload) values (body) returning id $$;`);
  const dispatch = migration.slice(migration.indexOf('create or replace function public.dispatch_ai_video_operator_worker()'), migration.indexOf('select cron.unschedule'));
  await db.exec(dispatch);
  await assert.rejects(db.query('select dispatch_ai_video_operator_worker()'), /operator_worker_schedule_unconfigured/);
  await db.exec(`insert into vault.decrypted_secrets values ('ai_video_operator_worker_url','https://example.com/worker'),('ai_video_operator_worker_token','test-worker-token')`);
  await assert.rejects(db.query('select dispatch_ai_video_operator_worker()'), /operator_worker_schedule_invalid_url/);
  await db.exec(`update vault.decrypted_secrets set decrypted_secret='https://testproject.supabase.co/functions/v1/ai-video-render-worker' where name='ai_video_operator_worker_url'`);
  await db.query('select dispatch_ai_video_operator_worker()');
  assert.deepEqual((await db.query('select payload from net.calls')).rows[0].payload, { operator_only: true });
  await db.exec('set role anon');
  await assert.rejects(db.query('select public.dispatch_ai_video_operator_worker()'), /permission denied/);
  await db.exec('reset role');
  console.log('Passed: old 40-poll recovery, 15-second cadence, exhausted sync state, no ambiguous resubmission, atomic request deduplication, active lease preservation, scheduler config errors, target URL validation, operator-only dispatch, anonymous caller denied.');

  // ── Verified identity lane (20260914010000) ─────────────────────────────
  // Stub the neighbours the migration touches, then apply the whole file.
  await db.exec(`alter table ai_video_operator_jobs
      add column ref_urls text[] not null default '{}'::text[],
      add column provider text not null default 'monid' check (provider in ('monid', 'byteplus_modelark'));
    grant select, insert, update, delete on table ai_video_operator_jobs to service_role;
    alter role service_role bypassrls; -- Supabase's service_role attribute; RLS here is a fail-closed floor for anon/authenticated.
    create table public.customers (id uuid primary key default gen_random_uuid());
    create table public.ai_video_orders (id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id),
      status text not null default 'paid', fulfillment_status text, fulfillment_updated_at timestamptz, paid_at timestamptz,
      updated_at timestamptz not null default now());
    create table public.consent_events (id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id),
      consent_type text not null, accepted_at timestamptz not null, ip_address inet, user_agent text, version text not null default 'v1.0',
      created_at timestamptz not null default now(), constraint consent_events_consent_type_chk check (consent_type in ('tos', 'marketing')));
    grant select, insert, update, delete on table public.customers, public.ai_video_orders, public.consent_events to service_role;
    create schema cron; create table cron.job(jobid bigserial primary key, jobname text, schedule text, command text);
    create function cron.schedule(jobname text, schedule text, command text) returns bigint language sql as $$ insert into cron.job(jobname, schedule, command) values ($1, $2, $3) returning jobid $$;
    create function cron.unschedule(job_id bigint) returns boolean language sql as $$ delete from cron.job where jobid = $1 returning true $$;
    alter table net.calls add column url text;
    create or replace function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int) returns bigint language sql as $$ insert into net.calls(payload, url) values (body, url) returning id $$;`);
  const legacy = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  // A pre-existing row that the new shape rule would reject must not block the migration.
  await db.query(`insert into ai_video_operator_jobs(id,status,ref_urls) values ($1,'succeeded','{http://legacy.example/sheet.png}')`, [legacy]);
  const identity = await readFile(new URL('../supabase/migrations/20260914010000_ai_video_identities.sql', import.meta.url), 'utf8');
  await db.exec(identity);
  // Migration is re-runnable.
  await db.exec(identity);
  const shape = (await db.query(`select convalidated from pg_constraint where conname = 'ai_video_operator_jobs_ref_urls_shape_check'`)).rows[0];
  assert.equal(shape.convalidated, false, 'legacy ref_urls row leaves the shape check NOT VALID instead of failing the migration');
  assert.equal((await db.query(`select convalidated from pg_constraint where conname = 'ai_video_operator_jobs_asset_provider_check'`)).rows[0].convalidated, true);
  const cronRows = (await db.query(`select schedule, command from cron.job where jobname = 'ai_video_identity_gc_nightly'`)).rows;
  assert.equal(cronRows.length, 1, 'exactly one nightly GC schedule after two applies');
  assert.equal(cronRows[0].schedule, '0 19 * * *'); assert.match(cronRows[0].command, /dispatch_ai_video_identity_gc/);

  // Operator job refs: https:// or asset://, and asset:// forces ModelArk.
  await db.exec('set role service_role');
  await db.query(`insert into ai_video_operator_jobs(id,status,ref_urls) values ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1','queued','{https://example.com/sheet.png}')`);
  await db.query(`insert into ai_video_operator_jobs(id,status,provider,ref_urls) values ('e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2','queued','byteplus_modelark','{https://example.com/sheet.png,asset://asset-richie-01}')`);
  await assert.rejects(db.query(`insert into ai_video_operator_jobs(id,status,provider,ref_urls) values ('e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3','queued','monid','{asset://asset-richie-01}')`), /asset_provider_check/);
  await assert.rejects(db.query(`insert into ai_video_operator_jobs(id,status,ref_urls) values ('e4e4e4e4-e4e4-4e4e-8e4e-e4e4e4e4e4e4','queued','{http://example.com/sheet.png}')`), /ref_urls_shape_check/);
  await assert.rejects(db.query(`insert into ai_video_operator_jobs(id,status,provider,ref_urls) values ('e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5','queued','byteplus_modelark','{asset://short}')`), /ref_urls_shape_check/);
  await assert.rejects(db.query(`update ai_video_operator_jobs set ref_urls = '{https://ok.example/x.png,ftp://nope}' where id = $1`, [legacy]), /ref_urls_shape_check/);

  // Identities: customer rows need a customer; verified rows need group + consent.
  const customer = (await db.query(`insert into public.customers default values returning id`)).rows[0].id;
  const oldOrder = (await db.query(`insert into public.ai_video_orders(customer_id, fulfillment_status, fulfillment_updated_at, paid_at)
    values ($1, 'delivered', now() - interval '40 days', now() - interval '45 days') returning id`, [customer])).rows[0].id;
  await assert.rejects(db.query(`insert into public.ai_video_identities(owner_kind, display_name) values ('customer', 'No Customer')`), /customer_owner_check/);
  await assert.rejects(db.query(`insert into public.ai_video_identities(owner_kind, display_name, verification_status, consent_at) values ('founder', 'Richie', 'verified', now())`), /verified_has_group_check/);
  await assert.rejects(db.query(`insert into public.ai_video_identities(owner_kind, display_name, verification_status, group_id) values ('founder', 'Richie', 'verified', 'group-richie-001')`), /verified_has_consent_check/);
  await assert.rejects(db.query(`insert into public.ai_video_identities(owner_kind, display_name, group_id) values ('founder', 'Richie', 'bad id!')`), /group_id_check/);
  await assert.rejects(db.query(`insert into public.ai_video_identities(owner_kind, display_name, callback_nonce_hash) values ('founder', 'Richie', 'not-a-sha256')`), /callback_nonce_hash_check/);
  const founder = (await db.query(`insert into public.ai_video_identities(owner_kind, display_name, verification_status, group_id, consent_at, consent_text_version)
    values ('founder', 'Richie', 'verified', 'group-richie-001', now(), 'v1') returning id`)).rows[0].id;
  const cust = (await db.query(`insert into public.ai_video_identities(owner_kind, customer_id, order_id, display_name, verification_status, group_id, consent_at, consent_text_version)
    values ('customer', $1, $2, 'Pelanggan Satu', 'verified', 'group-cust-0001', now(), 'v1') returning id`, [customer, oldOrder])).rows[0].id;
  await assert.rejects(db.query(`insert into public.ai_video_identities(owner_kind, display_name, group_id) values ('founder', 'Dup', 'group-richie-001')`), /group_id_uidx/);
  const nonce = 'a'.repeat(64);
  await db.query(`update public.ai_video_identities set callback_nonce_hash = $1 where id = $2`, [nonce, founder]);
  await assert.rejects(db.query(`update public.ai_video_identities set callback_nonce_hash = $1 where id = $2`, [nonce, cust]), /nonce_uidx/);

  // Per-identity caps: customer 2, founder 6; soft-deleted rows free a slot; restoring past the cap is rejected.
  const addAsset = (identityId, assetId) => db.query(`insert into public.ai_video_identity_assets(identity_id, asset_id, asset_type) values ($1, $2, 'Image') returning id`, [identityId, assetId]);
  await assert.rejects(addAsset(cust, 'short'), /asset_id_check/);
  const custA = (await addAsset(cust, 'asset-cust-0001')).rows[0].id;
  await addAsset(cust, 'asset-cust-0002');
  await assert.rejects(addAsset(cust, 'asset-cust-0003'), /identity_asset_cap/);
  await db.query(`update public.ai_video_identity_assets set deleted_at = now() where id = $1`, [custA]);
  // Soft-deleted rows keep their asset_id: BytePlus ids are globally unique and never reused.
  await assert.rejects(addAsset(cust, 'asset-cust-0001'), /unique/);
  await addAsset(cust, 'asset-cust-0003');
  await assert.rejects(db.query(`update public.ai_video_identity_assets set deleted_at = null where id = $1`, [custA]), /identity_asset_cap/);
  for (let i = 1; i <= 6; i++) await addAsset(founder, `asset-richie-0${i}`);
  await assert.rejects(addAsset(founder, 'asset-richie-07'), /identity_asset_cap/);
  // Moving an asset into a full identity is also refused.
  await assert.rejects(db.query(`update public.ai_video_identity_assets set identity_id = $1 where asset_id = 'asset-cust-0002'`, [founder]), /identity_asset_cap/);
  await db.query(`update public.ai_video_identity_assets set status = 'failed', failed_reason = 'face mismatch' where asset_id = 'asset-richie-06'`);

  // Quota view: live non-failed assets and unrevoked groups against 50/50, alert at 40.
  let quota = (await db.query('select * from public.ai_video_identity_quota')).rows[0];
  assert.deepEqual(quota, { active_assets: 7, groups: 2, asset_limit: 50, group_limit: 50, alert: false });
  await db.query(`insert into public.ai_video_identities(owner_kind, display_name, group_id)
    select 'founder', 'Bulk ' || g, 'group-bulk-' || lpad(g::text, 4, '0') from generate_series(1, 38) g`);
  quota = (await db.query('select * from public.ai_video_identity_quota')).rows[0];
  assert.equal(quota.groups, 40); assert.equal(quota.alert, true);
  await db.query(`update public.ai_video_identities set revoked_at = now() where display_name like 'Bulk %'`);
  quota = (await db.query('select * from public.ai_video_identity_quota')).rows[0];
  assert.equal(quota.groups, 2); assert.equal(quota.alert, false);

  // Consent: consent_events accepts the new biometric type and still rejects junk.
  await db.query(`insert into public.consent_events(customer_id, consent_type, accepted_at, version) values ($1, 'ai_video_identity_face', now(), 'v1')`, [customer]);
  await db.query(`insert into public.consent_events(customer_id, consent_type, accepted_at) values ($1, 'tos', now())`, [customer]);
  await assert.rejects(db.query(`insert into public.consent_events(customer_id, consent_type, accepted_at) values ($1, 'junk', now())`, [customer]), /consent_type_chk/);

  // GC candidates: customer assets on orders delivered > 30 days ago with no recent inference. Founders never.
  let gc = (await db.query('select asset_id from public.ai_video_identity_gc_candidates() order by asset_id')).rows.map((r) => r.asset_id);
  assert.deepEqual(gc, ['asset-cust-0002', 'asset-cust-0003'], 'soft-deleted asset excluded, founder assets excluded');
  await db.query(`update public.ai_video_identity_assets set last_inference_at = now() - interval '2 days' where asset_id = 'asset-cust-0002'`);
  gc = (await db.query('select asset_id from public.ai_video_identity_gc_candidates()')).rows.map((r) => r.asset_id);
  assert.deepEqual(gc, ['asset-cust-0003'], 'recent inference keeps the asset');
  await db.query(`update public.ai_video_orders set fulfillment_updated_at = now() - interval '10 days' where id = $1`, [oldOrder]);
  assert.equal((await db.query('select * from public.ai_video_identity_gc_candidates()')).rows.length, 0, 'recently delivered order is not swept');
  await db.query(`update public.ai_video_orders set fulfillment_status = 'in_progress', fulfillment_updated_at = now() - interval '60 days' where id = $1`, [oldOrder]);
  assert.equal((await db.query('select * from public.ai_video_identity_gc_candidates()')).rows.length, 0, 'undelivered order is not swept');
  await db.query(`update public.ai_video_orders set fulfillment_status = 'delivered' where id = $1`, [oldOrder]);

  // Nightly dispatcher: same Vault secrets as the operator worker, URL swapped to ai-video-identity, body {"action":"gc"}.
  await db.query('select public.dispatch_ai_video_identity_gc()');
  await db.exec('reset role');
  const gcCall = (await db.query(`select url, payload from net.calls order by id desc limit 1`)).rows[0];
  assert.equal(gcCall.url, 'https://testproject.supabase.co/functions/v1/ai-video-identity');
  assert.deepEqual(gcCall.payload, { action: 'gc' });
  await db.exec(`update vault.decrypted_secrets set decrypted_secret='https://evil.example/functions/v1/ai-video-render-worker' where name='ai_video_operator_worker_url'`);
  await assert.rejects(db.query('select public.dispatch_ai_video_identity_gc()'), /identity_gc_schedule_invalid_url/);
  await db.exec(`delete from vault.decrypted_secrets where name='ai_video_operator_worker_token'`);
  await assert.rejects(db.query('select public.dispatch_ai_video_identity_gc()'), /identity_gc_schedule_unconfigured/);

  // Anonymous callers get nothing.
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from public.ai_video_identities'), /permission denied/);
  await assert.rejects(db.query('select * from public.ai_video_identity_assets'), /permission denied/);
  await assert.rejects(db.query('select * from public.ai_video_identity_quota'), /permission denied/);
  await assert.rejects(db.query('select * from public.ai_video_identity_gc_candidates()'), /permission denied/);
  await assert.rejects(db.query('select public.dispatch_ai_video_identity_gc()'), /permission denied/);
  await db.exec('reset role');
  console.log('Passed: identity migration re-runnable, legacy ref_urls guard, https/asset:// shape, asset:// forces ModelArk, verified needs group + consent, customer needs customer_id, unique group + nonce, per-identity caps 2/6 incl. restore + move, quota view alert at 40, consent type extended, GC candidates, nightly dispatcher URL + body, anonymous denied.');
} finally { await db.close(); }
