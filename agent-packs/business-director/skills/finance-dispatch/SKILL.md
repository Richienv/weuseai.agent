# finance-dispatch — Hermes skill

Bundle: business-director (v3 — Phase 5 dept pack)
Tier: studio (Q3=A locked: phase_5_enabled = true required)
Handler: `hermes-skill:finance-dispatch` (facade — translates finance-shaped intent to specialist persona/skill)

> Replaces the general-purpose `department-task-spawner` for finance work. No new logic — pure routing.

> **Hard guardrail:** BD v3 + dispatched specialists are NOT licensed accountants (akuntan publik) or tax consultants (konsultan pajak). Output is reasoning grounded in publicly-known DJP/PSAK/UU regulations. For binding tax filings (SPT Tahunan, e-Faktur PPN, PPh, BPJS contributions), recommend licensed-accountant review BEFORE submission.

## Kapan dipakai

Customer raises finance-shaped intent. Trigger phrases:

- "review pricing tier kita"
- "estimasi cash runway"
- "model unit economics"
- "PPh 21 buat karyawan baru"
- "lapor PPN bulan ini"
- "SPT Tahunan PT"
- "invoice template + e-faktur"
- "rekening koran reconcile"

## Yang harus diekstrak

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `intent_kind` | enum: pricing-review \| cash-runway \| unit-economics \| pph-calc \| ppn-filing \| spt-tahunan \| invoice-template \| reconcile | ya | Determines specialist routing |
| `period` | string | tidak | "Q3 2026", "Jan 2026", "FY 2025" — context for reporting intents |
| `urgency` | enum: now \| next-sprint \| backlog | tidak | Default next-sprint |

## Routing table

| `intent_kind` | Specialist persona | Skill called |
|---|---|---|
| pricing-review | Trade Pro | pricing-tier-modeler |
| cash-runway | Trade Pro | runway-modeler |
| unit-economics | Trade Pro | unit-economics-modeler |
| pph-calc | Trade Pro | pph-calculator (Indonesian PPh 21/23/4 ayat 2) |
| ppn-filing | Trade Pro | ppn-prep (e-Faktur format) |
| spt-tahunan | Trade Pro + Doc Expert | spt-tahunan-prep + spt-template |
| invoice-template | Doc Expert | invoice-generator-handler (existing edge function) |
| reconcile | Trade Pro | reconciliation-helper |

## Approval gates (Q4=C: regulatory_filing = 48-hour expiry)

These intents surface `regulatory_filing` approvals before submission:

- `ppn-filing` → SPT Masa PPN submission
- `spt-tahunan` → SPT Tahunan PPh Badan submission
- `pph-calc` → if customer wants to auto-set the calculation as the actual filed value (rare; usually advisory only)

`pricing-review`, `cash-runway`, `unit-economics`, `invoice-template`, `reconcile` are advisory — no approval gate.

## PII handling

Finance touches NPWP frequently. Per Phase 4-4 transform-llm-output Q4=A allowlist:
- `business-director/incorporation-advisor` (NPWP) + `business-director/compliance-checker` (NPWP + KTP) pass PII through
- finance-dispatch routes to Trade Pro / Doc Expert which are NOT on the allowlist — so customer NPWP/account numbers in their inputs MUST be redacted in any draft outputs surfaced back via Telegram. Final filing documents (printed PDFs) can include them; surfaced summaries cannot.

## Yang dilakukan

1. Parse customer message → `intent_kind` + optional `period`
2. Route to specialist via Hermes v0.13.x multi-agent spawn (or invoke `invoice-generator-handler` edge function for invoice intent)
3. Open `department_threads` row (`department: 'finance'`) for cross-session resume
4. Specialist computes / drafts (PII redacted in surfaced summaries)
5. **For filing intents** — open `approval_requests` row (`action_kind: 'regulatory_filing'`, expiry = now + 48h), surface to customer via Telegram with summary numbers (NPWP redacted, totals visible)
6. On approval → final filing-ready document delivered (full PII included in PDF for printing); customer responsible for actual submission to DJP via official channels
7. On rejection → discard or iterate

## Output

Persona-voice wrapper:

> "Intent 'lapor PPN bulan Jul 2026' aku route ke **Trade Pro** (ppn-prep).
>
> Open thread di Finance department: `ppn-jul-2026`. ETA: ~8 menit untuk preparation.
>
> Aku akan compute total faktur (input + output) + PPN payable + draft e-Faktur format. Catatan: aku bukan konsultan pajak berlisensi — recommend review sama akuntan kamu sebelum submit ke DJP.
>
> Aku queue approval `regulatory_filing` (expires in 48 jam). Reply approve di Telegram begitu draft siap + kamu udah review numbers-nya."

## Decline scenarios

- Customer's tier ≠ studio OR `phase_5_enabled = false` → degrade to existing Persona v2 BD scoped MVP
- Tax dispute / DJP audit response → decline; recommend licensed konsultan pajak directly
- Capital raise valuation / 409A equivalent / cap table modeling → decline; recommend startup CFO advisor (out-of-scope for solo founder helper)
- Forex / international payment compliance (BI regulations) → flag + recommend BI-specialist consultation
