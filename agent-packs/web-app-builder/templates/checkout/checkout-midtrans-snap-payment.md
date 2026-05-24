# Template — Checkout Midtrans Snap

Halaman checkout terintegrasi Midtrans Snap. Alternatif untuk merchant yang sudah punya kontrak Midtrans (banyak e-commerce dan jasa lebih lama pakai Midtrans karena kontrak existing dengan Gojek group). Urutan metode pembayaran tetap disesuaikan preferensi Indonesia: QRIS dan e-wallet di atas, kartu kredit di bawah.

## Variables

- `{order_id}` — internal order ID kamu (string, unik per checkout).
- `{midtrans_order_id}` — ID yang dikirim ke Midtrans, biasanya `{order_id}` plus timestamp untuk hindari duplicate, contoh `ord-12345-1700000000` (string).
- `{customer_email}` — email pembeli (string, valid email).
- `{customer_first_name}` — nama depan (string, 1-40 karakter).
- `{customer_last_name}` — nama belakang, boleh kosong (string).
- `{customer_phone}` — nomor HP format E.164 dengan plus, contoh `+6281234567890` (string).
- `{amount_idr}` — total dalam IDR integer, contoh `499000` (integer, min 1000).
- `{item_details}` — array item: `[{id, name, price, quantity}]`. Sum dari price*quantity harus sama dengan amount_idr.
- `{finish_redirect_url}` — URL setelah transaksi selesai sukses (string).
- `{error_redirect_url}` — URL kalau gagal atau dibatalkan (string).
- `{client_key}` — Midtrans client key (publik, aman di browser) — sandbox prefix `SB-Mid-client-`, prod prefix `Mid-client-` (string).
- `{is_production}` — boolean, false untuk sandbox.

## Page structure

### Order summary

Sama bentuk dengan template Xendit. Item, subtotal, PPN kalau ada, total. Format IDR `Rp 499.000` (titik thousand).

### Checkout button

Tombol "Bayar Sekarang". Klik trigger `snap.pay(token)`. Disabled saat token belum siap dari server.

### Trust strip

- "Pembayaran diproses Midtrans (Gopay)"
- "Koneksi terenkripsi"
- "Refund sesuai UU Perlindungan Konsumen 8/1999"
- Nomor WhatsApp support

### Method preference di Snap config

Midtrans Snap punya parameter `enabled_payments` untuk batasi metode yang muncul. Urutan tampilan diatur dari array order:

```
['gopay', 'qris', 'shopeepay', 'other_qris', 'bca_va', 'mandiri_va', 'bri_va', 'bni_va', 'permata_va', 'credit_card']
```

GoPay duluan karena Midtrans = Gojek group; UX-nya paling smooth untuk pengguna GoPay (auto-deeplink ke app). QRIS kedua. Kartu kredit terakhir.

## Integration notes

### Server-side: get Snap token

```javascript
// server-side, NEVER expose server key to browser
const serverKey = process.env.MIDTRANS_SERVER_KEY
const baseUrl = isProduction
  ? 'https://app.midtrans.com/snap/v1/transactions'
  : 'https://app.sandbox.midtrans.com/snap/v1/transactions'

const response = await fetch(baseUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Basic ${Buffer.from(serverKey + ':').toString('base64')}`,
  },
  body: JSON.stringify({
    transaction_details: {
      order_id: midtransOrderId,
      gross_amount: amountIdr,
    },
    item_details: itemDetails,
    customer_details: {
      first_name: customerFirstName,
      last_name: customerLastName,
      email: customerEmail,
      phone: customerPhone,
    },
    enabled_payments: [
      'gopay',
      'qris',
      'shopeepay',
      'other_qris',
      'bca_va',
      'mandiri_va',
      'bri_va',
      'bni_va',
      'permata_va',
      'credit_card',
    ],
    callbacks: {
      finish: finishRedirectUrl,
    },
  }),
})

const { token, redirect_url } = await response.json()
// Send token to browser
```

### Browser-side: init Snap.js

Load Snap.js dari Midtrans CDN. URL beda untuk sandbox vs production.

```html
<script
  type="text/javascript"
  src="https://app.sandbox.midtrans.com/snap/snap.js"
  data-client-key="{client_key}"
></script>
<!-- Prod: https://app.midtrans.com/snap/snap.js -->

<button id="pay-button" disabled>Bayar Sekarang</button>

<script>
  async function startCheckout() {
    const res = await fetch('/api/midtrans/snap-token', {
      method: 'POST',
      body: JSON.stringify({ orderId: '{order_id}' }),
    })
    const { token } = await res.json()
    const btn = document.getElementById('pay-button')
    btn.disabled = false
    btn.onclick = () => {
      window.snap.pay(token, {
        onSuccess: (result) => {
          window.location.href = '{finish_redirect_url}?order_id=' + result.order_id
        },
        onPending: (result) => {
          // VA atau QRIS — customer belum bayar, biar webhook yang confirm
          window.location.href = '/pending?order_id=' + result.order_id
        },
        onError: (result) => {
          window.location.href = '{error_redirect_url}?reason=' + (result.status_message || 'unknown')
        },
        onClose: () => {
          // Customer tutup modal tanpa bayar
          console.log('Snap closed without payment')
        },
      })
    }
  }
  startCheckout()
</script>
```

### Webhook signature verification

Midtrans signature = SHA512 dari `order_id + status_code + gross_amount + server_key`.

```javascript
import { createHash } from 'crypto'

const expected = createHash('sha512')
  .update(body.order_id + body.status_code + body.gross_amount + process.env.MIDTRANS_SERVER_KEY)
  .digest('hex')

if (body.signature_key !== expected) {
  return res.status(401).json({ error: 'invalid_signature' })
}
```

Jangan trust `transaction_status` dari body tanpa verifikasi signature. Replay attack di Midtrans masih bisa terjadi kalau endpoint webhook publik dan signature nggak di-check.

### Pending vs paid

Midtrans punya dua state sukses: `settlement` (sudah masuk ke merchant balance, biasanya VA dan QRIS setelah customer scan) dan `capture` (kartu kredit yang sudah di-charge). Treat dua-duanya sebagai paid. State `pending` itu invoice masih nunggu customer aksi — jangan grant access ke customer sampai status berubah.

### Sandbox dulu

Pakai server key dan client key dari sandbox dashboard. Test card numbers ada di dashboard sandbox. Jangan deploy sebelum verify webhook handler kena tanpa CORS issue.

## Tone guide

- Bahasa Indonesia, `kamu` form di error message.
- Label tombol konkret: "Bayar Sekarang", bukan "Lanjutkan" atau "Pay".
- Loading state copy: "Menyiapkan pembayaran..." bukan spinner kosong.
- Error message kasih next step actionable. "Pembayaran gagal — kartu ditolak bank. Cek limit atau coba kartu lain."
- Zero exclamation marks.
