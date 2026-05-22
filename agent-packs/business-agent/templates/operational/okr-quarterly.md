# Template — OKR Quarterly

Template OKR kuartalan: 3-5 objective × 3-5 key result masing-masing. Tiap key result punya confidence score 1-10 + cadence check-in mingguan / bi-weekly.

Audience: founder, exec team, head-of-function. Format Notion atau spreadsheet — disusun bersama di awal kuartal, di-update mingguan.

## Variables

- `{{quarter}}` — kuartal OKR, misal "Q1 2027".
- `{{set_date}}` — tanggal OKR di-set / di-commit.
- `{{checkin_cadence}}` — frekuensi review, default "mingguan, hari Jumat".
- `{{objective_*_title}}` — judul objective (3-5 total).
- `{{objective_*_owner}}` — owner objective.
- `{{kr_*_*_text}}` — kalimat key result, harus measurable.
- `{{kr_*_*_target}}` — angka target.
- `{{kr_*_*_baseline}}` — angka baseline awal kuartal.
- `{{kr_*_*_confidence}}` — confidence score 1-10 saat set (di-update tiap check-in).

## Template

```
# OKR — {{quarter}}

Di-commit: {{set_date}}
Check-in cadence: {{checkin_cadence}}

---

## Prinsip

- 3-5 objective per kuartal. Lebih dari 5 = tidak fokus.
- 3-5 key result per objective. Setiap KR harus measurable (angka konkret).
- Confidence score 1-10 update tiap check-in. 7+ = on track, 4-6 = perlu attention, ≤3 = perlu re-scope atau drop.
- Target ambisius: confidence awal 5-7 ideal. Confidence 10 di awal = target terlalu lunak.

---

## Objective 1 — {{objective_1_title}}

Owner: {{objective_1_owner}}

Contoh: "Tingkatkan retention customer Pro tier dari 88% ke 94% (rolling 90-day)."

| #     | Key Result                                                       | Baseline   | Target     | Confidence |
|-------|------------------------------------------------------------------|------------|------------|------------|
| 1.1   | Churn rate customer Pro tier turun dari 4,0% ke 2,0% per bulan   | 4,0%       | 2,0%       | 6/10       |
| 1.2   | NPS customer Pro tier naik dari 32 ke 45                         | 32         | 45         | 5/10       |
| 1.3   | Auto-greet flow shipped + adopted oleh 90% customer baru         | 0%         | 90%        | 8/10       |

---

## Objective 2 — {{objective_2_title}}

Owner: {{objective_2_owner}}

Contoh: "Stabilkan pendapatan recurring di Rp 250 jt / bulan."

| #     | Key Result                                                       | Baseline   | Target     | Confidence |
|-------|------------------------------------------------------------------|------------|------------|------------|
| 2.1   | Total MRR akhir kuartal Rp 250 jt                                | Rp 195 jt  | Rp 250 jt  | 5/10       |
| 2.2   | Customer paying Pro+ tier 90 (vs 68 saat ini)                    | 68         | 90         | 6/10       |
| 2.3   | ARPU Pro+ tier Rp 2,3 jt / bulan                                 | Rp 1,95 jt | Rp 2,3 jt  | 4/10       |

---

## Objective 3 — {{objective_3_title}}

Owner: {{objective_3_owner}}

Contoh: "Tutup pipeline enterprise pertama dengan 2 deal signed."

| #     | Key Result                                                       | Baseline   | Target     | Confidence |
|-------|------------------------------------------------------------------|------------|------------|------------|
| 3.1   | 2 deal enterprise signed (kontrak Rp 480 jt+ / tahun masing-masing) | 0 deal  | 2 deal     | 4/10       |
| 3.2   | Tier Enterprise launched di landing page                         | tidak ada  | live       | 8/10       |
| 3.3   | Pipeline enterprise minimal 8 qualified leads di funnel          | 1 lead     | 8 leads    | 5/10       |

---

## Check-in protocol

- **Mingguan (Jumat sore):** owner update confidence per KR + 1 kalimat status. Aksi konkret kalau confidence turun > 2 poin minggu lalu.
- **Akhir bulan:** review tema cross-objective di monthly review session.
- **Akhir kuartal:** scoring final per KR (0,0-1,0 scale berdasar pencapaian aktual). Score 0,7+ = sukses. Score < 0,4 = pelajaran untuk kuartal depan.

## Catatan

- OKR di sini bukan komitmen kontrak — ini target ambisius. Anda tidak gagal kalau tidak 100% tercapai; Anda gagal kalau tidak belajar dari hasil.
- Maksimal 5 objective. Kalau ada hal penting yang tidak masuk OKR, masuk ke backlog operational, bukan OKR.
```

## Tone guide

Formal exec register — Anda form. Setiap key result wajib measurable dengan baseline + target + confidence score numerik. Konsisten 1-10 scale untuk confidence (bukan persen). Catatan akhir mengingatkan OKR bersifat ambisius — bukan kontrak. Zero exclamation marks, zero kata banned.
