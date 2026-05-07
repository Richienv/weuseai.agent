# Workflow Library Foundation — Phase 2E-1 Spec (2026-05-07)

> **Status:** APPROVED 2026-05-07 (founder). All 6 open questions resolved. Implementation in progress on `feat/workflow-library-foundation`.
> **Goal:** Working workflow registry + 3 pilot workflows end-to-end. Prove the orchestrator pattern, then scale.
> **Branch:** `feat/workflow-library-foundation` (off `main` at `c972413`).

---

## Why this exists

Mental model shift, locked by founder direction 2026-05-07:

> weuseai agents bukan "LLM yang figure things out per request" tapi "orchestrator yang fetch pre-built workflows."

Customer says "pesen tiket Jakarta-Bali tanggal 15." The agent (Web Master persona):

1. Embeds the message → vector search against the workflow registry.
2. Match: `book-ticket-traveloka` workflow.
3. Extract structured params: `{origin: "Jakarta", destination: "Bali", date: "2026-05-15"}`.
4. Ask missing params with persona voice: "Berangkat pagi atau sore?"
5. Invoke a deterministic handler (Edge Function or Hermes skill — NOT LLM).
6. Return result with persona voice applied.

LLM role is bounded:
- **Intent matching:** which workflow fits this message
- **Parameter extraction:** message text → structured params
- **Voice application:** raw output → persona-toned customer reply

Heavy lifting (the actual work) = pre-built deterministic handlers. ~30× LLM cost reduction vs "let the LLM figure everything out per call." Determinism + repeatability + observability come for free.

Templates (invoice PDFs, slide decks) are ONE workflow type — the `template-fetch-and-render` pattern. Same machinery as booking, scraping, generation, automation. Unified architecture.

---

## Architecture

### Two-axis: discover then execute

```
                ┌─────────────────────────────────┐
                │  Customer message hits agent    │
                │  ("pesen tiket Jakarta-Bali")   │
                └────────────────┬────────────────┘
                                 │
                                 ▼
               ┌──────────────────────────────────┐
               │  workflow-discover Edge Function │
               │   ─ embed message (vector)       │
               │   ─ search workflows table       │
               │   ─ filter by agent + tier       │
               │   ─ return top 3 with confidence │
               └────────────────┬─────────────────┘
                                │
                                ▼ (top-1 chosen, params extracted)
               ┌──────────────────────────────────┐
               │  workflow-execute Edge Function  │
               │   ─ validate parameters_schema   │
               │   ─ insert workflow_runs row     │
               │   ─ route by execution_type:     │
               │       • edge-fn   → call handler │
               │       • hermes-skill → return    │
               │           skill ref to caller    │
               │       • external-api → HTTP call │
               │       • composite → recurse      │
               │   ─ update workflow_runs row     │
               │   ─ return output                │
               └────────────────┬─────────────────┘
                                │
                                ▼
                ┌────────────────────────────────┐
                │  Persona scaffold wraps output │
                │  (voice applied at agent layer)│
                └────────────────────────────────┘
```

### Cost model

| Step | Today (LLM-figures-it-out) | Phase 2E pattern |
|---|---|---|
| Intent matching | ~500 tokens output × Sonnet | Vector embedding (~$0.00002 per call) |
| Parameter extraction | ~2000 tokens × Sonnet | Small LLM (Haiku-eq, ~$0.0001 per call) |
| Actual work | ~5000-15000 tokens × Sonnet | Deterministic handler (~$0 LLM) |
| Voice/output | ~1500 tokens × Sonnet | Same (~$0.0005) |
| **Per call** | **~$0.05-0.15** | **~$0.0005-0.002** |

~30× reduction at the call level, more for high-frequency workflows. Cost is the moat.

---

## Data model

### Migration: enable pgvector + workflows tables

File: `supabase/migrations/20260507120000_workflow_registry.sql`

```sql
create extension if not exists vector;

create table workflows (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_id text not null,                -- "Invoice Generator" — display name (BI)
  description_id text not null,         -- one-line BI description for catalog
  agent_slugs text[] not null,          -- ['doc-expert'] or ['doc-expert', 'business-director']
  category text not null check (category in (
    'booking', 'scraping', 'generation', 'analysis', 'automation', 'template'
  )),
  intent_phrases text[] not null,       -- 5-15 sample customer phrases
  intent_embedding vector(1536),        -- text-embedding-3-small dim
  parameters_schema jsonb not null,     -- JSON Schema for required + optional params
  execution_type text not null check (execution_type in (
    'edge-function', 'hermes-skill', 'composite', 'external-api'
  )),
  handler_ref text not null,            -- namespaced: 'edge-fn:invoice-generator-handler'
  output_type text not null check (output_type in (
    'file', 'text', 'json', 'side-effect'
  )),
  tier text not null check (tier in ('starter', 'pro', 'studio')),
  version int not null default 1,
  success_rate numeric default 0,       -- updated post-run by trigger or batch job
  avg_duration_ms int default 0,
  usage_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index workflows_intent_embedding_idx on workflows
  using ivfflat (intent_embedding vector_cosine_ops) with (lists = 100);

create index workflows_agent_slugs_idx on workflows using gin (agent_slugs);
create index workflows_category_idx on workflows (category);
create index workflows_tier_idx on workflows (tier);

create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete cascade,
  agent_slug text not null,
  parameters jsonb,
  status text not null check (status in (
    'pending', 'running', 'success', 'failed'
  )),
  output jsonb,
  error text,
  duration_ms int,
  started_at timestamptz default now(),
  completed_at timestamptz
);

create index workflow_runs_customer_idx on workflow_runs(customer_id, started_at desc);
create index workflow_runs_workflow_idx on workflow_runs(workflow_id, started_at desc);

-- RLS: workflows readable by service-role only (Edge Functions). No anon access.
-- workflow_runs same — anon never sees other customers' runs.
alter table workflows enable row level security;
alter table workflow_runs enable row level security;
-- (No policies created — service-role bypasses RLS, anon gets blocked.)
```

**Schema notes:**

- **Tier divergence resolved:** Founder spec said `('free', 'pro', 'studio')` but our existing `subscriptions.tier` uses `'starter' | 'pro' | 'studio'`. Aligning to existing — `'starter'` is the entry tier (Rp 299k setup); no `'free'` in our business model. Workflows tagged `'starter'` are available to everyone; `'pro'` requires Pro+; `'studio'` is Studio-only.
- **`agent_slugs text[]`:** Conceptually references the PERSONA_SLUGS tuple from `soul-md-template.ts` but no FK (Postgres can't FK-reference TS exports). A test asserts every value is one of the 10 known slugs.
- **`handler_ref` convention:** Namespaced strings.
  - `edge-fn:invoice-generator-handler` → calls `${SUPABASE_URL}/functions/v1/invoice-generator-handler`
  - `hermes-skill:daily-briefing-bahasa` → already-installed skill on customer's VPS (Hermes invokes locally)
  - `external:traveloka-api` → external HTTP — out of scope for Phase 2E-1 pilot
  - `composite:<workflow-slug>` → multi-step — out of scope for Phase 2E-1 pilot
- **`status` enum:** 4 states for the pilot. `'cancelled'` and `'timeout'` are Phase 2E-2 additions if needed.
- **Vector index:** `ivfflat` with `lists=100` is fine through ~10k workflows. Reindex when registry exceeds that.
- **RLS:** Service-role-only by design. Customer-facing access goes through Edge Functions which use service-role internally and validate `customer_id` against the request.

---

## Embedding pipeline

### Provider choice

`vector(1536)` matches OpenAI's `text-embedding-3-small`. Provider options:

| Option | Cost / 1M tokens | Pros | Cons |
|---|---|---|---|
| OpenAI direct | $0.02 | Cheap, dim matches schema, fast | Requires dedicated API key (no OpenRouter for embeddings) |
| Cloudflare Workers AI | ~free at our volume | Already in stack mentally | Different model dim (768 or 1024); doesn't fit `vector(1536)` |
| Self-hosted (sentence-transformers) | ~free + infra | Full control | Adds Fly.io service, latency hit |

**PROPOSED: OpenAI direct.** $0.02/1M is negligible (3 pilot workflows × ~50 tokens of intent_phrases = < $0.000003 to seed; per customer message at runtime ~$0.000001). Founder approval needed: this is the only place in our stack that touches OpenAI directly. Add `OPENAI_EMBED_API_KEY` Supabase secret.

### When does embedding happen?

- **Workflow registration (us):** A registration helper script calls OpenAI to embed `intent_phrases.join('. ')` and INSERTs the row. Pilot has 3 workflows; we run the script once.
- **Customer message (runtime):** `workflow-discover` Edge Function embeds `message_text` per call.

No DB trigger needed for the pilot. Phase 2E-2+ may add a trigger when customers can author their own workflows.

---

## Edge Functions (3 new)

All three follow the established CORS chain pattern (`handleCors → handler → withCors`) from `supabase/functions/_shared/cors.ts`.

### 1. `workflow-discover`

**Method:** POST.
**Auth:** `customer_id` in body, validated against `customers` table. Phase 2E-1 trusts the UUID; Phase 2E-2 swaps to per-customer API key issued at provision (parallels welcome.html → Phase 2B JWT migration).

**Input:**
```json
{
  "customer_id": "uuid",
  "agent_slug": "web-master",
  "message_text": "pesen tiket Jakarta-Bali tanggal 15"
}
```

**Output:**
```json
{
  "matches": [
    {
      "workflow_id": "uuid",
      "slug": "book-ticket-traveloka",
      "name_id": "Pesan tiket Traveloka",
      "confidence": 0.87,
      "parameters_schema": { "$schema": "...", "required": [...], ... },
      "extracted_parameters": { "origin": "Jakarta", "destination": "Bali", "date": "2026-05-15" },
      "missing_parameters": ["passenger_count", "departure_window"]
    },
    { "...top 2 and top 3..." }
  ],
  "auto_execute_recommended": true
}
```

**Top-K + confidence semantics:**

- `matches` is an array of exactly **3** results, **sorted descending by `confidence`** (cosine similarity, range 0-1).
- `confidence` is the literal cosine score — visible to callers so the agent can make its own routing decision.
- **`auto_execute_recommended`** is a boolean convenience flag: `true` iff `matches[0].confidence >= 0.85` AND `matches[0].confidence - matches[1].confidence >= 0.10` (top-1 is clearly ahead of top-2). The agent SHOULD auto-execute on `true`; ask the customer to confirm on `false`.
- **0.85 threshold** is an initial guess based on the OpenAI embedding similarity range for related-but-not-identical phrases. Tune from production telemetry once `workflow_runs` has data.
- The 0.10 separation rule prevents auto-execute when two workflows are similarly likely (e.g. user says "ringkas berita pasar" and both `daily-briefing-builder` and `tiktok-script-builder` score 0.86 — ambiguous, ask user).

**Process:**
1. Validate `customer_id` exists, get their tier.
2. Embed `message_text` via OpenAI.
3. SQL: `select ... from workflows where agent_slug = ANY(agent_slugs) and tier_ord <= customer_tier_ord order by intent_embedding <=> $1 limit 3`.
4. For each match, run small-LLM parameter extraction against `parameters_schema` to populate `extracted_parameters`.
5. Compute `missing_parameters` = required - extracted.
6. Return.

**Cost per call:** ~$0.000003 (embed) + ~$0.0002 (param extract via Haiku-eq through OpenRouter).

### 2. `workflow-execute`

**Method:** POST.
**Auth:** Same as discover.

**Input:**
```json
{
  "customer_id": "uuid",
  "workflow_id": "uuid",
  "parameters": { "client_name": "Acme Corp", "items": [...], "due_date": "2026-05-20" }
}
```

**Output:**
```json
{
  "run_id": "uuid",
  "status": "success",
  "output": { "file_url": "https://...signed-url...", "format": "html" },
  "duration_ms": 1240
}
```

**Process:**
1. Validate customer + tier (`customer.tier_ord >= workflow.tier_ord`).
2. Validate `parameters` against `parameters_schema` (ajv or hand-rolled validator).
3. Insert `workflow_runs` row with `status='running'`.
4. Route by `execution_type`:
   - `edge-function`: HTTP call to `${SUPABASE_URL}/functions/v1/${handler_ref}`
   - `hermes-skill`: return `{ skill_ref, parameters }` for caller to invoke locally on VPS
   - `composite`, `external-api`: out of scope for pilot — return error
5. Catch exceptions → update row with `status='failed'`, `error=...`, return persona-voiced apology.
6. Update row with `status='success'`, `output=...`, `duration_ms=...`.

**Failsafe:** Handler exceptions never silently fail. Always update `workflow_runs`, always return a structured error.

### 3. `workflow-list`

**Method:** GET.
**Auth:** Open (read-only metadata; no handler_ref or sensitive fields exposed).

**Query:** `?agent_slug=doc-expert&category=template&tier=starter` (all optional).

**Output:**
```json
{
  "workflows": [
    {
      "slug": "invoice-generator",
      "name_id": "Generator Invoice",
      "description_id": "Bikin invoice PDF dari list item dan client info",
      "agent_slugs": ["doc-expert", "business-director"],
      "category": "template",
      "tier": "starter",
      "intent_phrases_sample": ["bikin invoice", "tagihan ke client"],
      "parameters_schema": { ... },
      "version": 1
    }
  ]
}
```

Excludes: `intent_embedding`, `handler_ref`, `success_rate`, `avg_duration_ms`, `usage_count` — debugging metadata, not customer-facing.

### Edge Function `verify_jwt` config

All three bypass Supabase JWT (Phase 2E-1 trusts customer_id UUID). Add to `supabase/config.toml`:

```toml
[functions.workflow-discover]
verify_jwt = false

[functions.workflow-execute]
verify_jwt = false

[functions.workflow-list]
verify_jwt = false
```

---

## 3 pilot workflows

### 1. `invoice-generator` (Doc Expert) — template pattern

**Slug:** `invoice-generator`
**Agent:** `doc-expert`, also `business-director` (cross-persona — Pro tier customers in either persona can invoke)
**Category:** `template`
**Tier:** `starter`
**Execution type:** `edge-function`
**Handler:** `edge-fn:invoice-generator-handler`
**Output type:** `file`

**`intent_phrases`:** [
  "bikin invoice untuk client",
  "tagihan untuk klien",
  "buat invoice untuk pembayaran",
  "generate invoice",
  "siapkan invoice",
  "tagihan bulan ini untuk",
  "invoice template",
  "bikin tagihan PDF"
]

**`parameters_schema`** (JSON Schema):
```json
{
  "type": "object",
  "required": ["client_name", "items"],
  "properties": {
    "client_name": { "type": "string", "minLength": 1, "maxLength": 200 },
    "client_address": { "type": "string", "maxLength": 500 },
    "items": {
      "type": "array",
      "minItems": 1,
      "maxItems": 50,
      "items": {
        "type": "object",
        "required": ["description", "qty", "unit_price"],
        "properties": {
          "description": { "type": "string", "minLength": 1, "maxLength": 200 },
          "qty": { "type": "number", "minimum": 0 },
          "unit_price": { "type": "number", "minimum": 0 }
        }
      }
    },
    "tax_rate": { "type": "number", "minimum": 0, "maximum": 1, "default": 0.11 },
    "due_date": { "type": "string", "format": "date" },
    "currency": { "type": "string", "enum": ["IDR", "USD"], "default": "IDR" }
  }
}
```

**Handler implementation (`supabase/functions/invoice-generator-handler/index.ts`):**

1. Fetch HTML template from Supabase Storage: `templates/invoice/v1/template.html`.
2. Render template with customer data (subtotal, tax, total computed server-side).
3. **Output decision for Phase 2E-1:** Return rendered HTML as a signed URL to a Supabase Storage object. PDF rendering deferred to Phase 2E-2.
   - **Reason:** Edge Functions can't run Chromium; PDF needs an external service (Browserless, Cloudflare Browser Rendering, or a Fly.io WeasyPrint wrapper). That's a separate infra decision worth its own founder review. HTML output is still customer-deliverable (Doc Expert can email it as `.html` attachment, customer prints to PDF in their own browser if needed).
   - **Phase 2E-2:** add `format: "pdf" | "html"` parameter, default to PDF once we pick a renderer.

**Storage layout (drift-tested):**
```
templates/invoice/v1/template.html         (Mustache-style HTML, weuseai branding)
templates/invoice/v1/template.css          (inline-able CSS for portability)
templates/invoice/v1/expected.html         (golden output for the test fixture)
```

A drift test asserts `templates/invoice/v1/template.html` content (SHA256) matches a checked-in expected hash. Same pattern as the SOUL.md drift checks.

**Tests:**
- Param validation rejects missing `client_name` → 400
- Param validation rejects empty `items` → 400
- Golden output: known input renders to expected HTML structure (table rows, totals, footer)
- Branding: `weuseai.agent` in footer (default brand for Phase 2E-1)
- Storage drift: template hash matches checked-in expected
- Currency formatting: `IDR` outputs `Rp 1.500.000`, `USD` outputs `$1,500.00`
- Tax computation: subtotal × tax_rate added before total

### 2. `daily-briefing-builder` (The Pro) — aggregation pattern

**Slug:** `daily-briefing-builder`
**Agent:** `the-pro`
**Category:** `analysis`
**Tier:** `starter`
**Execution type:** `edge-function`
**Handler:** `edge-fn:daily-briefing-handler`
**Output type:** `text`

**`intent_phrases`:** [
  "briefing pagi",
  "kasih ringkasan hari ini",
  "summary hari ini",
  "apa yang penting hari ini",
  "rangkum kalender pagi ini",
  "executive summary harian",
  "what's on my plate today"
]

**`parameters_schema`:**
```json
{
  "type": "object",
  "properties": {
    "date": { "type": "string", "format": "date", "description": "Defaults to today (Asia/Jakarta)" },
    "sources": {
      "type": "array",
      "items": { "type": "string", "enum": ["calendar", "email", "chat", "news"] },
      "default": ["calendar", "email", "news"]
    }
  }
}
```

**Handler implementation:**

Phase 2E-1 ships with **MOCK MCP adapters** — pulls from a fixture file in Supabase Storage rather than real Gmail/Calendar MCP. Real MCP integration is Phase 2C-2 work and shouldn't block this foundation.

1. For each requested source, call its mock adapter:
   - `calendar` → read fixture `mocks/daily-briefing/calendar-${date}.json`
   - `email` → read fixture `mocks/daily-briefing/email-${date}.json`
   - `news` → real call to news aggregator (already in scope from `setup-script.ts` `DAILY_NEWS_SKILL_MD`)
2. Compose markdown summary using a structured prompt + small LLM (Haiku-eq via OpenRouter).
3. Return as `output_type: 'text'`, body in `output.text`.

**Mock fixture path convention (drift-tested):**

Path: `templates/mocks/{source}/{scenario}.json`. Documented in `docs/workflows/README.md` so Phase 2C-2 can swap real MCP adapters without changing the schema.

Three scenarios ship with the pilot:

```
templates/mocks/calendar/typical-day.json    # 5 events: 4 meetings + 1 personal lunch
templates/mocks/gmail/typical-day.json       # 10 emails: 3 important + 5 noise + 2 follow-up
templates/mocks/calendar/empty.json          # zero events (graceful-handling test)
templates/mocks/gmail/empty.json             # zero emails (graceful-handling test)
```

**Calendar JSON shape (mirrors Google Calendar Events API):**
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

**Gmail JSON shape (mirrors Gmail messages.list + messages.get):**
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

**`importance` values:** `important` | `noise` | `follow_up`. Used by the handler to bucket the briefing output. Real MCP responses won't have this field — Phase 2C-2 either adds it via classifier or drops the bucket and outputs the full list.

**Tests:**
- Missing date → defaults to today (Asia/Jakarta), uses correct fixture
- Missing connector (e.g. `email` source but no fixture) → graceful: omits that section, returns warning in `output.warnings[]`
- Output format: markdown with sections `## Kalender`, `## Email`, `## Berita`
- Output language: Bahasa Indonesia (kamu form, no banned words)
- Date scoping: events outside the target date filtered out
- Fixture drift: hash check on test fixtures

### 3. `tiktok-script-builder` (Video Producer) — structured generation pattern

**Slug:** `tiktok-script-builder`
**Agent:** `video-producer`
**Category:** `generation`
**Tier:** `pro`
**Execution type:** `edge-function`
**Handler:** `edge-fn:tiktok-script-handler`
**Output type:** `json`

**`intent_phrases`:** [
  "bikin script TikTok",
  "script Reels",
  "scriptin video pendek",
  "ide konten TikTok",
  "buat hook video",
  "rencana TikTok harian",
  "draft Reels 30 detik"
]

**`parameters_schema`:**
```json
{
  "type": "object",
  "required": ["topic"],
  "properties": {
    "topic": { "type": "string", "minLength": 3, "maxLength": 200 },
    "length": { "type": "integer", "enum": [15, 30, 60, 90], "default": 30 },
    "audience": { "type": "string", "enum": ["gen-z", "millennial", "general"], "default": "general" },
    "platform": { "type": "string", "enum": ["tiktok", "reels", "shorts"], "default": "tiktok" }
  }
}
```

**Handler implementation:**

1. Build a structured prompt template with the topic, length, audience.
2. Call small LLM via OpenRouter — pinned model: `anthropic/claude-3.5-haiku` (claude-3-haiku is deprecated; 3.5 is current stable with reliable JSON mode). Customer's OpenRouter key from `customer_openrouter_keys` (Phase 2A) used here so cost stays on BYOK side.
3. Validate output against the response schema.
4. Return JSON.

**Response schema:**
```json
{
  "type": "object",
  "required": ["hook", "body", "cta", "visual_scenes", "sound_suggestion", "hashtags"],
  "properties": {
    "hook": { "type": "string", "description": "First 3 seconds, ≤30 chars optimal" },
    "body": { "type": "string", "description": "Main content body" },
    "cta": { "type": "string", "description": "Call to action, last 3-5 seconds" },
    "visual_scenes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "timestamp": { "type": "string", "pattern": "^\\d{1,2}:\\d{2}$" },
          "description": { "type": "string" }
        }
      }
    },
    "sound_suggestion": { "type": "string", "description": "Trending sound name or genre" },
    "hashtags": { "type": "array", "items": { "type": "string", "pattern": "^#[a-zA-Z0-9_]+$" }, "minItems": 3, "maxItems": 10 }
  }
}
```

**Tests:**
- Output schema valid (every required field present, types correct)
- `hook` length ≤30 chars (representing ≤3-second read-aloud)
- `length`-aware: 15s script has fewer/shorter scenes than 90s
- Indonesian output: `hook`, `body`, `cta` are BI; hashtags can be mixed
- Hashtag format: each starts with `#`, no spaces, alphanumeric+underscore only
- Schema validation rejects malformed LLM output → status=failed with descriptive error

---

## Hermes runtime integration — DEFERRED

Phase 2E-1 does **NOT** wire the running Hermes agent on the customer's VPS to call workflow-discover/execute. That integration depends on:

1. **Per-persona skill bundles** (Phase 2C-2) — installing a `workflow-router` skill on the VPS at provision time
2. **Per-customer API auth** — a key issued at provision, stored in `/home/weuseai/.hermes/.env`, validated by Edge Functions

Phase 2E-1 demo invokes Edge Functions directly via curl or test fixtures. This proves the workflow registry pattern in isolation without dragging in 2C-2 skill work.

**Phase 2E-2 plan (separate work):**
- Install `workflow-router` Hermes skill on every VPS
- Add `customer_api_keys` table + auth flow
- Demo: real customer message → Hermes → workflow-discover → workflow-execute → persona-voiced reply via Telegram

---

## Auth model (Phase 2E-1)

Edge Functions trust `customer_id` UUID in request body. Same model as the welcome.html → Phase 1 RLS approach. UUIDs are unguessable; the workflow-execute Edge Function validates that the customer exists, has a paid subscription, and has tier ≥ workflow.tier before running anything.

**Risks at this phase (acceptable for foundation, tighten in 2E-2):**
- Anyone with a customer's UUID can invoke their workflows
- No rate limiting (one customer could spam the registry)

**2E-2 hardening (parallels welcome.html → Phase 2B JWT plan):**
- Mint `customer_workflow_token` (signed JWT, 24h expiry) at provision time
- Edge Functions verify JWT → resolve customer_id server-side
- Rate limit per customer_id at the Edge Function entry

---

## Demo script

A single shell script + markdown doc demonstrate all 3 pilots end-to-end:

`docs/workflows/demo.md`:
```markdown
# Phase 2E-1 demo

Replace SUPABASE_URL with your project URL. Replace CID with a test customer UUID.

## Pilot 1: invoice-generator

curl -X POST "$SUPABASE_URL/functions/v1/workflow-discover" \
  -H "Content-Type: application/json" \
  -d '{"customer_id":"$CID","agent_slug":"doc-expert","message_text":"bikin invoice untuk PT Acme Indonesia"}'

# → returns top match: invoice-generator with extracted client_name="PT Acme Indonesia"
# → missing_parameters: ["items"]

curl -X POST "$SUPABASE_URL/functions/v1/workflow-execute" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id":"$CID",
    "workflow_id":"<uuid-from-above>",
    "parameters":{
      "client_name":"PT Acme Indonesia",
      "items":[{"description":"Konsultasi 10 jam","qty":10,"unit_price":500000}],
      "due_date":"2026-05-21"
    }
  }'

# → returns signed URL to rendered HTML invoice with weuseai.agent branding

## Pilot 2: daily-briefing-builder
[similar curl block]

## Pilot 3: tiktok-script-builder
[similar curl block]
```

---

## Test plan

Target: 30+ new tests, all passing.

### Schema + migration tests
- Migration applies cleanly to a fresh Supabase instance
- pgvector extension enabled
- ivfflat index exists and is queryable
- workflows + workflow_runs tables exist with correct constraints
- RLS enabled on both tables; anon SELECT returns empty without policy

### workflow-discover tests
- Valid customer + agent_slug + message → returns top 3 matches with descending confidence
- 5 sample phrases → assert correct workflow matched as top-1:
  - "bikin invoice untuk PT Acme" → invoice-generator
  - "briefing pagi dong" → daily-briefing-builder
  - "scriptin TikTok 30 detik" → tiktok-script-builder
  - "kasih ringkasan email pagi" → daily-briefing-builder (not tiktok-script-builder)
  - "tagihan untuk klien Mei" → invoice-generator
- Customer tier filter: `starter` customer can't see `pro`-tier workflows
- Unknown customer_id → 404
- Empty message → 400

### workflow-execute tests
- Valid run: status transitions pending → running → success
- Invalid parameters → 400, no workflow_runs row inserted
- Handler exception → workflow_runs row with status=failed + error text
- Tier mismatch (starter customer invoking pro workflow) → 403
- Idempotency: same parameters twice → two runs, both succeed independently

### workflow-list tests
- No filter → returns all 3 pilot workflows
- Filter by agent_slug → only workflows for that agent
- Filter by category → only matching category
- Sensitive fields excluded: handler_ref, intent_embedding, success_rate not in output

### Per-pilot golden output tests
- invoice-generator: known input renders to expected HTML structure
- daily-briefing-builder: known fixture set renders to expected markdown
- tiktok-script-builder: known prompt → output validates against response schema

### Drift tests (storage assets)
- `templates/invoice/v1/template.html` SHA256 matches checked-in expected hash
- `mocks/daily-briefing/calendar-fixture.json` SHA256 matches expected
- `mocks/daily-briefing/email-fixture.json` SHA256 matches expected

### CORS tests (parallel to existing edge functions)
- OPTIONS preflight from production origin → 200 + correct headers
- OPTIONS from preview origin (vercel.app subdomain) → 200 + echoed origin
- POST from disallowed origin → 200 + canonical origin header (fail-closed)

### Vector search test
- Insert 3 pilot workflows with embeddings
- Query 5 customer phrases against the index
- Top-1 match correctness across all 5

---

## Acceptance criteria

Per founder brief, marked ✅ when shipped:

- [ ] Schema migration applied to staging Supabase
- [ ] pgvector extension enabled, ivfflat index queryable
- [ ] 3 Edge Functions deployed: workflow-discover, workflow-execute, workflow-list
- [ ] CORS verified on all 3 (handleCors → handler → withCors pattern)
- [ ] 3 pilot workflows registered with embeddings populated
- [ ] Vector embedding pipeline working (intent_phrases → embedding via OpenAI)
- [ ] Test suite: 30+ new tests, all passing
- [ ] `npm run typecheck:all` clean
- [ ] Demo script: 1 customer message per pilot → working output (HTML invoice URL, markdown briefing, JSON TikTok script)
- [ ] Documentation: `docs/workflows/README.md` explaining how to add a workflow

---

## Constraints (founder-locked)

- **LLM in handlers = minimal.** Small models (Haiku-eq via OpenRouter) for intent + parameter extraction. NOT Opus. Cost is the moat.
- **Indonesian context first.** Pilot workflows assume ID locale: Rupiah formatting, Indonesian dates (DD MMM YYYY), Bahasa output.
- **Failsafe gracefully.** Handler failure → `workflow_runs` row with status=failed + error text + persona-voiced apology to caller. NEVER silent failure.
- **NO scope creep into 2E-2.** Stop at 3 pilots + foundation. Do NOT draft additional workflows yet.

---

## Out of scope (deferred)

- **Hermes runtime integration** (Phase 2E-2, gated by 2C-2 skill bundles)
- **Real PDF rendering** for invoice-generator (Phase 2E-2, requires infra decision: Browserless, Cloudflare Browser Rendering, or self-hosted WeasyPrint on Fly.io)
- **Real MCP integration** for daily-briefing-builder (Phase 2C-2)
- **Composite workflows** (Phase 2E-2 — multi-step orchestration)
- **External-api workflows** (Phase 2E-2 — Traveloka, Gojek, etc.)
- **workflow-rerun / workflow-cancel endpoints** (Phase 2E-3)
- **Customer-facing workflow registry UI** (Phase 2E-3)
- **Per-customer workflow customization / private workflows** (Phase 2E-3+)
- **success_rate / avg_duration_ms / usage_count auto-update** (Phase 2E-2 — needs trigger or batch job)
- **Per-customer API key auth** (Phase 2E-2, parallels welcome.html → Phase 2B JWT)
- **Rate limiting per customer** (Phase 2E-2)

---

## Phase boundaries

| Phase | Scope | Status |
|---|---|---|
| **2E-1** (this branch) | Workflow registry + 3 pilot workflows + 3 Edge Functions + tests | In progress |
| **2E-2** | Hermes integration (workflow-router skill on VPS), per-customer API key, real PDF rendering, real MCP integration for daily-briefing, +10 more workflows, composite workflows | Pending |
| **2E-3** | Customer-facing UI (browse / invoke / customize workflows), workflow_runs analytics dashboard, per-customer private workflows | Pending |

---

## Open questions for founder review

The architecture is workable end-to-end, but six decisions are worth confirming explicitly before coding starts:

### Q1: Embedding provider — OpenAI direct?

I'm proposing **OpenAI text-embedding-3-small** (matches the `vector(1536)` schema dimension). This adds OpenAI as a NEW direct dependency in our stack — currently we only use OpenAI-compatible APIs through OpenRouter. The cost is negligible (<$1/month at expected pilot volume).

**Alternatives:**
- Cloudflare Workers AI embeddings (free at our volume, but different dim → schema change)
- Self-hosted on Fly.io (zero per-call cost, ~$5/month infra, latency hit)

**Recommendation: OpenAI direct.** Confirm or override?

### Q2: Tier enum alignment

Founder spec said `tier in ('free', 'pro', 'studio')`. I aligned to existing schema: `('starter', 'pro', 'studio')`. Reasoning: no `'free'` in our business model (Starter Rp 299k is the entry tier).

**Confirm:** ship with `('starter', 'pro', 'studio')` enum.

### Q3: PDF for invoice-generator — defer to 2E-2?

I'm proposing **HTML output for the pilot**, with PDF deferred to Phase 2E-2 once we pick a renderer (Browserless / Cloudflare Browser Rendering / self-hosted WeasyPrint).

**Reason:** PDF rendering is a separate infra decision worth its own founder review. HTML output proves the template-fetch-and-render pattern; PDF just changes the final output stage.

**Alternative:** block 2E-1 on PDF infra decision and ship PDF in this PR.

**Recommendation: ship HTML, add PDF in 2E-2.** Confirm or override?

### Q4: Hermes integration — defer to 2E-2?

The pilot does NOT integrate with the running Hermes agent on customer VPS. Demo invokes Edge Functions directly via curl.

**Reason:** Hermes integration depends on Phase 2C-2 (per-persona skill bundles), which isn't in scope here. Pulling it forward expands 2E-1 by ~40% and entangles two workstreams.

**Alternative:** include a minimal `workflow-router` skill in 2E-1.

**Recommendation: defer to 2E-2.** Confirm?

### Q5: daily-briefing MCP integration — mock for pilot?

The pilot ships with mock MCP adapters (read from Supabase Storage fixtures). Real Gmail/Calendar MCP integration is Phase 2C-2.

**Recommendation: mock for pilot.** Confirm?

### Q6: Pinned LLM for tiktok-script-builder

~~Proposing `anthropic/claude-3-haiku` via OpenRouter.~~ Updated to `anthropic/claude-3.5-haiku` per founder direction (claude-3-haiku deprecated; 3.5 is current stable with reliable JSON mode). Cost ~similar. Future upgrade path to claude-haiku-4.5 when stable.

---

## Decisions locked 2026-05-07

| # | Decision | Outcome |
|---|---|---|
| Q1 | Embedding provider | OpenAI direct (`text-embedding-3-small`, 1536 dim). Future privacy/data-residency concerns can swap to self-hosted in Phase 3 if needed. |
| Q2 | Tier enum | `('starter', 'pro', 'studio')` — aligned to existing `subscriptions.tier`. No `'free'` in business model. If a workflow ever needs to be subscription-free, add a separate `is_public boolean` column. |
| Q3 | PDF rendering | Ship HTML output for Phase 2E-1 pilot. PDF deferred to Phase 2E-2 with separate spec doc covering renderer choice (Browserless / Cloudflare Browser Rendering / WeasyPrint). HTML output is enough to prove the pattern + concierge testing. |
| Q3a | Parameter extraction (post-2E-1a re-decision, 2026-05-08) | **OPTION (b) implemented in 2E-1.** Add a NEW Supabase secret `OPENROUTER_ORCHESTRATION_KEY` — separate from `OPENROUTER_PROVISIONING_KEY` (which mints customer keys). Cost lands on the platform (~$6/month at 1000 customers × 30 extraction calls/month). LLM call: claude-3.5-haiku via OpenRouter, JSON mode, max 200 output tokens, temperature 0. Retry once on malformed JSON with a stricter prompt. Two failures → fall back to empty `extracted_parameters`, log to `extraction_failures` table. Extraction is only invoked for top-1 when `shouldAutoExecute` is true (cost optimization — ambiguous matches don't waste extraction budget). |
| Q4 | Hermes runtime integration | Defer to Phase 2E-2. Curl-based demo via Edge Function endpoint sufficient for 2E-1 acceptance. |
| Q5 | MCP integration | Mock fixtures in Supabase Storage. Path convention `templates/mocks/{source}/{scenario}.json`. Real MCP adapters swap in via Phase 2C-2 without schema changes. |
| Q6 | LLM model pin | `anthropic/claude-3.5-haiku` via OpenRouter (customer's BYOK key). |

Vector search top-K + threshold (added to spec body):
- `workflow-discover` returns exactly 3 matches sorted by descending `confidence` (cosine).
- `auto_execute_recommended = true` iff top-1 ≥ 0.85 AND top-1 minus top-2 ≥ 0.10.
- Below threshold → agent asks customer to confirm.

Schema spot-checks all approved as-is:
- `handler_ref` namespacing (4 prefixes)
- `agent_slugs text[]` validated against PERSONA_SLUGS in tests
- 4-state `workflow_runs.status` (extra states added later if ops needs them)

---

*Last updated: 2026-05-07 by Claude (Phase 2E-1 spec, post-approval)*
