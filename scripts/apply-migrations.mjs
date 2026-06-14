#!/usr/bin/env node
/**
 * Apply pending Supabase migrations via the Management API — no DB password.
 *
 * Why this exists (2026-06-14): Edge Functions auto-deploy, but MIGRATIONS had
 * no deploy gate, so merged migrations sat unapplied. That silently broke
 * production: `fleet_alerts`, `custom_personas`, `library_proposals`,
 * `customers.genesis_draft` and more existed on main but NOT in the live DB —
 * the features that depend on them errored with 42P01/42703. (See
 * docs + PR history.) `supabase db push` would close this but needs a DB
 * password secret; this does the same job over the Management API SQL endpoint
 * using the SUPABASE_ACCESS_TOKEN we already have.
 *
 * Idempotent: applies only repo migrations whose version is NOT yet recorded in
 * supabase_migrations.schema_migrations, then records each. Re-running is a
 * no-op once the DB is in sync.
 *
 * Run: SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=<token> node scripts/apply-migrations.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REF = process.env.SUPABASE_PROJECT_REF
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!REF || !TOKEN) {
  console.error('FATAL: SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN are required.')
  process.exit(2)
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`

async function sql(query) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok || (body && typeof body === 'object' && !Array.isArray(body) && body.message)) {
    throw new Error(`SQL failed (HTTP ${r.status}): ${JSON.stringify(body).slice(0, 400)}`)
  }
  return body
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql') && !f.startsWith('.')) // ignore macOS ._ AppleDouble files
  .sort()
const versionOf = (f) => (f.match(/^(\d+)_/) || [])[1]

const recorded = new Set(
  (await sql('select version from supabase_migrations.schema_migrations')).map((r) => String(r.version)),
)

let applied = 0
for (const f of files) {
  const version = versionOf(f)
  if (!version) { console.warn(`skip (no numeric version prefix): ${f}`); continue }
  if (recorded.has(version)) continue
  const name = f.replace(/^\d+_/, '').replace(/\.sql$/, '').replace(/'/g, "''")
  console.log(`→ applying ${f}`)
  await sql(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
  await sql(`insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}') on conflict (version) do nothing`)
  applied++
}

console.log(applied > 0 ? `Applied ${applied} pending migration(s).` : 'No pending migrations — DB schema is in sync with main.')
