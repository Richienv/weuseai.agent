# Doc Expert

Pengrajin dokumen. Invoice profesional, dokumen akademik (skripsi BAB I-V, thesis, abstract), dengan citation styles APA / MLA / Chicago — sesuai konvensi Indonesia.

**Tier:** semua (Starter, Pro, Studio).

---

## Apa yang kamu dapat

- **Invoice generator** — list item + info klien jadi HTML + PDF siap kirim atau cetak. Format profesional, ada nomor invoice + detail pajak.
- **Academic doc builder** — skripsi 5-bab struktur Indonesia, thesis, tugas kuliah, abstract. Output dalam Bahasa atau English.
- **Citation engine** — APA, MLA, Chicago. Footnote auto-formatted, daftar pustaka di akhir.

---

## Sample tasks

- "Bikinin invoice untuk klien PT Maju Sentosa, jasa konsultasi 10 jam @ Rp 750rb, plus PPN 11%" — output HTML + PDF.
- "Susun BAB II skripsi aku tentang dampak fintech pada UMKM, citation style APA" — dia outline, lalu kasih draft 8-12 halaman dengan citation footnote.
- "Bikin abstract dari paper aku ini (paste full text), max 250 kata" — abstract Bahasa + English dual-version.

---

## Skill list

| Skill | Tier | Penjelasan |
|---|---|---|
| `invoice-generator` | semua | HTML + PDF invoice (Phase 2E-3 pipeline) |
| `academic-doc-builder` | semua | Skripsi BAB I-V, thesis, tugas, abstract |
| `citation-formatter` | semua | APA / MLA / Chicago dengan konvensi Indonesia |

---

## Format invoice

Invoice output mengikuti template `invoice-pro.html` — kop perusahaan, nomor invoice, breakdown item, subtotal + pajak, total, info pembayaran. PDF render via Phase 2E-3 pipeline (CF Workers + Browserless).

Customizable: paste header bisnis kamu, logo (URL), bank account info — tersimpan di VPS, dipakai untuk semua invoice berikutnya.

---

## Format skripsi BAB I-V

Default mengikuti pedoman umum universitas Indonesia:

- **BAB I Pendahuluan** — latar belakang, rumusan masalah, tujuan, manfaat, batasan.
- **BAB II Tinjauan Pustaka** — landasan teori + kerangka berpikir + hipotesis (kalau kuantitatif).
- **BAB III Metodologi** — desain penelitian, populasi/sampel, instrumen, prosedur, analisis.
- **BAB IV Hasil dan Pembahasan** — finding + interpretasi.
- **BAB V Penutup** — simpulan, saran, rekomendasi.

Kalau pedoman universitas kamu beda, paste pedoman PDF — dia adapt struktur otomatis.

---

## Limitasi

- **Bukan auto-fill data** — invoice butuh input item dari kamu, dia format. Kalau kamu mau tarik dari spreadsheet, paste content manual.
- **Bukan cek plagiarisme** — academic doc adalah draft baru, bukan copy dari source. Citation factual tapi cek sendiri sebelum submit.
- **Phase 1:** PDF render via edge function — tergantung Browserless availability. Jarang fail tapi bisa.

---

## Kapan switch ke persona lain

- Kalau kamu butuh **deck slide visual** → [Slide Master](./slide-master.md).
- Kalau kamu butuh **content social media** → [Social Conductor](./social-conductor.md).
- Kalau kamu butuh **research kompleks dengan source ratusan** → [Deep Researcher](./deep-researcher.md).
