# Template — A/B test setup

Rencana satu A/B test yang terstruktur — hipotesis, metric, control, variant, ukuran sampel, durasi, aturan berhenti, dan rencana analisis. Dipakai sebelum kamu menyalakan eksperimen di Vercel atau tool A/B test lain, supaya hasilnya bisa dipertahankan.

## Variables

- `{test_name}` — nama singkat eksperimen, kebab-case (contoh: "hero-headline-v2").
- `{page_path}` — path halaman yang diuji (contoh: "/", "/pricing").
- `{hypothesis}` — pernyataan "kalau X, maka Y, karena Z" — satu kalimat.
- `{primary_metric}` — metric utama yang menentukan menang/kalah (contoh: "click-through rate ke tombol Mulai").
- `{guardrail_metric}` — metric yang tidak boleh turun (contoh: "bounce rate", "waktu di halaman").
- `{control_description}` — apa yang ada sekarang (control), deskripsi singkat copy / desain.
- `{variant_description}` — apa yang berubah di variant, deskripsi konkret bedanya.
- `{baseline_metric_value}` — nilai metric utama sekarang (sebelum test).
- `{minimum_detectable_effect}` — efek minimum yang ingin kamu deteksi, dalam persen relatif (contoh: "+10%").
- `{sample_size_per_variant}` — jumlah pengunjung per variant yang dibutuhkan untuk statistical power 80%.
- `{traffic_per_day}` — estimasi traffic harian ke `{page_path}`.
- `{run_duration_days}` — durasi planned run, minimum 7 hari supaya menangkap pola mingguan.
- `{stop_rule}` — aturan kapan eksperimen dihentikan lebih awal.
- `{owner}` — siapa yang menjalankan dan menulis analisis.

## Template

```markdown
# A/B Test — {test_name}

**Owner:** {owner}
**Halaman:** {page_path}
**Tanggal mulai:** {start_date}
**Tanggal berhenti planned:** {planned_end_date}

## Hipotesis

Kalau {what_we_change}, maka {expected_outcome}, karena {underlying_reason}.

Contoh konkret: "Kalau headline diganti dari 'Website bisnis kamu, jadi dalam 5 menit' jadi 'Bayar setup sekali, hosting transparan', maka click-through ke tombol 'Mulai sekarang' naik, karena positioning hosting-as-utility lebih sesuai dengan keberatan utama UMKM (subscription fatigue)."

## Metrics

| Tipe | Nama | Definisi |
|---|---|---|
| Primary | {primary_metric} | {bagaimana diukur, event apa di analytics} |
| Guardrail | {guardrail_metric} | {batas bawah yang dijaga} |

- **Baseline:** {baseline_metric_value}
- **Minimum detectable effect (MDE):** {minimum_detectable_effect}
- **Target:** {baseline_metric_value} → {baseline_plus_mde}

## Control vs Variant

### Control (A) — apa yang ada sekarang
{control_description}

### Variant (B) — yang berubah
{variant_description}

**Yang BUKAN berubah:** {list_what_stays_same} — supaya cuma satu variabel yang diuji.

## Sample size & durasi

- Traffic ke `{page_path}`: {traffic_per_day} pengunjung / hari
- Sample size per variant: {sample_size_per_variant}
- Estimasi durasi run: {run_duration_days} hari
- Minimum durasi: 7 hari (menangkap pola weekday vs weekend)

## Stop rule

Eksperimen dihentikan lebih awal kalau:
- {primary_metric} variant turun lebih dari {early_stop_loss_threshold}% setelah ≥ 1000 pengunjung per variant
- {guardrail_metric} turun di luar toleransi
- Ada bug teknis di salah satu variant

Jangan berhenti lebih awal karena "kelihatan menang" sebelum sample size tercapai — itu peek bias.

## Rencana analisis

1. Setelah {run_duration_days} hari atau sample size tercapai — yang lebih dulu — eksperimen dihentikan.
2. Hitung lift relatif: ({variant_metric} − {control_metric}) / {control_metric}.
3. Statistical significance: pakai chi-square test atau confidence interval, target p < 0.05 atau CI tidak menyentuh 0.
4. Cek guardrail metric tidak turun signifikan.
5. Kalau variant menang dan guardrail aman → roll out 100% ke variant.
6. Kalau variant kalah atau tie → kembali ke control, catat pelajaran.
7. Tulis 1-halaman post-mortem dengan: hipotesis, hasil, keputusan, dan ide eksperimen berikutnya.

## Pre-launch checks

- [ ] Variant sudah dipreview di staging dan terlihat sesuai desain
- [ ] Event analytics di-fire dengan benar untuk {primary_metric}
- [ ] Traffic split 50/50 dikonfirmasi via tool A/B test
- [ ] Owner siap memeriksa data tiap 2-3 hari selama run
```

Aturan praktis: kalau kamu belum bisa nulis hipotesis "kalau X, maka Y, karena Z", kamu belum siap menjalankan eksperimennya. Cari dulu Z-nya.

## Tone guide

- Bahasa Indonesia, kamu form.
- Hipotesis: tiga bagian (kalau / maka / karena). Bagian "karena" adalah reasoning yang membedakan eksperimen dari tebakan.
- Metric definisi: tulis event analytics yang dipakai, bukan deskripsi umum. "Click pada `#cta-primary` di `/pricing`" bukan "Engagement di halaman harga".
- Control & variant: deskripsi yang cukup spesifik supaya orang lain bisa men-rebuild dari catatan ini saja.
- Stop rule: aturan numerik, bukan feeling. "p < 0.05 setelah 2000 sample" bukan "kalau jelas menang".
- Rencana analisis: step-by-step yang bisa dijalankan ulang. Audit trail untuk diri sendiri di masa depan.
- Zero exclamation marks.
