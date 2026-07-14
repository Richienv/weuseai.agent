// Phase 5-4: Indonesian-context refinement templates drift tests.
//
// Asserts the 4 new templates exist on disk + are registered in the
// business-director manifest + carry the expected content markers.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const BD_DIR = path.join(ROOT, 'agent-packs/business-agent')

const NEW_TEMPLATES = [
  {
    id: 'finance/bpjs-registration-paths.md',
    contentMarkers: [
      'BPJS Kesehatan',
      'BPJS Ketenagakerjaan',
      'JHT',
      'JKK',
      'JKM',
      'JP',
    ],
  },
  {
    id: 'finance/djp-tax-filing-cycle.md',
    contentMarkers: ['PPh 21', 'PPh 25', 'PPN', 'PKP', 'SPT Tahunan'],
  },
  {
    id: 'finance/bank-account-checklist.md',
    contentMarkers: ['BCA', 'Mandiri', 'NIB', 'rekening badan'],
  },
  {
    id: 'legal/uu-pdp-basic-compliance.md',
    contentMarkers: ['UU 27/2022', 'Privacy Policy', 'DPO', 'Otoritas PDP'],
  },
] as const

type Manifest = { templates: { id: string; kind: string; description_id: string }[] }

function readManifest(): Manifest {
  return JSON.parse(
    fs.readFileSync(path.join(BD_DIR, 'manifest.json'), 'utf8'),
  ) as Manifest
}

// ─── Files exist ──────────────────────────────────────────────────

for (const t of NEW_TEMPLATES) {
  test(`${t.id} exists on disk`, () => {
    const p = path.join(BD_DIR, 'templates', t.id)
    assert.ok(
      fs.existsSync(p),
      `expected template at ${path.relative(ROOT, p)}`,
    )
  })
}

// ─── Manifest registration ────────────────────────────────────────

test('all 4 Phase 5-4 templates registered in manifest', () => {
  const m = readManifest()
  const ids = new Set(m.templates.map((t) => t.id))
  for (const t of NEW_TEMPLATES) {
    assert.ok(
      ids.has(t.id),
      `expected template ${t.id} registered in business-agent/manifest.json`,
    )
  }
})

test('every Phase 5-4 manifest entry has Phase 5-4 attribution in description', () => {
  const m = readManifest()
  for (const t of NEW_TEMPLATES) {
    const entry = m.templates.find((e) => e.id === t.id)
    assert.ok(entry, `missing manifest entry for ${t.id}`)
    assert.ok(
      /Phase 5-4/.test(entry!.description_id),
      `${t.id} description_id should mention Phase 5-4 attribution`,
    )
  }
})

// ─── Content markers ─────────────────────────────────────────────

for (const t of NEW_TEMPLATES) {
  test(`${t.id} contains required content markers`, () => {
    const md = fs.readFileSync(path.join(BD_DIR, 'templates', t.id), 'utf8')
    for (const marker of t.contentMarkers) {
      assert.ok(
        md.includes(marker),
        `${t.id} missing required marker: ${marker}`,
      )
    }
  })
}

// ─── Disclaimer presence (governance defense) ────────────────────

test('all Phase 5-4 templates carry "not licensed advisor" disclaimer', () => {
  for (const t of NEW_TEMPLATES) {
    const md = fs.readFileSync(path.join(BD_DIR, 'templates', t.id), 'utf8')
    assert.ok(
      /Disclaimer|disclaim|bukan.*berlisensi|bukan.*lawyer|bukan.*advokat|bukan.*akuntan|bukan.*konsultan/i.test(md),
      `${t.id} should carry "not licensed advisor" disclaimer`,
    )
  }
})

// ─── Cross-reference to BD v3 deliverables ───────────────────────

test('djp-tax-filing-cycle references at least one BD v3 deliverable id', () => {
  const md = fs.readFileSync(
    path.join(BD_DIR, 'templates/finance/djp-tax-filing-cycle.md'),
    'utf8',
  )
  // Must reference at least one stages.ts deliverable id to keep the
  // template anchored to the state-machine.
  assert.ok(
    /build_unit_economics_modeled|sell_recurring_revenue_stable|setup_npwp_acquired/.test(md),
    'djp-tax-filing-cycle.md should reference at least one BD v3 deliverable id',
  )
})

test('uu-pdp-basic-compliance references contract_sign approval gate', () => {
  const md = fs.readFileSync(
    path.join(BD_DIR, 'templates/legal/uu-pdp-basic-compliance.md'),
    'utf8',
  )
  assert.ok(
    md.includes('contract_sign'),
    'uu-pdp-basic-compliance.md should reference contract_sign approval gate',
  )
  assert.ok(
    md.includes('identity_legal_pages_published'),
    'uu-pdp-basic-compliance.md should reference identity_legal_pages_published deliverable',
  )
})

test('bpjs-registration-paths references setup_bpjs_registered deliverable', () => {
  const md = fs.readFileSync(
    path.join(BD_DIR, 'templates/finance/bpjs-registration-paths.md'),
    'utf8',
  )
  assert.ok(
    md.includes('setup_bpjs_registered'),
    'bpjs-registration-paths.md should reference setup_bpjs_registered deliverable',
  )
})
