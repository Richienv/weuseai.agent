/**
 * Drift gate for every `skill_kind: "playbook"` manifest entry.
 *
 * Phase 2 Week 3 — locks the playbook format established in Phase 1 / 2 so
 * future authors can't ship a manifest entry that says one thing while the
 * SKILL.md says another. Iterates every persona manifest, finds each
 * `skill_kind: "playbook"` skill, and asserts:
 *
 *   - the SKILL.md file exists at agent-packs/<pack>/skills/<id>/SKILL.md
 *   - it has YAML frontmatter delimited by `---`
 *   - frontmatter `skill_kind` = "playbook"
 *   - frontmatter `name` = the manifest skill id
 *   - frontmatter `bundle` = the manifest's agent_slug
 *   - frontmatter `flow_state_playbook_id` = the manifest skill id
 *   - frontmatter `total_steps` is a positive integer
 *   - the body has exactly `total_steps` `### Langkah N` step headings
 *   - every step block contains all 6 bold fields: Aksi / Tautan/endpoint /
 *     Input yang diharapkan / Output yang diharapkan / Validasi /
 *     Gerbang eskalasi
 *
 * No external YAML parser — frontmatter is simple key: value lines for
 * the fields we check.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(TEST_DIR, '..')
const AGENT_PACKS_DIR = resolve(REPO_ROOT, 'agent-packs')

// ─── helpers ─────────────────────────────────────────────────────────────

type ManifestSkillRaw = {
  id: string
  skill_kind?: string
}

type ManifestRaw = {
  agent_slug: string
  skills: ManifestSkillRaw[]
}

function listPersonaPacks(): string[] {
  return readdirSync(AGENT_PACKS_DIR).filter((entry) => {
    if (entry.startsWith('_')) return false // _shared, _manifest.schema.json
    const full = resolve(AGENT_PACKS_DIR, entry)
    try {
      return statSync(full).isDirectory()
    } catch {
      return false
    }
  })
}

function readManifest(pack: string): ManifestRaw | null {
  try {
    return JSON.parse(
      readFileSync(resolve(AGENT_PACKS_DIR, pack, 'manifest.json'), 'utf8'),
    ) as ManifestRaw
  } catch {
    return null
  }
}

/**
 * Extract a scalar value from a YAML-ish `key: value` frontmatter block.
 * Returns the raw string (quotes stripped), or null if the key is missing.
 */
function extractScalar(frontmatter: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.+)$`, 'm')
  const m = frontmatter.match(re)
  if (!m) return null
  return m[1].trim().replace(/^["']|["']$/g, '')
}

function splitFrontmatter(skillMd: string): { frontmatter: string; body: string } | null {
  // SKILL.md must open with `---` on line 1.
  if (!skillMd.startsWith('---')) return null
  const lines = skillMd.split('\n')
  // Find the closing `---` after line 0.
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return {
        frontmatter: lines.slice(1, i).join('\n'),
        body: lines.slice(i + 1).join('\n'),
      }
    }
  }
  return null
}

const REQUIRED_STEP_FIELDS = [
  '**Aksi:**',
  '**Tautan/endpoint:**',
  '**Input yang diharapkan:**',
  '**Output yang diharapkan:**',
  '**Validasi:**',
  '**Gerbang eskalasi:**',
] as const

// ─── collect every (pack, skill_kind=playbook) target ────────────────────

type PlaybookTarget = {
  pack: string
  agentSlug: string
  skillId: string
  skillMdPath: string
}

function collectPlaybookTargets(): PlaybookTarget[] {
  const targets: PlaybookTarget[] = []
  for (const pack of listPersonaPacks()) {
    const manifest = readManifest(pack)
    if (!manifest || !Array.isArray(manifest.skills)) continue
    for (const skill of manifest.skills) {
      if (skill.skill_kind !== 'playbook') continue
      targets.push({
        pack,
        agentSlug: manifest.agent_slug,
        skillId: skill.id,
        skillMdPath: resolve(
          AGENT_PACKS_DIR,
          pack,
          'skills',
          skill.id,
          'SKILL.md',
        ),
      })
    }
  }
  return targets
}

const TARGETS = collectPlaybookTargets()

// ─── tests ───────────────────────────────────────────────────────────────

// Sanity guard: if there are no playbooks at all, the gate is meaningless.
// Phase 1 shipped 3 (deep-researcher/market-research, slide-master/pitch-deck,
// the-pro/customer-reply) so we expect at least 3 on main.
test('drift-gate: at least 3 playbooks declared on main (Phase 1 baseline)', () => {
  assert.ok(
    TARGETS.length >= 3,
    `expected ≥3 playbook manifest entries, found ${TARGETS.length}`,
  )
})

// Per-target shape checks — one suite per playbook, with a clear name so
// a failure points straight at the offending playbook.
for (const target of TARGETS) {
  const label = `${target.pack}/${target.skillId}`

  test(`drift: ${label} — SKILL.md exists`, () => {
    let stat
    try {
      stat = statSync(target.skillMdPath)
    } catch {
      assert.fail(`SKILL.md not found at ${target.skillMdPath}`)
    }
    assert.ok(stat.isFile(), `${target.skillMdPath} is not a file`)
  })

  test(`drift: ${label} — has YAML frontmatter`, () => {
    const content = readFileSync(target.skillMdPath, 'utf8')
    const split = splitFrontmatter(content)
    assert.ok(split, `${label}: SKILL.md must open with --- frontmatter`)
  })

  test(`drift: ${label} — frontmatter fields match manifest`, () => {
    const content = readFileSync(target.skillMdPath, 'utf8')
    const split = splitFrontmatter(content)
    assert.ok(split, `${label}: no frontmatter`)
    const fm = split.frontmatter

    assert.equal(
      extractScalar(fm, 'skill_kind'),
      'playbook',
      `${label}: skill_kind must be "playbook"`,
    )
    assert.equal(
      extractScalar(fm, 'name'),
      target.skillId,
      `${label}: frontmatter name must equal the manifest skill id`,
    )
    assert.equal(
      extractScalar(fm, 'bundle'),
      target.agentSlug,
      `${label}: frontmatter bundle must equal the manifest agent_slug`,
    )
    assert.equal(
      extractScalar(fm, 'flow_state_playbook_id'),
      target.skillId,
      `${label}: frontmatter flow_state_playbook_id must equal the manifest skill id`,
    )
    const total = extractScalar(fm, 'total_steps')
    assert.match(total ?? '', /^\d+$/, `${label}: total_steps must be an integer`)
    assert.ok(
      Number(total) >= 1,
      `${label}: total_steps must be ≥1`,
    )
  })

  test(`drift: ${label} — step count matches total_steps`, () => {
    const content = readFileSync(target.skillMdPath, 'utf8')
    const split = splitFrontmatter(content)
    assert.ok(split, `${label}: no frontmatter`)

    const declared = Number(extractScalar(split.frontmatter, 'total_steps') ?? '0')
    // Only count headings of the shape "### Langkah <N> — ...".
    const stepHeadings = split.body.match(/^### Langkah \d+\b/gm) ?? []

    assert.equal(
      stepHeadings.length,
      declared,
      `${label}: declared total_steps=${declared} but found ${stepHeadings.length} "### Langkah N" headings`,
    )
  })

  test(`drift: ${label} — every step has all 6 required bold fields`, () => {
    const content = readFileSync(target.skillMdPath, 'utf8')
    const split = splitFrontmatter(content)
    assert.ok(split, `${label}: no frontmatter`)

    // Split body on step headings; check each step block.
    const parts = split.body.split(/(?=^### Langkah \d+\b)/m)
    const stepBlocks = parts.filter((p) => /^### Langkah \d+\b/.test(p))
    assert.ok(stepBlocks.length > 0, `${label}: no step blocks found`)

    for (const block of stepBlocks) {
      const headingMatch = block.match(/^### Langkah \d+[^\n]*/)
      const heading = headingMatch ? headingMatch[0] : '(unknown step)'
      const missing = REQUIRED_STEP_FIELDS.filter((field) => !block.includes(field))
      assert.equal(
        missing.length,
        0,
        `${label}: step "${heading.trim()}" is missing field(s): ${missing.join(', ')}`,
      )
    }
  })
}
