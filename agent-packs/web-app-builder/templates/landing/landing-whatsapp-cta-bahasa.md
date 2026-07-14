# Template — Landing page WhatsApp-first CTA (Bahasa)

Landing satu halaman untuk audiens Indonesia yang ngandelin WhatsApp sebagai jalur sales. Hero CTA langsung ke `wa.me/<nomor>` dengan pesan prefilled, bukan form email. Cocok untuk jasa, konsultasi, B2C UMKM, atau apa pun yang closing-nya lewat percakapan personal.

## Variables

- `{business_name}` — nama bisnis atau produk (string, 1-40 karakter).
- `{h1_headline}` — judul utama hero, 6-10 kata, klaim hasil konkret (string).
- `{subhead}` — satu kalimat 12-20 kata; jelasin untuk siapa dan kenapa relevan sekarang (string).
- `{wa_number_e164}` — nomor WhatsApp Business format E.164 tanpa tanda plus, contoh `6281234567890` (string, digit only).
- `{wa_prefill_message}` — pesan yang muncul di chat saat pengunjung klik, max 80 karakter, mulai dengan "Halo" (string).
- `{response_window}` — jam balasan, contoh "Senin-Jumat 09:00-17:00 WIB" (string).
- `{response_sla_minutes}` — janji response time dalam menit jam kerja, contoh `30` (integer).
- `{wa_business_verified}` — apakah akun WhatsApp Business sudah verified (centang hijau), boolean.
- `{social_proof_1}` — bukti sosial pertama, contoh "Sudah dipakai 240 UMKM di Jabodetabek" (string).
- `{social_proof_2}` — bukti sosial kedua, contoh nama media atau testimoni 6-8 kata (string).
- `{social_proof_3}` — bukti sosial ketiga, sama bentuk (string).
- `{secondary_cta_label}` — label tombol sekunder, contoh "Lihat contoh kerja" (string).
- `{secondary_cta_url}` — URL tombol sekunder (string).

## Page structure

### Hero

H1 dengan klaim hasil. Subhead satu kalimat. Di bawahnya dua tombol — tombol utama hijau WhatsApp, tombol sekunder netral.

Copy contoh:
- H1: "Bantu UMKM-mu pajak bulanan beres dalam 24 jam"
- Subhead: "Konsultan pajak berpengalaman, harga UMKM, percakapan via WhatsApp tanpa janjian dulu."

### CTA primary — WhatsApp

Tombol hijau dengan ikon WhatsApp. Klik buka chat ke `https://wa.me/{wa_number_e164}?text={url_encoded_prefill}`.

Label tombol: "Chat di WhatsApp" (bukan "Hubungi kami" — terlalu generic).

Di bawah tombol, baris kecil status response:
- "Balasan dalam {response_sla_minutes} menit, {response_window}"
- Kalau `{wa_business_verified}` true, tambah baris "Akun WhatsApp Business terverifikasi" + glyph centang.

```html
<a
  href="https://wa.me/{wa_number_e164}?text={url_encoded_prefill}"
  class="cta-whatsapp"
  rel="noopener"
>
  <svg class="icon-wa" aria-hidden="true"><!-- WhatsApp glyph --></svg>
  Chat di WhatsApp
</a>
<p class="response-window">
  Balasan dalam {response_sla_minutes} menit, {response_window}.
</p>
```

### CTA secondary

Tombol outline. Bisa buat "Lihat contoh kerja", "Baca FAQ", atau "Download brosur PDF". Jangan buat email — pengunjung yang udah scroll sejauh ini lebih siap chat.

### Social proof strip

Tiga slot, satu baris. Pakai angka spesifik atau nama yang dikenal. Hindari "ribuan pelanggan puas".

### Pricing tease (opsional)

Kalau bisnis punya harga jelas, tampilkan satu angka "Mulai Rp 250.000" dengan link "Lihat semua paket". Format IDR pakai titik thousand, tanpa desimal.

### FAQ — 4 pertanyaan

Wajib jawab:
1. Bayar lewat apa? (sebut Xendit / QRIS / transfer manual sesuai realita merchant)
2. Bisa minta invoice? (jawab ya/tidak + format PDF atau e-faktur)
3. Garansi atau refund? (sebut UU Perlindungan Konsumen 8/1999 kalau relevan)
4. Tim kamu siapa? (1-2 kalimat siapa yang bakal jawab di WhatsApp)

## Integration notes

### WhatsApp prefill encoding

Pesan harus di-URL-encode. Spasi jadi `%20`, baris baru `%0A`. Contoh:

```javascript
const phone = '6281234567890';
const message = 'Halo, saya mau tanya tentang paket pajak UMKM bulanan';
const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
```

### WhatsApp Business badge

Untuk centang hijau (Official Business Account), akun harus apply via Meta Business Suite. Bukan otomatis dari WhatsApp Business app — itu cuma label "Business", bukan verified. Jangan klaim "terverifikasi" kalau cuma pakai app gratisan.

### Response-time copy

Janji response time itu komitmen, bukan marketing. Kalau bilang "balasan dalam 30 menit", harus ada orang yang stand by. Pengunjung yang nunggu lebih dari janji bakal frustasi lebih dari kalau dari awal nggak dijanjiin.

Untuk bisnis solo, copy yang lebih aman: "Balasan biasanya dalam 1-2 jam jam kerja." Lebih jujur, tetap responsif.

### Tracking klik WhatsApp

WhatsApp link nggak bisa ditrack secara native. Pakai onclick event ke Google Tag Manager atau Plausible kalau perlu measure conversion:

```html
<a
  href="https://wa.me/{wa_number_e164}?text={prefill}"
  onclick="plausible('whatsapp_click')"
>
  Chat di WhatsApp
</a>
```

## Tone guide

- Bahasa Indonesia, `kamu` form.
- Hero: klaim hasil konkret dengan timeframe. "Pajak beres dalam 24 jam" bukan "Solusi pajak terpercaya".
- CTA WhatsApp: pakai kata kerja langsung. "Chat di WhatsApp" bukan "Klik di sini".
- Response copy: angka spesifik dengan jangka waktu. "30 menit jam kerja" bukan "secepatnya".
- FAQ: pertanyaan yang beneran ditanyain prospek, bukan promosi terselubung.
- Zero exclamation marks. Maks satu emoji di seluruh page.
