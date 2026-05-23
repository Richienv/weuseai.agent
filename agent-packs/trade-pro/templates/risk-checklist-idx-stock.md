# Template — Risk checklist IDX stock

Checklist pre-trade untuk saham IDX (Indonesia Stock Exchange). Sebelum kamu kirim order ke broker, lewati checklist ini supaya keputusan terikat ke data emiten, bukan ke kabar grup. Trade Pro tidak menempatkan order — output checklist ini kamu pakai sendiri di platform broker pilihanmu (Mandiri Sekuritas, Mirae, IPOT, Stockbit, atau lainnya).

> **NOTE: BUKAN SARAN INVESTASI.** Template ini adalah kerangka analitis. Trade Pro tidak menempatkan trade, tidak memindahkan dana, dan tidak menjamin hasil. Keputusan dan eksekusi tetap di customer + broker masing-masing.

## Variables

- `{{check_date}}` — string, tanggal checklist dalam WIB (mis. "Senin, 25 Mei 2026, 08:30 WIB")
- `{{emiten_name}}` — string, nama emiten lengkap (mis. "PT Bank Central Asia Tbk")
- `{{idx_code}}` — string, kode 4-huruf di IDX (mis. "BBCA", "GOTO", "TLKM", "BBRI")
- `{{papan_listing}}` — string, papan IDX. Pilih satu: "Utama" / "Pengembangan" / "Akselerasi" / "Pemantauan Khusus". Cek di idx.co.id atau RTI Business
- `{{suspension_status}}` — string, status suspensi terkini. "AKTIF" / "SUSPEND — alasan: <misal: belum sampaikan lapkeu>" / "UMA (Unusual Market Activity)". Cek pengumuman IDX hari ini
- `{{rups_terdekat}}` — string, jadwal RUPS terdekat + agenda (mis. "RUPST 12 Juni 2026, agenda persetujuan dividen final FY2025 + penunjukan auditor"). Isi "Belum ada agenda RUPS publish" kalau kosong
- `{{dividend_ex_date}}` — string, ex-date dividen terdekat kalau ada (mis. "Cum-date 5 Juni 2026, ex-date 6 Juni 2026, payment 20 Juni 2026, DPS Rp 270"). Isi "—" kalau tidak ada dividen pending
- `{{per_ratio}}` — string, Price/Earnings Ratio per laporan keuangan terakhir, plus periode (mis. "PER 22.5x per Q1 2026 audited")
- `{{pbv_ratio}}` — string, Price/Book Value (mis. "PBV 4.8x")
- `{{roe_pct}}` — string, Return on Equity terakhir (mis. "ROE 19.2% TTM")
- `{{der_ratio}}` — string, Debt-to-Equity Ratio (mis. "DER 0.42x", atau "DER N/A — sektor bank, pakai CAR sebagai gantinya")
- `{{position_intent}}` — string, niat posisi dalam 1 kalimat (mis. "Akumulasi 100 lot untuk hold 6-12 bulan, masuk via fractional 3 entry")
- `{{red_flag_observations}}` — markdown bullet list, hal-hal yang patut diragukan dari checklist di atas. Isi "Tidak ada red flag dari checklist" kalau bersih
- `{{go_no_go}}` — string, keputusan: "GO" / "TUNDA — butuh data lebih" / "BATAL — red flag tidak teratasi"

## Template

# Risk checklist IDX — {{emiten_name}} ({{idx_code}})

*Tanggal cek: {{check_date}}*

## Identitas emiten

- Nama emiten: {{emiten_name}}
- Kode IDX: {{idx_code}}
- Papan listing: {{papan_listing}}

> Papan listing mempengaruhi syarat free-float, kapitalisasi minimum, dan governance requirement. Papan Pemantauan Khusus = ada masalah administratif / keuangan yang membuat saham dipisahkan; risiko delisting lebih tinggi.

## Status suspensi + UMA

{{suspension_status}}

> Cek pengumuman terbaru di idx.co.id (menu "Berita") sebelum kirim order. Saham yang sedang suspend atau di-UMA punya volatilitas + likuiditas yang berbeda dari kondisi normal.

## Corporate action

- RUPS terdekat: {{rups_terdekat}}
- Dividen pending: {{dividend_ex_date}}

> RUPS agenda perubahan modal, stock split, atau penggantian direksi adalah trigger pergerakan harga. Cek dampak ke posisi yang akan kamu ambil — terutama kalau kamu akan masuk dekat ex-date dividen, harga akan terkoreksi sebesar Dividend Per Share (DPS) di hari ex-date.

## Fundamental snapshot

Per laporan keuangan terakhir (audited annual atau quarterly):

| Metrik | Nilai |
|--------|-------|
| PER (Price/Earnings Ratio) | {{per_ratio}} |
| PBV (Price/Book Value) | {{pbv_ratio}} |
| ROE (Return on Equity) | {{roe_pct}} |
| DER (Debt-to-Equity) | {{der_ratio}} |

> Sumber: laporan keuangan resmi emiten di idx.co.id (menu "Laporan Keuangan") atau di KSEI / Stockbit fundamental tab. Bandingkan dengan rata-rata sektor — angka tinggi atau rendah sendirian tidak otomatis baik atau buruk.

## Niat posisi

{{position_intent}}

## Red flag dari checklist

{{red_flag_observations}}

## Keputusan

**{{go_no_go}}**

---

### Referensi regulator + sumber data

- **OJK (Otoritas Jasa Keuangan)** — pengatur pasar modal Indonesia. POJK 13/POJK.04/2017 tentang pendaftaran emiten + POJK 31/POJK.04/2015 tentang keterbukaan informasi.
- **IDX (Bursa Efek Indonesia)** — penyelenggara perdagangan. Rule book + pengumuman emiten di idx.co.id.
- **KSEI** — kustodian sentral, data registry saham + dividen.
- **Fundamental data:** laporan keuangan resmi di idx.co.id; tools agregator gratis: RTI Business, Stockbit, Bibit (tab fundamental).

### Konteks pajak (saham IDX)

- Pajak transaksi penjualan saham IDX: **0.1% dari nilai transaksi** (final), dipotong otomatis oleh broker per Pasal 4 PP 41/1994. Tidak ada pajak capital gain terpisah untuk saham IDX yang ditransaksikan di bursa.
- Pajak dividen: **10% Final** dari DPS bruto per Pasal 17 ayat 2c UU PPh, dipotong otomatis oleh emiten / broker sebelum dividen masuk ke RDN (Rekening Dana Nasabah).

### Catatan akhir

Checklist ini analitis pre-trade. Trade Pro tidak menempatkan order, tidak mengakses RDN kamu, dan tidak menjamin hasil. Order eksekusi dilakukan oleh kamu di platform broker masing-masing dengan password + 2FA yang kamu pegang sendiri.

## Tone guide

Faktual, regulator-aware, tanpa hype. Tidak ada "saham bagus ini wajib dibeli" — itu rekomendasi, dan Trade Pro tidak merekomendasi. Yang dilakukan: surface data, identifikasi red flag, biarkan customer yang putus. Bahasa pasif untuk fakta regulasi, aktif untuk instruksi cek. NO TRADE / TUNDA dipresentasikan sebagai keputusan dewasa setara dengan GO.
