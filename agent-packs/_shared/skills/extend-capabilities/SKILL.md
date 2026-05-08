# extend-capabilities — Hermes skill (shared, all agents)

Bundle: shared (referenced by every agent's manifest.json)
Execution: hermes-skill (runs entirely on customer's VPS, no Edge Function call)
Tier: starter (every paid customer)

## Why this exists

Customer asks for something not in the agent's pre-loaded inventory (e.g. Doc Expert is asked for an SKDU letter, which has no template in the bundle). Instead of saying "tidak bisa", the agent generates a new template using the customer's LLM (BYOK), persists it to the VPS, registers it in the local manifest, and uses it to fulfill the request. The library compounds in value over time, per customer.

## Kapan dipakai

When the agent matches an intent it CAN serve in principle (matches its persona scope) but DOESN'T have a template/skill for. Trigger heuristic:

- Customer asks for a doc/output type not listed in `manifest.json` `templates[]`
- The persona scope (per SOUL.md) clearly covers this kind of work
- A reasonable LLM-generated template would solve the request

Don't use for:
- Anything outside the persona's scope (Doc Expert won't extend into video editing — that's Video Producer territory)
- Anything that needs a real external API integration (Phase 2E-2 wires those)
- Sensitive output requiring human review (legal contracts, medical advice, financial filings)

## Yang dilakukan

1. **Identify the gap.** Customer's intent matched persona scope but no existing template fits. Confirm with customer in 1 line: "Aku belum punya template buat [X]. Boleh aku coba bikin satu? Sekitar 30 detik."

2. **Wait for customer approval.** Don't auto-extend — explicit consent is the contract. If customer declines, route to a manual/best-effort response without persistence.

3. **Generate the template** using the customer's LLM (configured via `OPENAI_API_KEY` in `/home/weuseai/.hermes/.env`):

   ```
   System prompt:
   Kamu adalah template generator untuk agent "{agent_slug}". Customer minta template untuk: "{customer_request}".

   Generate template content yang:
   - Match persona scope dari SOUL.md (read by Hermes' system prompt context)
   - Bisa di-fill dengan variables {placeholder} style
   - Single-file, format yang sesuai (HTML / Markdown / DOCX-style markdown)
   - Tone calm-premium, kamu form, no exclamation, no banned words

   Output the template content ONLY. No prose explanation. No markdown code fences (unless the template itself is markdown).
   ```

   Set temperature 0.3, max_tokens 2000.

4. **Persist to VPS.** Write the generated content to:

   ```
   /var/lib/weuseai/customer-grown/templates/{slug}.{ext}
   ```

   Where `{slug}` is a kebab-case identifier derived from the customer request (e.g. "skdu-letter") and `{ext}` matches the format (html, md, docx-md).

5. **Update local manifest.** Append the new template to `/home/weuseai/.hermes/agent-pack/manifest.json` (a copy of the agent-pack manifest customized at runtime). The manifest entry:

   ```json
   {
     "id": "skdu-letter.md",
     "kind": "letter",
     "description_id": "Surat Keterangan Domisili Usaha — generated 2026-05-08 untuk customer request",
     "best_for": "Pengajuan domisili usaha ke kelurahan",
     "source": "customer-grown",
     "generated_at": "2026-05-08T07:30:00+07:00"
   }
   ```

   IMPORTANT: only update the LOCAL manifest. Don't sync back to the central agent-packs/ in our repo. The library compounds per-customer, not centrally.

6. **Use the new template** to fulfill the original request. Return result with persona voice, mentioning that the template is "now in your library — kapan-kapan kamu butuh lagi, sudah ready".

## Persistence layout

```
/var/lib/weuseai/customer-grown/
├── templates/
│   ├── skdu-letter.md
│   ├── pernyataan-mitra.md
│   └── ...
├── skills/                           (Phase 2E-2: full skill generation; 2E-1.5 pilot is templates only)
└── extension-log.jsonl               (audit log: when, what, why)
```

The `extension-log.jsonl` is append-only — one line per extension event, JSON formatted:

```json
{"timestamp":"2026-05-08T07:30:00+07:00","customer_request":"...","slug":"skdu-letter","template_path":"...","approved_in_session":"sess_abc"}
```

## Contoh interaksi

**Customer (Doc Expert):** "Bikin SKDU buat usaha aku."

**Doc Expert:**

Aku belum punya template buat SKDU (Surat Keterangan Domisili Usaha). Boleh aku coba bikin satu sekarang? Sekitar 30 detik. Setelah ready, file-nya bakal masuk ke library kamu — kapan-kapan butuh lagi tinggal panggil.

**Customer:** "Boleh, coba aja"

**Doc Expert (after generation):**

Done. Template SKDU sudah aku susun + tersimpan di library kamu sebagai `skdu-letter.md`.

[Buka draft](file:///var/lib/weuseai/customer-grown/templates/skdu-letter.md)

Aku isi placeholder seperlunya. Kamu kasih tahu detail (nama usaha, alamat, nomor RT/RW, nama pemilik) atau aku ekstrak dari profil yang sudah aku tau?

## Hard limits

- **Persetujuan customer eksplisit dulu sebelum generate.** Tidak silent-extend.
- **No central sync.** Customer-grown templates stay on customer's VPS. Tidak sync ke agent-packs/ repo. Library kompoun per customer.
- **Persona-scope check.** Doc Expert tidak extend ke video editing tasks. Kalau diminta, refuse + redirect ke persona yang fit (Video Producer).
- **No sensitive auto-generation.** Legal contract, medical advice, financial advice — flag for human review, don't auto-persist.
- **Append-only audit log.** `/var/lib/weuseai/customer-grown/extension-log.jsonl` kept for compliance + tuning.
