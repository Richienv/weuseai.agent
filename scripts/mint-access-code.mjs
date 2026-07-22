#!/usr/bin/env node
/**
 * Mint an access code for a B2B client who paid OUTSIDE the system.
 *
 * WHY THIS EXISTS
 * ---------------
 * Some clients settle by bank transfer, not Xendit. They still need the
 * exact same activation as a paid invoice: an active subscription on the
 * right tier, a VPS spun up, and the same /welcome landing. The redeem
 * path (`supabase/functions/redeem-access-code`) does all of that — but
 * only for a code that already exists in `access_codes`. This script is
 * the ONLY supported way to put one there.
 *
 * CODE FORMAT (canonical — mirrored by the edge handler's CODE_RE)
 * ---------------------------------------------------------------
 * Alphabet ABCDEFGHJKMNPQRSTVWXYZ23456789 (30 chars — I, L, O, U, 0 and 1
 * are excluded so a code read aloud or typed off a WhatsApp screenshot
 * cannot be mistyped). Length 8 → 30^8 ≈ 6.56e11 keyspace. Stored
 * normalised (8 chars, no dash); shown to the operator as XXXX-XXXX.
 *
 * Randomness is `crypto.randomInt`, which rejection-samples internally —
 * a plain `randomBytes(1)[0] % 30` would bias the first 16 letters of the
 * alphabet and shrink the effective keyspace.
 *
 * ENV (never hardcode — read from .env.local or the real environment)
 * -------------------------------------------------------------------
 *   SUPABASE_URL               https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service-role key (access_codes is RLS
 *                              default-deny; only service-role writes)
 *
 * USAGE
 * -----
 *   npm run mint:code -- --tier=library-full --label="PT Sinar Jaya"
 *   npm run mint:code -- --tier=done-for-you --always-on --expires-days=14
 *   npm run mint:code -- --tier=solo --uses=3 --notes="batch onboarding"
 *   npm run mint:code -- --tier=solo --dry-run   # generate + print only
 *
 * The code is printed ONCE. It is not recoverable from the dashboard in
 * display form — re-run the script if it is lost before hand-off.
 */

import { randomInt } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load .env.local if present (local runs); CI/cron passes real env.
const ENV_LOCAL = resolve(process.cwd(), '.env.local')
if (existsSync(ENV_LOCAL)) {
  for (const line of readFileSync(ENV_LOCAL, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
const CODE_LENGTH = 8
const MAX_INSERT_ATTEMPTS = 5

/**
 * Canonical v1.4 tiers a code may grant. `enterprise` is deliberately
 * absent — enterprise deals are contracted and provisioned by hand, and
 * an 8-char string must never be able to hand one out.
 */
const ALLOWED_TIERS = ['bare', 'solo', 'voice-starter', 'library-full', 'done-for-you']

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

// ─── args ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = { alwaysOn: false, dryRun: false, uses: 1 }
  for (const arg of argv) {
    if (arg === '--always-on') {
      flags.alwaysOn = true
    } else if (arg === '--dry-run') {
      flags.dryRun = true
    } else if (arg.startsWith('--tier=')) {
      flags.tier = arg.slice('--tier='.length)
    } else if (arg.startsWith('--label=')) {
      flags.label = arg.slice('--label='.length)
    } else if (arg.startsWith('--notes=')) {
      flags.notes = arg.slice('--notes='.length)
    } else if (arg.startsWith('--expires-days=')) {
      flags.expiresDays = Number(arg.slice('--expires-days='.length))
    } else if (arg.startsWith('--uses=')) {
      flags.uses = Number(arg.slice('--uses='.length))
    } else {
      fail(`unknown argument "${arg}" — see the usage block in this script`)
    }
  }

  if (!flags.tier) {
    fail(
      `--tier is required. Allowed: ${ALLOWED_TIERS.join(', ')}\n` +
        '  example: npm run mint:code -- --tier=library-full --label="PT Sinar Jaya"',
    )
  }
  if (!ALLOWED_TIERS.includes(flags.tier)) {
    fail(
      `--tier "${flags.tier}" is not mintable. Allowed: ${ALLOWED_TIERS.join(', ')}` +
        (flags.tier === 'enterprise'
          ? '\n  enterprise is provisioned by hand, never via an access code.'
          : ''),
    )
  }
  if (!Number.isInteger(flags.uses) || flags.uses < 1) {
    fail('--uses must be a positive integer (default 1)')
  }
  if (flags.expiresDays !== undefined) {
    if (!Number.isInteger(flags.expiresDays) || flags.expiresDays < 1) {
      fail('--expires-days must be a positive integer')
    }
  }
  return flags
}

// ─── code generation ───────────────────────────────────────────────────

/**
 * Cryptographically-secure 8-char code. `randomInt(0, 30)` rejection-
 * samples under the hood, so every letter is equally likely — modulo on
 * raw bytes would not be.
 */
function generateCode() {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)]
  }
  return out
}

/** Storage form (8 chars) → display form XXXX-XXXX. */
function toDisplay(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

// ─── insert ────────────────────────────────────────────────────────────

async function insertCode(supabaseUrl, serviceKey, row) {
  const res = await fetch(`${supabaseUrl}/rest/v1/access_codes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  const text = await res.text()
  if (res.status === 409 || /duplicate key|23505/.test(text)) {
    // Astronomically unlikely at 6.56e11 keyspace — retried anyway so a
    // collision is a one-line retry, never a confusing operator error.
    return { collision: true }
  }
  if (!res.ok) {
    throw new Error(`insert access_codes → HTTP ${res.status}: ${text}`)
  }
  return { collision: false, body: text }
}

// ─── main ──────────────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs(process.argv.slice(2))

  const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!flags.dryRun && (!supabaseUrl || !serviceKey)) {
    fail(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local or env).\n' +
        '  Run with --dry-run to generate a code without inserting it.',
    )
  }

  const expiresAt =
    flags.expiresDays === undefined
      ? null
      : new Date(Date.now() + flags.expiresDays * 24 * 60 * 60 * 1000).toISOString()

  let code = null
  if (flags.dryRun) {
    code = generateCode()
  } else {
    for (let attempt = 1; attempt <= MAX_INSERT_ATTEMPTS; attempt++) {
      const candidate = generateCode()
      const result = await insertCode(supabaseUrl, serviceKey, {
        code: candidate,
        tier: flags.tier,
        label: flags.label ?? null,
        always_on: flags.alwaysOn,
        max_redemptions: flags.uses,
        expires_at: expiresAt,
        notes: flags.notes ?? null,
      })
      if (!result.collision) {
        code = candidate
        break
      }
      console.error(`  ! code collision on attempt ${attempt} — regenerating`)
    }
    if (!code) fail(`could not mint a unique code after ${MAX_INSERT_ATTEMPTS} attempts`)
  }

  const lines = [
    '',
    `${flags.dryRun ? '[dry-run] ' : ''}Access code: ${toDisplay(code)}`,
    `  tier        : ${flags.tier}`,
    `  always_on   : ${flags.alwaysOn ? 'yes' : 'no'}`,
    `  max uses    : ${flags.uses}`,
    `  expires     : ${expiresAt ? expiresAt : 'never'}`,
  ]
  if (flags.label) lines.push(`  label       : ${flags.label}`)
  if (flags.notes) lines.push(`  notes       : ${flags.notes}`)
  lines.push(
    '',
    flags.uses === 1
      ? 'Sekali pakai — kode ini hangus begitu ditukar, dan hanya ditampilkan sekali di sini.'
      : `Bisa dipakai ${flags.uses} kali, dan kode ini hanya ditampilkan sekali di sini.`,
    '',
  )
  console.log(lines.join('\n'))
}

main().catch((e) => {
  console.error(`✗ fatal: ${e instanceof Error ? e.stack : String(e)}`)
  process.exit(1)
})
