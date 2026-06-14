/**
 * Post-deploy smoke: every sellable catalog slug must be accepted by the LIVE
 * create-invoice Edge Function, and a bogus slug must be rejected.
 *
 * Why: create-invoice deploys separately from Vercel and went a month stale
 * once (#229 fix merged but undeployed) — customers hit "Paket tidak dikenali"
 * for weeks. This canary fails the deploy workflow LOUDLY if the live function
 * doesn't recognise a catalog slug, so a bad/stale deploy can't pass silently.
 *
 * Non-destructive: we send an incomplete body (plan + email only). The handler
 * validates plan BEFORE the later fields, so a recognised plan fails on the
 * NEXT field (e.g. invalid_alwaysOn) — never reaching invoice creation. So:
 *   - sellable slug  -> error is NOT 'invalid_plan'  (accepted)
 *   - bogus slug     -> error IS 'invalid_plan'      (rejected)
 *
 * Run: SMOKE_BASE=<supabase url> SMOKE_ANON=<anon key> npx tsx scripts/smoke-create-invoice-plans.ts
 */

import { TIERS } from '../supabase/functions/_shared/tier-personas.ts'

const BASE = process.env.SMOKE_BASE
const ANON = process.env.SMOKE_ANON
if (!BASE || !ANON) {
  console.error('FATAL: SMOKE_BASE and SMOKE_ANON env vars are required')
  process.exit(2)
}

const URL = `${BASE.replace(/\/$/, '')}/functions/v1/create-invoice`

// Sellable slugs = the canonical catalog minus enterprise (contact-only, not
// self-serve checkout). Derived from the source of truth — no hardcoded list.
const SELLABLE = (Object.keys(TIERS) as Array<keyof typeof TIERS>).filter((t) => t !== 'enterprise')

async function errorCodeFor(plan: string): Promise<string> {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { apikey: ANON!, authorization: `Bearer ${ANON}`, 'content-type': 'application/json' },
    body: JSON.stringify({ plan, email: 'deploy-smoke@weuseai.test' }),
  })
  const body = (await r.json().catch(() => ({}))) as { error?: string; invoice_url?: string }
  if (body.invoice_url) return 'created_invoice' // should not happen with an incomplete body
  return body.error ?? `http_${r.status}`
}

const failures: string[] = []

for (const slug of SELLABLE) {
  const code = await errorCodeFor(slug)
  if (code === 'invalid_plan') {
    failures.push(`sellable slug "${slug}" was REJECTED as invalid_plan — the live function does not recognise it (stale deploy?)`)
    console.error(`✗ ${slug} -> ${code}`)
  } else {
    console.log(`✓ ${slug} -> ${code} (accepted)`)
  }
}

// Control: a bogus slug MUST be rejected (proves validation is actually running).
const bogus = await errorCodeFor('totally-not-a-real-plan')
if (bogus !== 'invalid_plan') {
  failures.push(`bogus slug was NOT rejected (got "${bogus}") — plan validation is not running on the live function`)
  console.error(`✗ bogus -> ${bogus} (expected invalid_plan)`)
} else {
  console.log(`✓ bogus -> ${bogus} (correctly rejected)`)
}

if (failures.length) {
  console.error(`\nSMOKE FAILED (${failures.length}):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`\nSMOKE PASSED — all ${SELLABLE.length} catalog slugs accepted by the live create-invoice, bogus rejected.`)
