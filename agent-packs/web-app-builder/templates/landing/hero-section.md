# Template — Hero section

Block hero satu halaman: judul tebal, subhead jelas, dua CTA berbeda berat, slot visual, dan tiga bukti sosial. Dipakai saat kamu mau membuka landing page apa pun — SaaS, agency, course, atau e-commerce — tanpa harus susun ulang struktur tiap kali.

## Variables

- `{h1_headline}` — judul utama, 6-10 kata, klaim hasil yang kamu janjikan ke pengunjung.
- `{subhead}` — satu kalimat, 12-20 kata, penjelasan singkat untuk siapa produknya dan kenapa relevan sekarang.
- `{primary_cta_label}` — teks tombol utama, kata kerja, maks 3 kata (contoh: "Mulai sekarang", "Lihat demo").
- `{primary_cta_url}` — URL tujuan tombol utama (checkout, signup, atau halaman demo).
- `{secondary_cta_label}` — teks tombol sekunder, lebih ringan (contoh: "Lihat contoh", "Baca FAQ").
- `{secondary_cta_url}` — URL tujuan tombol sekunder.
- `{visual_placeholder_alt}` — deskripsi visual hero — screenshot produk, foto founder, atau ilustrasi.
- `{social_proof_1}`, `{social_proof_2}`, `{social_proof_3}` — bukti sosial pendek, satu baris per slot (jumlah customer, nama media, atau quote 6-8 kata).

## Template

```html
<section class="hero">
  <div class="hero-copy">
    <h1>{h1_headline}</h1>
    <p class="subhead">{subhead}</p>

    <div class="cta-row">
      <a href="{primary_cta_url}" class="cta-primary">{primary_cta_label}</a>
      <a href="{secondary_cta_url}" class="cta-secondary">{secondary_cta_label}</a>
    </div>

    <ul class="social-proof">
      <li>{social_proof_1}</li>
      <li>{social_proof_2}</li>
      <li>{social_proof_3}</li>
    </ul>
  </div>

  <div class="hero-visual">
    <!-- {visual_placeholder_alt} -->
  </div>
</section>
```

Catatan urutan: judul dulu, subhead di bawahnya, baru CTA. Bukti sosial menyusul di bawah CTA — ini posisi yang dibaca pengunjung setelah mereka mempertimbangkan klik, bukan sebelum.

## Tone guide

- Bahasa Indonesia primer, kamu form.
- Judul: klaim hasil yang konkret, bukan slogan. Hindari kata "solusi", "platform", "ekosistem".
- Subhead: satu kalimat, satu ide. Sebut siapa target pengunjungnya supaya orang yang bukan target bisa pergi.
- CTA primary: kata kerja yang menggerakkan ke aksi (mulai, lihat, coba). CTA secondary: ajakan yang lebih ringan (baca, pelajari).
- Bukti sosial: angka spesifik atau nama yang dikenal. Hindari "ribuan customer puas" — itu klise.
- Zero exclamation marks. Maks satu emoji di seluruh section, dan cuma kalau memang menambah arti.
