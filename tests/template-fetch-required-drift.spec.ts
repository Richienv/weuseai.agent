/**
 * Drift gate for the `template_fetch_required: true` SKILL.md convention.
 *
 * P1 of the 2026-05-22 strict template-fetch flow. When a manifest skill
 * entry declares `template_fetch_required: true`, the skill's SKILL.md
 * must instruct the agent to consult the persona's template library
 * before improvising — concretely, the body must carry a section heading
 * `## Fetch template` (matched case-insensitively; "Fetch template",
 * "Fetch template dulu", "Template fetch", etc. all qualify).
 *
 * This gate prevents the discipline from rotting: an author cannot flip
 * the flag without also writing the instruction block, and cannot delete
 * the instruction block without also clearing the flag.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(TEST_DIR, '..')
const AGENT_PACKS_DIR = resolve(REPO_ROOT, 'agent-packs')

type ManifestSkillRaw = {
  id: string
  template_fetch_required?: boolean
}

type ManifestRaw = {
  agent_slug: string
  skills: ManifestSkillRaw[]
}

function listPersonaPacks(): string[] {
  return readdirSync(AGENT_PACKS_DIR).filter((entry) => {
    if (entry.startsWith('_')) return false
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

type Target = { pack: string; skillId: string; skillMdPath: string }

function collectTargets(): Target[] {
  const targets: Target[] = []
  for (const pack of listPersonaPacks()) {
    const manifest = readManifest(pack)
    if (!manifest || !Array.isArray(manifest.skills)) continue
    for (const skill of manifest.skills) {
      if (skill.template_fetch_required !== true) continue
      targets.push({
        pack,
        skillId: skill.id,
        skillMdPath: resolve(AGENT_PACKS_DIR, pack, 'skills', skill.id, 'SKILL.md'),
      })
    }
  }
  return targets
}

const TARGETS = collectTargets()

// Headers that count as the required instruction block. Matched at the
// start of a line (anchored at the H2 level) so a casual mention in
// prose doesn't satisfy the gate.
const FETCH_HEADER_RE = /^##\s+(fetch template|template fetch)\b/im

test('template_fetch_required drift gate scans every persona pack', () => {
  // Sanity: the gate must not silently skip if the discovery walk breaks.
  // Listing the packs at all proves the walk works; an empty TARGETS array
  // means "no skill has the flag yet" which is the expected initial state
  // — the gate becomes meaningful as soon as the first opt-in lands.
  assert.ok(
    listPersonaPacks().length > 0,
    'no persona packs discovered under agent-packs/',
  )
})

for (const target of TARGETS) {
  const label = `${target.pack}/${target.skillId}`

  test(`template-fetch drift: ${label} — SKILL.md exists`, () => {
    let stat
    try {
      stat = statSync(target.skillMdPath)
    } catch {
      assert.fail(`SKILL.md not found at ${target.skillMdPath}`)
    }
    assert.ok(stat.isFile(), `${target.skillMdPath} is not a file`)
  })

  test(`template-fetch drift: ${label} — SKILL.md has a ## Fetch template section`, () => {
    const body = readFileSync(target.skillMdPath, 'utf8')
    assert.match(
      body,
      FETCH_HEADER_RE,
      `${label}: manifest declares template_fetch_required:true but ` +
        `SKILL.md is missing a "## Fetch template" (or "## Template fetch") section`,
    )
  })
}
