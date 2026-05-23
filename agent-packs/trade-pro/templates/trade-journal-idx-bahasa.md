# Template — Trade journal IDX (Bahasa Indonesia)

Journal trading IDX dalam Bahasa Indonesia, satu entry per trade (open atau closed). Lot di IDX = 100 saham. Harga dalam Rupiah. Pakai template ini untuk catat eksekusi + post-mortem; jangan dipakai untuk plan trade besok atau wishlist saham.

> **NOTE: BUKAN SARAN INVESTASI.** Template ini adalah kerangka analitis. Trade Pro tidak menempatkan trade, tidak memindahkan dana, dan tidak menjamin hasil. Keputusan dan eksekusi tetap di customer + broker masing-masing.

## Variables

- `{{entry_date}}` — string, tanggal entry trade dalam WIB (mis. "Senin, 25 Mei 2026")
- `{{exit_date}}` — string, tanggal exit kalau sudah closed. Isi "—" kalau masih open
- `{{idx_code}}` — string, kode 4-huruf di IDX (mis. "BBCA", "GOTO", "TLKM")
- `{{papan_listing}}` — string, papan saat trade dieksekusi. "Utama" / "Pengembangan" / "Akselerasi" / "Pemantauan Khusus"
- `{{direction}}` — string, "long" (beli). Note: short-selling di IDX dibatasi ke saham yang masuk daftar OJK + butuh marjin khusus; kalau short, sebutkan eksplisit
- `{{lot_size}}` — string, ukuran posisi dalam lot. 1 lot = 100 saham (mis. "20 lot = 2.000 saham")
- `{{avg_entry_price}}` — string, harga rata-rata entry dalam IDR (mis. "Rp 9.850 per saham, total notional Rp 19.700.000")
- `{{avg_exit_price}}` — string, harga rata-rata exit dalam IDR. Isi "—" kalau masih open
- `{{thesis_entry}}` — string, 1-2 kalimat alasan masuk. Fokus ke data + setup, bukan ke "kayaknya naik"
- `{{stop_loss_level}}` — string, level cut-loss yang ditetapkan sebelum entry (mis. "Rp 9.500 — break support mingguan")
- `{{target_level}}` — string, level target profit (mis. "Rp 10.800 sebagai T1, Rp 11.500 sebagai T2")
- `{{outcome_idr}}` — string, hasil profit/loss dalam IDR + persen. Sudah net fee broker + pajak 0.1% jual (mis. "+Rp 1.840.000, +9.3% net"). Isi "—" kalau open
- `{{plan_diikuti}}` — string, "Ya" / "Tidak — <alasan singkat>". Apakah eksekusi sesuai stop + target yang ditulis pre-entry
- `{{pelajaran}}` — string, 1-2 kalimat pelajaran proses untuk trade berikutnya. Fokus ke yang bisa diulang atau dihindari, bukan ke "untungnya besar"

## Template

# Journal trade — {{idx_code}} ({{entry_date}})

## Identitas posisi

- Emiten: {{idx_code}}
- Papan: {{papan_listing}}
- Arah: {{direction}}
- Ukuran: {{lot_size}}

## Eksekusi

| | Tanggal | Harga rata-rata |
|---|---|---|
| Entry | {{entry_date}} | {{avg_entry_price}} |
| Exit | {{exit_date}} | {{avg_exit_price}} |

## Thesis saat masuk

{{thesis_entry}}

## Risk frame pre-entry

- Stop-loss: {{stop_loss_level}}
- Target: {{target_level}}

## Hasil

- P/L net: {{outcome_idr}}
- Plan diikuti: {{plan_diikuti}}

## Pelajaran

{{pelajaran}}

---

### Konvensi IDX yang dipakai journal ini

- **Lot:** 1 lot = 100 saham di IDX (berlaku untuk semua saham di papan Utama / Pengembangan / Akselerasi / Pemantauan Khusus per Surat Edaran BEI).
- **Auto-rejection:** harga saham IDX punya batas auto-rejection harian (ARA/ARB) yang berbeda per papan. Cek di rule book IDX kalau exit yang kamu rencanakan jatuh di luar batas hari itu.
- **Fee broker:** beda per broker. Catat fee net di outcome_idr supaya post-mortem akurat.
- **Pajak penjualan:** 0.1% nilai transaksi dipotong otomatis oleh broker per Pasal 4 PP 41/1994. Ini final — tidak ada capital gain tax terpisah.

### Disiplin journaling

- Satu trade per entry. Jangan tulis "rencana minggu depan" di journal — itu di template lain.
- Append-only. Entry lama tidak diedit walau hasilnya pahit; pola muncul dari 20-30 entry yang jujur.
- Bahasa proses, bukan bahasa hasil. "Ikuti stop yang ditetapkan" > "untungnya cuma sedikit".
- Trade Pro tidak menempatkan order. Eksekusi dan dana 100% di sisi kamu + broker.

## Tone guide

Sober, faktual, Bahasa Indonesia natural. Tidak ada "moon", "lambo", "cuan", "fomo" — Trade Pro persona profesional. Pelajaran ditulis sebagai instruksi self-future: "kalau setup serupa muncul lagi, tunggu konfirmasi candle close H+1 sebelum entry". Plan-tidak-diikuti dicatat tanpa moralisasi: fakta + konsekuensi + adjustment. Hasil winning tidak dirayakan; hasil losing tidak diratapi — keduanya data.
