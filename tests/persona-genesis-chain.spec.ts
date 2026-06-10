/**
 * Phase F harness extension — Persona Genesis full local chain.
 *
 * Simulates the real path end-to-end with NO network: the VPS interview
 * skill's X-CID POST → persona-genesis handler (canned DeepSeek fixture) →
 * real validator → real USTAR/gzip packager → in-memory Storage →
 * bundle-fetch (custom path, tenant gates) → simulated weuseai-bundle-pull
 * (download via the signed URL, real gunzip + untar, the script's actual
 * install layout) → assert the installed SKILL.md files and SOUL are
 * exactly what generation produced AND would resolve as Hermes skills.
 *
 * HONESTY NOTE (spec §Honesty + limits): this is the local-first
 * verification of the chain. The real-VPS run (provision a throwaway
 * done-for-you box, run /bikin-persona over Telegram) requires
 * Vultr/Fly/Supabase credentials this session does not have — that step is
 * the founder procedure in docs/runbooks/persona-genesis.md.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  handlePersonaGenesis,
  type PersonaGenesisDeps,
  type CustomPersonaRow,
} from '../supabase/functions/_shared/persona-genesis-handler.ts'
import {
  bundleFetchHandler,
  type BundleFetchDeps,
} from '../supabase/functions/_shared/bundle-fetch-handler.ts'
import { gunzipBytes, parseTar } from '../supabase/functions/_shared/tar-gz.ts'
import { validateManifest } from '../supabase/functions/_shared/manifest-validator.ts'
import { buildBundlePullScript } from '../services/provisioning/src/bundle-pull-script.ts'
import { FIXTURE_PROFILE, fixtureLlm } from './_helpers/genesis-fixture.ts'

const CID = 'e2e00000-1111-4222-8333-444455556666'
const SLUG = `custom-${CID}`

test('Persona Genesis chain: interview POST → generate → publish → fetch → pull → installed skills', async (t) => {
  // ─── shared in-memory infrastructure ────────────────────────────────
  const storage = new Map<string, Uint8Array>()
  const personaRows = new Map<string, CustomPersonaRow & { profile: unknown }>()
  const souls = new Map<string, string>()
  const refreshes: string[] = []
  const alerts: string[] = []

  const genesisDeps: PersonaGenesisDeps = {
    db: {
      async getGenesisCustomer(id) {
        if (id !== CID) return null
        return {
          id, display_name: 'Richie Founder', email: 'richie@example.com',
          tier: 'done-for-you', subscription_status: 'active',
        }
      },
      async getCustomPersona(id) { return personaRows.get(id) ?? null },
      async upsertCustomPersona(row) {
        personaRows.set(row.customer_id, {
          ...row,
          generations_today: 1,
          updated_at: new Date().toISOString(),
        })
      },
      async updateCustomerSoul(id, soul) { souls.set(id, soul) },
    },
    llm: fixtureLlm(),
    storage: {
      async upload(path, bytes) { storage.set(path, bytes); return { ok: true } },
    },
    async vpsRefresh(customerId) { refreshes.push(customerId); return { ok: true } },
    async founderAlert(text) { alerts.push(text) },
  }

  // ─── stage 1: the VPS agent's interview POST (X-CID bound) ──────────
  let genesisBody: Record<string, any> = {}
  await t.test('interview POST → 200, bundle published, SOUL swapped, refresh fired', async () => {
    const res = await handlePersonaGenesis(
      new Request('https://edge.test/persona-genesis', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cid': CID },
        body: JSON.stringify({ customer_id: CID, profile: FIXTURE_PROFILE }),
      }),
      genesisDeps,
    )
    assert.equal(res.status, 200)
    genesisBody = (await res.json()) as Record<string, any>
    assert.equal(genesisBody.ok, true)
    assert.equal(genesisBody.persona_name, 'Konten Komandan')
    assert.ok(storage.has(`bundles/${SLUG}/1.0.0.tar.gz`))
    assert.match(souls.get(CID)!, /Richie Founder/)
    assert.deepEqual(refreshes, [CID])
    assert.equal(alerts.length, 0, 'no founder alert on a clean run')
  })

  // ─── stage 2: bundle-fetch — the restart's pull asks for the bundle ──
  const fetchDeps: BundleFetchDeps = {
    customerLookup: async (cid) => ({
      id: cid, tier: 'done-for-you', bundle_versions: {}, bundle_update_policy: 'pin',
    }),
    listBundleVersions: async () => [],
    signUrl: async ({ path, expirySeconds }) => ({
      url: `https://storage.local/${path}`,
      expiresAt: new Date(Date.now() + expirySeconds * 1000).toISOString(),
    }),
    customPersonaLookup: async (cid) => {
      const row = personaRows.get(cid)
      return row ? { version: row.version, status: row.status } : null
    },
  }

  let signedUrl = ''
  let version = ''
  await t.test('bundle-fetch serves the custom bundle to its owner only', async () => {
    const owner = await bundleFetchHandler({ customer_id: CID, agent_slug: SLUG }, fetchDeps)
    assert.equal(owner.ok, true)
    if (!owner.ok) return
    signedUrl = owner.body.signed_url
    version = owner.body.version
    assert.equal(version, '1.0.0')

    // The isolation gate, end-to-end: another customer is refused.
    const thief = await bundleFetchHandler(
      { customer_id: 'f0000000-9999-4999-8999-999999999999', agent_slug: SLUG },
      fetchDeps,
    )
    assert.equal(thief.ok, false)
  })

  // ─── stage 3: simulated weuseai-bundle-pull install ──────────────────
  // The signed URL maps into our in-memory storage; the extraction below
  // is the same gunzip+untar the VPS's `tar -xzf` performs, and the
  // install layout mirrors apply_tier_filter + the persona-shell copy.
  await t.test('pull + install: skills land in the Hermes discovery layout', async () => {
    const path = signedUrl.replace('https://storage.local/', '')
    const tarball = storage.get(path)
    assert.ok(tarball, 'signed URL resolves to the published object')

    const entries = parseTar(await gunzipBytes(tarball!))
    const byPath = new Map(entries.map((e) => [e.path, e.content]))

    // manifest extracts + REVALIDATES on the consumer side.
    const manifest = JSON.parse(byPath.get('manifest.json')!)
    const mv = validateManifest(manifest, { allowAgentSlugs: [SLUG] })
    assert.equal(mv.ok, true)
    assert.equal(manifest.version, version)

    // Simulate the install: for each manifest skill, skills/<id>/SKILL.md
    // must exist in the bundle (what the script copies into
    // ~/.hermes/skills/<id>/SKILL.md); the shell SKILL.md exposes /<slug>.
    const installed = new Map<string, string>()
    for (const skill of manifest.skills) {
      const src = byPath.get(`skills/${skill.id}/SKILL.md`)
      assert.ok(src, `bundle carries skills/${skill.id}/SKILL.md`)
      installed.set(`${skill.id}/SKILL.md`, src!)
    }
    const shell = byPath.get('SKILL.md')
    assert.ok(shell, 'persona-shell SKILL.md present')
    installed.set(`${SLUG}/SKILL.md`, shell!)

    assert.equal(installed.size, manifest.skills.length + 1)
    // Every installed skill references real bundle templates only.
    for (const skill of manifest.skills) {
      for (const ref of skill.templates_used ?? []) {
        assert.ok(byPath.has(`templates/${ref}`), `template ${ref} shipped`)
      }
    }
  })

  // ─── stage 4: the generated pull SCRIPT would attempt this slug ──────
  await t.test('weuseai-bundle-pull script targets custom-<cid> after tier slugs', () => {
    const script = buildBundlePullScript({ customerId: CID })
    assert.ok(script.includes('custom-$CID'))
    assert.ok(script.includes('pull_custom_persona'))
  })

  // ─── stage 5: regeneration round-trip ────────────────────────────────
  await t.test('regeneration publishes 1.0.1 and fetch serves the new version', async () => {
    const res = await handlePersonaGenesis(
      new Request('https://edge.test/persona-genesis', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cid': CID },
        body: JSON.stringify({ customer_id: CID, profile: FIXTURE_PROFILE }),
      }),
      genesisDeps,
    )
    assert.equal(res.status, 200)
    const fetch2 = await bundleFetchHandler({ customer_id: CID, agent_slug: SLUG }, fetchDeps)
    assert.equal(fetch2.ok, true)
    if (!fetch2.ok) return
    assert.equal(fetch2.body.version, '1.0.1')
    assert.ok(storage.has(`bundles/${SLUG}/1.0.1.tar.gz`))
  })
})
