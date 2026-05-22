# Template — Sentiment analysis

Dashboard sentimen pasar untuk satu asset class atau pair. Surface indikator + interpretasi + bias akhir. Sentimen bukan signal entry — dipakai sebagai konteks untuk size + timing, bukan sebagai trigger trade.

## Variables

- `{{asset_class}}` — string, market yang dianalisis (mis. "Crypto majors", "IDX large-cap", "BTCUSDT")
- `{{analysis_date}}` — string, tanggal sentiment snapshot dalam WIB
- `{{fear_greed}}` — string, nilai + label kalau index tersedia (mis. "72 — Greed", "28 — Fear"). Sebut sumber + tanggal akses
- `{{volume_signal}}` — string, kondisi volume vs rata-rata (mis. "Volume harian 1.8x rata-rata 30-hari — partisipasi meningkat", "Volume rendah, di bawah 70% rata-rata")
- `{{open_interest}}` — string, kondisi open interest untuk pair futures atau opsi (isi "—" kalau tidak relevan untuk spot equity). Sebut delta dari minggu lalu
- `{{funding_rates}}` — string, kondisi funding rate untuk crypto perpetual (isi "—" kalau bukan crypto). Sebut arah + besar (mis. "BTC +0.018% per 8 jam, long-heavy", "Negatif tipis, short-heavy")
- `{{social_signal}}` — string, observasi sentimen sosial — bukan kuantitatif, surface kualitatif (mis. "Spike mention 'altseason' di Twitter trader, belum tercermin di volume"). Tandai sebagai signal yang tidak terverifikasi
- `{{interpretation}}` — string, 2-3 kalimat membaca indikator bersama-sama. Apa yang konsisten, apa yang conflicting
- `{{bias}}` — string, "constructive" / "neutral" / "cautious" / "risk-off". Singkat, satu kata
- `{{action_implication}}` — string, 1-2 kalimat implikasi untuk size dan timing — bukan untuk arah trade. Mis. "Greed extreme — ukuran posisi baru sebaiknya konservatif. Bukan signal short, tapi signal jangan tambah size."

## Template

# Sentiment — {{asset_class}}

**Tanggal:** {{analysis_date}}

## Indikator

| Indikator | Reading |
|---|---|
| Fear / Greed | {{fear_greed}} |
| Volume vs rata-rata | {{volume_signal}} |
| Open interest | {{open_interest}} |
| Funding rate | {{funding_rates}} |
| Social signal | {{social_signal}} |

## Interpretasi

{{interpretation}}

## Bias

**{{bias}}**

## Implikasi untuk eksekusi

{{action_implication}}

---

*Sentiment bukan signal entry. Yang dipakai untuk timing entry tetap setup di `market-analysis.md` + plan di `exit-plan.md`. Greed extreme tidak otomatis berarti short, fear extreme tidak otomatis berarti long.*

## Tone guide

Observasional, bukan prediktif. Bahasa "reading" bukan "ramalan". Social signal selalu di-tag tidak terverifikasi — ini disiplin SOUL.md untuk rumor sosial. Bias dalam satu kata supaya tidak jadi narasi. Action implication eksplisit: sentiment ke size + timing, bukan ke arah. Pesan penutup wajib mengingatkan bahwa extreme reading tidak otomatis = trade reversal — kontrarian buta sama bahayanya dengan FOMO buta. Tidak ada "everyone is bullish so I'm short" — bahasa kontrarian malas. Tidak ada "diamond hands community kuat" — Trade Pro lihat data, bukan vibes.
