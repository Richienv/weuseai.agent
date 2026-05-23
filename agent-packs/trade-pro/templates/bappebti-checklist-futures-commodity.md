# Template — BAPPEBTI checklist (futures + komoditas + crypto)

Checklist compliance untuk customer yang trading futures, komoditas, atau crypto-asset di Indonesia. BAPPEBTI (Badan Pengawas Perdagangan Berjangka Komoditi) di bawah Kementerian Perdagangan adalah regulator untuk produk perdagangan berjangka komoditi (PBK) — termasuk crypto-asset per Peraturan BAPPEBTI Nomor 5 Tahun 2019. Pakai checklist ini sebelum top-up dana ke pialang berjangka mana pun.

> **NOTE: BUKAN SARAN INVESTASI.** Template ini adalah kerangka analitis. Trade Pro tidak menempatkan trade, tidak memindahkan dana, dan tidak menjamin hasil. Keputusan dan eksekusi tetap di customer + broker masing-masing.

## Variables

- `{{check_date}}` — string, tanggal checklist dalam WIB
- `{{pialang_name}}` — string, nama pialang berjangka yang akan dipakai (mis. "PT XYZ Berjangka")
- `{{pialang_bappebti_status}}` — string, status di BAPPEBTI. "TERDAFTAR — nomor izin xxx, masih berlaku" / "TIDAK TERDAFTAR — JANGAN GUNAKAN" / "PERLU CEK". Cek di bappebti.go.id menu "Daftar Pialang Berjangka"
- `{{product_class}}` — string, jenis produk. "Multilateral (komoditas berjangka — emas/CPO/karet di JFX/ICDX)" / "Bilateral (forex spot, indeks, CFD)" / "Crypto-asset (PFAK terdaftar)"
- `{{produk_diizinkan}}` — string, apakah produk yang akan ditradingkan masuk daftar resmi BAPPEBTI. Untuk crypto, cek "Daftar Aset Kripto yang Diperdagangkan di Pasar Fisik Aset Kripto" yang di-publish BAPPEBTI. Untuk komoditas, cek listing di JFX (Jakarta Futures Exchange) atau ICDX (Indonesia Commodity & Derivatives Exchange)
- `{{notional_cap_per_regulasi}}` — string, batas notional / leverage maksimum per regulasi BAPPEBTI yang relevan (mis. "Leverage forex retail max 1:100 per Peraturan BAPPEBTI 12/2018, tergantung kategori klien")
- `{{risk_disclosure_acked}}` — string, "Sudah baca + tanda-tangan Risk Disclosure Statement (RDS) dari pialang" / "Belum — JANGAN top-up dulu"
- `{{kyc_status}}` — string, status KYC di pialang. "Lengkap (KTP/NPWP/foto/spesimen tanda tangan diserahkan + diverifikasi)" / "Belum lengkap — pending"
- `{{dispute_resolution_path}}` — string, jalur penyelesaian sengketa yang tertulis di kontrak (mis. "BAKTI (Badan Arbitrase Perdagangan Berjangka Komoditi) sebagai jalur pertama, pengadilan negeri sebagai fallback")
- `{{red_flags}}` — markdown bullet list, hal-hal yang membatalkan keputusan top-up. Isi "Tidak ada red flag" kalau bersih
- `{{go_no_go}}` — string, keputusan: "GO — top-up sesuai rencana" / "TUNDA — lengkapi <hal yang kurang>" / "BATAL — pialang/produk tidak compliant"

## Template

# BAPPEBTI compliance checklist — {{pialang_name}}

*Tanggal cek: {{check_date}}*

## Status pialang di BAPPEBTI

{{pialang_bappebti_status}}

> Kalau pialang tidak terdaftar di BAPPEBTI, jangan top-up dana. Dana di pialang tidak resmi tidak punya jalur perlindungan regulator — disengketakan ke mana pun akan sulit.

## Klasifikasi produk

{{product_class}}

> Multilateral: melalui bursa (JFX/ICDX) dengan kliring resmi (KBI — Kliring Berjangka Indonesia). Bilateral: pialang sebagai counterparty langsung — risiko default counterparty lebih relevan. Crypto: hanya PFAK (Pedagang Fisik Aset Kripto) yang terdaftar BAPPEBTI yang boleh.

## Produk diizinkan?

{{produk_diizinkan}}

> Untuk crypto-asset di Indonesia: hanya aset yang masuk daftar resmi BAPPEBTI (di-publish berkala, biasanya 200-300+ aset) yang legal diperdagangkan. Aset di luar daftar tetap bisa kamu beli di exchange luar negeri, tapi compliance + jalur penyelesaian sengketa akan berbeda.

## Notional + leverage cap

{{notional_cap_per_regulasi}}

> Leverage di luar batas regulasi adalah tanda pialang tidak compliant — atau kamu sedang masuk kategori klien profesional yang batas-batasnya lebih longgar tapi proteksi-nya juga lebih sedikit.

## Dokumen pre-trading

| Item | Status |
|------|--------|
| Risk Disclosure Statement (RDS) | {{risk_disclosure_acked}} |
| KYC lengkap di pialang | {{kyc_status}} |

> RDS adalah kewajiban pialang per regulasi BAPPEBTI sebelum customer dibuka rekeningnya. Baca RDS, jangan asal centang.

## Jalur penyelesaian sengketa

{{dispute_resolution_path}}

> BAKTI (Badan Arbitrase Perdagangan Berjangka Komoditi) adalah forum arbitrase khusus PBK di Indonesia. Pengadilan negeri sebagai jalur lain. Kalau kontrak menetapkan yurisdiksi asing tanpa fallback BAKTI / pengadilan Indonesia, itu red flag — Indonesian customer akan sulit menggugat dari luar yurisdiksi.

## Red flag dari checklist

{{red_flags}}

## Keputusan

**{{go_no_go}}**

---

### Referensi regulator

- **BAPPEBTI** — Badan Pengawas Perdagangan Berjangka Komoditi (Kementerian Perdagangan RI). Web: bappebti.go.id. Daftar pialang berjangka + daftar PFAK + daftar aset kripto resmi tersedia di sini.
- **JFX** (Jakarta Futures Exchange) — bursa multilateral komoditi.
- **ICDX** (Indonesia Commodity & Derivatives Exchange) — bursa multilateral komoditi.
- **KBI** (Kliring Berjangka Indonesia) — lembaga kliring multilateral.
- **BAKTI** — Badan Arbitrase Perdagangan Berjangka Komoditi.

### Regulasi yang sering jadi rujukan

- Undang-Undang Nomor 10 Tahun 2011 tentang Perdagangan Berjangka Komoditi (perubahan atas UU 32/1997).
- Peraturan BAPPEBTI Nomor 5 Tahun 2019 — penyelenggaraan pasar fisik aset kripto.
- Peraturan BAPPEBTI tentang Pialang Berjangka (revisi berkala — cek versi terbaru di bappebti.go.id).

### Catatan akhir

Checklist ini hanya untuk pre-trading compliance. Trade Pro tidak membuka rekening di pialang atas nama kamu, tidak top-up dana, dan tidak menempatkan trade. Semua eksekusi 100% di sisi kamu dengan kredensial yang kamu pegang sendiri. Kalau ada produk PBK yang dijanjikan "fixed return" atau "tidak ada risiko" — itu hampir pasti penipuan; PBK adalah produk berisiko per definisinya.

## Tone guide

Faktual, regulator-aware, protective. Tidak ada "ayo trading futures supaya cepat kaya" — Trade Pro tahu PBK punya tingkat blow-up tinggi untuk retail. Bahasa GO / TUNDA / BATAL diberi bobot sama; tidak ada framing bahwa BATAL itu kekalahan. Red flag ditulis dengan konsekuensi konkret (dana sulit ditarik, jalur hukum lemah), bukan dengan dramatisasi.
