# Template — Post-launch report (7 hari)

Laporan satu minggu setelah site live — traffic, conversion, sumber, halaman teratas, titik drop-off, dan hipotesis iterasi berikutnya. Dipakai untuk menutup loop launch, bukan untuk dokumentasi internal yang tidak dibaca.

## Variables

- `{site_url}` — URL production yang dilaporkan.
- `{owner_name}` — pemilik site.
- `{launch_date}` — tanggal go-live (YYYY-MM-DD).
- `{report_window}` — periode yang dilaporkan, default 7 hari pertama.
- `{analytics_provider}` — sumber data (Plausible, Vercel Analytics, GA).
- `{primary_goal}` — tujuan utama site (contoh: "lead form submission", "checkout completion").

## Template

```markdown
# Post-launch report — {site_url}

**Owner:** {owner_name}
**Launch date:** {launch_date}
**Report window:** {launch_date} → {launch_date_plus_7}
**Data source:** {analytics_provider}
**Primary goal:** {primary_goal}

## Ringkasan eksekutif

Dalam 7 hari pertama, site menerima **{total_visitors}** pengunjung unik dan menghasilkan **{total_conversions}** {primary_goal} (conversion rate **{conversion_rate}%**). Sumber traffic terbesar: **{top_source}** ({top_source_share}%). Halaman dengan konversi tertinggi: **{top_converting_page}**. Titik drop-off paling tajam: **{biggest_dropoff}**.

## Traffic

| Metric | Nilai | Catatan |
|---|---|---|
| Pengunjung unik | {total_visitors} | {comparison_to_target_if_any} |
| Total page views | {total_pageviews} |  |
| Rata-rata page per session | {pages_per_session} |  |
| Average session duration | {avg_session_duration} |  |
| Bounce rate | {bounce_rate}% | Benchmark 40-60% normal untuk landing |
| Mobile share | {mobile_share}% | Indonesia rata-rata 70-80% |

## Conversion

| Metric | Nilai | Catatan |
|---|---|---|
| Total {primary_goal} | {total_conversions} |  |
| Conversion rate | {conversion_rate}% | {benchmark_if_known} |
| Cost per conversion | {cpc_or_na} | N/A kalau organic only |
| Time to first conversion | {time_to_first_conversion} | Setelah pengunjung sampai halaman |

## Sumber traffic

| Source | Pengunjung | Share | Conversion rate |
|---|---|---|---|
| {source_1} | {visits_1} | {share_1}% | {cvr_1}% |
| {source_2} | {visits_2} | {share_2}% | {cvr_2}% |
| {source_3} | {visits_3} | {share_3}% | {cvr_3}% |
| {source_4} | {visits_4} | {share_4}% | {cvr_4}% |
| Direct | {direct_visits} | {direct_share}% | {direct_cvr}% |

## Halaman teratas

| # | Page path | Pengunjung | Avg time | Exit rate |
|---|---|---|---|---|
| 1 | {page_1} | {visits_1} | {time_1} | {exit_1}% |
| 2 | {page_2} | {visits_2} | {time_2} | {exit_2}% |
| 3 | {page_3} | {visits_3} | {time_3} | {exit_3}% |
| 4 | {page_4} | {visits_4} | {time_4} | {exit_4}% |
| 5 | {page_5} | {visits_5} | {time_5} | {exit_5}% |

## Drop-off / titik bocor

| Dari | Ke | Drop rate | Apa yang mungkin terjadi |
|---|---|---|---|
| {page_a} | {page_b} | {drop_pct}% | {hypothesis_short} |
| {page_c} | {form_or_checkout} | {drop_pct}% | {hypothesis_short} |
| Hero | Pricing section (scroll) | {scroll_drop}% | {hypothesis_short} |

## Hipotesis untuk iterasi berikutnya

Tiga hipotesis berdasarkan data minggu ini, urut dari yang paling mungkin berdampak:

### 1. {hypothesis_1_title}
**Observasi:** {data_point_supporting_h1}
**Hipotesis:** Kalau {change_1}, maka {expected_outcome_1}, karena {reasoning_1}.
**Cara uji:** {test_plan_h1 — A/B test, atau iterasi langsung}
**Effort:** {low|medium|high}

### 2. {hypothesis_2_title}
**Observasi:** {data_point_supporting_h2}
**Hipotesis:** Kalau {change_2}, maka {expected_outcome_2}, karena {reasoning_2}.
**Cara uji:** {test_plan_h2}
**Effort:** {low|medium|high}

### 3. {hypothesis_3_title}
**Observasi:** {data_point_supporting_h3}
**Hipotesis:** Kalau {change_3}, maka {expected_outcome_3}, karena {reasoning_3}.
**Cara uji:** {test_plan_h3}
**Effort:** {low|medium|high}

## Tindak lanjut

- [ ] Pilih satu hipotesis dari tiga di atas untuk dieksekusi minggu depan.
- [ ] Susun A/B test plan kalau effort medium/high (pakai template `ab-test-setup.md`).
- [ ] Jadwalkan review 30 hari untuk lihat tren panjang.

## Catatan kualitatif

Hal-hal yang tidak terlihat di angka tapi penting:
- {qualitative_note_1}
- {qualitative_note_2}
- {qualitative_note_3}
```

Aturan praktis: kalau laporan ini tidak menghasilkan satu keputusan iterasi, kamu tidak butuh laporannya — kamu butuh data yang berbeda.

## Tone guide

- Bahasa Indonesia, kamu form.
- Ringkasan eksekutif: maksimal 3 kalimat, angka di-bold supaya gampang di-scan.
- Tabel: kosongkan kolom catatan kalau tidak ada konteks penting. Jangan paksa isi.
- Drop-off: deskripsikan apa yang mungkin terjadi, bukan diagnosis pasti. "Form terlalu panjang, kemungkinan abandonment di field nomor 4" lebih jujur dari "Form bermasalah".
- Hipotesis: pakai format kalau/maka/karena yang sama dengan `ab-test-setup.md`. Konsisten antar template.
- Catatan kualitatif: hal yang kamu observasi langsung (testimonial WhatsApp dari customer, screenshot dari user) — bukan tebakan.
- Hindari "berhasil", "sukses", "kurang memuaskan" tanpa angka pembanding. Pakai data atau diam.
- Zero exclamation marks.
