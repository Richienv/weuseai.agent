# legal-dispatch — Hermes skill

Bundle: business-director (v3 — Phase 5 dept pack)
Tier: studio (Q3=A locked: phase_5_enabled = true required)
Handler: `hermes-skill:legal-dispatch` (facade — translates legal-shaped intent to specialist persona/skill)

> Replaces the general-purpose `department-task-spawner` for legal work. No new logic — pure routing.

> **Hard guardrail:** BD v3 + dispatched specialists are NOT licensed Indonesian lawyers (advokat). Output is template + reasoning grounded in publicly-known regulations. For legally binding work (akta notaris, UU PDP DPO appointment, court filings), surface "needs licensed-lawyer review" + recommend consultation BEFORE customer signs anything.

## Kapan dipakai

Customer raises legal-shaped intent. Trigger phrases:

- "draft kontrak vendor"
- "NDA untuk freelancer"
- "ToS website kita"
- "privacy policy buat aplikasi"
- "compliance UU PDP / cookie consent"
- "regulasi DJP untuk SaaS"
- "license agreement"
- "perjanjian kerja karyawan"

## Yang harus diekstrak

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `intent_kind` | enum: contract-draft \| nda \| tos \| privacy-policy \| compliance-check \| regulation-lookup \| license \| employment-agreement | ya | Determines specialist routing |
| `counterparty` | string | tidak | Who the contract is with (vendor name, freelancer name, "users") |
| `scope_summary` | string | ya | One sentence on what the document needs to cover |

## Routing table

| `intent_kind` | Specialist persona | Skill called |
|---|---|---|
| contract-draft | Doc Expert | contract-template-generator |
| nda | Doc Expert | nda-template-generator |
| tos | Doc Expert | tos-template-generator |
| privacy-policy | Doc Expert | privacy-policy-generator (UU PDP-aware) |
| compliance-check | Business Director | compliance-checker (existing skill — Indonesian context) |
| regulation-lookup | Deep Researcher | regulation-research |
| license | Doc Expert | license-template-generator |
| employment-agreement | Doc Expert | employment-template-generator (BPJS-aware) |

## Approval gates (Q4=C: contract_sign = 14-day expiry)

EVERY legal action that produces a customer-signing document surfaces a `contract_sign` approval. The customer must approve in Telegram before BD v3 marks `identity_legal_pages_published` (or analogous deliverable) complete.

Specifically:
- `contract-draft`, `nda`, `tos`, `privacy-policy`, `license`, `employment-agreement` → all gate on `contract_sign` approval before being marked as deliverable-complete

`compliance-check` and `regulation-lookup` are advisory — no approval needed (customer just reads the analysis).

## PII handling

Legal templates often need NPWP (15-digit) + KTP (16-digit) numbers in employment / contract docs. Phase 4-4's transform-llm-output enforces:

- Q4=A allowlist: `business-director/incorporation-advisor` (NPWP) + `business-director/compliance-checker` (NPWP + KTP) pass PII through
- All other dispatched legal skills must redact PII in DRAFTS (output to customer's screen) but allow it in FINAL signed templates the customer will print/sign offline

## Yang dilakukan

1. Parse customer message → `intent_kind` + `counterparty` + `scope_summary`
2. Route to specialist via Hermes v0.13.x multi-agent spawn
3. Open `department_threads` row (`department: 'legal'`) for cross-session resume
4. Specialist drafts template (no PII unless allowlisted)
5. **For document-producing intents** — open `approval_requests` row (`action_kind: 'contract_sign'`, expiry = now + 14d), surface to customer via Telegram
6. On approval → final template generated + delivered as PDF/MD; deliverable marked complete
7. On rejection → discard or iterate per customer feedback

## Output

Persona-voice wrapper:

> "Intent 'draft NDA untuk freelancer designer' aku route ke **Doc Expert** (nda-template-generator).
>
> Open thread di Legal department: `nda-2026-q3-designer-freelance`. ETA: ~5 menit untuk draft.
>
> Catatan: aku bukan advokat berlisensi. Draft ini grounded di template UU Indonesia + best-practice. Sebelum sign, recommend review sama lawyer (estimate biaya: Rp 500k-2jt untuk NDA review).
>
> Aku queue approval `contract_sign` (expires in 14 hari). Reply approve di Telegram begitu draft siap + kamu udah review."

## Decline scenarios

- Customer's tier ≠ studio OR `phase_5_enabled = false` → degrade to existing Persona v2 BD scoped MVP
- Litigation / dispute resolution / court filings → decline; recommend licensed advokat directly
- Cross-border contracts (foreign jurisdictions) → flag risk + recommend specialist (international lawyer); BD v3 only ships Indonesia-context confidently
- M&A / capital raise term sheets → decline; recommend corporate lawyer
