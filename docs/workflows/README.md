# Workflow Library — Phases 2E-1.5 + 2E-2

> **Status:**
> - **2E-1.5** (merged `7f9ed98`): per-agent bundles + 3 pilots + Hermes-native skill discovery.
> - **2E-2** (`feat/hermes-vps-integration`): bundle delivery (Storage pull at boot), tier gate, self-extension L1, telemetry. End of Day 5 deliverable.
>
> **Specs:**
> - `docs/plans/2026-05-08-workflow-library-pivot-to-hermes-native.md` (2E-1.5 — architecture)
> - `docs/plans/2026-05-08-phase-2e-2-bundle-delivery-spec.md` (2E-2 — delivery mechanics)

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
```

**Secrets dropped vs PR #2:** `OPENAI_EMBED_API_KEY`, `OPENROUTER_ORCHESTRATION_KEY` — no longer needed. $0 platform LLM cost.

### Phase 2E-2 additional steps (after 2E-2 merge)

```sh
# 6. Apply 2E-2 migration (customers.bundle_versions + bundle_pull_attempts)
supabase db push --linked

# 7. Build the bootstrap bundle (one-time + whenever The Pro SOUL.md or
#    extend-capabilities SKILL.md change). Drift test catches stale bundle.
tsx scripts/build-bootstrap-bundle.ts

# 8. Deploy the 3 new Edge Functions
supabase functions deploy bundle-publish bundle-fetch bundle-pull-record \
  --project-ref gtjgsligllbjcisiyrah

# 9. Publish the per-agent bundle (used at customer first boot via bundle-fetch).
#    Done via the bundle-publish Edge Function with service-role bearer:
SUPABASE_URL=$STAGING_URL \
SUPABASE_SERVICE_ROLE_KEY=$STAGING_SERVICE_KEY \
  curl -X POST "$STAGING_URL/functions/v1/bundle-publish" \
    -H "Authorization: Bearer $STAGING_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg agent doc-expert \
      --arg version 1.0.0 \
      --arg b64 "$(tar --no-xattrs --no-mac-metadata --owner=0 --group=0 -czf - \
        -C agent-packs/doc-expert . \
        -C ../_shared . | base64)" \
      '{agent_slug: $agent, version: $version, bundle_tar_base64: $b64}')"

# (Repeat step 9 per published agent: doc-expert, the-pro, video-producer.)

# 10. Set tier-default bundle_update_policy on existing customers (optional).
#    Defaults: starter → 'pin', pro/studio → 'latest'.
#    Run via psql or a one-off script. Phase 3+ adds this to the
#    subscription-activation Edge Function.
psql "$STAGING_DB_URL" -c "
  update customers
  set bundle_update_policy = case
    when (select tier from subscriptions where customer_id = customers.id and status='active') in ('pro','studio') then 'latest'
    else 'pin'
  end;
"
```

**No new Supabase secrets required for 2E-2.** Bundle delivery uses the existing service-role key for admin uploads (bundle-publish) and customer_id UUIDs for customer reads (bundle-fetch + bundle-pull-record). Customer's BYOK OpenRouter key on the VPS still pays for any LLM work the agent does.

### Live VPS smoke test (manual run, costs ~\$0.50)

Phase 2E-2 includes a real-VPS smoke test that provisions an IDCloudHost VM, ships the bundle, verifies installation. **Manual-run only**, capped at 2 runs per Phase 2E-2 (mid-phase + pre-PR) per founder gating policy.

```sh
SUPABASE_URL=https://gtjgsligllbjcisiyrah.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role> \
IDCLOUDHOST_API_KEY=<idch-key> \
IDCLOUDHOST_BILLING_ACCOUNT_ID=<billing-id> \
AGENT_SLUG=doc-expert \
BUNDLE_VERSION=1.0.0 \
  npx tsx tests/_e2e-bundle-pull-smoke.mts
```

The script:
1. Tars + uploads the agent's bundle to Storage via `bundle-publish`.
2. Spawns a VPS tagged `weuseai-smoke-2e2-<YYYYMMDD>`.
3. Runs the setup-script over SSH (with the inline bootstrap bundle).
4. Polls until `/var/lib/weuseai/bundle/<slug>/.installed-version` exists.
5. Verifies SKILL.md files, customer-grown dir, systemd drop-in, telemetry row.
6. Tears down the VPS.

To leave the VPS up for debugging: `SKIP_TEARDOWN=1`.

### Cleanup utility

```sh
IDCLOUDHOST_API_KEY=<key> tsx scripts/cleanup-orphan-vms.ts
# Add --dry-run to preview without deleting
```

Deletes any IDCloudHost VPS named `weuseai-smoke-*` older than 24h (override via `TTL_HOURS=N`). Safe to run nightly via cron.

---

## Phase boundaries

| Phase | Scope | Status |
|---|---|---|
| **2E-1.5** | Per-agent bundles + 3 pilots + Hermes-native skill discovery | ✅ Merged `7f9ed98` |
| **2E-2** (`feat/hermes-vps-integration`) | Bundle delivery (Storage pull at boot) + tier gate (`enabled_for_tiers`) + self-extension L1 + telemetry + live VPS smoke | In progress (Days 1-5) |
| **2E-3** | PDF rendering + `customer-tier-bump` Edge Function (instant tier upgrade via Xendit webhook) | Pending |
| **2E-4** | Bundle expansion (Slide Master, Trade Pro, Web Master, Macro Strategist, Business Director) — parallel-able | Pending |
| **2E-5** | Auto-update background job (nightly poll for new bundle versions per `latest` policy) | Pending |
| **Phase 3+** | Privacy levels 2-4, dashboard UI, staged update mode, customer-tier-bump automation | Pending |
