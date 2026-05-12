# Bank Account Setup Checklist (Indonesian Founder)

> Rekening badan separates business cash from personal — kewajiban PT, rekomendasi kuat untuk CV/Perorangan kalau hire ≥1 karyawan atau accept B2B payment.

---

## Document checklist (universal — most banks ask same set)

| Document | PT | CV | Perorangan |
|---|---|---|---|
| KTP pengurus | ✓ (semua direksi + komisaris) | ✓ (sekutu aktif) | ✓ |
| NPWP pengurus | ✓ | ✓ | ✓ |
| NPWP badan | ✓ wajib | ✓ wajib | n/a |
| Akta pendirian + SK Kemenkumham | ✓ | ✓ (akta CV + SK Kemenkumham/PN) | n/a |
| NIB (OSS) | ✓ | ✓ | ✓ |
| Surat keterangan domisili | Sometimes | Sometimes | Sometimes |
| SIUP / izin sektor (kalau berlaku) | If KBLI butuh izin tambahan | Same | Same |
| Setoran awal | Rp 500k-2jt (varies) | Rp 200k-1jt | Rp 100k-500k |

**Bring originals + 2 copies of each.** Kunjungan cabang biasanya 1-2 jam (verifikasi + tanda tangan).

---

## Bank comparison (per 2026 Q1)

| Bank | Strength | Weakness | Best for |
|---|---|---|---|
| **BCA** | Most-used by Indonesian customers; QRIS + e-wallet integration smooth; KlikBCA Bisnis solid web | High biaya admin Rp 25-50k/bulan; verifikasi ketat | B2C e-commerce, freelancer-paying |
| **Mandiri** | B2B trustable; Mandiri Cash Management for payroll; large SME network | UI jadul; cabang antri panjang | B2B services, payroll-heavy |
| **BNI** | Government tender access; BNI Bisnis Direct OK | Less popular for retail customers | Tender-driven, vendor pemerintah |
| **BRI** | Murah biaya admin (Rp 10-15k); UMKM-friendly | Network jaringan ATM kuat tapi web banking less polished | UMKM, micro-merchant |
| **Bank Jago / SeaBank / Allo Bank** | Digital-first, low/free admin, instant transfer; API integration available | Branch presence minimal; B2B trust still building | Digital-native solo founder, freelance gigs |
| **Permata Bank** | Strong B2B; SyariahME option | Premium positioning, biaya higher | Premium services / Syariah businesses |

---

## Multi-account strategy

Most successful Indonesian founders end up with **2-3 accounts**:

1. **Operational account** — main inflow, bills, payroll. Pilih based on customer-facing channel (BCA for retail, Mandiri for B2B).
2. **Tax + reserve account** — auto-transfer 25-30% of revenue here for PPh + emergencies. Use a separate bank (e.g., BRI or Jago) untuk visual separation.
3. **Optional: Foreign currency account** — kalau ada international receivables (Wise / DBS / HSBC).

**Strategy:** open operational first (Stage Identity), add reserve account in Stage Build once revenue stable.

---

## Common slip-ups

- **Open atas nama personal saat masih CV/Perorangan, mix business + personal cash.** Auditor's nightmare. Open badan account ASAP even if low volume.
- **Bayar payroll dari personal account.** Karyawan SPT 1770 jadi rumit; perusahaan kena audit risk.
- **Skip QRIS setup at BCA/Mandiri.** Lost cashless retail customers. Setup QRIS gratis di hampir semua bank, integration ke Xendit/Midtrans easy.

---

## Deliverable mapping

- `setup_pt_incorporated` includes "rekening badan opened" sub-deliverable per existing 5-stage-checklist narrative (rekening badan di bank Indonesia).
- `build_first_payment_flow` requires payment gateway connected to bank — Xendit/Midtrans settles to your operational account.

---

## What BD v3 surfaces vs what customer does

- **BD v3 surfaces:** comparison + checklist via finance-dispatch routing to Trade Pro.
- **Customer does:** actual visit to cabang + sign documents.

> _Disclaimer: rate + biaya berubah per kebijakan bank. Cross-check di [bi.go.id](https://bi.go.id) atau bank's website sebelum keputusan._
