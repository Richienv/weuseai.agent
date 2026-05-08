# Workflow Library — Phase 2E-1.5 (Hermes-Native)

> **Status:** Per-agent bundles + 3 pilots shipping.
> **Spec:** `docs/plans/2026-05-08-workflow-library-pivot-to-hermes-native.md`
> **Architecture pivot:** dropped platform-side `workflow-discover` (Hermes does intent matching natively on the customer's VPS). See pivot spec for rationale.

---

## Mental model

Agents are not platform-side LLMs. They are **Hermes runtimes on the customer's VPS** — running with the customer's BYOK key, loading skill files (SKILL.md) from a per-agent bundle that ships at provision time.

```
Customer message
       │
       ▼
Hermes (on customer's VPS, customer's BYOK LLM)
  ─ matches intent against SKILL.md "Kapan dipakai" sections
  ─ extracts parameters from message
  ─ executes skill body:
       ├─ POST workflow-execute Edge Function (deterministic handler)
       ├─ Run skill body locally (e.g. extend-capabilities generates a new template)
       └─ Pure persona response (no skill match — fall back to SOUL.md alone)
       │
       ▼
Reply with persona voice
```

LLM stays on customer's BYOK key throughout. Platform Edge Functions are pure compute.

---

## Three customer-facing paths

### Path 1 — existing template

Customer asks for something the agent has a skill for. Hermes matches → extracts params → POSTs to the deterministic handler → wraps result with persona voice.

Example: "Bikin invoice 8 jam @800rb buat PT Acme" → Doc Expert + invoice-generator → HTML signed URL.

### Path 2 — self-extension (the wow moment)

Customer asks for something the agent CAN serve in principle but DOESN'T have a template for. Hermes matches the `extend-capabilities` skill → confirms with customer → generates a new template using the customer's LLM → persists to `/var/lib/weuseai/customer-grown/` → uses it to fulfill the request.

The library compounds in value over time, per customer. No central sync.

Example: "Bikin SKDU buat usaha aku" → Doc Expert (no SKDU template) → extend-capabilities → generates `skdu-letter.md` → drafts the letter.

### Path 3 — pure persona

Customer asks for something open-ended that doesn't match any skill. Hermes uses only the SOUL.md scaffold (Phase 2C-1 work) + the customer's LLM to respond. No Edge Function call.

Example: "Ringkas minggu ini, fokus apa?" → The Pro → conversational response based on persona + memory context.

---

## What ships in 2E-1.5

| Layer | Files |
|---|---|
| **Schema** | `supabase/migrations/20260508130000_workflow_registry_hermes_native.sql` (workflows + workflow_runs, no pgvector) |
| **Edge Functions** | `workflow-list` (catalog) + `workflow-execute` (validate + route + audit) |
| **Handler Edge Functions** | `invoice-generator-handler` (HTML render), `daily-briefing-handler` (markdown compose), `tiktok-script-handler` (validator-only — Hermes generates locally) |
| **Per-agent bundles** | `agent-packs/{doc-expert,the-pro,video-producer}/{SOUL.md, manifest.json, skills/, templates/}` |
| **Shared self-extension skill** | `agent-packs/_shared/skills/extend-capabilities/SKILL.md` (copied into every agent) |
| **Manifest schema + validator** | `agent-packs/_manifest.schema.json` + `supabase/functions/_shared/manifest-validator.ts` |
| **Provisioning hook** | `services/provisioning/src/setup-script.ts` extended with `bundleTarBase64` param + bundle install block |
| **Registration helper** | `scripts/register-workflow.ts` (slimmed — no embedding) |
| **Tests** | 148 passing across 8 spec files |

---

## Adding a new workflow

Each workflow has 4 components:

| Component | Where |
|---|---|
| **Skill** (Hermes instructions) | `agent-packs/<agent-slug>/skills/<skill-id>/SKILL.md` |
| **Template** (if needed) | `agent-packs/<agent-slug>/templates/<template-id>` |
| **Manifest entry** | append to `agent-packs/<agent-slug>/manifest.json` `skills[]` + `templates[]` |
| **Handler** (deterministic work) | `supabase/functions/_shared/<slug>-handler.ts` + `supabase/functions/<slug>-handler/index.ts` |
| **Workflow row** (audit reference) | append to `scripts/register-workflow.ts` `PILOTS` array |
| **Tests** | `tests/<slug>-handler.spec.ts` + drift test in `tests/manifest-validator.spec.ts` |

The manifest validator catches:
- Missing required fields
- Invalid enums (tier, execution, category)
- Skill referencing a template not in `templates[]`
- Duplicate skill or template ids
- Unknown agent_slug

Every commit that touches a manifest must pass `tsx --test tests/manifest-validator.spec.ts`.

---

## Customer-grown content

Per `extend-capabilities` skill, agents persist generated templates to:

```
/var/lib/weuseai/customer-grown/
├── templates/
│   └── <slug>.<ext>
├── skills/                      # Phase 2E-2 (skill generation)
└── extension-log.jsonl          # append-only audit
```

No central sync — each customer's library evolves independently.

---

## Operational prereqs (founder runs)

```sh
# 1. Apply migration (slimmed — no pgvector)
supabase db push --linked

# 2. Create Storage buckets — TWO needed:
#   - workflow-outputs:   handler outputs (e.g. invoice HTML signed URLs)
#   - workflow-templates: mock fixtures for daily-briefing pilot
supabase storage create workflow-outputs   --public false
supabase storage create workflow-templates --public false

# 3. Upload daily-briefing mock fixtures into the workflow-templates bucket.
#    Without these, daily-briefing returns warnings + empty sections instead
#    of the calendar/email content. Path 3 demo depends on them being there.
#    CLI form (Phase 2E-2 may automate this in customer-flow):
supabase storage cp ./agent-packs/the-pro/templates/mocks/calendar/typical-day.json \
  ss:///workflow-templates/mocks/calendar/typical-day.json
supabase storage cp ./agent-packs/the-pro/templates/mocks/calendar/empty.json \
  ss:///workflow-templates/mocks/calendar/empty.json
supabase storage cp ./agent-packs/the-pro/templates/mocks/gmail/typical-day.json \
  ss:///workflow-templates/mocks/gmail/typical-day.json
supabase storage cp ./agent-packs/the-pro/templates/mocks/gmail/empty.json \
  ss:///workflow-templates/mocks/gmail/empty.json

# 4. Deploy 5 Edge Functions (workflow-discover dropped)
supabase functions deploy workflow-list workflow-execute \
  invoice-generator-handler daily-briefing-handler tiktok-script-handler \
  --project-ref gtjgsligllbjcisiyrah

# 5. Seed workflow rows
SUPABASE_URL=$STAGING_URL \
SUPABASE_SERVICE_ROLE_KEY=$STAGING_SERVICE_KEY \
  tsx scripts/register-workflow.ts --all

# customer-flow.ts integration (Phase 2E-2 work):
#   tar agent-packs/<slug>/ + agent-packs/_shared/, base64 encode,
#   pass as bundleTarBase64 to buildSetupScript()
```

**Secrets dropped vs PR #2:** `OPENAI_EMBED_API_KEY`, `OPENROUTER_ORCHESTRATION_KEY` — no longer needed. $0 platform LLM cost.

---

## Phase boundaries

| Phase | Scope | Status |
|---|---|---|
| **2E-1.5** (this branch) | Per-agent bundles + 3 pilots + Hermes-native pattern + provisioning hook (parameterized) | Shipping |
| **2E-2** | customer-flow.ts wires bundle tar + base64; live Hermes integration + end-to-end demo on a VPS; PDF renderer; real MCPs; composite workflows; +10 more workflows | Pending |
| **2E-3** | Customer-facing UI for browsing/invoking workflows + workflow_runs analytics + per-customer private templates dashboard | Pending |
