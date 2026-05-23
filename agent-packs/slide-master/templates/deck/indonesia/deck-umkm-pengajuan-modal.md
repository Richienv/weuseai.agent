# Template — Deck Pengajuan Modal UMKM

Audience: lembaga pembiayaan UMKM Indonesia — bank penyalur KUR (BRI, Mandiri, BNI, BSI), P2P lending OJK-licensed (Akseleran, Modalku, Investree, KoinWorks), angel UMKM, koperasi simpan pinjam, atau program inkubator daerah. Use case: pelaku UMKM yang pitch permodalan untuk ekspansi, modal kerja, atau capex peralatan.

Beda dari pitch deck startup: fokus ke kapasitas bayar (cash flow, omzet stabil) bukan growth potential, sebutkan KBLI code, omzet bracket per PP 7/2021 (Mikro <Rp 2M, Kecil <Rp 15M, Menengah <Rp 50M omzet/tahun), legalitas lengkap (NIB, SIUP, NPWP), dan agunan kalau pinjaman butuh kolateral.

## Variables

- `{{nama_usaha}}` — nama usaha atau merek
- `{{nama_pemilik}}` — nama pemilik usaha
- `{{lokasi_usaha}}` — alamat lengkap usaha (kelurahan, kecamatan, kota, provinsi)
- `{{kbli_code}}` — KBLI 2020 5-digit (contoh: "47711 — Perdagangan Eceran Pakaian", "56101 — Restoran")
- `{{tahun_berdiri}}` — tahun usaha mulai operasi
- `{{kategori_umkm}}` — Mikro (<Rp 2M omzet/tahun), Kecil (<Rp 15M), atau Menengah (<Rp 50M) per PP 7/2021
- `{{legalitas}}` — NIB (Nomor Induk Berusaha), SIUP, NPWP, izin sektor spesifik (PIRT untuk pangan rumahan, BPOM untuk pangan komersial, halal MUI, dll.)
- `{{omzet_bulanan_idr}}` — omzet rata-rata bulanan 12 bulan terakhir dalam IDR
- `{{omzet_tahunan_idr}}` — omzet tahunan terkini dalam IDR
- `{{biaya_operasional_bulanan}}` — biaya operasional bulanan (sewa, bahan baku, gaji, listrik, dll.)
- `{{laba_bersih_bulanan}}` — laba bersih bulanan dalam IDR
- `{{jumlah_karyawan}}` — jumlah karyawan tetap dan tidak tetap
- `{{jenis_pembiayaan}}` — KUR Mikro / KUR Kecil / KUR Super Mikro / P2P lending / pinjaman komersial / angel
- `{{nominal_pengajuan_idr}}` — nominal yang diajukan dalam IDR
- `{{tenor_bulan}}` — tenor pengembalian dalam bulan
- `{{tujuan_penggunaan}}` — modal kerja / capex peralatan / ekspansi outlet / digitalisasi
- `{{agunan}}` — agunan yang ditawarkan (BPKB kendaraan, sertifikat tanah, deposito, atau "tanpa agunan" untuk KUR di bawah Rp 100 juta per kebijakan OJK)

## Template

```
---
template: deck-umkm-pengajuan-modal
audience: lembaga-pembiayaan-umkm
duration_minutes: 15
slide_count: 12
language: id
---

# Slide 1 — Cover
**Title:** Proposal Permodalan — {{nama_usaha}}
**Visual:** Logo / foto usaha + nama pemilik + lokasi + nominal pengajuan {{nominal_pengajuan_idr}} + jenis pembiayaan {{jenis_pembiayaan}}
**Speaker note:** Buka dengan rasa hormat. "Selamat pagi, Pak/Ibu. Terima kasih atas waktu. Saya {{nama_pemilik}}, pemilik {{nama_usaha}} di {{lokasi_usaha}}." ~30 detik.

# Slide 2 — Profil Usaha
**Title:** Tentang {{nama_usaha}}
**Visual:** Foto usaha (storefront, dapur, gudang, atau peralatan utama) + 4 data: tahun berdiri {{tahun_berdiri}}, KBLI {{kbli_code}}, kategori UMKM {{kategori_umkm}} (per PP 7/2021), jumlah karyawan {{jumlah_karyawan}}
**Speaker note:** Sebut KBLI code lengkap — analis kredit langsung pakai KBLI untuk klasifikasi risiko sektoral. Kategori UMKM merujuk PP 7/2021 (Mikro <Rp 2M, Kecil <Rp 15M, Menengah <Rp 50M omzet/tahun). ~75 detik.

# Slide 3 — Legalitas
**Title:** Dokumen Legalitas
**Visual:** Tabel checklist {{legalitas}} dengan kolom: dokumen | nomor | tanggal terbit | status (aktif / dalam proses perpanjangan)
**Speaker note:** Wajib sebut NIB (dari OSS), NPWP, SIUP kalau ada, dan izin sektor spesifik (PIRT, BPOM, halal MUI, izin lingkungan kalau perlu). Lembaga pembiayaan filter pengajuan tanpa NIB lengkap di langkah pertama. ~60 detik.

# Slide 4 — Produk atau Jasa
**Title:** Yang Kami Tawarkan
**Visual:** Foto produk / jasa utama (3-5 foto) + harga rata-rata per item dalam IDR + segmentasi customer (B2C end consumer / B2B reseller / B2G)
**Speaker note:** Sebut produk dan harga eksplisit dalam IDR. Lembaga pembiayaan menilai stabilitas margin per kategori produk. ~75 detik.

# Slide 5 — Track Record Omzet
**Title:** Omzet 12 Bulan Terakhir
**Visual:** Bar chart omzet bulanan 12 bulan dalam IDR (sumbu Y format Rp 25.000.000,-). Rata-rata bulanan {{omzet_bulanan_idr}}, omzet tahunan {{omzet_tahunan_idr}}. Source: rekening koran bank + buku kas + faktur pajak (kalau PKP)
**Speaker note:** Track record minimal 6 bulan (KUR), idealnya 12 bulan. Sebut sumber data — analis akan minta rekening koran 6 bulan terakhir sebagai verifikasi. ~90 detik.

# Slide 6 — Cash Flow Bulanan
**Title:** Arus Kas Bulanan
**Visual:** Tabel breakdown rata-rata bulanan: Omzet {{omzet_bulanan_idr}}, HPP (Rp X), Biaya operasional {{biaya_operasional_bulanan}} (sewa, gaji, listrik, internet, transport), Laba kotor (Rp Y), Laba bersih {{laba_bersih_bulanan}}, Debt service ratio kalau ada pinjaman existing
**Speaker note:** Cash flow positif berkelanjutan adalah indikator utama kapasitas bayar. Kalau ada pinjaman existing, sebut sisa cicilan dan debt-to-income ratio. Lembaga pembiayaan umumnya kasih plafon supaya total cicilan ≤ 30% laba bersih bulanan. ~90 detik.

# Slide 7 — Channel Penjualan
**Title:** Channel Penjualan
**Visual:** Pie chart split omzet per channel: offline outlet (%), Tokopedia (%), Shopee (%), TikTok Shop (%), WhatsApp/direct (%), reseller (%). Sebut payment method utama (QRIS, transfer bank, COD, kartu)
**Speaker note:** Channel diversification mengurangi risiko konsentrasi. Lembaga pembiayaan suka usaha yang sudah multi-channel — bukti adaptasi digital. ~75 detik.

# Slide 8 — Tujuan Penggunaan Dana
**Title:** Tujuan Pengajuan
**Visual:** Pie chart {{tujuan_penggunaan}} dengan alokasi 3-4 bucket: modal kerja (stock bahan baku, payroll), capex (peralatan, kendaraan operasional), ekspansi (sewa outlet baru, renovasi), digitalisasi (POS system, ads budget). Setiap bucket dengan nominal IDR absolut
**Speaker note:** Spesifik. "Pembelian mesin oven kapasitas 50 kg/hari merek X seharga Rp 45.000.000,-" lebih kuat dari "untuk peralatan". Lembaga pembiayaan butuh detail untuk justifikasi plafon. ~90 detik.

# Slide 9 — Proyeksi Setelah Pendanaan
**Title:** Proyeksi 12-24 Bulan
**Visual:** Tabel proyeksi: omzet bulanan baseline vs proyeksi (% kenaikan), tambahan kapasitas produksi, target market baru, ROI investasi dalam bulan
**Speaker note:** Proyeksi realistis lebih kuat dari proyeksi agresif. Sebut asumsi: "Penambahan mesin meningkatkan kapasitas dari 100 ke 250 unit/hari, dengan margin existing 35% diproyeksikan menghasilkan tambahan laba bersih Rp 12.000.000,- per bulan." ~90 detik.

# Slide 10 — Pengajuan Pembiayaan
**Title:** Detail Pengajuan
**Visual:** Tabel: jenis pembiayaan {{jenis_pembiayaan}}, nominal {{nominal_pengajuan_idr}}, tenor {{tenor_bulan}} bulan, estimasi cicilan bulanan (Rp X), agunan {{agunan}}, total bunga estimasi (Rp Y)
**Speaker note:** Untuk KUR: bunga 6% efektif per tahun (kebijakan pemerintah 2024-2026), plafon maksimum Rp 500 juta untuk KUR Mikro tanpa agunan tambahan. Untuk P2P lending OJK-licensed: bunga 18-30% per tahun tergantung risk grade. ~90 detik.

# Slide 11 — Mitigasi Risiko
**Title:** Mitigasi Risiko Bisnis
**Visual:** Per risiko (penurunan demand, kenaikan harga bahan baku, persaingan, regulasi): probability, impact, dan mitigasi konkret
**Speaker note:** Lembaga pembiayaan menilai self-awareness pemilik usaha. Akui risiko terbuka — "demand musiman turun saat puasa, dimitigasi dengan stok produk tahan lama" lebih dipercaya dari "tidak ada risiko". ~75 detik.

# Slide 12 — Komitmen & Penutup
**Title:** Komitmen Pengembalian
**Visual:** 3 data: debt service ratio proyeksi (≤ 30% laba bersih), agunan {{agunan}}, kontak pemilik (HP + alamat) + tanggal pengajuan
**Speaker note:** Tutup dengan komitmen. "Saya berkomitmen mengembalikan {{nominal_pengajuan_idr}} dalam {{tenor_bulan}} bulan dengan cicilan tepat waktu. Terima kasih atas pertimbangan Bapak/Ibu." ~60 detik. Buka Q&A.
```

## Tone guide

- Tone hormat-profesional. Sapa dengan "Pak/Ibu" — audience lembaga pembiayaan adalah analis kredit yang menghargai formalitas Indonesia.
- Semua angka uang dalam IDR dengan format titik ribuan: `Rp 25.000.000,-`. Konsisten — jangan campur dengan USD.
- KBLI code 5-digit wajib disebut. Analis pakai KBLI untuk lookup risk grade sektoral.
- Kategori UMKM merujuk PP 7/2021 (Mikro <Rp 2M omzet/tahun, Kecil <Rp 15M, Menengah <Rp 50M).
- Legalitas wajib: NIB (dari OSS sejak UU Cipta Kerja 2020), NPWP, SIUP (kalau perlu sesuai KBLI), dan izin sektor (PIRT untuk pangan rumahan, BPOM untuk pangan komersial, halal MUI untuk konsumen Muslim).
- Track record omzet minimal 6 bulan untuk KUR Mikro, 12 bulan untuk KUR Kecil atau pinjaman komersial. Sumber data: rekening koran bank, buku kas, faktur pajak.
- KUR rate 6% efektif per tahun (kebijakan pemerintah 2024-2026 — verifikasi rate terkini sebelum pitch). Plafon maksimum: KUR Super Mikro Rp 10 juta, KUR Mikro Rp 100 juta, KUR Kecil Rp 500 juta.
- P2P lending: hanya pilih platform OJK-licensed (cek daftar di ojk.go.id). Bunga 18-30% per tahun tergantung risk grade — jauh lebih mahal dari KUR.
- Mitigasi risiko wajib di-surface. Lembaga pembiayaan menilai self-awareness pemilik usaha sebagai indikator kompetensi.
- Bahasa Indonesia formal-profesional, English minimal (kecuali istilah teknis spesifik seperti debt service ratio).
- Tidak ada exclamation marks. Tidak ada superlatif. Tone direktur ke direktur.
