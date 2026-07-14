# Integration preflight — shared handshake

## Kapan dipakai

Setiap kali skill integrasi pihak ketiga (Xendit, WhatsApp, OnlinePajak) hendak melakukan operasi atas nama pelanggan. Preflight WAJIB dijalankan dulu sebelum operasi inti.

Skill yang mengandalkan preflight ini:
- `/xendit` — pembayaran, invoice, refund
- `/whatsapp` — pesan, template, broadcast (deferred Phase 2)
- `/pajak` — e-faktur, SPT, BPE (deferred Phase 3)

## Yang dilakukan

### Langkah 1 — Cek status kredensial

Panggil:

```
GET /integration-credentials/<integration>
Headers:
  X-CID: <customer_id>
  Authorization: Bearer <hmac_customer_token>
```

Tiga kemungkinan respons:

| Status | Arti | Tindakan |
|---|---|---|
| `200` body `{ configured: true, last_validated_at, ... }` | Kredensial aktif | Lanjut ke operasi inti |
| `404` body `{ configured: false }` | Belum konek | Tampilkan flow onboarding (lihat Langkah 2a) |
| `410` body `{ configured: false, revoked_at }` | Pelanggan sudah revoke | Tampilkan flow re-onboarding (lihat Langkah 2b) |

### Langkah 2a — Onboarding pertama kali

Sampaikan ke pelanggan dengan voice calm-premium:

> Untuk pakai fitur <nama_fitur>, kamu butuh hubungkan akun <integration> dulu.
>
> Buka pengaturan akun <integration> kamu, salin API key, lalu paste di sini.

Setelah pelanggan mengirim API key via Telegram:

```
POST /integration-credentials/<integration>
Headers:
  X-CID: <customer_id>
  Authorization: Bearer <hmac_customer_token>
Body: { "api_key": "<paste>", "label": "<opsional, mis. 'Xendit Live'>" }
```

Sukses → `200 { configured: true, last_validated_at }`. Lanjut ke operasi inti.
Gagal → tampilkan `message_bahasa` dari respons (sudah dimapping di backend, jangan terjemahkan ulang).

### Langkah 2b — Re-onboarding setelah revoke

Hampir sama dengan 2a, tapi tone-nya beda:

> Akun <integration> kamu sebelumnya sudah dilepas. Mau hubungkan ulang?
>
> Paste API key terbaru di sini.

Flow `POST` setelah pelanggan kirim key — sama persis dengan 2a.

### Langkah 3 — Operasi inti

Setelah preflight `200`, panggil endpoint operasi:

```
POST /integration-proxy-<integration>
Headers:
  X-CID: <customer_id>
  Authorization: Bearer <hmac_customer_token>
Body: { "operation": "<nama_operasi>", "params": { ... } }
```

Respons standar:
- Sukses: `200 { ok: true, data: {...} }`
- Gagal mapped: `4xx/5xx { ok: false, code, message_bahasa, suggested_action? }`

**Tampilkan `message_bahasa` apa adanya — jangan parafrase, jangan tambah emoji, jangan tambah tanda seru.**

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue") kecuali skill itu sendiri override (mis. `/business-agent` pakai "Anda" untuk konteks bisnis formal)
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh pelanggan
- Tidak ada error code numerik (401, 500) atau acronim tech (OAuth, JWT, HMAC) bocor ke pelanggan
- Kalimat pendek. Satu ide per kalimat
- Zero exclamation marks

## Logging

Setiap operasi inti otomatis dicatat ke `audit_log` server-side dengan:
- `customer_id` — siapa
- `action = "<integration>.<operation>"` — apa
- `result = ok | error` — bagaimana
- `meta` — sanitized (no PII)

Skill tidak perlu logging sendiri. Server-side handler sudah ngurus.

## Revocation

Pelanggan bisa revoke kapan saja via:

> "Lepas integrasi <nama>"

Skill panggil:

```
DELETE /integration-credentials/<integration>
Headers:
  X-CID: <customer_id>
  Authorization: Bearer <hmac_customer_token>
```

Idempotent. Sukses → konfirmasi singkat: "Akun <integration> kamu sudah dilepas. Hubungkan lagi kapan saja."
