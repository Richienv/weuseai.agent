# Workflow Library — Phase 2E-1 (Foundation)

> **Status:** invoice-generator pilot end-to-end working. daily-briefing-builder + tiktok-script-builder pending (next half of 2E-1).
> **Spec:** `docs/plans/2026-05-07-workflow-library-foundation-spec.md`

This folder documents the workflow registry — what it is, how to add a new workflow, and how to demo what's there.

---

## Mental model

Agents are not LLMs that figure things out per request. They are **orchestrators that fetch pre-built workflows** from a registry, extract structured parameters, and invoke deterministic handlers.

```
"pesen tiket Jakarta-Bali tanggal 15"
        │
        ▼
   workflow-discover  ──┐  (vector search → top 3 + confidence)
        │               │
        ▼               │
   workflow-execute  ───┘  (deterministic handler, NOT LLM)
        │
        ▼
   persona voice applied (agent layer)
```

LLM lives only at three boundaries:

1. **Embedding** — customer message → 1536-dim vector (OpenAI `text-embedding-3-small`)
2. **Parameter extraction** — message → structured params via small model (claude-3.5-haiku via OpenRouter, customer's BYOK key). *Phase 2E-2: lands when Hermes runtime can do this on the VPS using the customer's key.*
3. **Voice application** — handler output → persona-toned customer reply (handled by the persona scaffold, not the workflow)

Heavy lifting (the actual work) = deterministic handlers. ~30× LLM cost reduction vs "let the model figure everything out." Determinism + repeatability + observability come for free.

---

## What ships in 2E-1

- **Schema** — `workflows` + `workflow_runs` tables, pgvector extension, ivfflat index, RLS service-role only. 2 migrations: `20260507120000_workflow_registry.sql` (tables) + `20260507130000_workflow_vector_search_rpc.sql` (vector search RPC).
- **3 Edge Functions** — `workflow-list`, `workflow-discover`, `workflow-execute`.
- **1 pilot worker** — `invoice-generator-handler` (template-fetch-and-render pattern, HTML output).
- **Registration script** — `scripts/register-workflow.ts` for seeding workflows with embeddings.

Out of scope (per spec deferrals):

- Hermes runtime integration (2E-2, gated by 2C-2)
- Real PDF rendering (2E-2 with separate renderer-choice spec)
- Real MCP integration for daily-briefing (2C-2)
- Composite + external-api execution types (2E-2)
- Customer-facing UI (2E-3)

---

## Adding a new workflow

Each workflow has 4 things:

| Thing | Where |
|---|---|
| **Persona content** (intent phrases, parameters_schema, name) | `scripts/register-workflow.ts` — add to `PILOTS` array |
| **Handler implementation** | `supabase/functions/_shared/<slug>-handler.ts` (pure logic, dependency-injected I/O) |
| **deno-serve entrypoint** | `supabase/functions/<slug>-handler/index.ts` (HTTP + Storage + Supabase client wiring) |
| **Tests** | `tests/<slug>-handler.spec.ts` (handler-level; injection mocks all I/O) |

### Step-by-step

1. **Decide the agent slug + tier.** `invoice-generator` is `doc-expert + business-director` at `starter` tier (every paid customer). A workflow tied to a persona that doesn't exist will fail the routing test.

2. **Write the handler** in `supabase/functions/_shared/<slug>-handler.ts`. Make it I/O-free — pure functions take input, return output. Storage upload + signed URL generation happen in the deno-serve entrypoint, not the handler. This makes tests trivial.

3. **Write the tests** for the handler. Include:
   - Validation of every required param (missing → caller's fault, validated upstream by `workflow-execute`)
   - At least one **golden output** test — known input → expected output structure
   - **Drift test** for any large templates (HTML, prompt strings) that mirror an on-disk file in `agent-packs/workflow-templates/<slug>/v<N>/`
   - XSS / injection defense if you take customer free-text into rendered HTML

4. **Write the deno-serve entrypoint** in `supabase/functions/<slug>-handler/index.ts`. Pattern:
   - Import handler from `_shared/`
   - Wire CORS (`handleCors` → handler → `withCors`)
   - Construct Supabase client + any external clients from `Deno.env`
   - Parse JSON body, call handler, return result

5. **Add to `supabase/config.toml`** with `verify_jwt = false` (callers don't carry Supabase JWTs).

6. **Add to `scripts/register-workflow.ts`** `PILOTS` array — slug, name_id, description_id, agent_slugs, intent_phrases (5-15 sample customer phrases), parameters_schema (JSON Schema), handler_ref (`edge-fn:<slug>-handler`), tier, version.

7. **Register against staging** (founder runs):
   ```sh
   SUPABASE_URL=$STAGING_URL \
   SUPABASE_SERVICE_ROLE_KEY=$STAGING_SERVICE_KEY \
   OPENAI_EMBED_API_KEY=$OPENAI_EMBED_API_KEY \
     tsx scripts/register-workflow.ts <new-slug>
   ```

8. **Deploy the Edge Functions**:
   ```sh
   supabase functions deploy <slug>-handler --project-ref gtjgsligllbjcisiyrah
   ```

9. **Demo it** — add a curl block to `docs/workflows/demo.md` and verify end-to-end.

---

## Mock fixture path convention (Q5 lock 2026-05-07)

Daily-briefing-builder + future MCP-dependent workflows ship with mock fixtures in Supabase Storage.

**Path:** `templates/mocks/{source}/{scenario}.json`

Pilot fixtures (planned for next 2E-1 batch):

```
templates/mocks/calendar/typical-day.json    # 5 events: 4 meetings + 1 personal
templates/mocks/calendar/empty.json          # zero events
templates/mocks/gmail/typical-day.json       # 10 emails: 3 important + 5 noise + 2 follow-up
templates/mocks/gmail/empty.json             # zero emails
```

**Calendar JSON shape** (mirrors Google Calendar Events API):
```json
{
  "events": [
    {
      "id": "evt_001",
      "summary": "Standup",
      "start": { "dateTime": "2026-05-07T09:00:00+07:00" },
      "end":   { "dateTime": "2026-05-07T09:15:00+07:00" },
      "attendees": [{ "email": "rina@example.com" }],
      "location": "Zoom",
      "type": "meeting"
    }
  ]
}
```

**Gmail JSON shape** (mirrors `messages.list` + `messages.get`):
```json
{
  "emails": [
    {
      "id": "msg_001",
      "from": "rina@example.com",
      "subject": "Re: Q3 review tomorrow",
      "snippet": "Bisa pindah ke jam 2 siang?",
      "received_at": "2026-05-07T07:24:00+07:00",
      "importance": "important",
      "thread_id": "thr_001"
    }
  ]
}
```

When 2C-2 wires real Gmail/Calendar MCPs, these fixtures get replaced by adapter calls. The handler interface stays the same — fixture loader and MCP adapter both produce the same JSON shape.

---

## handler_ref convention

Workflows route via a namespaced handler_ref string:

| Prefix | Meaning | 2E-1 status |
|---|---|---|
| `edge-fn:<name>` | Sibling Supabase Edge Function | ✅ implemented |
| `hermes-skill:<name>` | Pre-installed skill on customer's VPS | 2E-2 (Hermes integration) |
| `external:<id>` | External HTTP API (Traveloka, Gojek, etc.) | 2E-2 |
| `composite:<slug>` | Multi-step orchestration (calls other workflows) | 2E-2 |

Phase 2E-1 only implements `edge-fn:`. Other types record a `failed` workflow_run with `error: "execution_type X not implemented in 2E-1"` so callers know it's a wiring gap, not a bug.

---

## Vector search semantics (auto-execute threshold)

`workflow-discover` returns exactly **3 matches**, sorted descending by `confidence` (cosine similarity, range 0-1).

**`auto_execute_recommended` is true iff:**
- `matches[0].confidence >= 0.85`, AND
- `matches[0].confidence - matches[1].confidence >= 0.10`

Below threshold → agent SHOULD ask the customer to confirm rather than auto-execute. This prevents misroutes when two workflows score similarly (e.g. "ringkas berita" could match `daily-briefing-builder` or `tiktok-script-builder` — ambiguous, ask).

Tune threshold from `workflow_runs` telemetry once we have data.

---

## Operational notes

### Required Supabase secrets (set once via `supabase secrets set`)

```
OPENAI_EMBED_API_KEY         = sk-...           # workflow-discover embedding pipeline (~$0/mo)
OPENROUTER_ORCHESTRATION_KEY = sk-or-v1-...     # parameter extraction at workflow-discover (~$6/mo
                                                #   at 1000 customers × 30 calls/customer-month;
                                                #   distinct from OPENROUTER_PROVISIONING_KEY which
                                                #   only mints customer keys)
```

**Why two OpenRouter keys?** `OPENROUTER_PROVISIONING_KEY` mints per-customer sub-accounts at provision time and never makes inference calls. `OPENROUTER_ORCHESTRATION_KEY` is platform-side inference for parameter extraction — separate billing line, separate audit log, can be revoked independently. The customer's own OpenRouter key (BYOK) lives only on their VPS and is never reachable from Edge Functions.

### Required Storage bucket (one-time setup)

```sh
supabase storage create workflow-outputs --public false
```

`invoice-generator-handler` writes rendered HTML here as `invoices/<customer_id>/<filename>.html` and returns a 24h signed URL.

### Testing

```sh
npm test                      # all tests
npx tsx --test tests/workflow-*.spec.ts tests/parameter-validator.spec.ts tests/invoice-*.spec.ts
npm run typecheck:all
```

Phase 2E-1 ships with **115+ new handler-level tests** covering input validation, golden output, drift checks, failsafe paths, and routing logic. All I/O is dependency-injected so the test suite runs without a live Supabase connection.

### Observability

Every `workflow-execute` call writes a row to `workflow_runs` regardless of success. Failed runs include `error` text. Phase 2E-2 adds a batch job that updates `workflows.success_rate / avg_duration_ms / usage_count` from `workflow_runs` telemetry.

---

## Phase boundaries

| Phase | Scope | Status |
|---|---|---|
| **2E-1a** (this branch, mid-phase checkpoint) | Schema + 3 Edge Functions + invoice-generator pilot end-to-end | ✅ shipping |
| **2E-1b** (next half) | daily-briefing-builder + tiktok-script-builder pilots + 30+ tests cumulative | Pending |
| **2E-2** | Hermes runtime integration (workflow-router skill on VPS), per-customer API key auth, real PDF, real MCP, +10 workflows, composite | Pending |
| **2E-3** | Customer-facing UI for browsing/invoking/customizing workflows, workflow_runs analytics dashboard | Pending |
