# Research Synthesis Structure

> Reference yang dipakai `synthesis-report`. Kerangka tetap untuk laporan riset Deep Researcher.

---

## Tiga format

| Format | Panjang | Kapan dipakai |
|---|---|---|
| `brief-memo` | ~1 halaman | Pertanyaan fokus, butuh jawaban cepat dengan sumber |
| `executive-summary` | ~2 halaman | Topik luas, audience mau inti tanpa semua detail |
| `full-report` | 3+ halaman | Riset mendalam, audience mau pendalaman per temuan |

---

## Kerangka (full-report)

### 1. TL;DR
3-5 kalimat di paling atas. Inti temuan, bisa dibaca dalam 60 detik. Tidak ada citation di sini — ini ringkasan, detail menyusul.

### 2. Key findings
Tiap temuan satu poin. Format per poin:
- Pernyataan temuan, satu kalimat.
- Evidence ringkas pendukung.
- Citation langsung ke sumber (penanda nomor).
- Tag kalau perlu: `[unverified]`, `[limited sources]`, `[konflik — lihat detail]`.

Urutkan dari temuan paling kuat / paling relevan ke audience.

### 3. Detail per sub-section
Satu sub-section per temuan kunci. Pendalaman: konteks, angka, kutipan sumber. Methodology note kalau sumber pakai paradigma atau definisi berbeda — jelaskan kenapa angka bisa tidak sebanding.

### 4. Konflik antar sumber
Bagian wajib kalau ada klaim bertentangan. Tampilkan kedua sisi dengan attribution. Jelaskan kemungkinan penyebab perbedaan (methodology, periode data, sample). Jangan dirata-rata, jangan dipilih satu diam-diam.

### 5. Gaps & unverified
Apa yang belum bisa dipastikan. Pertanyaan yang sumbernya tidak ada atau tipis. Ditandai terbuka — ketidakpastian bagian dari sintesis jujur, bukan kelemahan yang disembunyikan.

### 6. Sumber
Daftar lengkap dari `citation-builder`. Sumber primer dan secondary bisa dipisah. Tiap entri lengkap: penulis / lembaga, judul, tahun, penerbit, URL / DOI, tanggal akses.

---

## Penyesuaian per format

- `brief-memo` — TL;DR + key findings + sumber. Detail digabung ke key findings. Konflik dan gaps disebut inline kalau ada.
- `executive-summary` — TL;DR + key findings + konflik + gaps + sumber. Detail per sub-section diringkas, tidak penuh.
- `full-report` — semua bagian penuh.

---

## Aturan klaim

- Setiap klaim di key findings dan detail disandarkan ke sumber Tier A atau B (lihat `source-credibility-rubric.md`).
- Klaim dari sumber Tier C cuma masuk kalau ter-corroborate, dan ditandai.
- Sub-section tanpa sumber ditinggalkan kosong dengan catatan, tidak ditambal tebakan.
- Tidak ada kesimpulan yang lebih kuat dari evidence-nya.
