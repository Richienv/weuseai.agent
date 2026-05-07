# Workflow Library Demo — Phase 2E-1.5 (Hermes-Native)

3 paths the founder asked to demonstrate the new architecture. Replace `$SUPABASE_URL` and `$CID` with a staging customer UUID that has an active subscription.

```sh
export SUPABASE_URL="https://gtjgsligllbjcisiyrah.supabase.co"
export CID="<paste-customer-uuid>"
```

---

## Path 1 — existing template (Doc Expert + invoice-generator)

This path proves the deterministic-handler pattern. Hermes (on the customer's VPS) does intent matching + parameter extraction LOCALLY using the customer's BYOK LLM. Then it POSTs to `workflow-execute` for the deterministic HTML render.

### Step 1: list — confirm catalog has the workflow

```sh
curl -sS "$SUPABASE_URL/functions/v1/workflow-list?agent_slug=doc-expert" | jq
```

Expected: `invoice-generator` listed with `category: 'template'`, `tier: 'starter'`.

### Step 2: execute — Hermes (or curl simulating it) sends extracted params

In production, Hermes generates this body. For the demo, we send it directly:

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/workflow-execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"customer_id\": \"$CID\",
    \"workflow_id\": \"<uuid-from-list>\",
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

Expected: `{ run_id, status: 'success', output: { file_url: 'https://...' } }`.

### Step 3: open the signed URL

The HTML invoice renders with weuseai.agent branding, IDR formatting, PPN 11% breakdown. `workflow_runs` row written with `status='success'`.

---

## Path 2 — self-extension (Doc Expert + SKDU letter — the wow moment)

This path proves the library compounds. Doc Expert's `manifest.json` doesn't have an SKDU template. Customer asks anyway. Agent creates one, persists it, uses it.

In production, this happens entirely inside Hermes on the customer's VPS — no Edge Function calls. The interaction is the demo:

### Customer message

```
Bikin SKDU buat usaha aku
```

### Hermes flow (on the customer's VPS)

1. **Intent match**: Hermes' LLM scans loaded SKILL.md files. No skill matches "SKDU" directly. The LLM evaluates whether `extend-capabilities` should fire — the request matches Doc Expert's persona scope (document creation), no existing template fits.

2. **Confirm**: Hermes responds with the persona voice:
   > "Aku belum punya template buat SKDU (Surat Keterangan Domisili Usaha). Boleh aku coba bikin satu sekarang? Sekitar 30 detik."

3. **Customer approves**:
   > "Boleh, coba aja"

4. **Generate**: Hermes uses the customer's BYOK LLM to generate template content per the prompt in `agent-packs/_shared/skills/extend-capabilities/SKILL.md`. Cost ~$0.001 on customer's key.

5. **Persist**: Hermes writes `/var/lib/weuseai/customer-grown/templates/skdu-letter.md` and appends to `/var/lib/weuseai/customer-grown/extension-log.jsonl`:
   ```json
   {"timestamp":"2026-05-08T07:30:00+07:00","customer_request":"SKDU","slug":"skdu-letter","template_path":"/var/lib/weuseai/customer-grown/templates/skdu-letter.md"}
   ```

6. **Use**: Hermes reads the new template, fills placeholders with what the customer provided, returns a draft.

7. **Persona-voiced reply**:
   > "Done. Template SKDU sudah aku susun + tersimpan di library kamu sebagai `skdu-letter.md`. Kapan-kapan butuh lagi tinggal panggil."

### Verification

SSH into the customer's VPS:

```sh
ls /var/lib/weuseai/customer-grown/templates/
# skdu-letter.md   ← was empty before, now has content

cat /var/lib/weuseai/customer-grown/extension-log.jsonl
# one JSON line per extension event
```

The customer's library has grown. Next time anyone asks for an SKDU on this VPS, the agent uses the existing template — no LLM regeneration needed.

---

## Path 3 — pure persona (The Pro + open-ended)

No skill match. Hermes responds using only `SOUL.md` (the persona scaffold from Phase 2C-1) + the customer's LLM. No `workflow-execute` call.

### Customer message

```
Minggu depan padat banget. Apa yang harus aku skip?
```

### Hermes flow

1. Intent match: no skill in inventory matches "what should I skip?" deterministically.
2. Hermes falls back to persona-driven response using The Pro's SOUL.md context (calm, observational, anticipatory tone signature).
3. Reply uses customer's BYOK LLM, drafted in The Pro's voice. No Edge Function involved.

### Sample response (illustrative, actual depends on the LLM):

> Pagi, [first_name]. Untuk decide skip-nya, biasanya tiga lensa yang aku pakai: (1) yang kontribusinya jelas ke milestone Q2 — keep. (2) yang bisa di-async via Slack atau email — propose pindah ke async. (3) yang kalau kamu skip, no one will follow up — itu kandidat skip pertama.
>
> Mau aku unpack salah satu meeting yang ragu-ragu, atau langsung kirim daftar lima yang paling overhead?

This path doesn't write to `workflow_runs`. It's purely a Hermes-side conversation. The platform's role is just hosting.

---

## What's NOT in this demo

- **End-to-end Hermes integration on a real VPS.** Path 2 + 3 above describe the runtime contract; the actual VPS integration ships in Phase 2E-2 alongside `customer-flow.ts` wiring (tar + base64 the bundle into `bundleTarBase64`).
- **PDF output for invoices.** Phase 2E-2 with separate renderer-choice spec.
- **Real Gmail / Calendar MCPs for daily-briefing.** Phase 2C-2.
- **Skill self-generation** (only template self-generation in 2E-1.5). Phase 2E-2.

---

## Failure paths

### Path 1 — handler validation rejects bad params

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/workflow-execute" \
  -H "Content-Type: application/json" \
  -d "{\"customer_id\": \"$CID\", \"workflow_id\": \"<uuid>\", \"parameters\": {\"client_name\": \"X\"}}" | jq
# {"error": "parameter_validation_failed", "detail": "<root>: missing required property \"items\""}
```

No `workflow_runs` row written (validation fires before insert).

### Path 2 — customer declines extension

Hermes doesn't generate. Falls back to "Maaf, untuk SKDU kamu mungkin perlu cek template resmi dari kelurahan setempat" — persona-voiced refusal, no persistence.

### Path 3 — LLM error on customer's BYOK key

Hermes returns "Sepertinya credit OpenRouter habis atau ada error API. Cek di dashboard kamu." — still using persona voice, no fallback to platform LLM.

---

## Manifest validation as a gate

Before deploying to a new customer, validate the bundle:

```sh
npx tsx --test tests/manifest-validator.spec.ts
```

20/20 must pass — including drift checks against all 3 pilot manifests on disk. Any failure means a manifest somewhere has a typo or invariant violation; CI blocks the deploy.
