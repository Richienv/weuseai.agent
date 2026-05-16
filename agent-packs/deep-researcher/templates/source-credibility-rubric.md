# Source Credibility Rubric

> Reference yang dipakai `source-evaluator`. Lima dimensi penilaian, tier akhir A-D.

---

## Lima dimensi

### 1. Authority
Siapa penulis atau lembaga di balik sumber, dan apa track record-nya.

- **Tinggi** — peneliti dengan publikasi peer-reviewed, lembaga resmi (pemerintah, badan statistik, regulator), media dengan editorial standard yang jelas.
- **Sedang** — penulis dengan keahlian relevan tapi tanpa peer review, media industri yang kredibel.
- **Rendah** — anonim, tidak ada kredensial yang bisa dicek, atau platform tanpa editorial oversight.

### 2. Recency
Kapan sumber dipublikasi, dan apakah masih relevan untuk topik.

- Topik bergerak cepat (teknologi, regulasi, pasar) — sumber > 2 tahun ditandai "perlu cek update".
- Topik stabil (sejarah, metodologi dasar) — usia bukan masalah selama tidak ada revisi besar.
- Tanggal publikasi tidak jelas — turunkan tier minimal satu tingkat.

### 3. Primary vs secondary
- **Primer** — data asli, paper penelitian, laporan resmi, dokumen sumber, wawancara langsung.
- **Secondary** — reporting tentang sumber lain, rangkuman, analisis pihak ketiga.
- **Tertiary** — aggregator, ensiklopedia, repost. Berguna untuk orientasi awal, tidak untuk disandari sebagai bukti.

Sumber primer lebih disandari. Secondary dipakai kalau primer tidak tersedia, dengan catatan.

### 4. Bias signal
Apakah ada conflict of interest, agenda komersial, atau political slant yang patut diungkap.

- Vendor yang menulis soal kategorinya sendiri — kepentingan komersial.
- Lembaga advokasi — punya posisi yang sah diungkap, bukan otomatis didiskualifikasi.
- Sumber tanpa bias signal jelas tetap dicek corroboration-nya.

Bias tidak membatalkan sumber — tapi wajib disebut saat sumbernya dipakai.

### 5. Corroboration
Apakah klaim utama sumber didukung sumber independen lain.

- **Ter-corroborate** — minimal satu sumber independen menegaskan klaim kunci.
- **Single-source** — klaim kunci cuma ada di sumber ini. Ditandai, dipakai hati-hati.
- **Bertentangan** — sumber lain membantah klaim. Konflik ditampilkan, bukan dipilih diam-diam.

---

## Tier akhir

| Tier | Arti | Cara pakai di sintesis |
|---|---|---|
| **A** | Primer, otoritatif, ter-corroborate | Sandari klaim utama langsung |
| **B** | Kredibel dengan catatan kecil | Sandari, sebutkan catatannya |
| **C** | Pakai hati-hati | Cuma kalau ter-corroborate sumber A/B, tandai |
| **D** | Tidak disarankan disandari | Drop, atau sebut sebagai "klaim tidak terverifikasi" |

Aturan: tier tidak naik di atas batas dimensi terlemahnya. Sumber dengan authority tinggi tapi tanpa corroboration untuk klaim baru maksimal Tier B.

---

## Catatan

Penilaian ini soal kredibilitas dan kecocokan sumber, bukan vonis benar / salah atas isi klaim. `source-evaluator` menilai apakah sebuah sumber bisa disandari, bukan apakah dunia bekerja seperti yang sumber itu katakan.
