/**
 * Drift gate for The Pro's skill-engine families (the "30 peran" layer).
 *
 * THE CONSTRAINTS THIS GATE DEFENDS
 * ─────────────────────────────────
 * 1. RELIABILITY SPLIT — numbers come from shell (tools/kas.py, tools/fill.py),
 *    content comes from seeded LIBRARY templates, the LLM is language skin.
 *    If a tool stops compiling, or a SKILL.md stops calling it, the family
 *    silently degrades to "LLM makes numbers up" — the exact failure mode
 *    the layer was built to prevent.
 * 2. MANIFEST ↔ DISK PARITY — every declared family skill has a SKILL.md,
 *    every templates_used id exists in templates[] AND as a file, every new
 *    family template on disk is declared. Hermes installs from the manifest;
 *    an undeclared file never reaches the customer.
 * 3. WEBSITE TEMPLATES stay shippable — {{placeholder}} present, <30KB,
 *    zero external assets (CSP-free VPS serving is spike-gated; a CDN dep
 *    would break the "self-contained" promise silently), and config.json
 *    asks at most 4 questions per template, all of which resolve.
 * 4. BRAND + HONESTY — customer-facing surfaces carry zero exclamation
 *    marks, no banned words, no "Anda"; no "auto-kirim" claim (drafts are
 *    approved + sent by the customer) and no "akurat N%" accuracy claim.
 * 5. SOUL.md carries the low-literacy UX rules + the one-sentence skill
 *    index — SOUL.md is the only file Hermes loads every turn, so a family
 *    the SOUL never names is discoverable only by luck.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(TEST_DIR, '..')
const PACK_DIR = resolve(REPO_ROOT, 'agent-packs/the-pro')

const FAMILIES = [
  'buku-kas',
  'tukang-tagih',
  'admin-toko',
  'konten-harian',
  'juru-dokumen',
  'asisten-pribadi',
  'hidup-sehat',
  'rutinitas',
  'website-instan',
] as const

/** Template id prefixes owned by this layer (manifest↔disk parity scope). */
const FAMILY_TEMPLATE_PREFIXES = [
  'kas/',
  'tagih/',
  'toko/',
  'konten/',
  'dokumen/',
  'pribadi/',
  'sehat/',
  'rutinitas/',
  'website/',
]

const WEBSITE_TEMPLATES = [
  'umkm-profil',
  'menu-qr',
  'linkbio',
  'katalog',
  'undangan',
  'cv-online',
  'toko-sederhana',
  'jasa',
]

type ManifestSkill = {
  id: string
  description_id: string
  template_fetch_required?: boolean
  templates_used?: string[]
  execution: string
  handler_ref: string
  enabled_for_tiers?: string[]
}
type ManifestTemplate = { id: string; kind: string; description_id: string }
type Manifest = {
  version: string
  skills: ManifestSkill[]
  templates: ManifestTemplate[]
}

const manifest = JSON.parse(
  readFileSync(resolve(PACK_DIR, 'manifest.json'), 'utf8'),
) as Manifest
const soulMd = readFileSync(resolve(PACK_DIR, 'SOUL.md'), 'utf8')

const skillById = new Map(manifest.skills.map((s) => [s.id, s]))
const templateIds = new Set(manifest.templates.map((t) => t.id))

// ─── 1. manifest ↔ disk: skills ─────────────────────────────────────────

for (const family of FAMILIES) {
  test(`engines: ${family} — declared in manifest.json`, () => {
    assert.ok(
      skillById.has(family),
      `manifest.json skills[] is missing "${family}" — bundle-pull installs from the manifest, ` +
        'so an undeclared skill never reaches a customer VPS.',
    )
  })

  test(`engines: ${family} — SKILL.md exists on disk`, () => {
    const p = resolve(PACK_DIR, 'skills', family, 'SKILL.md')
    assert.ok(statSync(p).isFile(), `${p} missing`)
  })

  test(`engines: ${family} — hermes-skill execution + all-tier eligibility`, () => {
    const s = skillById.get(family)
    assert.ok(s, `${family} not in manifest`)
    assert.equal(s.execution, 'hermes-skill')
    assert.equal(s.handler_ref, `hermes-skill:${family}`)
    assert.deepEqual(s.enabled_for_tiers, ['starter', 'pro', 'studio'])
  })

  test(`engines: ${family} — template_fetch_required + templates_used resolve`, () => {
    const s = skillById.get(family)
    assert.ok(s, `${family} not in manifest`)
    assert.equal(
      s.template_fetch_required,
      true,
      `${family}: content must come from the seeded library — flag template_fetch_required`,
    )
    const used = s.templates_used ?? []
    assert.ok(used.length > 0, `${family}: must reference its library templates`)
    for (const id of used) {
      assert.ok(templateIds.has(id), `${family}: templates_used "${id}" not declared in templates[]`)
      const p = resolve(PACK_DIR, 'templates', id)
      assert.ok(statSync(p).isFile(), `${family}: template file missing on disk: ${p}`)
    }
  })
}

// ─── 2. manifest ↔ disk: family template files ──────────────────────────

function familyFilesOnDisk(): string[] {
  const out: string[] = []
  const base = resolve(PACK_DIR, 'templates')
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('._') || entry === '.DS_Store') continue
      const full = resolve(dir, entry)
      if (statSync(full).isDirectory()) walk(full, `${prefix}${entry}/`)
      else out.push(`${prefix}${entry}`)
    }
  }
  for (const p of FAMILY_TEMPLATE_PREFIXES) {
    const dir = resolve(base, p)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    walk(dir, p)
  }
  return out.sort()
}

test('engines: every family template on disk is declared in manifest.json', () => {
  for (const file of familyFilesOnDisk()) {
    assert.ok(
      templateIds.has(file),
      `agent-packs/the-pro/templates/${file} ships in the bundle but is undeclared in manifest ` +
        'templates[]. Declare it so the inventory stays honest.',
    )
  }
})

test('engines: every declared family template exists on disk', () => {
  const onDisk = new Set(familyFilesOnDisk())
  for (const t of manifest.templates) {
    if (!FAMILY_TEMPLATE_PREFIXES.some((p) => t.id.startsWith(p))) continue
    assert.ok(
      onDisk.has(t.id),
      `manifest declares "${t.id}" but the file does not exist — the agent would fetch a path ` +
        'that never resolves.',
    )
  }
})

// ─── 3. deterministic tools compile + stay LLM-free number sources ──────

for (const tool of ['kas.py', 'fill.py']) {
  test(`engines: tools/${tool} — python3 compiles it (stdlib only)`, () => {
    execFileSync('python3', ['-m', 'py_compile', resolve(PACK_DIR, 'tools', tool)], {
      stdio: 'pipe',
    })
  })

  test(`engines: tools/${tool} — imports stdlib only`, () => {
    const src = readFileSync(resolve(PACK_DIR, 'tools', tool), 'utf8')
    const STDLIB = new Set([
      'argparse', 'csv', 'json', 'os', 're', 'sys', 'html', 'datetime', 'math',
    ])
    for (const m of src.matchAll(/^(?:import (\w+)|from (\w+) import)/gm)) {
      const mod = (m[1] ?? m[2]) as string
      assert.ok(
        STDLIB.has(mod),
        `tools/${tool} imports "${mod}" — customer VPSes have no pip; stdlib only`,
      )
    }
  })
}

test('engines: buku-kas SKILL.md calls kas.py via shell — never computes itself', () => {
  const body = readFileSync(resolve(PACK_DIR, 'skills/buku-kas/SKILL.md'), 'utf8')
  assert.match(body, /tools\/kas\.py/, 'buku-kas must invoke tools/kas.py')
  assert.match(body, /python3 /, 'buku-kas must show the literal shell invocation')
  assert.match(
    body,
    /bukan olehku|bukan hitungan model|bukan dijumlah di kepala/,
    'buku-kas must state that the LLM never does the arithmetic',
  )
})

test('engines: website-instan SKILL.md fills via fill.py, not hand-written HTML', () => {
  const body = readFileSync(resolve(PACK_DIR, 'skills/website-instan/SKILL.md'), 'utf8')
  assert.match(body, /tools\/fill\.py/, 'website-instan must invoke tools/fill.py')
  assert.match(
    body,
    /Tidak menulis HTML dari nol/,
    'website-instan must forbid improvised HTML outside the templates',
  )
})

test('engines: spike-gated capabilities are marked in the skills that depend on them', () => {
  // Unverified Hermes capabilities (crontab self-registration, Caddy serving,
  // document-file send/receive) ship written but flagged — the agent must be
  // honest about them until the real-VPS spike passes.
  for (const [family, marker] of [
    ['rutinitas', /spike-gated/i],
    ['website-instan', /spike-gated/i],
    ['juru-dokumen', /spike-gated/i],
  ] as const) {
    const body = readFileSync(resolve(PACK_DIR, 'skills', family, 'SKILL.md'), 'utf8')
    assert.match(body, marker, `${family}: missing the spike-gated marker`)
  }
})

// ─── 4. website templates: placeholders, size, self-containment ─────────

const websiteConfig = JSON.parse(
  readFileSync(resolve(PACK_DIR, 'templates/website/config.json'), 'utf8'),
) as { templates: Record<string, { pertanyaan: { key: string; tanya: string }[] }> }

const PLACEHOLDER_RE = /\{\{\s*([a-z][a-z0-9_]*)\s*(?:\|\s*(?:links|tabel|wa)\s*)?\}\}/g

function templatePlaceholders(html: string): Set<string> {
  const keys = new Set<string>()
  for (const m of html.matchAll(PLACEHOLDER_RE)) keys.add(m[1])
  return keys
}

for (const name of WEBSITE_TEMPLATES) {
  const path = resolve(PACK_DIR, 'templates/website', `${name}.html`)

  test(`website: ${name} — exists, <30KB, has {{placeholder}}s`, () => {
    const stat = statSync(path)
    assert.ok(stat.isFile(), `${path} missing`)
    assert.ok(
      stat.size < 30 * 1024,
      `${name}.html is ${stat.size} bytes — must stay under 30KB for cheap VPS serving`,
    )
    const html = readFileSync(path, 'utf8')
    const keys = templatePlaceholders(html)
    assert.ok(keys.size > 0, `${name}.html has no {{placeholder}} — nothing for fill.py to fill`)
  })

  test(`website: ${name} — zero external assets (self-contained promise)`, () => {
    const html = readFileSync(path, 'utf8')
    for (const [label, re] of [
      ['external script', /<script[^>]*\ssrc=/i],
      ['inline script', /<script(?![^>]*\ssrc=)/i], // static pages: no JS at all
      ['external stylesheet', /<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:/i],
      ['css @import', /@import/i],
      ['remote css url()', /url\(\s*["']?https?:/i],
      ['remote image', /<img[^>]+src=["']https?:/i],
      ['iframe', /<iframe/i],
      ['known CDN host', /(cdn\.|unpkg\.com|jsdelivr\.net|fonts\.googleapis|cdnjs)/i],
    ] as const) {
      assert.ok(!re.test(html), `${name}.html contains ${label} — templates must be self-contained`)
    }
  })

  test(`website: ${name} — config.json asks ≤4 questions that fully cover the template`, () => {
    const entry = websiteConfig.templates[name]
    assert.ok(entry, `config.json has no entry for "${name}"`)
    assert.ok(
      entry.pertanyaan.length >= 1 && entry.pertanyaan.length <= 4,
      `${name}: ${entry.pertanyaan.length} questions — the low-literacy cap is 4`,
    )
    const questionKeys = new Set(entry.pertanyaan.map((q) => q.key))
    assert.equal(questionKeys.size, entry.pertanyaan.length, `${name}: duplicate question keys`)
    const html = readFileSync(path, 'utf8')
    const needed = templatePlaceholders(html)
    // Every placeholder must be answerable, every question must be used.
    for (const key of needed) {
      assert.ok(
        questionKeys.has(key),
        `${name}: placeholder {{${key}}} has no config.json question — fill.py would always fail`,
      )
    }
    for (const key of questionKeys) {
      assert.ok(
        needed.has(key),
        `${name}: config asks "${key}" but the template never uses it — a wasted question`,
      )
    }
  })
}

test('website: config.json covers exactly the 8 shipped templates', () => {
  assert.deepEqual(
    Object.keys(websiteConfig.templates).sort(),
    [...WEBSITE_TEMPLATES].sort(),
  )
})

test('website: fill.py end-to-end — deterministic fill of menu-qr with escaping', () => {
  const out = execFileSync(
    'python3',
    [resolve(PACK_DIR, 'tools/fill.py'), 'daftar', '--template', resolve(PACK_DIR, 'templates/website/menu-qr.html')],
    { encoding: 'utf8' },
  )
  const parsed = JSON.parse(out) as { ok: boolean; placeholder: string[] }
  assert.equal(parsed.ok, true)
  assert.deepEqual(
    [...parsed.placeholder].sort(),
    ['catatan', 'menu', 'nama_usaha', 'whatsapp'],
  )
})

// ─── 5. brand + honesty on every new customer-facing surface ────────────

const BANNED_WORDS = [
  'basically', 'just', 'literally', 'honestly', 'kind of', 'pretty much',
  'revolutionary', 'disrupt', '10x', 'game-changer', 'next-level',
]

function customerFacingSurfaces(): [string, string][] {
  const surfaces: [string, string][] = []
  for (const family of FAMILIES) {
    const p = resolve(PACK_DIR, 'skills', family, 'SKILL.md')
    surfaces.push([`skills/${family}/SKILL.md`, readFileSync(p, 'utf8')])
  }
  for (const file of familyFilesOnDisk()) {
    const raw = readFileSync(resolve(PACK_DIR, 'templates', file), 'utf8')
    // HTML: check visible text only (tags + CSS live inside <style>/<head>).
    const text = file.endsWith('.html')
      ? raw.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ')
      : raw
    surfaces.push([`templates/${file}`, text])
  }
  return surfaces
}

test('brand: zero exclamation marks + no Anda/lo-gue on any new surface', () => {
  for (const [label, text] of customerFacingSurfaces()) {
    assert.ok(!text.includes('!'), `${label}: exclamation mark found — brand voice is calm`)
    assert.ok(!/\bAnda\b/.test(text), `${label}: use "kamu", never "Anda"`)
    assert.ok(!/\b(lo|gue)\b/.test(text), `${label}: use "kamu", never lo/gue`)
  }
})

test('brand: no banned words on any new surface', () => {
  for (const [label, text] of customerFacingSurfaces()) {
    for (const word of BANNED_WORDS) {
      assert.ok(
        !new RegExp(`\\b${word.replace(/[-]/g, '\\-')}\\b`, 'i').test(text),
        `${label}: banned brand word "${word}"`,
      )
    }
  }
})

test('honesty: no auto-send claim, no percent-accuracy claim', () => {
  const surfaces = customerFacingSurfaces()
  surfaces.push(['manifest.json', JSON.stringify(manifest)])
  for (const [label, text] of surfaces) {
    assert.ok(
      !/auto-?kirim/i.test(text),
      `${label}: "auto-kirim" — the agent DRAFTS, the customer approves + sends`,
    )
    assert.ok(
      !/akurat\s+\d+\s*%/i.test(text),
      `${label}: numeric accuracy claim — we never promise "% akurat"`,
    )
  }
})

test('honesty: dunning + shop + content skills keep the draft-approve-send split', () => {
  for (const family of ['tukang-tagih', 'admin-toko', 'konten-harian'] as const) {
    const body = readFileSync(resolve(PACK_DIR, 'skills', family, 'SKILL.md'), 'utf8')
    assert.match(
      body,
      /customer yang|kamu yang|approve/i,
      `${family}: must state the customer approves/sends — the agent never contacts third parties`,
    )
  }
})

test('honesty: hidup-sehat carries the permanent non-medical disclaimer', () => {
  const body = readFileSync(resolve(PACK_DIR, 'skills/hidup-sehat/SKILL.md'), 'utf8')
  assert.match(body, /bukan dokter/i)
  assert.match(body, /bukan ahli gizi/i)
  const latihan = readFileSync(resolve(PACK_DIR, 'templates/sehat/latihan-rumahan.md'), 'utf8')
  assert.match(latihan, /bukan pelatih atau tenaga medis/i)
})

test('honesty: buku-kas frames tax as indicative, never licensed advice', () => {
  const body = readFileSync(resolve(PACK_DIR, 'skills/buku-kas/SKILL.md'), 'utf8')
  assert.match(body, /bukan konsultan pajak/i)
  assert.match(body, /0,5%/, 'the 0.5% final-tax basis must be stated')
})

// ─── 6. SOUL.md: low-literacy UX rules + the skill index sentence ────────

test('soul: SOUL.md carries the low-literacy UX rules (thin, in How I communicate)', () => {
  assert.match(soulMd, /maksimal 3 baris/, 'SOUL.md must cap default answers at 3 lines')
  assert.match(soulMd, /satu emoji/, 'SOUL.md must offer one-emoji confirmation')
  assert.match(soulMd, /Voice note setara teks/, 'SOUL.md must make voice notes first-class')
})

test('soul: SOUL.md indexes the 9 families in one sentence', () => {
  assert.match(
    soulMd,
    /buku kas.*tukang tagih.*admin toko.*konten harian.*juru dokumen.*asisten pribadi.*hidup sehat.*rutinitas.*website instan/s,
    'SOUL.md is the only every-turn file — without the index sentence the families are ' +
      'discoverable only by luck',
  )
})

test('soul: the additions stay thin — SOUL.md under 7000 chars (read every message)', () => {
  assert.ok(
    soulMd.length < 7000,
    `SOUL.md is ${soulMd.length} chars — it ships in every prompt; keep the additions thin`,
  )
})

// ─── 7. version discipline ───────────────────────────────────────────────

test('engines: manifest version bumped to ≥1.7.0 for the skill-engine layer', () => {
  const [major, minor] = manifest.version.split('.').map(Number)
  assert.ok(
    major > 1 || (major === 1 && minor >= 7),
    `manifest.version ${manifest.version} — bundle-pull skips unchanged versions; the layer ` +
      'only reaches VPSes after a bump',
  )
})
