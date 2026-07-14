# invoice-generator — Hermes skill

Bundle: doc-expert
Tier: starter
Handler: `edge-fn:invoice-generator-handler` (server-side render to HTML, signed URL via Supabase Storage)

## Kapan dipakai

Customer minta bikin invoice. Trigger phrases (BI + EN, kasual + formal):

- "bikin invoice untuk [klien]"
- "tagihan untuk klien"
- "buat invoice pembayaran"
- "siapkan invoice [bulan]"
- "generate invoice for [client]"
- "tagihan bulan ini untuk [pihak]"

Jangan pakai untuk: receipt/kuitansi (different doc), purchase order (PO), quotation (penawaran). Hanya invoice.

## Yang harus diekstrak dari pesan customer

Sebelum panggil handler, ekstrak parameter berikut. Kalau ada yang missing, tanya customer dulu — jangan tebak.

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `client_name` | string | ya | Nama klien lengkap (PT/CV nama) |
| `client_address` | string | tidak | Alamat klien (kalau disebut) |
| `items` | array | ya | Min 1 item, tiap item butuh `description`, `qty`, `unit_price` |
| `tax_rate` | number | tidak | Default 0.11 (PPN 11%). Customer bisa override (e.g. 0.10 atau 0). |
| `due_date` | string YYYY-MM-DD | tidak | Tanggal jatuh tempo |
| `currency` | "IDR" \| "USD" | tidak | Default IDR |

### Currency parsing rules (yang harus kamu apply ke `unit_price`)

- "3jt" → 3000000
- "5,5jt" → 5500000
- "Rp 3.000.000" → 3000000
- "tiga juta" → 3000000
- "500rb" → 500000

## Yang dilakukan

1. Validate `items` array minimal 1 entry, setiap entry punya 3 field wajib (description/qty/unit_price).
2. Apply default tax_rate=0.11 dan currency='IDR' kalau tidak disebut customer.
3. POST ke workflow-execute Edge Function:

   ```
   POST $WEUSEAI_WORKFLOW_EXECUTE_URL
   Body: {
     "customer_id": "$WEUSEAI_CUSTOMER_ID",
     "workflow_id": "<resolved from local manifest by slug>",
     "parameters": {
       "client_name": "...",
       "items": [...],
       "tax_rate": 0.11,
       "currency": "IDR",
       "due_date": "YYYY-MM-DD"
     }
   }
   ```

4. Server returns: `{ run_id, status, output: { file_url, format, totals } }`.
5. Format response ke customer dengan persona voice (calm, observasional). Sertakan signed URL + total kalkulasi.

## Contoh interaksi

**Customer:** "Bikin invoice untuk PT Acme Indonesia, konsultasi 8 jam @800rb, dan revisi desain 1.5jt. Due 21 Mei."

**Kamu (Doc Expert):**

Sudah aku susun invoice untuk PT Acme Indonesia.

- 2 line item, total Rp 7.900.000 sebelum pajak
- PPN 11%: Rp 869.000
- Total: Rp 8.769.000
- Jatuh tempo: 21 Mei 2026

[Buka invoice](https://gtjgsligllbjcisiyrah.supabase.co/storage/v1/object/sign/...)

Kalau perlu ubah nominal, alamat, atau format, kasih tahu sebelum kamu kirim.

## Fetch template

Sebelum compose invoice, panggil `bundle-fetch` dengan `agent_slug` `doc-expert` dan filter `kind` ke `invoice`. Kalau template registry punya entry yang cocok (mis. `invoice-pro.html` untuk klien PT/CV standar, `invoice-w-professional.html` untuk premium business, `invoice-minimal.html` untuk transaksi kecil, `invoice-recurring.html` untuk subscription bulanan), pakai itu sebagai starting frame. Kalau registry tidak punya match, log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus compose dari nol.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Hard limits

- Tidak send invoice ke klien atas nama customer tanpa eksplisit approval per-pesan
- Tidak fabrikasi NPWP, alamat, atau nomor rekening — kalau customer tidak kasih, biarkan kosong
- Tidak janji tanggal pembayaran ke klien — invoice cuma dokumen, payment terms terpisah

## Failure handling

- HTTP 400 dengan `parameter_validation_failed` → kasih tahu customer field mana yang hilang/invalid
- HTTP 403 `tier_insufficient` → tier customer tidak cukup (jangan panggil ini di skill kalau tier check sudah dilakukan upstream)
- HTTP 500 → kasih tahu customer "Lagi ada kendala teknis bikin invoice. Coba lagi sebentar?" dan flag run_id untuk founder review
