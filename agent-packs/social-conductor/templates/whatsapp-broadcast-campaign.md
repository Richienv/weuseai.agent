# Template — WhatsApp broadcast campaign

> Dipakai `campaign-planner` atau `post-drafter` saat customer butuh kirim broadcast WA ke list pelanggan. Mengikuti Meta WhatsApp Business API conventions: header + body + footer + CTA, kategori jelas (marketing / utility / authentication), opt-in wajib (UU PDP 27/2022 + Meta policy), frekuensi max 1x per minggu untuk marketing supaya nggak kena block, opt-out path eksplisit ("balas STOP").

---

## Variables

| Variable | Wajib | Notes |
|---|---|---|
| `{category}` | ya | `marketing` / `utility` / `authentication` — menentukan rate limit + approval flow |
| `{header_text}` | tidak | Optional, max 60 karakter. Title bold di top message |
| `{body_text}` | ya | Inti pesan. Max 1024 karakter. Personalize dengan `{{1}}` placeholder untuk nama |
| `{footer_text}` | tidak | Optional, max 60 karakter. Disclaimer atau brand line |
| `{cta_buttons[]}` | tidak | Max 3 buttons: quick reply atau URL action |
| `{opt_out_line}` | ya | Wajib selalu disertakan — "Balas STOP buat berhenti dapat pesan ini" |
| `{send_schedule}` | ya | Hari + jam target. Max 1x/minggu untuk marketing |

---

## Template

### Format Meta WhatsApp Business API (template message structure)

```
HEADER: {header_text}
BODY: {body_text}
FOOTER: {footer_text}
BUTTONS: [{cta_button_1}] [{cta_button_2}] [{cta_button_3}]
```

### Render-out example (kategori = marketing, promo Harbolnas)

```
HEADER: Harbolnas 12.12 di {{brand_name}}

BODY:
Halo kak {{1}}.

Harbolnas 12.12 udah mulai. Diskon sampai 50% untuk produk pilihan, gratis ongkir minimal pembelian Rp 150.000.

Promo berlaku 12 Desember 2026 saja. Stok terbatas, dulu-duluan.

Cek koleksi di link bawah.

FOOTER: Promo s/d 12 Des 2026

BUTTONS:
[Lihat Promo] (URL: https://brand.id/harbolnas)
[Hubungi CS] (Quick reply)

---

Balas STOP buat berhenti dapat pesan ini.
```

### Render-out example (kategori = utility, konfirmasi pemesanan)

```
HEADER: Pesanan #{{1}} dikonfirmasi

BODY:
Halo kak {{2}}.

Pesanan kamu udah kami terima dan sedang diproses.

- Nomor pesanan: #{{1}}
- Total: Rp {{3}}
- Estimasi tiba: {{4}}

Kami akan kabari lagi saat pesanan dikirim. Kalau ada pertanyaan, balas pesan ini.

FOOTER: {{brand_name}} — Terima kasih

BUTTONS:
[Lacak Pesanan] (URL: https://brand.id/track/{{1}})

---

Balas STOP buat berhenti dapat notifikasi pesanan.
```

### Render-out example (kategori = authentication, OTP)

```
BODY:
Kode verifikasi kamu: {{1}}

Kode berlaku 5 menit. Jangan share kode ini ke siapapun, termasuk yang ngaku dari {{brand_name}}.

FOOTER: {{brand_name}} — Pesan otomatis
```

---

## Reference packet — Meta WA Business API + UU PDP compliance

### Kategori template (Meta classification)

| Kategori | Use-case | Rate limit | Approval Meta |
|---|---|---|---|
| `marketing` | Promo, penawaran, campaign launch | Per-customer rolling 7-day cap (Meta scoring) | Wajib approval template |
| `utility` | Konfirmasi order, status pengiriman, reminder appointment | Lebih longgar, tetap rate-limited | Wajib approval template |
| `authentication` | OTP, kode verifikasi | Limit ketat, tidak boleh promo | Wajib approval template, format khusus |

### Opt-in wajib (UU PDP 27/2022 Pasal 22 + Meta policy)

- Pelanggan harus eksplisit consent dapat broadcast — checkbox di form, atau balas YES di message pertama
- Consent harus tercatat (timestamp, source, IP) — bisa di-audit kalau ada complaint
- Consent boleh dicabut kapan saja — opt-out path wajib di setiap pesan

### Frekuensi broadcast (anti-block guidance)

- **Marketing:** max 1x per minggu per kontak. Lebih sering = report-spam tinggi, Meta drop quality score, broadcast diblokir
- **Utility:** sesuai kebutuhan transaksi (order update, reminder)
- **Authentication:** sesuai trigger (OTP request)

### Opt-out path (wajib di footer atau body)

- Frase recommended: "Balas STOP buat berhenti dapat pesan ini."
- Variant: "Reply STOP to unsubscribe" (kalau audience bilingual)
- Customer balas STOP → harus auto-removed dari list dalam 24 jam (Meta requirement)
- Variasi keyword: STOP, BERHENTI, UNSUBSCRIBE — sistem wajib handle ketiga

### UU PDP 27/2022 disclosure pointer

- Brand harus punya privacy policy yang declare WhatsApp digunakan untuk komunikasi pelanggan
- Data nomor WA = data pribadi (PDP Art. 1.1). Penyimpanan harus aman, akses terbatas
- Pelanggan berhak request data deletion (PDP Art. 9). Workflow harus support

---

## Tone guide — WhatsApp broadcast Indonesia

- **Sapaan "kak":** default untuk audience umum Indonesia. "Pak / Bu" kalau audience corporate atau formal
- **Personalize dengan nama:** `Halo kak {{1}}` — Meta template variable. Hindari "Halo customer" generic
- **Body singkat:** WA bukan email. 3-5 kalimat max. Long-form push ke link
- **IDR formatting:** `Rp 150.000` dengan titik thousand. Bukan `Rp150000` atau `IDR 150000`
- **Tanggal Indonesia format:** "12 Desember 2026" atau "12 Des 2026". Bukan ISO atau US format
- **Zero exclamation marks:** termasuk di header. Calm-premium register applies
- **Bahasa Indonesia primary:** mixing English boleh untuk technical term (CS, OTP, link), body utama BI
- **Footer disclaimer singkat:** brand name + tagline pendek atau periode promo. Bukan paragraph T&C

---

## BANNED di WhatsApp broadcast (compliance + voice)

- `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`
- Exclamation marks (semua kategori)
- Caps lock berlebih di body (terbaca shouting / phishing-like)
- Frase yang trigger Meta spam filter: "MENANG HADIAH", "TRANSFER SEKARANG", "KLAIM SEGERA" (terlihat scam)
- Link shortener pihak ketiga (bit.ly, tinyurl) — Meta penalize. Pakai domain brand langsung
- Send tanpa opt-in tercatat (UU PDP + Meta violation)
- Frekuensi marketing >1x/minggu per kontak (block risk)

---

## Validation rules (skill-side)

- Kategori harus didefinisikan sebelum draft (marketing / utility / authentication)
- Opt-out line wajib ada (auto-inject kalau tidak ditulis)
- Body ≤1024 karakter (Meta hard limit)
- Header ≤60 karakter
- Footer ≤60 karakter
- Buttons max 3 (Meta hard limit)
- Schedule send untuk marketing wajib check: last broadcast ke kontak ini ≥7 hari lalu
- Personalisasi `{{1}}`, `{{2}}` placeholder wajib dimap ke field DB (nama, no order, dst)
- IDR formatted dengan titik thousand
- Voice-fit score terhadap locked profile sebelum approval
