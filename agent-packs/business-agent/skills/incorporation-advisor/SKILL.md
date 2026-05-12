# incorporation-advisor — Hermes skill

Bundle: business-agent (v2)
Tier: studio
Handler: `hermes-skill:incorporation-advisor`

## Kapan dipakai

- "PT atau CV?"
- "biaya buat PT"
- "step urus OSS"
- "berapa modal disetor untuk PT"
- "incorporate di Jakarta"

## Yang harus diekstrak

| Field | Wajib | Notes |
|---|---|---|
| `mode` | ya | enum: pt-vs-cv \| oss-walkthrough \| cost-estimate |
| `business_kind` | tidak | Informs KBLI suggestion |
| `team_size` | tidak | Informs whether multi-shareholder consideration matters |
| `expected_revenue_yr_idr` | tidak | Informs UMKM 0.5% PPh Final eligibility |

## Yang dilakukan

### pt-vs-cv mode
Load `templates/incorporation/pt-vs-cv-comparison.md`. Surface decision tree:
- Modal Rp 50jt+ ready → PT lebih clean.
- Solo / family-business / pajak personal masih efisien → CV.
- Plan IPO / serious VC fundraise dalam 3 tahun → wajib PT (dan PT Tbk eventually).

### oss-walkthrough mode
Load `templates/incorporation/oss-checklist.md`. Walk customer through:
1. Pilih KBLI sesuai business_kind.
2. Tingkat risiko (Rendah / Menengah Rendah / Menengah Tinggi / Tinggi) — auto-determined dari KBLI.
3. Dokumen pendukung per tingkat risiko.
4. Submit OSS-RBA online; verifikasi setelah 90 hari.

### cost-estimate mode
Surface biaya breakdown (2026 estimate):
- Notaris akta PT: Rp 2-3jt
- BNRI / Berita Negara: Rp 700k-1jt
- NPWP badan: gratis (kantor pajak)
- Modal disetor PT minimal: Rp 50jt (real, bukan paper — note bank verifikasi via SPT 1 tahun pertama)
- BPJS Kesehatan + Ketenagakerjaan: ~4-5% of payroll
- Akuntan freelance setahun: Rp 6-15jt (bulanan Rp 500k-1.2jt)

## Output

Persona-voice wrapper untuk pt-vs-cv:

> "PT vs CV buat [business_kind]:
>
> | Aspect | PT | CV |
> |---|---|---|
> | Modal disetor | Min Rp 50jt | Tidak ada minimum |
> | Notaris + setup | ~Rp 4-5jt + 2 minggu | ~Rp 2-3jt + 1 minggu |
> | Pajak | Badan terpisah (PPh 22%) | Personal (progresif) |
> | Multi-shareholder | Mudah | Kompleks |
> | Image klien B2B | Lebih dipercaya | OK untuk UMKM |
>
> Untuk [business_kind] dengan team [size], rekomendasi: **PT** kalau plan-nya scale ≥5 orang dalam setahun atau ada B2B contract sizable. **CV** kalau solo / family-run dengan <Rp 1jt revenue/bulan.
>
> Aku surface — keputusan tetap kamu. Kalau ragu, ngomong sama akuntan yang familiar dengan bisnis kamu."

## Decline

- File OSS / akta atas nama customer. Customer submit sendiri.
- Guarantee approval timeline. OSS verifikasi tergantung KBLI risiko level.
