# Workflow Library Demo — Phase 2E-1 (mid-phase checkpoint)

Replace `$SUPABASE_URL` with your project URL and `$CID` with a real customer UUID that has an active subscription.

```sh
export SUPABASE_URL="https://gtjgsligllbjcisiyrah.supabase.co"
export CID="<paste-customer-uuid>"
```

---

## Pilot 1: invoice-generator (end-to-end)

### Step 1 — confirm catalog lists the workflow

```sh
curl -sS "$SUPABASE_URL/functions/v1/workflow-list?agent_slug=doc-expert" | jq
```

**Expected:**
```json
{
  "workflows": [
    {
      "slug": "invoice-generator",
      "name_id": "Generator Invoice",
      "description_id": "Bikin invoice HTML dari list item dan info klien — siap kirim atau cetak.",
      "agent_slugs": ["doc-expert", "business-director"],
      "category": "template",
      "tier": "starter",
      "intent_phrases_sample": ["bikin invoice untuk client", "tagihan untuk klien", "buat invoice untuk pembayaran"],
      "parameters_schema": { "type": "object", "required": ["client_name", "items"], ... },
      "output_type": "file",
      "version": 1
    }
  ]
}
```

### Step 2 — discover via customer message

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/workflow-discover" \
  -H "Content-Type: application/json" \
  -d "{
    \"customer_id\": \"$CID\",
    \"agent_slug\": \"doc-expert\",
    \"message_text\": \"bikin invoice untuk PT Acme Indonesia\"
  }" | jq
```

**Expected (when `OPENROUTER_ORCHESTRATION_KEY` is configured):**
```json
{
  "matches": [
    {
      "workflow_id": "<uuid>",
      "slug": "invoice-generator",
      "name_id": "Generator Invoice",
      "confidence": 0.91,
      "parameters_schema": { ... },
      "extracted_parameters": { "client_name": "PT Acme Indonesia" },
      "missing_parameters": ["items"]
    },
    { "...top 2..." },
    { "...top 3..." }
  ],
  "auto_execute_recommended": true
}
```

Notes:

- **Extraction only fires for top-1 when `auto_execute_recommended=true`** (top-1 confidence ≥ 0.85 AND gap to top-2 ≥ 0.10). Ambiguous matches return all 3 with empty `extracted_parameters` — agent should ask the customer to confirm which workflow.
- The orchestration LLM (`anthropic/claude-3.5-haiku`) parses Indonesian + English + currency variants (`3jt`, `Rp 3.000.000`, `tiga juta`, `500rb`) into structured params. Cost ~$0.0002/call on the platform's `OPENROUTER_ORCHESTRATION_KEY` (not the customer's BYOK key).
- Per-field schema validation strips invalid extractions: if the LLM returns `amount: "three million"` against a `number` schema, that field gets stripped and listed in `missing_parameters`.
- Retry-once on malformed JSON; second failure → empty `extracted_parameters` + row in `extraction_failures` for tuning.

### Step 3 — execute with parameters

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/workflow-execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"customer_id\": \"$CID\",
    \"workflow_id\": \"<uuid-from-step-2>\",
    \"parameters\": {
      \"client_name\": \"PT Acme Indonesia\",
      \"client_address\": \"Jl. Sudirman No. 1, Jakarta Pusat\",
      \"items\": [
        { \"description\": \"Konsultasi UI/UX 8 jam\", \"qty\": 8, \"unit_price\": 800000 },
        { \"description\": \"Revisi desain (round 2)\", \"qty\": 1, \"unit_price\": 1500000 }
      ],
      \"due_date\": \"2026-05-21\"
    }
  }" | jq
```

**Expected:**
```json
{
  "run_id": "<uuid>",
  "status": "success",
  "output": {
    "file_url": "https://gtjgsligllbjcisiyrah.supabase.co/storage/v1/object/sign/workflow-outputs/invoices/...",
    "format": "html",
    "filename": "invoice-pt-acme-indonesia-INV-20260507-XXXX.html",
    "invoice_number": "INV-20260507-XXXX",
    "issue_date": "2026-05-07",
    "totals": {
      "subtotal": 7900000,
      "tax": 869000,
      "total": 8769000,
      "currency": "IDR",
      "tax_rate": 0.11
    },
    "expires_in_seconds": 86400
  },
  "duration_ms": 1230
}
```

### Step 4 — verify the rendered invoice

Open `output.file_url` in a browser. You should see the rendered HTML invoice with:

- weuseai.agent branding in the header
- "PT Acme Indonesia" and the address
- 2 line items with totals
- Subtotal Rp 7.900.000, Pajak (11%) Rp 869.000, Total Rp 8.769.000
- Footer with `hello@weuseai.agent` contact

### Step 5 — verify audit row

```sh
# Run via Supabase SQL editor or psql
select id, status, duration_ms, error
from workflow_runs
where customer_id = '$CID'
order by started_at desc
limit 1;
```

Should show one row with `status = 'success'` and `duration_ms` matching step 3's response.

---

## Failure path demos

### Tier mismatch (403)

If a workflow's tier exceeds the customer's tier, `workflow-execute` returns 403 without inserting a workflow_runs row.

```sh
# (Demo workflow tagged tier='studio' against a starter customer)
curl -sS -X POST "$SUPABASE_URL/functions/v1/workflow-execute" -H "Content-Type: application/json" \
  -d "{\"customer_id\": \"$STARTER_CID\", \"workflow_id\": \"<studio-only-wf>\", \"parameters\": {}}" | jq
# {
#   "error": "tier_insufficient",
#   "detail": "workflow requires studio, customer has starter"
# }
```

### Parameter validation failure (400)

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/workflow-execute" -H "Content-Type: application/json" \
  -d "{
    \"customer_id\": \"$CID\",
    \"workflow_id\": \"<invoice-uuid>\",
    \"parameters\": { \"client_name\": \"X\" }
  }" | jq
# {
#   "error": "parameter_validation_failed",
#   "detail": "<root>: missing required property \"items\""
# }
```

### Handler-side failure (500 + run_id)

If the handler throws or returns an error result, `workflow-execute` records a failed run AND returns the run_id so the caller can audit the attempt:

```json
{
  "error": "handler_failed",
  "detail": "PDF service down",
  "run_id": "<uuid-of-failed-run>"
}
```

The corresponding `workflow_runs` row has `status = 'failed'` and `error = 'PDF service down'`.

---

## What's NOT in this demo (Phase 2E-2 work)

- **Hermes integration:** the running agent on the customer's VPS doesn't yet call these endpoints. Demo above invokes them directly via curl. Phase 2E-2 adds a `workflow-router` skill on every VPS.
- **Real PDF output:** invoice-generator returns HTML in 2E-1. PDF rendering (Browserless, Cloudflare Browser Rendering, or self-hosted WeasyPrint) lands in 2E-2 with a separate spec doc.
- **daily-briefing-builder + tiktok-script-builder:** the other two pilots are in the next 2E-1 batch.
