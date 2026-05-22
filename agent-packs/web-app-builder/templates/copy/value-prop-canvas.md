# Template — Value proposition canvas

Canvas dua sisi: customer profile (jobs / pains / gains) di kiri, value map (features / pain relievers / gain creators) di kanan. Dipakai sebelum kamu mulai nulis copy hero — supaya pesan landing-mu cocok dengan apa yang pengunjung benar-benar cari.

## Variables

- `{segment_name}` — nama segmen customer (contoh: "Freelance designer Jakarta", "Founder solo UMKM kuliner").
- `{customer_jobs[]}` — 3-5 pekerjaan yang segmen ini coba selesaikan (fungsional, sosial, atau emosional).
- `{customer_pains[]}` — 3-5 hal yang membuat pekerjaan itu menyakitkan (waktu, biaya, risiko, frustrasi).
- `{customer_gains[]}` — 3-5 hasil yang mereka harap atau mau dicapai (di luar required outcomes).
- `{product_features[]}` — 3-5 fitur produk kamu yang paling relevan untuk segmen ini.
- `{pain_relievers[]}` — 3-5 cara produk kamu mengurangi atau menghilangkan pain (map 1-ke-1 ke `{customer_pains[]}` kalau bisa).
- `{gain_creators[]}` — 3-5 cara produk kamu menghasilkan gain (map ke `{customer_gains[]}`).
- `{fit_score}` — penilaian fit (1-5), opsional, untuk dipakai saat membandingkan beberapa canvas.

## Template

```markdown
# Value Proposition Canvas — {segment_name}

## Customer Profile

### Customer Jobs (pekerjaan yang mau diselesaikan)
- {customer_jobs[0]}
- {customer_jobs[1]}
- {customer_jobs[2]}

### Pains (hambatan dan frustrasi)
- {customer_pains[0]}
- {customer_pains[1]}
- {customer_pains[2]}

### Gains (hasil yang diharapkan)
- {customer_gains[0]}
- {customer_gains[1]}
- {customer_gains[2]}

## Value Map

### Products & Features
- {product_features[0]}
- {product_features[1]}
- {product_features[2]}

### Pain Relievers (cara mengurangi pain)
- {pain_relievers[0]} — menanggapi: {customer_pains[0]}
- {pain_relievers[1]} — menanggapi: {customer_pains[1]}
- {pain_relievers[2]} — menanggapi: {customer_pains[2]}

### Gain Creators (cara menghasilkan gain)
- {gain_creators[0]} — menghasilkan: {customer_gains[0]}
- {gain_creators[1]} — menghasilkan: {customer_gains[1]}
- {gain_creators[2]} — menghasilkan: {customer_gains[2]}

## Fit assessment

- Pain → reliever coverage: {how many pains have a reliever}
- Gain → creator coverage: {how many gains have a creator}
- Overall fit score: {fit_score} / 5
- Catatan: {notes_on_misfit_or_priority}
```

Aturan praktis: kalau ada pain tanpa reliever, atau gain tanpa creator, itu titik kosong yang harus kamu putuskan — tambah fitur, atau cari segmen lain. Jangan dipaksakan.

## Tone guide

- Bahasa Indonesia, kamu form.
- Item canvas: kalimat lengkap, bukan satu kata. "Cari klien baru tanpa harus DM cold" jelas; "Akuisisi klien" terlalu abstrak.
- Pain: tulis dari sudut pandang customer. "Aku capek revisi 5 kali" bukan "Iterasi terlalu banyak".
- Gain: hasil konkret, bukan emosi umum. "Punya portfolio yang bisa di-share via WhatsApp" bukan "Lebih percaya diri".
- Pain reliever / gain creator: kata kerja yang menjelaskan mekanismenya, bukan klaim hasil. "Auto-generate PDF dari draft" bukan "Bikin proses lebih efisien".
- Zero exclamation marks. Hindari kata "solusi" — itu menutupi mekanisme.
