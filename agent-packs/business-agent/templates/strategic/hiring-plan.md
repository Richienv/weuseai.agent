# Template — Hiring Plan

Plan hiring kuartalan: role, level, need-by, budget, must-have skills, nice-to-have, owner. Format grid sortable — gampang prioritize ulang setiap monthly review.

Audience: founder, exec team, recruiter (kalau ada). Bukan untuk publik atau job posting — internal planning only.

## Variables

- `{{quarter}}` — kuartal plan, misal "Q1 2027".
- `{{plan_date}}` — tanggal plan dibuat / di-update terakhir.
- `{{total_budget_idr}}` — total budget hiring kuartal ini (gross salary + benefit).
- `{{role_*_title}}` — judul role per baris.
- `{{role_*_level}}` — junior / mid / senior / lead.
- `{{role_*_need_by}}` — target start date.
- `{{role_*_budget}}` — gross salary range per bulan IDR.
- `{{role_*_must_have}}` — skill wajib (3-5 bullet).
- `{{role_*_nice_to_have}}` — skill plus (1-3 bullet).
- `{{role_*_owner}}` — siapa yang drive hiring loop ini.

## Template

```
# Hiring Plan — {{quarter}}

Plan dibuat: {{plan_date}}
Total budget kuartal: {{total_budget_idr}} (contoh: Rp 360 jt — sekitar 6 hire mid-level setara)

---

## Grid prioritas

| # | Role                       | Level   | Need-by      | Budget gross/bln    | Owner       | Status      |
|---|----------------------------|---------|--------------|---------------------|-------------|-------------|
| 1 | Senior Backend Engineer    | Senior  | 1 Feb 2027   | Rp 28-35 jt         | Founder     | Sourcing    |
| 2 | Customer Success Lead      | Lead    | 15 Feb 2027  | Rp 22-28 jt         | Head of CX  | Draft JD    |
| 3 | Mid Frontend Engineer      | Mid     | 1 Mar 2027   | Rp 16-22 jt         | Eng Lead    | Backlog     |
| 4 | Sales Development Rep      | Junior  | 1 Mar 2027   | Rp 7-10 jt + komisi | Head of Sales | Backlog   |

## Detail per role

### 1. Senior Backend Engineer

- **Need-by:** 1 Februari 2027
- **Budget:** Rp 28-35 jt gross / bulan
- **Owner:** {{role_1_owner}}
- **Must-have:**
  - 5+ tahun TypeScript / Node.js production
  - Pengalaman Supabase / Postgres + RLS
  - Pernah ship integrasi payment gateway lokal (Xendit / Midtrans / DOKU)
  - Komunikasi async Bahasa Indonesia + English
  - Berdomisili Jabodetabek atau willing relocate
- **Nice-to-have:**
  - Pengalaman Edge Function / Cloudflare Worker
  - Pernah handle VPS provisioning (Vultr / DigitalOcean)
- **Konteks:** Anda butuh untuk drive backend reliability + handle complex billing flow (multi-tier + Always-On add-on).

### 2. Customer Success Lead

- **Need-by:** 15 Februari 2027
- **Budget:** Rp 22-28 jt gross / bulan
- **Owner:** {{role_2_owner}}
- **Must-have:**
  - 3+ tahun lead role di SaaS / managed service Indonesia
  - Pengalaman onboarding customer non-teknis (UMKM, freelancer)
  - Pernah build playbook retention dari nol
  - Bahasa Indonesia native + English business level
- **Nice-to-have:**
  - Pengalaman Telegram / WhatsApp Business sebagai support channel
  - Familiar dengan dashboard analytics (Mixpanel / Posthog)

### 3. Mid Frontend Engineer

- **Need-by:** 1 Maret 2027
- **Budget:** Rp 16-22 jt gross / bulan
- **Owner:** {{role_3_owner}}
- **Must-have:**
  - 3+ tahun React / TypeScript production
  - Familiar dengan Tailwind + komponen library modern
  - Bisa convert Figma ke kode tanpa bolak-balik
- **Nice-to-have:**
  - Pengalaman static HTML + React-via-CDN (stack landing weuseai)
  - Familiar Vercel deployment workflow

### 4. Sales Development Rep

- **Need-by:** 1 Maret 2027
- **Budget:** Rp 7-10 jt gross / bulan + komisi 10% per deal close
- **Owner:** {{role_4_owner}}
- **Must-have:**
  - 1-2 tahun outbound sales B2B di Indonesia (SaaS atau service)
  - Komfort dengan tooling outreach (Apollo / Lemlist / manual LinkedIn)
  - Bahasa Indonesia native + English business level
- **Nice-to-have:**
  - Network di komunitas founder Jabodetabek / Surabaya / Bandung
  - Familiar dengan QRIS / payment gateway sebagai talking point

## Asumsi + dependensi

- Total kas Anda saat ini Rp 600 jt, runway base 14 bulan. Hire 4 orang kuartal ini akan menaikkan burn Rp 73-95 jt / bulan, runway turun ke ~9 bulan.
- Hire 1 (Senior Backend) wajib di kuartal ini — risiko delivery roadmap Q2 tanpa role ini.
- Hire 3 + 4 (Mid Frontend + SDR) dapat di-defer 1 kuartal kalau pipeline Q1 di bawah target.

## Review cadence

Update plan setiap awal bulan saat monthly review. Status per role: Backlog → Draft JD → Sourcing → Interview → Offer → Started.
```

## Tone guide

Formal exec register — Anda form. Grid sortable adalah inti — detail per role hanya untuk yang prioritas ≤2. Budget gross IDR, eksplisit range bukan single number. Must-have 3-5 bullet, nice-to-have 1-3 bullet. Asumsi runway impact harus eksplisit. Zero exclamation marks, zero kata banned.
