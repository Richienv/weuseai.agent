# Template — Checkout DOKU Jokul / DOKU PayPro

Halaman checkout terintegrasi DOKU (sekarang dipasarkan sebagai Jokul atau DOKU PayPro). Pattern untuk merchant Indonesia yang sudah punya kontrak DOKU — biasanya merchant lama, partner ride-hailing, atau enterprise yang switching cost ke gateway lain mahal. DOKU punya keunggulan di Virtual Account multi-bank dan settlement T+1 ke rekening Indonesia.

## Variables

- `{order_id}` — internal order ID kamu, unik per checkout (string).
- `{invoice_number}` — invoice number yang dikirim ke DOKU, biasanya `INV-{order_id}` (string, max 64 karakter).
- `{customer_email}` — email pembeli (string).
- `{customer_name}` — nama pembeli (string, 1-80 karakter).
- `{customer_phone}` — nomor HP format `+628...` (string).
- `{customer_id_number}` — opsional, NIK pembeli untuk transaksi besar (string, 16 digit kalau diisi).
- `{amount_idr}` — total dalam IDR integer, contoh `499000` (integer, min 10000 untuk DOKU).
- `{line_items}` — array `[{name, qty, price, sku}]`. Total = sum(qty * price) harus match amount_idr.
- `{currency}` — selalu `IDR`.
- `{callback_url}` — webhook URL kamu untuk notifikasi status (string).
- `{redirect_url_success}` — URL setelah pembayaran sukses (string).
- `{redirect_url_failed}` — URL kalau gagal (string).
- `{merchant_id}` — DOKU merchant ID dari dashboard (string).
- `{client_id}` — DOKU client ID (string, publik).
- `{is_production}` — boolean, false untuk sandbox.

## Page structure

### Order summary

Sama dengan template Xendit dan Midtrans. Item, subtotal, PPN, total. Format IDR `Rp 499.000`.

### Payment method selector (DOKU-specific)

DOKU support:
1. **Virtual Account** — BCA, Mandiri, BRI, BNI, Permata, CIMB Niaga, Maybank, Sinarmas, Danamon. DOKU strong di sini.
2. **QRIS** — single QR code semua wallet.
3. **E-wallet** — OVO, DANA, LinkAja, ShopeePay.
4. **Kartu Kredit/Debit** — Visa, Mastercard, JCB, Amex.
5. **Convenience store** — Alfamart, Indomaret. Cocok buat audiens unbanked di kota-kota tier-2.
6. **Direct debit** — BCA Klikpay, Mandiri Clickpay (lawas tapi masih dipakai).

Urutan rekomendasi: QRIS → VA (default expanded ke BCA) → E-wallet → Alfamart/Indomaret → Kartu Kredit.

Note unik DOKU: Alfamart/Indomaret berguna karena masih ada audiens (terutama daerah) yang nggak punya rekening atau e-wallet — bayar tunai di kasir mini-market. Conversion rate-nya kecil tapi non-zero, dan competitor sering skip.

### CTA

Tombol "Bayar Sekarang" — redirect ke DOKU hosted checkout page atau trigger Jokul Checkout JavaScript widget tergantung mode integrasi.

### Trust strip

- "Pembayaran diproses DOKU"
- "PCI DSS Level 1 certified"
- "Refund sesuai UU Perlindungan Konsumen 8/1999"
- Nomor WhatsApp support

## Integration notes

### Mode integrasi DOKU

DOKU punya dua mode utama:

1. **Jokul Checkout (hosted)** — customer redirect ke page DOKU. Paling cepat setup, PCI compliance handled DOKU.
2. **Jokul Direct API** — kamu host UI sendiri, call DOKU API langsung. Butuh PCI compliance lebih ketat di sisi kamu. Cocok kalau brand experience harus seamless.

Template ini fokus ke Jokul Checkout (mode hosted) — itu pattern yang paling sering dipakai merchant baru.

### Server-side: create payment

DOKU pakai signature SHA256 HMAC. Setiap request butuh signature di header.

```javascript
import { createHmac, createHash } from 'crypto'

const baseUrl = isProduction
  ? 'https://api.doku.com'
  : 'https://api-sandbox.doku.com'

const path = '/checkout/v1/payment'
const requestTime = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14) + 'Z'
const requestId = crypto.randomUUID()

const body = {
  order: {
    invoice_number: invoiceNumber,
    amount: amountIdr,
    line_items: lineItems,
    currency: 'IDR',
    callback_url: callbackUrl,
    callback_url_cancel: redirectUrlFailed,
  },
  payment: {
    payment_due_date: 60, // minutes
    payment_method_types: [
      'VIRTUAL_ACCOUNT_BCA',
      'VIRTUAL_ACCOUNT_BANK_MANDIRI',
      'VIRTUAL_ACCOUNT_BANK_RAKYAT_INDONESIA',
      'VIRTUAL_ACCOUNT_BNI',
      'QRIS',
      'EMONEY_OVO',
      'EMONEY_DANA',
      'EMONEY_LINKAJA',
      'EMONEY_SHOPEEPAY',
      'ONLINE_TO_OFFLINE_ALFA',
      'ONLINE_TO_OFFLINE_INDOMARET',
      'CREDIT_CARD',
    ],
  },
  customer: {
    name: customerName,
    email: customerEmail,
    phone: customerPhone,
  },
}

// DOKU signature: HMAC-SHA256 of (client_id + request_id + request_timestamp + digest)
// where digest = SHA256(body) base64
const bodyString = JSON.stringify(body)
const digest = createHash('sha256').update(bodyString).digest('base64')
const stringToSign = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTime}\nRequest-Target:${path}\nDigest:${digest}`
const signature = 'HMACSHA256=' + createHmac('sha256', secretKey).update(stringToSign).digest('base64')

const response = await fetch(baseUrl + path, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Client-Id': clientId,
    'Request-Id': requestId,
    'Request-Timestamp': requestTime,
    'Signature': signature,
  },
  body: bodyString,
})

const { response: dokuResp } = await response.json()
// dokuResp.payment.url = hosted checkout URL
// Redirect customer to dokuResp.payment.url
```

### Webhook (notification) verification

DOKU POST notifikasi balik ke `callback_url`. Verify signature pakai pola yang sama — header `Signature`, regenerate dari body + header `Request-Id` + `Request-Timestamp`.

```javascript
const incomingSig = req.headers['signature']
const digest = createHash('sha256').update(JSON.stringify(req.body)).digest('base64')
const stringToSign = `Client-Id:${process.env.DOKU_CLIENT_ID}\nRequest-Id:${req.headers['request-id']}\nRequest-Timestamp:${req.headers['request-timestamp']}\nRequest-Target:/your/webhook/path\nDigest:${digest}`
const expected = 'HMACSHA256=' + createHmac('sha256', process.env.DOKU_SECRET_KEY).update(stringToSign).digest('base64')

if (incomingSig !== expected) {
  return res.status(401).json({ error: 'invalid_signature' })
}
```

### Alfamart/Indomaret quirk

Status `PENDING` untuk Alfamart/Indomaret bisa bertahan sampai 24 jam karena customer harus pergi ke kasir untuk bayar. Set expectation di UI: "Bayar di kasir Alfamart/Indomaret dalam 24 jam. Status order akan update otomatis setelah pembayaran terverifikasi."

Jangan auto-cancel order Alfamart/Indomaret di bawah 24 jam — itu cara cepet kehilangan audiens daerah.

### Settlement

DOKU settlement T+1 ke rekening Indonesia (BCA, Mandiri, dll). Tidak ada biaya cross-border karena semua transaksi domestik. Beda dengan Xendit/Midtrans yang juga T+1 tapi pricing structure beda — kalau merchant sudah punya kontrak DOKU, biasanya alasannya pricing untuk volume tertentu.

### Sandbox dulu

DOKU sandbox di `https://api-sandbox.doku.com`. Dashboard sandbox terpisah dari production — credentials beda. Test VA bisa di-mark "paid" manual dari dashboard simulator.

## Tone guide

- Bahasa Indonesia, `kamu` form di error message.
- Label metode pakai brand resmi: "BCA Virtual Account" bukan "Bank Central Asia VA".
- Alfamart/Indomaret instruction harus eksplisit langkah-langkah, audiens unbanked nggak familiar dengan flow checkout digital. Contoh: "1. Catat nomor pembayaran. 2. Datang ke kasir Alfamart terdekat. 3. Sebut 'bayar DOKU' dan kasih nomor pembayaran."
- Loading state: "Menyiapkan pembayaran DOKU..."
- Zero exclamation marks.
