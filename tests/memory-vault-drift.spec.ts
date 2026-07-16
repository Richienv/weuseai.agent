/**
 * Drift gate for The Pro's memory vault ("unlimited memory / second brain").
 *
 * THE CONSTRAINT THIS GATE EXISTS TO DEFEND
 * ─────────────────────────────────────────
 * Upstream Hermes loads EXACTLY TWO things into the agent's context:
 *   1. SOUL.md — system prompt, unconditional, every turn
 *   2. a SKILL.md — only when that skill match-triggers
 * There is no template loader (docs/audits/2026-05-17-persona-template-inventory.md).
 * Therefore arbitrary vault markdown is INERT: the agent reads a file only if
 * it voluntarily issues a read AND in-context prose names the exact path.
 *
 * So the standing recall + capture discipline MUST live in
 * agent-packs/the-pro/SOUL.md, naming the vault path literally. If that
 * section is deleted, or the path drifts from the one provisioning actually
 * creates, the vault is never read and the whole feature is dead weight —
 * silently, with every test still green. These tests are what make that
 * failure loud.
 *
 * Pins:
 *   - SOUL.md carries the memory section, names the literal vault path,
 *     and mandates both recall and capture
 *   - the path in SOUL.md == MEMORY_VAULT_DIR in the bundle-pull script
 *     == the paths in the end-of-day + weekly cron prompts
 *   - the vault lives OUTSIDE the version-scoped bundle tree (a version bump
 *     must not orphan accumulated memory) and is seeded SEED-IF-ABSENT
 *   - recall stays BOUNDED (no "read the whole vault" / growing index)
 *   - per-turn writes stay cheap: SOUL.md's capture rule targets inbox.md
 *     only; note/index writing is deferred to the crons
 *   - exactly ONE writer owns the daily/weekly artifacts (no competing skill)
 *   - every seeded vault file is declared in manifest.json and vice versa
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, relative, resolve } from 'node:path'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(TEST_DIR, '..')
const PACK_DIR = resolve(REPO_ROOT, 'agent-packs/the-pro')
const VAULT_SEED_DIR = resolve(PACK_DIR, 'templates/memory')

/** The one string that has to be identical everywhere or the vault is inert. */
const VAULT_PATH = '/var/lib/weuseai/memory'

const soulMd = readFileSync(resolve(PACK_DIR, 'SOUL.md'), 'utf8')
const manifest = JSON.parse(
  readFileSync(resolve(PACK_DIR, 'manifest.json'), 'utf8'),
) as {
  templates: { id: string; kind: string }[]
  skills: { id: string; templates_used?: string[] }[]
}
const bundlePullSrc = readFileSync(
  resolve(REPO_ROOT, 'services/provisioning/src/bundle-pull-script.ts'),
  'utf8',
)
const setupScriptSrc = readFileSync(
  resolve(REPO_ROOT, 'services/provisioning/src/setup-script.ts'),
  'utf8',
)

// ─── 1. SOUL.md is the prerequisite: without it, nothing else matters ────

test('vault: SOUL.md carries the memory section (the only file Hermes loads every turn)', () => {
  assert.match(
    soulMd,
    /^# My memory$/m,
    'agent-packs/the-pro/SOUL.md lost its "# My memory" section. Hermes loads SOUL.md ' +
      'unconditionally and a SKILL.md only on match — so this section is the ONLY place a ' +
      'standing recall+capture discipline can live. Without it the vault is never read.',
  )
})

test('vault: SOUL.md names the literal vault path (prose must name the exact path)', () => {
  assert.ok(
    soulMd.includes(`${VAULT_PATH}/index.md`),
    `SOUL.md must name ${VAULT_PATH}/index.md literally — the agent only reads a file when ` +
      'in-context prose names its exact path. A relative or vague reference is inert.',
  )
})

test('vault: SOUL.md mandates recall BEFORE answering from memory', () => {
  const section = memorySection()
  assert.match(
    section,
    /Recall —/,
    'SOUL.md memory section must carry the standing recall mandate',
  )
  assert.match(
    section,
    new RegExp(`baca \`?${VAULT_PATH}/index\\.md\`? dulu`),
    'the recall rule must send the agent to the index FIRST, by exact path',
  )
})

test('vault: SOUL.md mandates capture of durable facts', () => {
  const section = memorySection()
  assert.match(
    section,
    /Capture —/,
    'SOUL.md memory section must carry the standing capture mandate',
  )
  assert.ok(
    section.includes(`${VAULT_PATH}/inbox.md`),
    'the capture rule must name inbox.md by exact path',
  )
})

// ─── 2. Bounded recall + cheap per-turn path (latency + credit) ──────────

test('vault: recall is BOUNDED — SOUL.md caps how many notes a turn may open', () => {
  const section = memorySection()
  assert.match(
    section,
    /[Mm]aksimal dua berkas/,
    'SOUL.md must cap the per-turn read. Each customer runs a $5 OpenRouter starter key; ' +
      'an unbounded read chain adds seconds and burns credit on every message.',
  )
  assert.match(
    section,
    /jangan buka apa pun/,
    'SOUL.md must tell the agent to skip the vault entirely when the turn needs no memory',
  )
})

test('vault: index.md seed is capped — it must never grow monotonically', () => {
  const index = readFileSync(resolve(VAULT_SEED_DIR, 'index.md'), 'utf8')
  assert.match(
    index,
    /[Mm]aksimal 40 baris/,
    'index.md is read on every memory-bearing turn. An uncapped index re-creates the exact ' +
      'context blowup "unlimited memory" claims to solve. Keep the hard cap + the archive rule.',
  )
})

test('vault: per-turn write is ONE inbox line — note writing is deferred to the crons', () => {
  const section = memorySection()
  assert.match(
    section,
    /Satu baris, lalu lanjut mengobrol/,
    'the capture rule must stay a single append. Multi-file write chains mid-conversation are ' +
      'what the latency/credit constraint forbids.',
  )
  assert.match(
    section,
    /bukan tugas di tengah percakapan/,
    'SOUL.md must explicitly push note-writing / index-updating / pruning to the crons',
  )
})

// ─── 3. Path agreement: SOUL.md ↔ provisioning ──────────────────────────

test('vault: bundle-pull MEMORY_VAULT_DIR matches the path SOUL.md names', () => {
  assert.match(
    bundlePullSrc,
    new RegExp(`const MEMORY_VAULT_DIR = '${VAULT_PATH}'`),
    `bundle-pull-script.ts must seed exactly ${VAULT_PATH} — the path hard-coded in SOUL.md. ` +
      'If these drift, the agent reads an empty path forever and never says so.',
  )
})

test('vault: lives OUTSIDE the version-scoped bundle tree (upgrades must not orphan memory)', () => {
  const bundleBase = /const BUNDLE_DIR_BASE = '(.+)'/.exec(bundlePullSrc)?.[1]
  assert.ok(bundleBase, 'BUNDLE_DIR_BASE not found in bundle-pull-script.ts')
  assert.ok(
    !VAULT_PATH.startsWith(`${bundleBase}/`),
    `the vault (${VAULT_PATH}) must not live under BUNDLE_DIR_BASE (${bundleBase}). Bundles ` +
      're-extract into a NEW <slug>/<version>/ dir on every bump — memory stored there is ' +
      'silently orphaned the first time the pack updates.',
  )
})

test('vault: seed is SEED-IF-ABSENT — a pack update must never clobber grown notes', () => {
  assert.match(
    bundlePullSrc,
    /if \[ -e "\$dst" \]; then\n\s*kept=\$\(\(kept \+ 1\)\)\n\s*continue/,
    'seed_memory_vault must skip files that already exist. A bulk copy over the tree would ' +
      "overwrite the customer's accumulated memory on every version bump.",
  )
  assert.ok(
    !/cp -r\s+"\$src"/.test(bundlePullSrc),
    'never recursively copy the seed over the vault — seed file-by-file, if-absent only',
  )
})

test('vault: seeding is non-fatal (no vault is worse than no agent, but not fatal)', () => {
  assert.match(
    bundlePullSrc,
    /seed_memory_vault\(\) \{[\s\S]*?if \[ ! -d "\$src" \]; then\n\s*return 0/,
    'seed_memory_vault must no-op for personas that ship no vault scaffold (only the-pro does today)',
  )
})

// ─── 4. Writes ride the EXISTING crons — exactly one writer ─────────────

test('vault: the end-of-day cron owns the daily note + inbox drain', () => {
  const prompt = cronPrompt('EOD_SUMMARY_CRON_PROMPT')
  assert.ok(
    prompt.includes(`${VAULT_PATH}/inbox.md`),
    'the end-of-day cron must drain inbox.md — it is the vault\'s only daily writer',
  )
  assert.ok(
    prompt.includes(`${VAULT_PATH}/harian/YYYY-MM-DD.md`),
    'the end-of-day cron must write the daily note by exact path',
  )
  assert.ok(
    prompt.includes(`${VAULT_PATH}/index.md`),
    'the end-of-day cron must update the index — deferred here, never done per-turn',
  )
})

test('vault: the end-of-day cron sends the summary BEFORE touching the vault', () => {
  const prompt = cronPrompt('EOD_SUMMARY_CRON_PROMPT')
  const send = prompt.indexOf('BAGIAN 1')
  const vault = prompt.indexOf('BAGIAN 2')
  assert.ok(send > -1 && vault > -1, 'end-of-day cron must keep its two ordered parts')
  assert.ok(
    send < vault,
    'the customer summary must be sent FIRST. Vault upkeep is bookkeeping — it must never ' +
      'cost the customer the thing they were promised.',
  )
})

test('vault: the weekly cron owns synthesis + the pruning that keeps recall bounded', () => {
  const prompt = cronPrompt('WEEKLY_RECAP_CRON_PROMPT')
  assert.ok(
    prompt.includes(`${VAULT_PATH}/mingguan/YYYY-Www.md`),
    'the weekly cron must write the weekly synthesis by exact path',
  )
  assert.ok(
    prompt.includes(`${VAULT_PATH}/arsip/`),
    'the weekly cron must archive cold notes — this is what bounds index.md over time',
  )
  assert.match(
    prompt,
    /40 baris/,
    'the weekly cron must enforce the index cap; nothing else prunes it',
  )
})

test('vault: NO competing writer — only end-of-day-summary owns the vault templates', () => {
  const writers = manifest.skills.filter((s) =>
    (s.templates_used ?? []).some((t) => t.startsWith('memory/')),
  )
  assert.deepEqual(
    writers.map((s) => s.id),
    ['end-of-day-summary'],
    'the shipped end-of-day + weekly crons already own the daily/weekly artifacts. A second ' +
      'skill writing the same notes = two writers, conflicting. Fold new capture/synthesis ' +
      'steps into the existing playbook instead of adding a parallel memory skill.',
  )
})

test('vault: no standalone memory skill exists in the pack', () => {
  const skillDirs = readdirSync(resolve(PACK_DIR, 'skills'))
  for (const dir of skillDirs) {
    assert.ok(
      !/^memory/.test(dir),
      `agent-packs/the-pro/skills/${dir} looks like a parallel memory skill. The discipline ` +
        'belongs in SOUL.md (read every turn); the writes belong in the existing crons. ' +
        'A memory SKILL.md only loads when it match-triggers — which is exactly when a ' +
        'standing rule must NOT be optional.',
    )
  }
})

// ─── 5. Seed completeness: manifest ↔ disk ──────────────────────────────

function seedFilesOnDisk(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      // Skip macOS AppleDouble sidecars. They appear when the repo lives on an
      // exFAT volume, are gitignored (`._*`), and never reach a CI checkout.
      if (entry.startsWith('._')) continue
      const full = resolve(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.md')) out.push(`memory/${relative(VAULT_SEED_DIR, full)}`)
    }
  }
  walk(VAULT_SEED_DIR)
  return out.sort()
}

test('vault: every seeded file on disk is declared in manifest.json', () => {
  const declared = new Set(manifest.templates.map((t) => t.id))
  for (const file of seedFilesOnDisk()) {
    assert.ok(
      declared.has(file),
      `agent-packs/the-pro/templates/${file} ships in the bundle but is undeclared in ` +
        'manifest.json templates[]. Declare it so the inventory stays honest.',
    )
  }
})

test('vault: every declared memory template exists on disk (seed is not a promise)', () => {
  const onDisk = new Set(seedFilesOnDisk())
  for (const t of manifest.templates.filter((t) => t.id.startsWith('memory/'))) {
    assert.ok(
      onDisk.has(t.id),
      `manifest declares template "${t.id}" but agent-packs/the-pro/templates/${t.id} does not ` +
        'exist. bundle-pull would seed a vault missing that file, and the agent would read a ' +
        'path that never resolves.',
    )
  }
})

test('vault: seed covers the full structure SOUL.md advertises', () => {
  const onDisk = seedFilesOnDisk()
  // Every folder SOUL.md names must exist in the seed, or a fresh agent is
  // told to write somewhere that does not exist.
  for (const dir of ['orang', 'proyek', 'harian', 'mingguan', 'arsip']) {
    assert.ok(
      onDisk.some((f) => f.startsWith(`memory/${dir}/`)),
      `SOUL.md names ${VAULT_PATH}/${dir}/ but the seed ships no file under templates/memory/${dir}/. ` +
        'Empty dirs do not survive git or the tarball — ship a template so the folder exists.',
    )
  }
  for (const file of ['memory/index.md', 'memory/inbox.md', 'memory/preferensi.md']) {
    assert.ok(onDisk.includes(file), `seed is missing ${file}, which SOUL.md names by path`)
  }
})

// ─── 6. Brand voice on the new surface ──────────────────────────────────

const BANNED = [
  'basically',
  'just',
  'literally',
  'honestly',
  'kind of',
  'pretty much',
  'revolutionary',
  'disrupt',
  '10x',
  'game-changer',
  'next-level',
]

test('vault: seed notes + SOUL memory section pass brand voice (zero exclamation, no Anda)', () => {
  const surfaces: [string, string][] = [
    ['SOUL.md#My memory', memorySection()],
    ...seedFilesOnDisk().map(
      (f) =>
        [f, readFileSync(resolve(PACK_DIR, 'templates', f), 'utf8')] as [string, string],
    ),
  ]
  for (const [label, text] of surfaces) {
    assert.ok(!text.includes('!'), `${label}: zero exclamation marks in brand copy`)
    assert.ok(!/\bAnda\b/.test(text), `${label}: use "kamu", never "Anda"`)
    assert.ok(!/\b(lo|gue)\b/.test(text), `${label}: use "kamu", never lo/gue`)
    for (const word of BANNED) {
      assert.ok(
        !new RegExp(`\\b${word.replace(/[-]/g, '\\-')}\\b`, 'i').test(text),
        `${label}: banned brand word "${word}"`,
      )
    }
  }
})

// ─── 7. Honesty: no memory claim beyond what the code delivers ──────────

test('vault: SOUL.md adds no NEW memory promise to the customer', () => {
  // SOUL.md already promised "Aku ingat percakapan lintas sesi" long before the
  // vault existed (backed only by chat history). This build makes that claim
  // real. It must not become a bigger claim: the memory section is internal
  // discipline addressed to the agent, not new marketing addressed to the
  // customer, and the customer never sees the vault.
  const section = memorySection()
  assert.ok(
    !/tak terbatas|unlimited|selamanya|tidak pernah lupa/i.test(section),
    'do not promise unbounded/perfect memory. The vault is bounded by design (capped index, ' +
      'archived notes, max two reads per turn) — claiming otherwise oversells the code.',
  )
  assert.match(
    section,
    /Customer tidak pernah membukanya/,
    'the memory section must keep the rule that the vault is internal — customers only chat ' +
      'on Telegram and never read a note',
  )
})

// ─── helpers ────────────────────────────────────────────────────────────

/** The `# My memory` section of SOUL.md, up to the next top-level heading. */
function memorySection(): string {
  const m = /^# My memory$([\s\S]*?)(?=^# )/m.exec(soulMd)
  assert.ok(m, 'SOUL.md has no "# My memory" section')
  return m[1]
}

/** Source text of a cron prompt constant in setup-script.ts. */
function cronPrompt(name: string): string {
  const m = new RegExp(`export const ${name} =([\\s\\S]*?)\\n\\n`).exec(setupScriptSrc)
  assert.ok(m, `${name} not found in setup-script.ts`)
  return m[1]
}
