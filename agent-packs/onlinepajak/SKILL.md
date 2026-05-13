# OnlinePajak — Indonesian tax filing — STUB (Slot 3, deferred)

> **Status:** Stub. Build deferred — narrower audience (PKP businesses only). See `docs/research/2026-05-13-indonesian-tools-integration.md` §4 for full rationale.

## Locked decisions (D2)

- **PJAP partner:** OnlinePajak (PT Achilles Advanced Systems) — the only Indonesian PJAP with self-serve OpenAPI developer portal.
- **Authentication model:** API key (reseller-scoped). Customer's NPWP registered as sub-account under our OnlinePajak enterprise account.
- **Liability gate:** every submission MUST surface explicit "taxpayer reviews and authorizes" step before calling OnlinePajak API — preserves bright-line tax liability (taxpayer remains legally responsible for return substance under UU KUP).

## Required credentials (per customer)

- OnlinePajak API key (reseller-scoped, our enterprise account)
- Customer NPWP confirmation (PKP status verified)
- Customer EFIN + sertifikat elektronik (.p12) — one-time founder-touch upload to OnlinePajak via their dashboard

Stored: API key only goes into `integration_credentials.ciphertext`. EFIN + sertifikat live on OnlinePajak's side (they hold the digital cert; we don't proxy that).

## Capabilities planned

| Operation | Purpose |
|---|---|
| `faktur.create` | Create electronic tax invoice (e-Faktur) from accounting data |
| `faktur.list` | Retrieve faktur pajak history |
| `spt.file` | Submit SPT Tahunan PPh Badan / PPh 21 / Masa PPN |
| `spt.status` | Check filing status + retrieve BPE (Bukti Penerimaan Elektronik) |
| `bpe.retrieve` | Download BPE PDF after successful submission |
| `pph21.compute` | Compute PPh 21 from payroll data (employee tax) |

## Why deferred

Slot 3 narrower audience:
- Only PKP-status businesses need e-Faktur. Many UMKM use PPh Final 0.5% (no faktur needed)
- Each onboarding requires founder-touch (NPWP verification + .p12 upload to OnlinePajak)
- Higher liability surface — wrong faktur → real DJP audit risk for customer
- PJAP self-certification ($50-150k, 12-24 months) is year-2+ moat play, not v1

## Trigger to ship Slot 3

Any of:
- First PKP customer signs up AND explicitly requests tax-filing capability
- Founder strategic call: prioritize moat-play over revenue (lock category before competitor)
- > 5,000 PKP customers reached → trigger self-PJAP-certification evaluation (separate decision)

## Compliance + liability traps

Per research doc §5:
- **UU PDP Art. 60** — tax data is sensitive personal data; DPA required with each customer; 3×24hr breach reporting; up to 2% annual revenue fine
- **UU KUP Art. 34** — tax data confidentiality criminal offense distinct from UU PDP
- **PER-05/PJ/2025** — only PJAPs reach DJP directly; we sit OUTSIDE the PJAP-DJP relationship; liability runs to (a) customer (commercial contract) + (b) PJAP (reseller agreement)

**Action items locked when Slot 3 ships:**
- Sign DPA with each customer
- E&O insurance carry
- OnlinePajak reseller agreement explicitly indemnifies us for OnlinePajak-side outages + DJP-rejection-by-OnlinePajak-error

## When this skill is built

Same shape as `/xendit`:
- Preflight via `_shared/skills/integration-preflight`
- Standalone Edge Function `/integration-proxy-onlinepajak`
- Bahasa error catalog (added to `integration-error-mapper.ts` under `onlinepajak` entry)
- Operations documented inline with required params

Additional gate over Xendit:
- Every write operation (faktur.create, spt.file) shows the prepared submission to customer + waits for explicit "ya, kirim" confirmation before calling OnlinePajak
- BPE PDF auto-archived in customer's Hermes inbox after every successful submission
