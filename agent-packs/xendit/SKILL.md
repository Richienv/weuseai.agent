# Xendit payments — pack entrypoint

## Kapan dipakai

Pelanggan minta sesuatu yang menyentuh pembayaran via Xendit:

- "Buat invoice / tagihan untuk <buyer>"
- "Kirim link pembayaran ke <kontak>"
- "Cek status pembayaran invoice <id>"
- "Refund pembelian <id>"
- "Cek saldo Xendit kamu"

## Voice signature

- Bahasa Indonesia, "kamu"
- Calm-premium, satu ide per kalimat
- Tidak ada acronym tech (HMAC, API, OAuth) yang bocor ke pelanggan
- Tidak ada error code numerik. Semua error pakai `message_bahasa` dari respons proxy

## Preflight

Sebelum operasi inti, jalankan preflight standar dari `_shared/skills/integration-preflight/SKILL.md`:

```
GET /integration-credentials/xendit
Headers: X-CID, Authorization: Bearer
```

- `200` → kredensial aktif, lanjut
- `404` → onboarding pertama kali, ikuti Langkah 2a preflight
- `410` → revoked, ikuti Langkah 2b preflight

## Operasi yang sudah jalan

### `invoice.create` — buat invoice baru

Required params: `external_id`, `amount` (IDR int), `description` (Bahasa).
Optional: `payer_email`, `invoice_duration` (detik, default 86400 = 24 jam), `success_redirect_url`, `failure_redirect_url`, `items`.

```
POST /integration-proxy-xendit
Body: { "operation": "invoice.create", "params": { ... } }
```

Respons sukses: `{ ok: true, data: { id, invoice_url, status, expiry_date } }`.

**Setelah sukses:** sampaikan ke pelanggan dengan format singkat:

> Invoice siap. Link pembayaran:
> <invoice_url>
>
> Berlaku 24 jam. Aku kabari kalau sudah dibayar.

### `invoice.get` — cek status invoice

Required params: `invoice_id`.

```
Body: { "operation": "invoice.get", "params": { "invoice_id": "inv-001" } }
```

Respons: `{ ok: true, data: { status, paid_at?, amount } }`.

Status enum dari Xendit: `PENDING` | `PAID` | `SETTLED` | `EXPIRED`. Mapping Bahasa ke pelanggan:

| Status | Sampaikan |
|---|---|
| PENDING | "Belum dibayar." |
| PAID | "Sudah dibayar. Dana sedang diproses Xendit." |
| SETTLED | "Sudah dibayar dan sudah masuk ke akun kamu." |
| EXPIRED | "Sudah kadaluarsa. Mau aku buatkan invoice baru?" |

### `refund.create` — initiate refund

Required params: `invoice_id`, `amount` (IDR int, partial atau full).
Optional: `reason` (default `OTHERS`).

```
Body: { "operation": "refund.create", "params": { "invoice_id": "inv-001", "amount": 50000 } }
```

Respons: `{ ok: true, data: { id, status, amount } }`.

**Catatan:** refund tidak otomatis untuk channel cash (Indomaret / Alfamart). Kalau Xendit balik `REFUND_NOT_SUPPORTED_BY_CHANNEL`, sampaikan ke pelanggan: "Refund untuk pembayaran tunai harus diproses manual. Aku siapkan instruksi step-by-step kalau kamu mau."

### `balance.get` — cek saldo

Optional params: `account_type` (default `CASH`).

```
Body: { "operation": "balance.get", "params": {} }
```

Respons: `{ ok: true, data: { balance, account_type } }`.

Format Bahasa ke pelanggan: "Saldo Xendit kamu Rp <balance>." (gunakan `Intl.NumberFormat('id-ID')` style separator).

## Operasi yang belum ada (next cascade)

Skill ini akan extended dengan:

- `invoice.send_link` — kirim link invoice langsung via Telegram ke kontak pelanggan
- `webhook.receive` — handler untuk Xendit webhook → notifikasi pelanggan saat invoice dibayar
- `payout.create` — disbursement ke rekening / e-wallet vendor
- `recurring.plan_create` — subscription plan management

Trigger build: setelah Xendit live ≥ 14 hari + ada feedback pelanggan.

## Revocation

Pelanggan boleh lepas integrasi kapan saja:

> "Lepas integrasi Xendit"

Skill panggil:

```
DELETE /integration-credentials/xendit
```

Konfirmasi: "Akun Xendit kamu sudah dilepas. Hubungkan lagi kapan saja."

## Compliance reminder

- Setiap operasi otomatis dicatat di audit log server-side (no PII)
- Plaintext API key tidak pernah masuk ke VPS pelanggan
- Pelanggan bertanggung jawab atas data buyer mereka (UU PDP processor relationship)
