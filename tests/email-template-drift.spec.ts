// Drift gate — assets/email-templates/*.md ↔ lifecycle-email-bodies.ts.
//
// The Supabase Edge Function runtime is Deno and Edge-bundled, so we don't
// read assets/ from disk at request time. Instead, the six lifecycle
// templates are inlined as TypeScript string constants in
// supabase/functions/_shared/lifecycle-email-bodies.ts (the canonical
// source for the body builders).
//
// This test pins the two sides together. If a future author updates the
// .md template but forgets the .ts constant (or vice versa), the suite
// fails loud with a per-template diff hint.
//
// What we compare:
//   - The body markdown AFTER the front-matter (`# title` line and
//     `<!-- Variables ... -->` comment) and AFTER the `**Subject:**` /
//     `---` separator. That is the substring the .ts string constant
//     must hold verbatim.
//   - The subject line extracted from `**Subject:** ...` must match the
//     `subject` field returned by the corresponding builder for the
//     same set of substitution variables (we render with the SAME args
//     on both sides and assert equality).

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  LIFECYCLE_TEMPLATE_SOURCES,
} from '../supabase/functions/_shared/lifecycle-email-bodies.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = join(__dirname, '..', 'assets', 'email-templates')

type ParsedMd = { subject: string; body: string }

function parseTemplateMd(raw: string): ParsedMd {
  // Strip leading `# title` line
  // Strip the `<!-- Variables ... -->` HTML comment
  // Find `**Subject:** ...` and capture the subject text
  // Skip the `---` separator + any leading blank lines
  // Everything after is the body — trimmed of trailing whitespace.
  const noComment = raw.replace(/<!--[\s\S]*?-->/g, '')
  const lines = noComment.split('\n')

  let subject = ''
  const bodyLines: string[] = []
  let pastSubject = false
  let pastSeparator = false
  for (const line of lines) {
    if (!pastSubject) {
      const m = line.match(/^\*\*Subject:\*\*\s*(.+?)\s*$/)
      if (m) {
        subject = m[1]
        pastSubject = true
        continue
      }
      continue
    }
    if (!pastSeparator) {
      if (/^---\s*$/.test(line)) {
        pastSeparator = true
        continue
      }
      // Skip lines before separator (whitespace, etc.)
      continue
    }
    bodyLines.push(line)
  }

  // Trim leading blank lines + trailing whitespace from the body.
  while (bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift()
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
    bodyLines.pop()
  }

  return { subject, body: bodyLines.join('\n') }
}

describe('email template drift — assets/email-templates/*.md ↔ lifecycle-email-bodies.ts', () => {
  for (const [name, source] of Object.entries(LIFECYCLE_TEMPLATE_SOURCES)) {
    test(`${name}.md body matches the inline TS constant`, () => {
      const raw = readFileSync(join(TEMPLATE_DIR, `${name}.md`), 'utf8')
      const parsed = parseTemplateMd(raw)
      assert.equal(
        source.body.trim(),
        parsed.body.trim(),
        `Body for ${name} drifted. Update either ` +
          `assets/email-templates/${name}.md OR the inline ` +
          `LIFECYCLE_TEMPLATE_SOURCES["${name}"].body in ` +
          `supabase/functions/_shared/lifecycle-email-bodies.ts so they match.`,
      )
    })

    test(`${name}.md subject matches the inline TS constant`, () => {
      const raw = readFileSync(join(TEMPLATE_DIR, `${name}.md`), 'utf8')
      const parsed = parseTemplateMd(raw)
      assert.equal(
        source.subject,
        parsed.subject,
        `Subject for ${name} drifted. Update either ` +
          `assets/email-templates/${name}.md OR the inline ` +
          `LIFECYCLE_TEMPLATE_SOURCES["${name}"].subject in ` +
          `supabase/functions/_shared/lifecycle-email-bodies.ts so they match.`,
      )
    })
  }

  test('all six template names are represented in the .ts constant', () => {
    const names = Object.keys(LIFECYCLE_TEMPLATE_SOURCES).sort()
    assert.deepEqual(names, [
      'flow-expired',
      'flow-paused',
      'refund',
      'setup-help',
      'support-handoff',
      'welcome',
    ])
  })
})
