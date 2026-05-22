# Template — Cash Runway Tracker

Tracker runway kas dengan skenario best / base / worst. Dipakai bulanan oleh founder untuk monitor kapan kas habis kalau burn tetap, dan untuk informasikan keputusan hiring / spend besar.

Audience: founder, exec team, board. Format ringkas — satu halaman, langsung baca runway dalam bulan.

## Variables

- `{{as_of_date}}` — tanggal snapshot kas, misal "30 Oktober 2026".
- `{{cash_start}}` — saldo kas awal periode (operational + reserve).
- `{{monthly_burn_base}}` — net burn rata-rata 3 bulan terakhir (OpEx − revenue).
- `{{monthly_burn_best}}` — skenario best case (revenue tumbuh, atau OpEx turun).
- `{{monthly_burn_worst}}` — skenario worst case (revenue stall, OpEx fixed).
- `{{runway_base_months}}` — `{{cash_start}}` / `{{monthly_burn_base}}`.
- `{{runway_best_months}}` / `{{runway_worst_months}}` — turunan masing-masing skenario.
- `{{recommendation_id}}` — rekomendasi action 1-2 kalimat dalam Bahasa Indonesia.

## Template

```
# Cash Runway — Snapshot per {{as_of_date}}

## Posisi kas

- Saldo operasional (BCA): Rp 420 jt
- Saldo reserve (BRI): Rp 180 jt
- **Total kas: {{cash_start}}** (contoh: Rp 600 jt)

## Burn rate

Rata-rata 3 bulan terakhir:

- Revenue rata-rata: Rp 180 jt / bulan
- OpEx rata-rata: Rp 260 jt / bulan
- **Net burn base: {{monthly_burn_base}}** (contoh: Rp 80 jt / bulan)

## Skenario runway

| Skenario   | Asumsi                                          | Net burn / bulan | Runway       |
|------------|-------------------------------------------------|------------------|--------------|
| **Best**   | Revenue +20% QoQ, OpEx flat                     | Rp 30 jt         | 20 bulan     |
| **Base**   | Revenue flat, OpEx flat (status quo)            | Rp 80 jt         | 7,5 bulan    |
| **Worst**  | Revenue −15%, OpEx +10% (hire 2 + tool tambahan)| Rp 140 jt        | 4,3 bulan    |

## Catatan asumsi

- Revenue: hanya recurring + signed contracts. Pipeline tidak dihitung sampai close.
- OpEx best/base: payroll 8 orang + infra fix. OpEx worst: hire 2 senior + tool tambahan Rp 12 jt/bulan.
- Reserve PPh + emergency Rp 60 jt sudah dikurangi dari total kas yang dipakai.

## Rekomendasi

{{recommendation_id}}

Contoh: "Pada skenario base, kas Anda cukup sampai pertengahan Q2 2027. Bila pipeline Q4 tidak close minimal dua deal retainer baru sebelum akhir November, sebaiknya freeze hiring Q1 2027 dan defer rencana ekspansi tool. Re-evaluasi runway setiap akhir bulan."

## Trigger ulang

Re-run tracker ini:
- Setiap awal bulan (default).
- Saat ada deal signing/closing yang ubah revenue baseline.
- Sebelum keputusan hiring atau commitment > Rp 50 jt.
```

## Tone guide

Formal exec register — Anda form. Angka konkret dalam IDR (jt / M), tidak USD. Skenario worst harus realistis (bukan apocalypse) — asumsinya harus ditulis eksplisit. Rekomendasi 1-2 kalimat actionable, tanpa kata banned. Zero exclamation marks.
