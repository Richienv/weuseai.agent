# Slide Master

Deck builder. Dua mode: narrative-arc (default — story arc 12 slide untuk pitch deck) dan template-picker (8 template student / worker).

**Tier:** semua (Starter, Pro, Studio).

---

## Apa yang kamu dapat

- **Narrative-arc mode** — deck 12 slide dengan struktur problem→solution→market→traction→ask. Cocok untuk pitch deck investor, customer pitch, internal review.
- **Template-picker mode** — 8 template siap pakai untuk student (presentation tugas, sidang skripsi) dan worker (laporan triwulan, proposal proyek).
- **Visual hint per slide** — bukan hanya teks, dia kasih saran chart type, image style, layout.

---

## Sample tasks

- "Bikinin pitch deck buat startup aku — edutech B2C buat anak SMA, target Series A 12-18 bulan lagi" — dia output 12 slide narrative arc.
- "Susun deck sidang skripsi aku tentang dampak fintech pada UMKM, 15 menit presentasi" — template-picker pilih `student-thesis-defense`.
- "Laporan Q2 untuk board, fokus revenue + cost optimization" — template `worker-quarterly-report`.

---

## Skill list

| Skill | Tier | Penjelasan |
|---|---|---|
| `narrative-arc-deck-builder` | semua | 12 slide problem→solution→market→traction→ask |
| `template-picker` | semua | 8 template pilihan student + worker |

---

## Output format

Slide Master output adalah **markdown structured** — header per slide + bullet content + visual hint. Phase 2 ada export ke PowerPoint / Google Slides via integration. Sementara, paste output ke tool slide kamu (Beautiful.ai, Gamma, Canva, atau manual ke PowerPoint).

Visual hint format:

```
## Slide 3: Market Size

- TAM: $X bil — anak SMA Indonesia 4,5jt orang
- SAM: $Y mil — segmen urban tier-1 + 2
- SOM: $Z jut — 100rb users tahun 1

Visual hint: triple-circle chart (TAM → SAM → SOM, descending size).
Image style: clean infographic, biru-putih palette.
```

---

## Limitasi

- **Bukan auto-design** — deck adalah outline + content. Visual aktual kamu compose pakai tool slide pilihan kamu.
- **Phase 2 export** ke PPTX / Gslides belum live.
- **Bukan brand-locked** — deck pakai voice generic. Kalau kamu butuh brand voice consistent dengan social content, pair-up sama [Social Conductor](./social-conductor.md).

---

## Kapan switch ke persona lain

- Kalau kamu butuh **dokumen panjang (skripsi, laporan)** → [Doc Expert](./doc-expert.md).
- Kalau kamu butuh **video pitch instead of deck** → [Video Producer](./video-producer.md).
- Kalau kamu butuh **research data untuk slide market size** → [Deep Researcher](./deep-researcher.md).
