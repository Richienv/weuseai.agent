# Template — Pricing section

Block pricing tiga tier dengan slot recommended-badge, tautan FAQ, dan strip jaminan. Dipakai saat landing page kamu butuh halaman harga yang terbaca cepat di mobile tanpa pengunjung harus zoom-in.

## Variables

- `{tier_1_name}`, `{tier_2_name}`, `{tier_3_name}` — nama tier (contoh: "Starter", "Pro", "Studio").
- `{tier_1_price}`, `{tier_2_price}`, `{tier_3_price}` — harga dengan unit (contoh: "Rp 99rb/bulan", "Rp 1,2jt sekali bayar").
- `{tier_1_tagline}`, `{tier_2_tagline}`, `{tier_3_tagline}` — satu kalimat siapa yang cocok di tier ini.
- `{tier_1_features[]}`, `{tier_2_features[]}`, `{tier_3_features[]}` — 5-7 fitur per tier, bullet pendek, hasil bukan fitur teknis.
- `{tier_1_cta}`, `{tier_2_cta}`, `{tier_3_cta}` — label tombol per tier (contoh: "Pilih Starter").
- `{tier_1_cta_url}`, `{tier_2_cta_url}`, `{tier_3_cta_url}` — URL checkout per tier.
- `{recommended_tier}` — tier yang dapat badge — nilai `1`, `2`, atau `3`. Kosongkan kalau tidak ada rekomendasi.
- `{recommended_label}` — teks badge, maks 3 kata (contoh: "Paling populer", "Pilihan founder").
- `{faq_url}` — tautan ke section FAQ atau halaman FAQ terpisah.
- `{guarantee_text}` — teks jaminan, satu kalimat (contoh: "Garansi 7 hari uang kembali kalau hasilnya tidak cocok.").

## Template

```html
<section class="pricing">
  <h2>Harga yang transparan</h2>

  <div class="tier-grid">
    <!-- Tier 1 -->
    <div class="tier {recommended_tier == 1 ? 'tier-featured' : ''}">
      {recommended_tier == 1 ? '<span class="badge">{recommended_label}</span>' : ''}
      <h3>{tier_1_name}</h3>
      <p class="price">{tier_1_price}</p>
      <p class="tagline">{tier_1_tagline}</p>
      <ul class="features">
        <!-- isi 5-7 baris dari {tier_1_features[]} -->
        <li>{tier_1_features[0]}</li>
        <li>{tier_1_features[1]}</li>
        <li>{tier_1_features[2]}</li>
        <li>{tier_1_features[3]}</li>
        <li>{tier_1_features[4]}</li>
      </ul>
      <a href="{tier_1_cta_url}" class="cta">{tier_1_cta}</a>
    </div>

    <!-- Tier 2 -->
    <div class="tier {recommended_tier == 2 ? 'tier-featured' : ''}">
      {recommended_tier == 2 ? '<span class="badge">{recommended_label}</span>' : ''}
      <h3>{tier_2_name}</h3>
      <p class="price">{tier_2_price}</p>
      <p class="tagline">{tier_2_tagline}</p>
      <ul class="features">
        <li>{tier_2_features[0]}</li>
        <li>{tier_2_features[1]}</li>
        <li>{tier_2_features[2]}</li>
        <li>{tier_2_features[3]}</li>
        <li>{tier_2_features[4]}</li>
        <li>{tier_2_features[5]}</li>
      </ul>
      <a href="{tier_2_cta_url}" class="cta">{tier_2_cta}</a>
    </div>

    <!-- Tier 3 -->
    <div class="tier {recommended_tier == 3 ? 'tier-featured' : ''}">
      {recommended_tier == 3 ? '<span class="badge">{recommended_label}</span>' : ''}
      <h3>{tier_3_name}</h3>
      <p class="price">{tier_3_price}</p>
      <p class="tagline">{tier_3_tagline}</p>
      <ul class="features">
        <li>{tier_3_features[0]}</li>
        <li>{tier_3_features[1]}</li>
        <li>{tier_3_features[2]}</li>
        <li>{tier_3_features[3]}</li>
        <li>{tier_3_features[4]}</li>
        <li>{tier_3_features[5]}</li>
        <li>{tier_3_features[6]}</li>
      </ul>
      <a href="{tier_3_cta_url}" class="cta">{tier_3_cta}</a>
    </div>
  </div>

  <div class="guarantee-strip">
    <p>{guarantee_text}</p>
    <a href="{faq_url}">Baca FAQ harga</a>
  </div>
</section>
```

Urutan fitur per tier: hasil dulu, baru detail teknis. Pengunjung scan dari atas — taruh yang paling penting di posisi pertama.

## Tone guide

- Bahasa Indonesia, kamu form.
- Harga: tulis lengkap dengan unit dan periode. Hindari "mulai dari" tanpa angka konkret.
- Fitur: tulis sebagai hasil yang pengunjung dapatkan, bukan fitur teknis. "Domain custom siap pakai", bukan "DNS auto-config".
- Tagline tier: sebut siapa yang cocok, bukan apa yang dapat. "Buat freelancer yang baru mulai", bukan "Paket entry-level dengan limit dasar".
- Badge "recommended": satu tier saja, jangan dua. Kalau tidak yakin tier mana, kosongkan.
- Jaminan: spesifik dengan jangka waktu dan syarat. Hindari "puas atau uang kembali" tanpa konteks.
- Zero exclamation marks.
