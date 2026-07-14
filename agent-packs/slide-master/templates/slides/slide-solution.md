# Template — Slide Solution (Single Slide)

Audience: kamu sedang draft satu slide solusi untuk deck yang lebih besar. Use case: slide solution stand-alone — janji satu kalimat, 3 bullet bagaimana, dan placeholder visual produk. Scope: satu slide saja, slot ke deck pitch / sales / internal.

## Variables

- `{{solution_promise}}` — janji solusi dalam satu kalimat outcome (bukan feature)
- `{{how_bullet_1}}` — langkah 1 cara solusi bekerja (kata kerja, ringkas)
- `{{how_bullet_2}}` — langkah 2
- `{{how_bullet_3}}` — langkah 3
- `{{visual_kind}}` — jenis visual: "product-screenshot" / "3-step-diagram" / "before-after" / "short-demo-gif"
- `{{visual_brief}}` — deskripsi singkat untuk designer atau image search
- `{{differentiator_one_liner}}` — satu hal yang produk ini lakukan beda dari status quo (kalimat pendek)

## Template

```
---
template: slide-solution
slide_kind: solution
slide_count: 1
language: id
---

# Slide — Solusi
**Title:** {{solution_promise}}

**Visual layout:**
- Header (atas): judul = janji solusi {{solution_promise}}
- Center anchor (60% area): visual {{visual_kind}} — {{visual_brief}}
- Right rail atau bottom strip: 3 bullet how — 1. {{how_bullet_1}} / 2. {{how_bullet_2}} / 3. {{how_bullet_3}}
- Footer line (kecil, italic): "{{differentiator_one_liner}}"

**Body text minimum:** Janji 1 kalimat, 3 bullet pendek (masing-masing ≤8 kata), 1 kalimat diferensiasi. Tidak ada paragraf penjelasan.

**Speaker note:**
Bacakan janji dalam satu nafas. Tunjukkan visual produk, jeda 3 detik supaya audience proses. Walk through 3 bullet bagaimana — satu kalimat per bullet, jangan over-explain. Tutup dengan satu kalimat diferensiasi: "{{differentiator_one_liner}}" — ini yang bikin pendekatan ini beda dari yang sudah ada. Total ~75 detik.

**Anti-pola yang dihindari:**
- Bullet feature list 7 item — gantikan dengan 3 bullet outcome
- Janji yang vague seperti "platform terdepan" — janji wajib spesifik dan terukur
- Visual diagram super kompleks dengan 12 kotak — audience tidak bisa parse dalam 3 detik
- Diferensiasi tanpa kontras eksplisit ("better, faster, smarter") — sebut vs apa
```

## Tone guide

- Satu slide, satu janji. Slide solusi yang menjual 5 hal sekaligus tidak menjual apa-apa.
- Outcome-language, bukan feature-language. "Tim sales close 30% lebih banyak deal" lebih kuat dari "punya AI pipeline forecasting."
- 3 bullet how adalah how-it-feels-to-use, bukan how-it-works-technical. Audience tidak butuh arsitektur di slide ini.
- Visual mendominasi, teks ringan. Produk yang ditunjukkan lebih persuasif dari produk yang dideskripsikan.
- Diferensiasi eksplisit. "Beda" tanpa "beda dari apa" tidak ada artinya.
- Bahasa Indonesia primer; English untuk istilah produk standar (demo, screenshot, dashboard).
- Tidak ada exclamation marks. Tidak ada kata `revolutionary`, `disrupt`, `next-level`, `game-changer`.
