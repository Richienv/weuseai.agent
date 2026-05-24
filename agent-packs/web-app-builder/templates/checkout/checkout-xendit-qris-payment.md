# Template — Checkout Xendit (QRIS-first)

Halaman checkout terintegrasi Xendit dengan urutan metode pembayaran yang disesuaikan preferensi konsumen Indonesia. QRIS jadi default karena conversion rate-nya paling tinggi di pasar lokal (satu scan, semua bank dan e-wallet ikut), bukan kartu kredit yang penetrasinya rendah.

## Variables

- `{order_id}` — internal order ID kamu (string, unik per checkout).
- `{external_id}` — ID yang dikirim ke Xendit untuk reconciliation, biasanya sama dengan `{order_id}` plus prefix env, contoh `prod-ord-12345` (string).
- `{customer_email}` — email pembeli (string, valid email).
- `{customer_name}` — nama pembeli (string, 1-80 karakter).
- `{customer_phone}` — nomor HP pembeli format E.164 tanpa plus, contoh `6281234567890` (string).
- `{amount_idr}` — total pembayaran dalam IDR integer (bukan rupiah ber-desimal), contoh `499000` untuk Rp 499.000 (integer, min 1000).
- `{description}` — keterangan order yang muncul di Xendit, max 80 karakter (string).
- `{success_redirect_url}` — URL setelah pembayaran sukses (string).
- `{failure_redirect_url}` — URL kalau pembayaran gagal atau dibatalkan (string).
- `{invoice_duration_seconds}` — berapa lama invoice valid sebelum expire, default `3600` (1 jam) (integer).
- `{tax_inclusive}` — apakah harga sudah termasuk PPN 11%, boolean.

## Page structure

### Order summary

Tampil di atas atau sidebar. Item, harga per item, subtotal, PPN kalau ada, total.

Format IDR: `Rp 499.000` (titik thousand, tanpa desimal, ada spasi setelah Rp). Kalau `{tax_inclusive}` false, tambah baris "PPN 11%" eksplisit.

### Payment method selector

Urutan tampilan dari atas (default expanded) ke bawah:

1. **QRIS** — default selected. Satu QR yang bisa di-scan dari semua e-wallet dan mobile banking. Label: "QRIS (semua e-wallet & m-banking)".
2. **E-wallet** — accordion. Pilihan: OVO, DANA, GoPay, LinkAja, ShopeePay. Tampilkan logo masing-masing.
3. **Virtual Account** — accordion. Pilihan: BCA, Mandiri, BRI, BNI, Permata, CIMB. Empat besar di atas.
4. **Kartu Kredit/Debit** — accordion paling bawah. Visa, Mastercard, JCB. Tambah catatan "biaya admin 2.9%" kalau kamu pass-through fee.
5. **Cicilan 0%** opsional kalau merchant punya kontrak cicilan dengan bank tertentu (BCA, Mandiri, BRI biasanya). Tampilkan di bawah Kartu Kredit.

Jangan pakai urutan default Xendit hosted page (alphabetical) — itu nempatin Akulaku di atas QRIS. Urutan ini conversion-driven.

### CTA

Tombol "Bayar Sekarang" (bukan "Checkout" — bahasa Inggris kurang familiar buat audiens UMKM). Disabled sampai metode dipilih. Loading state saat invoice di-create.

### Trust strip di bawah CTA

Empat baris kecil:
- Logo Xendit + teks "Pembayaran diproses Xendit"
- Glyph kunci + "Koneksi terenkripsi"
- "Refund sesuai UU Perlindungan Konsumen 8/1999"
- Nomor WhatsApp support, format `+62 812-...` (mudah klik di mobile)

## Integration notes

### Server-side create invoice

Xendit Invoice API. Server-only call (jangan expose secret key di browser). Endpoint `POST https://api.xendit.co/v2/invoices`, auth Basic dengan secret key + `:` di-base64.

```javascript
// server-side (Node, Edge Function, dll)
const response = await fetch('https://api.xendit.co/v2/invoices', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(process.env.XENDIT_SECRET_KEY + ':').toString('base64')}`,
  },
  body: JSON.stringify({
    external_id: orderId,
    amount: amountIdr,
    payer_email: customerEmail,
    description: description,
    invoice_duration: 3600,
    customer: {
      given_names: customerName,
      email: customerEmail,
      mobile_number: customerPhone,
    },
    success_redirect_url: successUrl,
    failure_redirect_url: failureUrl,
    payment_methods: [
      'QRIS',
      'OVO',
      'DANA',
      'LINKAJA',
      'SHOPEEPAY',
      'BCA',
      'MANDIRI',
      'BRI',
      'BNI',
      'PERMATA',
      'CIMB',
      'CREDIT_CARD',
    ],
    currency: 'IDR',
    locale: 'id',
  }),
})

const { invoice_url } = await response.json()
// Redirect customer to invoice_url
```

### QRIS redirect flow

QRIS di Xendit hosted page punya dua mode:
1. **Display QR di hosted page** — pengunjung scan dari device lain (HP). Cocok untuk desktop checkout.
2. **Mobile redirect** — auto buka aplikasi banking/e-wallet kalau di mobile dan installed. Xendit handle deteksi.

Untuk maximize conversion, pakai Xendit hosted page (`invoice_url` di response). Jangan build QR display sendiri kecuali sudah kontrak Direct API dengan Xendit.

### Webhook signature verification

Xendit POST notifikasi ke webhook endpoint kamu saat status berubah (PAID, EXPIRED, FAILED). Verify pakai header `x-callback-token`:

```javascript
// di webhook handler
const incoming = req.headers['x-callback-token']
const expected = process.env.XENDIT_WEBHOOK_TOKEN
if (incoming !== expected) {
  return res.status(401).json({ error: 'invalid_token' })
}
```

Jangan trust body kalau token nggak match — itu kemungkinan replay attack atau test traffic salah arah.

### Locale dan currency

Set `locale: 'id'` supaya Xendit hosted page tampil bahasa Indonesia. Set `currency: 'IDR'` — kalau kosong, default USD dan amount akan diinterpretasi salah.

### Test mode dulu

Pakai secret key `xnd_development_*` untuk dev. Test cards Xendit ada di docs. Jangan deploy ke prod sebelum verify ada call balik dari webhook test-mode — banyak merchant ketahuan webhook URL salah pas first real payment masuk.

## Tone guide

- Bahasa Indonesia, `kamu` form di error message dan instruction.
- Label tombol pakai kata kerja konkret. "Bayar Sekarang" bukan "Lanjutkan".
- Error message kasih actionable next step, jangan cuma "Terjadi kesalahan". Contoh: "Pembayaran gagal — saldo OVO kurang. Coba metode lain atau top-up dulu."
- Trust copy spesifik. "Refund sesuai UU Perlindungan Konsumen 8/1999" lebih kuat dari "Pembayaran aman".
- Zero exclamation marks. Jangan pakai emoji di error atau confirmation page.
