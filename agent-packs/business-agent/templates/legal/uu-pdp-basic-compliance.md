# UU PDP Basic Compliance Checklist (Indonesian Founder)

> UU 27/2022 (Undang-Undang Perlindungan Data Pribadi) wajib bagi semua entitas yang collect/process data pribadi customer Indonesia, regardless of size atau bentuk badan. Penalties up to Rp 5M (administrative) atau jail 4-6 tahun untuk kebocoran skala besar.

> _BD v3 + dispatched skills bukan licensed lawyer (advokat) atau Data Protection Officer (DPO) bersertifikat. Reference ini grounded in UU 27/2022 + PP 71/2019 publik per 2026 Q1. Untuk DPO appointment formal atau response to DJKI investigation, recommend licensed lawyer + sertifikat DPO._

---

## Apakah kamu in scope?

Wajib comply kalau:
- ✓ Collect data pribadi customer Indonesia (nama, email, phone, NIK, NPWP, alamat, biometric, etc.)
- ✓ Operate "platform digital" (situs, app, e-commerce, SaaS) yang accept user signup
- ✓ Process payment data via gateway (otomatis trigger karena PII di payload)

**Skip (basic-tier exempt):**
- Solo founder dengan 0 customer + 0 employee data — tapi begitu mulai collect, comply.
- Pure B2B-via-direct-contract (KAK signed offline, no platform login) — comply scope lebih ringan.

---

## Stage 1 — basic compliance (everyone must hit this)

| Deliverable | Definition of done | Approval gate |
|---|---|---|
| **Privacy Policy publish** | Bahasa Indonesia, accessible at `/privacy`. Cover: data jenis dikumpulkan, tujuan, retention, hak subject (akses/koreksi/hapus), kontak. | `contract_sign` (legal-dispatch surfaces, customer review) |
| **Cookie consent banner** | Trigger before non-essential cookies (analytics, ads). Bahasa Indonesia, opt-in (not opt-out). | none (pure UI) |
| **Data subject request mechanism** | Email atau form di `/privacy/request` untuk akses/koreksi/hapus. SLA respond ≤72 jam, fulfill ≤30 hari per UU. | none |
| **Breach response runbook** | Internal SOP: kalau bocor, lapor ke Otoritas PDP (Kementerian Kominfo) dalam 72 jam. | none |
| **Data retention policy** | Documented periods per data type (transactional 7 tahun for tax; marketing list 2 tahun; KYC 5 tahun post-relationship). | none |

`identity_legal_pages_published` deliverable wraps Privacy + Cookie + ToS publish step.

---

## Stage 2 — platform-tier (kalau ≥1000 active users atau process sensitive data)

| Deliverable | Definition of done |
|---|---|
| **DPO appointment** | Internal Data Protection Officer designated (founder/lead engineer initially OK; tetap appoint formally) |
| **Data flow inventory (DPA)** | Documented data inventory: source → storage → recipient → retention → deletion |
| **Vendor / processor agreements** | Contracts with data processors (Xendit, Supabase, etc.) include UU PDP-compliant processor clauses |
| **Encryption-at-rest + transit** | All PII columns encrypted; HTTPS on all data-collecting endpoints |
| **Access control + audit log** | Role-based access; access log retained ≥1 year |

---

## Stage 3 — sensitive data tier (KTP scans, biometric, healthcare, finance)

| Deliverable | Definition of done |
|---|---|
| **Explicit opt-in consent** | Granular consent UI; no forced consent bundling |
| **Sensitive data minimization** | Don't collect KTP scan kalau hanya butuh validation hash; collect biometric only with separate explicit consent |
| **Cross-border transfer notification** | Kalau process di server luar Indonesia, harus notify subject + ensure receiving country has equivalent protection (Adequacy Decision dari Otoritas PDP) atau pakai standard contractual clauses |
| **Annual DPIA review** | Data Protection Impact Assessment annual review, signed by DPO |

---

## Common slip-ups

- **NIK/KTP di customer's Hermes prompt log.** Phase 4-4 transform-llm-output redacts NIK by default; whitelist hanya `business-director/incorporation-advisor` + `business-director/compliance-checker` (Q4=A allowlist). Other dispatched skills MUST keep NIK redacted in surfaced summaries.
- **Privacy policy in English only.** UU PDP mandatory Bahasa Indonesia. Bilingual OK but BI primary.
- **No data subject request form.** First time customer asks "delete my data" via email and you can't show a process — administrative penalty material.
- **Vendor processor agreements missing.** Xendit/Supabase/etc. provide UU PDP-aware contracts; sign them. Don't assume default ToU covers PDP processor responsibilities.

---

## Deliverable mapping

- `identity_legal_pages_published` includes Privacy Policy + ToS publish (gated by `contract_sign` approval before going live).
- `build_first_payment_flow` triggers in-scope (payment processing = process PII).
- Beyond that, sensitive-data tier obligations surface as compliance-checker reminders, not auto-marked deliverables.

---

## What BD v3 surfaces vs what customer does

- **BD v3 surfaces:** template Privacy Policy + ToS + DPA inventory via legal-dispatch routing to Doc Expert.
- **Customer does:** publish to website, designate DPO formally, sign vendor processor agreements, respond to subject requests.

### Approval gate flow

1. legal-dispatch (`privacy-policy` intent) → Doc Expert generates UU PDP-aware draft.
2. `approval_requests` row opened (`action_kind: 'contract_sign'`, expiry NOW + 14d).
3. Customer reviews + approves in Telegram.
4. Final draft delivered (PDF + Markdown), customer publishes.
5. Deliverable marked complete.

> _Disclaimer: UU PDP enforcement evolving. Otoritas PDP (sub-direktorat Kominfo) issues clarifications periodically. Cross-check di [otoritaspdp.kominfo.go.id](https://otoritaspdp.kominfo.go.id) sebelum publish privacy policy._
