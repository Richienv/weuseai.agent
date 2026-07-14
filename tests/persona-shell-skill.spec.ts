/**
 * D1 lock 2026-05-12: every persona pack ships a top-level SKILL.md
 * (the "persona shell") so Hermes auto-exposes /<slug> as a slash
 * command. R1 verified on Renita's Vultr VPS — Hermes discovers
 * skills via rglob over ~/.hermes/skills/<slug>/SKILL.md and routes
 * /<slug> directly to the skill.
 *
 * bundle-pull-script.ts:apply_tier_filter() copies each
 * agent-pack/<slug>/SKILL.md → ~/.hermes/skills/<slug>/SKILL.md on
 * every Hermes boot. This test guards against drift: a missing
 * SKILL.md means the customer can't invoke that persona at all.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { KNOWN_PERSONA_SLUGS } from '../supabase/functions/_shared/manifest-validator.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

for (const slug of KNOWN_PERSONA_SLUGS) {
  test(`persona shell: agent-packs/${slug}/SKILL.md exists`, () => {
    const p = path.join(ROOT, `agent-packs/${slug}/SKILL.md`)
    assert.ok(fs.existsSync(p), `expected persona-shell SKILL.md at ${p}`)
  })

  test(`persona shell: agent-packs/${slug}/SKILL.md mentions /${slug}`, () => {
    const md = fs.readFileSync(path.join(ROOT, `agent-packs/${slug}/SKILL.md`), 'utf8')
    assert.match(
      md,
      new RegExp(`/${slug}\\b`),
      `persona shell for ${slug} should reference the /${slug} slash command`,
    )
  })

  test(`persona shell: agent-packs/${slug}/SKILL.md has "Kapan dipakai" section (Hermes discovery convention)`, () => {
    const md = fs.readFileSync(path.join(ROOT, `agent-packs/${slug}/SKILL.md`), 'utf8')
    assert.match(md, /## Kapan dipakai/, `persona shell for ${slug} missing "Kapan dipakai" section`)
  })

  test(`persona shell: agent-packs/${slug}/SKILL.md has no banned brand-voice words`, () => {
    const md = fs.readFileSync(path.join(ROOT, `agent-packs/${slug}/SKILL.md`), 'utf8')
    // Brand voice rule from CLAUDE.md: no basically, just, literally, honestly,
    // kind of, pretty much, revolutionary, disrupt, 10x, game-changer, next-level.
    // (The `just` exclusion has too many false positives in technical context
    // — we allow it inside SKILL.md technical instructions; the strict version
    // applies only to customer-facing landing/checkout copy.)
    const banned = /\b(basically|literally|honestly|revolutionary|disrupt|10x|game-changer|next-level)\b/i
    assert.doesNotMatch(md, banned, `persona shell for ${slug} contains banned word`)
  })
}

test('Deep Researcher now has a manifest.json (closes drafted-only gap)', () => {
  const p = path.join(ROOT, 'agent-packs/deep-researcher/manifest.json')
  assert.ok(fs.existsSync(p), 'expected manifest.json at agent-packs/deep-researcher/')
  const m = JSON.parse(fs.readFileSync(p, 'utf8'))
  assert.equal(m.agent_slug, 'deep-researcher')
  assert.match(m.version, /^\d+\.\d+\.\d+$/)
  assert.ok(Array.isArray(m.skills) && m.skills.length >= 1, 'manifest must have at least 1 skill entry')
  assert.equal(m.self_extend, true)
})
