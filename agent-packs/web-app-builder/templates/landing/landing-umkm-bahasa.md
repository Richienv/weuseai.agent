# Template — Landing UMKM (Bahasa)

Landing untuk audiens UMKM (Usaha Mikro Kecil Menengah) Indonesia. Register bahasa pakai `kamu`, hook problem-first (bukan klaim produk), social proof dari pelaku UMKM Indonesia (bukan logo Fortune 500), pricing IDR dengan emphasis monthly-payment-first, dan CTA ke pembiayaan KUR atau alternatif kalau relevan.

Anti-pattern yang harus dihindari: "Join 10,000 happy customers worldwide". UMKM Indonesia tidak relate ke ribuan customer global — mereka relate ke "Warung Bu Eni di Bandung sudah pakai 8 bulan, omzet naik 30%".

## Variables

- `{business_name}` — nama produk atau jasa kamu (string).
- `{problem_hook}` — pertanyaan problem-first untuk hero H1, 5-10 kata, biasanya dimulai dengan "Bingung", "Capek", "Pusing", atau "Sulit" (string).
- `{outcome_promise}` — janji hasil konkret untuk subhead, satu kalimat 12-20 kata dengan timeframe (string).
- `{wa_number_e164}` — WhatsApp Business number, format E.164 tanpa plus (string).
- `{wa_prefill_message}` — pesan WhatsApp prefilled untuk hero CTA, mulai dengan "Halo" (string).
- `{price_monthly_idr}` — harga bulanan dalam IDR integer, contoh `49000` (integer).
- `{price_yearly_idr}` — opsional, harga tahunan kalau ada diskon (integer).
- `{kur_eligible}` — apakah produk ini bisa dibeli via pembiayaan KUR (Kredit Usaha Rakyat), boolean.
- `{testimonial_1_name}` — nama UMKM testimoni 1, contoh "Bu Eni — Warung Eni, Bandung" (string).
- `{testimonial_1_quote}` — quote testimoni 1, 15-30 kata, bahasa percakapan asli (string).
- `{testimonial_2_name}` — nama UMKM testimoni 2 (string).
- `{testimonial_2_quote}` — quote testimoni 2 (string).
- `{testimonial_3_name}` — nama UMKM testimoni 3 (string).
- `{testimonial_3_quote}` — quote testimoni 3 (string).
- `{count_umkm_active}` — jumlah UMKM yang udah pakai, integer (kosongkan kalau di bawah 50 — jujur lebih baik daripada angka kosong) (integer).
- `{oss_legal_entity_required}` — apakah customer butuh OSS-RBA (NIB) untuk pakai, boolean.

## Page structure

### Hero — problem-first

H1 dengan pertanyaan problem. Bukan klaim produk.

Contoh yang bener:
- "Bingung urus pajak UMKM tiap bulan?"
- "Capek catat penjualan warung manual?"
- "Pusing mikir cara terima pembayaran QRIS?"

Contoh yang salah (terlalu produk-centric):
- "Solusi pajak terbaik untuk UMKM" — terlalu generik, terdengar kayak iklan
- "Platform akuntansi #1 di Indonesia" — klaim tanpa bukti

Subhead: outcome promise dengan timeframe. "Pajak bulanan beres dalam 30 menit, harga UMKM, ada tim bantuin di WhatsApp."

CTA primary: tombol hijau WhatsApp. CTA secondary: "Lihat cara kerjanya" link ke section penjelasan.

### Problem expansion section

3-4 paragraf yang validate problem dari sudut UMKM. Pakai detail spesifik:
- "Setiap akhir bulan kamu buka Excel, ngitung omzet per item, takut salah hitung pajak."
- "Tetangga sebelah baru kena denda karena lupa lapor SPT — kamu nggak mau gitu."
- "Pengen pakai aplikasi, tapi kebanyakan dibikin buat startup, harga subscription mahal."

Mirror problem audiens UMKM seperti mereka cerita ke teman, bukan dengan bahasa konsultan.

### Solution section — bukan feature list

Jangan list "Feature 1: AI-powered. Feature 2: Real-time sync." UMKM nggak relate.

Pakai 3 outcome:
1. **Lapor SPT bulanan tinggal klik** — "Bukan 3 jam lagi. 15 menit selesai."
2. **Bisa dipake dari HP** — "Nggak perlu laptop. Sambil jaga warung tetap bisa."
3. **Ada tim bantuin via WhatsApp** — "Stuck? Chat aja, jam kerja dibalas 30 menit."

### Social proof — testimoni UMKM

Tampilkan 3 testimoni dengan:
- Nama + nama bisnis + kota (bukan "Sarah, CEO" — tulis "Bu Eni — Warung Eni, Bandung")
- Foto kalau ada (foto asli orang Indonesia, bukan stock photo)
- Quote dengan bahasa percakapan asli — boleh ada "yang" dan "udah" — jangan dihaluskan jadi formal

Kalau `{count_umkm_active}` >= 50, tampilkan strip "Sudah dipakai {count_umkm_active}+ UMKM di Indonesia". Di bawah 50, skip — jangan boost angka.

### Pricing — monthly-first

Tampilkan harga bulanan paling besar dan jelas. Yearly toggle opsional, default ke monthly (UMKM cash-flow umumnya bulanan, jarang punya budget setahun di muka).

```html
<div class="pricing-card">
  <p class="price-monthly">
    <span class="price-amount">Rp {price_monthly_idr_formatted}</span>
    <span class="price-period">/bulan</span>
  </p>
  <p class="price-yearly-tease">
    Atau bayar setahun: Rp {price_yearly_idr_formatted} (hemat 2 bulan)
  </p>
</div>
```

Format IDR: `Rp 49.000` (titik thousand, tanpa desimal, spasi setelah Rp).

### KUR / pembiayaan section (opsional, kalau `{kur_eligible}` true)

Banyak UMKM beli alat usaha pakai pinjaman KUR (Kredit Usaha Rakyat) dari BRI, BNI, Mandiri. Kalau produk kamu bisa dibeli pakai KUR, jelasin langkah-langkah:

```
Bisa dibeli pakai KUR?
1. Datang ke BRI / BNI / Mandiri cabang terdekat
2. Bawa NIB (Nomor Induk Berusaha) dari OSS-RBA
3. Ajukan KUR Mikro (plafond sampai Rp 100 juta)
4. Setelah cair, transfer ke rekening kami pakai nomor invoice
```

Ini bukan untuk semua produk. Skip section kalau produk kamu service bulanan murah (< Rp 500rb/bulan) — KUR untuk pembelian alat atau modal usaha, bukan subscription.

### Legal entity helper (opsional, kalau `{oss_legal_entity_required}` true)

Kalau customer butuh badan usaha untuk pakai produk (misal untuk e-faktur), bantu mereka navigasi OSS-RBA:

```
Belum punya NIB?
Bikin gratis 10 menit di oss.go.id (Online Single Submission - Risk Based Approach).
Untuk usaha mikro (omzet < Rp 2 miliar/tahun) cukup NIB perseorangan, tidak perlu PT atau CV.
```

### FAQ — 5 pertanyaan UMKM-specific

Wajib jawab:
1. **Bayar lewat apa?** Sebut QRIS, e-wallet, transfer manual. Jangan cuma kartu kredit (UMKM banyak yang nggak punya).
2. **Bisa dapat invoice / e-faktur?** Jawab spesifik. UMKM yang sudah PKP butuh ini.
3. **Bisa konsultasi dulu sebelum bayar?** Iya, via WhatsApp. UMKM jarang langsung beli tanpa tanya.
4. **Kalau nggak cocok, bisa refund?** Sebut "sesuai UU Perlindungan Konsumen 8/1999" + window refund spesifik (7 hari atau 14 hari).
5. **Ada training atau cuma kasih akses doang?** UMKM butuh handholding awal, sebut format (video tutorial, WhatsApp support, atau in-person).

### Footer CTA

Tombol WhatsApp lagi. Audiens UMKM butuh diingatkan untuk klik — scroll panjang sering bikin lupa.

## Integration notes

### IDR formatting

```javascript
function formatIDR(amount) {
  return 'Rp ' + amount.toLocaleString('id-ID').replace(/,/g, '.')
}
// 49000 → "Rp 49.000"
// 1290000 → "Rp 1.290.000"
```

`toLocaleString('id-ID')` di beberapa runtime pakai titik separator (sesuai konvensi Indonesia), di lainnya pakai koma. Replace untuk safe.

### KUR / NIB external links

- KUR info resmi: `https://kur.ekon.go.id`
- OSS-RBA registrasi NIB: `https://oss.go.id`

Link ke website resmi pemerintah, jangan ke third-party explainer. Audiens UMKM percaya sumber `.go.id`.

### WhatsApp prefill

```javascript
const phone = '6281234567890'
const msg = 'Halo, saya UMKM di Bandung, mau tanya tentang paket pajak bulanan'
const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
```

Pesan prefilled bantu UMKM yang nggak biasa kasih opening line.

## Tone guide

- Bahasa Indonesia primary, `kamu` form.
- Register: percakapan, bukan corporate. Boleh pakai "udah", "nggak", "gimana".
- BANNED words tambahan untuk audiens UMKM: "scalable", "ecosystem", "platform", "solusi end-to-end", "transformasi digital".
- Hindari English jargon kecuali yang sudah masuk umum (online, transfer, invoice, QRIS).
- Testimoni: copy aslinya, jangan dipoles. Boleh ada "kayak", "banget", "yang penting".
- Hero claim spesifik dengan timeframe atau angka. "Pajak beres dalam 30 menit" bukan "Pajak jadi mudah".
- Zero exclamation marks di body. Boleh 1 di testimonial kalau memang ada di quote asli (jangan tambah sendiri).
