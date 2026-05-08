# Workflow Library — Hermes-Native Pivot Spec (2026-05-08)

> **Status:** APPROVED 2026-05-08 (founder), implementation on `feat/workflow-library-hermes-native`.
> **Supersedes:** `docs/plans/2026-05-07-workflow-library-foundation-spec.md` (kept as history; pre-pivot architecture).

---

## Why this pivot

Phase 2E-1 (mid-phase checkpoint, PR #2) shipped a working platform-side `workflow-discover` Edge Function that did vector search + parameter extraction with `OPENROUTER_ORCHESTRATION_KEY`. Clean architecture, but founder revisited 2026-05-08 and shifted direction:

| Reason | Before | After |
|---|---|---|
| **Cost** | Platform LLM call per discovery (~$0.0002 × 30k/mo = $6/mo + abuse risk to $700/mo) | $0 platform LLM. Customer's Hermes does intent matching + extraction with their BYOK key. |
| **Architecture surface** | 2 Edge Functions (`workflow-discover`, extraction-failures table, vector RPC, embedding pipeline) | Pure deterministic handlers + per-agent skill+template bundles |
| **Library compounding** | Static catalog | Self-extending — agents grow new templates at runtime via `extend-capabilities` skill, persist to customer's VPS |

Net result: cleaner architecture, $0 platform LLM cost, customer's library compounds in value over time.

---

## Architecture

```
Customer's VPS (Hermes runtime)             Platform (Supabase Edge Functions)
─────────────────────────────────           ──────────────────────────────────
Customer message                            workflow-list      (catalog UI)
       │                                    workflow-execute   (validate + route + audit)
       ▼                                    invoice-generator-handler  (HTML render)
Hermes loads SKILL.md from                  daily-briefing-handler     (markdown compose)
  /home/weuseai/.hermes/skills/             tiktok-script-handler      (schema validate)
       │
       ▼
LLM (customer's BYOK key)
  ─ matches intent against "Kapan dipakai"
  ─ extracts parameters from message
       │
       ▼
Hermes executes the skill body:
  ─ "edge-function" → POST workflow-execute  ──────────────►  (deterministic handler)
  ─ "hermes-skill"  → run skill body locally
                     (e.g. extend-capabilities generates
                      a new template, persists to
                      /var/lib/weuseai/customer-grown/)
       │
       ▼
Hermes wraps output with persona voice
(SOUL.md system prompt, customer's LLM)
       │
       ▼
Reply to customer
```

LLM stays on customer's BYOK key throughout. Platform Edge Functions are pure compute (HTML render, markdown compose, schema validate) — no LLM calls.

---

## What stays from Phase 2E-1 (~60% of PR #2's surface)

| Module | Status |
|---|---|
| `invoice-generator-handler` (handler + entrypoint + 24 tests) | ✅ unchanged |
| `daily-briefing-handler` (handler + entrypoint + 22 tests + 4 mock fixtures) | ✅ unchanged (fixtures moved to bundle) |
| `tiktok-script-handler` (handler + entrypoint) | 🔄 refactored — drop LLM generation; validator only |
| `workflow-execute` Edge Function | ✅ unchanged |
| `workflow-list` Edge Function | ✅ unchanged (drops `intent_phrases_sample` from output) |
| `workflow_runs` table (telemetry) | ✅ unchanged |
| `workflow-types` shared module | 🔄 slimmed (drop `DiscoverMatch`, `shouldAutoExecute`, threshold consts) |
| `parameter-validator` | ✅ unchanged |
| HTML invoice template | ✅ moved to `agent-packs/doc-expert/templates/invoice-pro.html` |
| Mock fixtures | ✅ moved to `agent-packs/the-pro/templates/mocks/` |
| Persona scaffolds (10 SOUL.md files from Phase 2C) | ✅ unchanged (already on main) |
| 110+ handler-level tests | ✅ kept (fixture paths updated) |

---

## What gets dropped (~40%)

| Module | Reason |
|---|---|
| `workflow-discover` Edge Function | Hermes does intent matching natively |
| `parameter-extraction` shared module | Hermes does extraction natively |
| `embedding.ts` shared module | No vector search anymore |
| `llm-client.ts` shared module | No platform LLM calls remain |
| Vector search RPC migration | No vector search |
| `extraction_failures` migration | No extraction telemetry needed |
| pgvector extension dependency | No vector ops |
| `OPENROUTER_ORCHESTRATION_KEY` references | No platform LLM calls |
| `OPENAI_EMBED_API_KEY` references | No embedding |
| ~50 discover/extraction tests | Modules dropped |

---

## What's new (per-agent bundles)

```
agent-packs/
├── _manifest.schema.json                       # JSON Schema for manifest.json
├── _shared/
│   └── skills/
│       └── extend-capabilities/
│           └── SKILL.md                        # self-extension scaffold (every agent gets this)
├── doc-expert/
│   ├── SOUL.md                                  # persona (existing, from Phase 2C)
│   ├── manifest.json                            # NEW catalog of skills + templates
│   ├── skills/
│   │   └── invoice-generator/
│   │       └── SKILL.md                         # Hermes skill instructions
│   └── templates/
│       └── invoice-pro.html                     # canonical template
├── the-pro/
│   ├── SOUL.md
│   ├── manifest.json
│   ├── skills/
│   │   └── daily-briefing/
│   │       └── SKILL.md
│   └── templates/
│       └── mocks/
│           ├── calendar/{typical-day,empty}.json
│           └── gmail/{typical-day,empty}.json
└── video-producer/
    ├── SOUL.md
    ├── manifest.json
    └── skills/
        └── tiktok-script/
            └── SKILL.md
```

### `manifest.json` schema

Source of truth: `agent-packs/_manifest.schema.json`. Validated by `supabase/functions/_shared/manifest-validator.ts` at:
- Test time (drift checks against all 3 pilot manifests + the schema file itself)
- Provisioning time (setup-script.ts validates before copying to VPS)
- Future: customer-grown manifest mutations (when extend-capabilities adds entries)

Required fields per the schema:
- `agent_slug` (must match one of the 10 PERSONA_SLUGS)
- `version` (semver)
- `description_id` (BI catalog blurb)
- `skills[]` (each with id, description_id, execution, handler_ref, tier)
- `templates[]` (each with id, kind, description_id)
- `self_extend` (boolean — does this agent enable the extend-capabilities scaffold?)
- `extension_dir` (absolute path on VPS for customer-grown content)

Cross-field invariants enforced:
- Every `skills[].templates_used` entry must reference a real `templates[].id`
- Skill ids unique within `skills[]`
- Template ids unique within `templates[]`

### Skill format choice (interpretation made)

Per CLAUDE.md "we don't fork Hermes" + the existing `setup-script.ts` pattern that already writes `SKILL.md` files to `/home/weuseai/.hermes/skills/<name>/SKILL.md`, the skills here ship as **markdown files** (Hermes-native format), not TypeScript wrappers.

The founder's brief used `.skill.ts` notation in the directory sketch — interpreted as shorthand for "the skill file" rather than mandating a TypeScript executable. If founder wants a TS wrapper layer instead (e.g. an integration shim that Hermes invokes via subprocess), the rename is mechanical.

### Self-extension scaffold (`extend-capabilities`)

Shipped to every agent (`agent-packs/_shared/skills/extend-capabilities/SKILL.md`, copied into each agent's `skills/` directory at provision). The skill instructs Hermes to:

1. Confirm with customer before generating (explicit consent contract).
2. Generate template content using customer's BYOK LLM (cost on customer).
3. Persist to `/var/lib/weuseai/customer-grown/templates/<slug>.<ext>`.
4. Append to `/var/lib/weuseai/customer-grown/extension-log.jsonl` (audit trail).
5. Use the new template to fulfill the original request.

**No central sync.** Customer-grown templates stay on the customer's VPS. The library compounds per customer.

---

## Provisioning integration

`services/provisioning/src/setup-script.ts` extended with:

- New optional `agentSlug` param (default `'the-pro'`)
- New optional `bundleTarBase64` param — caller (customer-flow.ts) tars the agent-pack directory + base64s
- New optional `workflowExecuteUrl` param (default production URL)

When `bundleTarBase64` is set:

1. Decode + extract to `/home/weuseai/.hermes/agent-pack/`
2. Copy each `skills/<name>/SKILL.md` into `/home/weuseai/.hermes/skills/<name>/` (Hermes-native discovery path)
3. Initialize `/var/lib/weuseai/customer-grown/{templates,skills,extension-log.jsonl}`
4. Write env vars: `WEUSEAI_AGENT_SLUG`, `WEUSEAI_CUSTOMER_ID`, `WEUSEAI_WORKFLOW_EXECUTE_URL`

Back-compat: when `bundleTarBase64` is absent, the script falls back to the Phase 1/2A baseline (DAILY_NEWS_SKILL_MD only).

---

## Test plan (cumulative on this branch)

```
npm run test:onboarding         → 103/103 (existing, untouched)
workflow + manifest tests       → 148/148 — broken down:
  - workflow-types               13 tests (slimmed; no threshold tests)
  - parameter-validator          25 tests (unchanged)
  - workflow-list-handler         9 tests (drops intent_phrases_sample test)
  - workflow-execute-handler     18 tests (unchanged)
  - invoice-generator-handler    24 tests (drift path updated)
  - daily-briefing-handler       22 tests (fixture paths updated)
  - tiktok-script-handler        14 tests (validator-only; no LLM mock)
  - manifest-validator           20 tests (NEW — schema + invariants + drift)
                                ────
                                145 passing across 8 spec files

npm run typecheck:all           → clean across 6 tsconfigs
```

---

## Demo (3 paths the founder asked for)

### Path 1: existing template (Doc Expert + invoice-generator)

Customer's Hermes already has the invoice-generator skill in inventory. SKILL.md instructs the LLM to extract `client_name`, `items`, etc., then POST to `workflow-execute`. Server renders HTML, signed URL returned.

### Path 2: self-extension (Doc Expert + SKDU letter, NOT in inventory)

Customer asks for "Surat Keterangan Domisili Usaha" — Doc Expert's `manifest.json` has no SKDU template. Hermes matches the request to the `extend-capabilities` skill (every agent has it). The skill confirms with the customer, generates a template via the customer's LLM, persists to `/var/lib/weuseai/customer-grown/templates/skdu-letter.md`, appends to extension-log.jsonl, and uses the template to draft the letter. **The wow moment** — agent grew its inventory in real time without our involvement.

### Path 3: pure persona (The Pro + open-ended advice)

Customer asks "what should I focus on this week?" — no skill matches a deterministic workflow. Hermes responds using only the persona scaffold (SOUL.md from Phase 2C) + the customer's LLM, no Edge Function call. This is the baseline — a persona-driven conversation.

---

## Operational prereqs (founder runs)

```sh
# 1. Apply slimmed migration (no pgvector)
supabase db push --linked

# 2. Create both Storage buckets
supabase storage create workflow-outputs   --public false
supabase storage create workflow-templates --public false

# 3. Upload daily-briefing mock fixtures (Path 3 demo depends on these)
supabase storage cp ./agent-packs/the-pro/templates/mocks/calendar/typical-day.json \
  ss:///workflow-templates/mocks/calendar/typical-day.json
supabase storage cp ./agent-packs/the-pro/templates/mocks/calendar/empty.json \
  ss:///workflow-templates/mocks/calendar/empty.json
supabase storage cp ./agent-packs/the-pro/templates/mocks/gmail/typical-day.json \
  ss:///workflow-templates/mocks/gmail/typical-day.json
supabase storage cp ./agent-packs/the-pro/templates/mocks/gmail/empty.json \
  ss:///workflow-templates/mocks/gmail/empty.json

# 4. Deploy 5 Edge Functions (workflow-discover dropped vs PR #2)
supabase functions deploy workflow-list workflow-execute \
  invoice-generator-handler daily-briefing-handler tiktok-script-handler \
  --project-ref gtjgsligllbjcisiyrah

# 5. Seed all 3 workflow rows (no embedding pipeline; plain UPSERT)
SUPABASE_URL=$STAGING_URL \
SUPABASE_SERVICE_ROLE_KEY=$STAGING_SERVICE_KEY \
  tsx scripts/register-workflow.ts --all

# customer-flow.ts integration (Phase 2E-2): tar agent-packs/<slug>/ + agent-packs/_shared/,
# base64 encode, pass as bundleTarBase64 to buildSetupScript()
```

Secrets dropped vs PR #2:
- `OPENAI_EMBED_API_KEY` — no longer needed
- `OPENROUTER_ORCHESTRATION_KEY` — no longer needed

---

## Out of scope (deferred to 2E-2 / 2E-3)

- **Real PDF rendering** for invoices — separate renderer-choice spec (Browserless / Cloudflare Browser Rendering / WeasyPrint)
- **Real Gmail/Calendar MCP** for daily-briefing — Phase 2C-2 (mock fixtures stay in pilot)
- **Composite + external-api** execution types — return "not implemented" errors in `workflow-execute` for now
- **End-to-end customer-flow.ts integration** — provisioning service caller currently doesn't pass `bundleTarBase64`. Phase 2E-2 wires it: tar the bundle, base64 encode, pass through.
- **Customer-grown manifest mutations** — `extend-capabilities` skill writes new template files, but the runtime manifest update logic (read manifest from VPS, append entry, write back) is in the SKILL.md but not yet automated end-to-end. Phase 2E-2 adds the file-edit primitive.
- **Customer-facing UI** for browsing/invoking workflows — Phase 2E-3
- **Per-customer API key auth** + rate limiting — Phase 2E-2

---

## Phase boundaries

| Phase | Scope | Status |
|---|---|---|
| **2E-1.5** (this branch) | Per-agent bundles + 3 pilots + Hermes-native pattern + provisioning hook | In progress |
| **2E-2** | customer-flow.ts wires bundle tar + base64; Hermes integration tested live; PDF renderer; real MCPs; composite workflows; +10 workflows | Pending |
| **2E-3** | Customer-facing UI; workflow_runs analytics dashboard; per-customer private templates | Pending |

---

## Acceptance criteria (revised)

- [x] All dead code removed (no orchestration key references, no embedding, no extraction)
- [x] Per-agent bundles for 3 pilots (doc-expert, the-pro, video-producer)
- [x] `manifest.json` schema documented (`agent-packs/_manifest.schema.json`) + validator (`manifest-validator.ts`) + drift tests pass for all 3 pilots
- [x] Hermes skill wrapper pattern shipped (SKILL.md per pilot + shared `extend-capabilities`)
- [ ] Self-extension scaffold working end-to-end on a live VPS — pilot specifies the contract; runtime testing happens in 2E-2 alongside customer-flow.ts integration
- [x] Provisioning script copies bundle to VPS at provision time (parameterized; back-compat preserved)
- [x] Demo doc shows all 3 paths (existing template / self-extension / pure persona)
- [x] Tests passing — 148 (was forecasted ~120)
- [x] `npm run typecheck:all` clean
- [x] PR description explains the pivot rationale

---

*Last updated: 2026-05-08 by Claude (Phase 2E-1.5 spec, Hermes-native pivot)*
