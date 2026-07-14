// RLS anti-pattern drift scanner.
//
// Source: docs/audits/2026-05-10-security-audit-sesi-d-pass-2.md
//   "drift test or migration template preventing USING (true) on any
//    table with customer_id"
//
// Walks migrations in chronological order, tracks customer-scoped tables,
// tracks effective policy state (CREATE then later DROP supersedes), and
// flags any effective `CREATE POLICY ... USING (true)` on a customer-
// scoped table without an `-- ALLOW-USING-TRUE: <reason>` escape comment
// directly above.
//
// Why scan effective state, not raw text:
// ────────────────────────────────────────
// Pass-1 P0-1 fix migrations (20260511*) DROP the offending Phase 5
// policies and CREATE replacements with USING (false). The *historical*
// USING (true) text remains in source for audit purposes — but the
// effective policy state in production is USING (false). A naive
// regex scanner would false-positive on those historical lines.
//
// The scanner builds the effective policy map by replaying migrations:
//   * CREATE POLICY <name> ON <table> ... USING (<expr>)
//       → set effective[(name, table)] = { expr, file, line, allowed }
//   * DROP POLICY [IF EXISTS] <name> ON <table>
//       → delete effective[(name, table)]
// At the end, only policies still in the effective map are checked.

export type DriftFinding = {
  /** Source file the offending policy was declared in. */
  file: string
  /** 1-indexed line of the CREATE POLICY statement. */
  line: number
  /** Policy name as written. */
  policy: string
  /** Target table (without schema). */
  table: string
  /** Reason the finding triggered. */
  reason: string
}

export type Migration = {
  filename: string
  contents: string
}

type EffectivePolicy = {
  policy: string
  table: string
  usingExpr: string
  file: string
  line: number
  /** Reason from `-- ALLOW-USING-TRUE: <reason>` if present, else null. */
  escapeReason: string | null
}

const POLICY_KEY = (name: string, table: string) =>
  `${normalizePolicyName(name)}\x00${table.toLowerCase()}`

function normalizePolicyName(s: string): string {
  // Postgres policy names are case-insensitive when unquoted, case-sensitive
  // when quoted. Migrations consistently quote them, so case-sensitive
  // comparison is correct. Strip surrounding quotes for the key.
  return s.replace(/^"(.*)"$/s, '$1')
}

function stripSchema(table: string): string {
  // strip optional `public.` prefix
  return table.replace(/^public\./i, '').toLowerCase()
}

// Match `CREATE POLICY <name> ON [public.]<table> ... USING (<expr>)`.
// We need access to capture groups + line numbers, so we run a global
// regex and use match.index to recover the line.
const CREATE_POLICY_RE =
  /CREATE\s+POLICY\s+("[^"]+"|\S+)\s+ON\s+([A-Za-z_][\w.]*)\b[\s\S]*?USING\s*\(([^;]*?)\)\s*(?:WITH\s+CHECK\s*\([^;]*?\)\s*)?;/gi

// Match `DROP POLICY [IF EXISTS] <name> ON [public.]<table>;`
const DROP_POLICY_RE =
  /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?("[^"]+"|\S+?)\s+ON\s+([A-Za-z_][\w.]*)\s*;/gi

// Match a customer_id column declaration in CREATE TABLE / ALTER TABLE.
// Used to build the "customer-scoped" table set.
const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][\w.]*)\s*\(([\s\S]*?)\)\s*;/gi
const ALTER_ADD_CUSTOMER_ID_RE =
  /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z_][\w.]*)[\s\S]*?ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?customer_id\b/gi
const HAS_CUSTOMER_ID_COL_RE = /(^|,|\()\s*customer_id\b/i

function lineOf(src: string, index: number): number {
  // 1-indexed line containing src[index].
  let line = 1
  for (let i = 0; i < index && i < src.length; i++) {
    if (src.charCodeAt(i) === 10) line++
  }
  return line
}

/** Returns the `<reason>` if line(s) immediately above `index` carry
 *  `-- ALLOW-USING-TRUE: <reason>`, else null. Empty reason returns null
 *  (forces a written acknowledgment). */
function findEscapeReason(src: string, index: number): string | null {
  // Walk backward from `index` to find the previous newline, then look
  // at the line just above. Skip blank lines.
  let pos = index
  while (pos > 0 && src.charCodeAt(pos - 1) !== 10) pos--
  // pos is now at start of the CREATE POLICY line.
  // Look at lines above: skip blank lines, then check first non-blank.
  let cursor = pos - 1 // newline ending previous line
  while (cursor > 0) {
    let lineEnd = cursor
    let lineStart = lineEnd
    while (lineStart > 0 && src.charCodeAt(lineStart - 1) !== 10) lineStart--
    const line = src.slice(lineStart, lineEnd).trim()
    if (line === '') {
      cursor = lineStart - 1
      continue
    }
    const m = line.match(/^--\s*ALLOW-USING-TRUE\s*:\s*(.*)$/i)
    if (!m) return null
    const reason = m[1].trim()
    return reason.length > 0 ? reason : null
  }
  return null
}

export function scanMigrations(migrations: Migration[]): DriftFinding[] {
  // Build the customer-scoped table set + effective policy state by
  // replaying migrations in order.
  //
  // Sorted by filename so chronological tie-breakers work the same way
  // Supabase CLI applies them.
  const sorted = [...migrations].sort((a, b) =>
    a.filename.localeCompare(b.filename),
  )

  const customerScoped = new Set<string>(['customers'])
  const effective = new Map<string, EffectivePolicy>()

  for (const mig of sorted) {
    const src = mig.contents

    // ─ Phase A: customer-scope discovery ─
    let m: RegExpExecArray | null

    CREATE_TABLE_RE.lastIndex = 0
    while ((m = CREATE_TABLE_RE.exec(src)) !== null) {
      const tbl = stripSchema(m[1])
      const body = m[2]
      if (HAS_CUSTOMER_ID_COL_RE.test(body)) {
        customerScoped.add(tbl)
      }
    }

    ALTER_ADD_CUSTOMER_ID_RE.lastIndex = 0
    while ((m = ALTER_ADD_CUSTOMER_ID_RE.exec(src)) !== null) {
      customerScoped.add(stripSchema(m[1]))
    }

    // ─ Phase B: policy state replay ─
    DROP_POLICY_RE.lastIndex = 0
    while ((m = DROP_POLICY_RE.exec(src)) !== null) {
      const name = m[1]
      const table = stripSchema(m[2])
      effective.delete(POLICY_KEY(name, table))
    }

    CREATE_POLICY_RE.lastIndex = 0
    while ((m = CREATE_POLICY_RE.exec(src)) !== null) {
      const name = m[1]
      const table = stripSchema(m[2])
      const usingExpr = m[3].trim()
      const line = lineOf(src, m.index)
      const escapeReason = findEscapeReason(src, m.index)
      effective.set(POLICY_KEY(name, table), {
        policy: normalizePolicyName(name),
        table,
        usingExpr,
        file: mig.filename,
        line,
        escapeReason,
      })
    }
  }

  // Now flag effective policies whose USING expression is `true` on a
  // customer-scoped table, unless an escape comment is present.
  const findings: DriftFinding[] = []
  for (const eff of effective.values()) {
    if (!isUsingTrue(eff.usingExpr)) continue
    if (!customerScoped.has(eff.table)) continue
    if (eff.escapeReason !== null) continue
    findings.push({
      file: eff.file,
      line: eff.line,
      policy: eff.policy,
      table: eff.table,
      reason: `CREATE POLICY ... USING (true) on customer-scoped table "${eff.table}" — anon-key holder can dump cross-customer rows. Replace with USING (false) + service-role Edge Function read, or add "-- ALLOW-USING-TRUE: <reason>" comment immediately above.`,
    })
  }

  // Stable order: file then line.
  findings.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
  )
  return findings
}

function isUsingTrue(expr: string): boolean {
  // Tolerate whitespace, parens, and case. `true`, `(true)`, `( TRUE )` all match.
  const stripped = expr.replace(/\s+/g, '').replace(/^\(+|\)+$/g, '').toLowerCase()
  return stripped === 'true'
}
