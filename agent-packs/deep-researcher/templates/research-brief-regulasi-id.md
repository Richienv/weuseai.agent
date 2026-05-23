# Template — Research Brief Regulasi Indonesia

Brief riset lanskap regulasi Indonesia pada satu topik. Memetakan rantai regulasi UU → PP → Permen → Surat Edaran dengan pasal spesifik dan regulator yang owns implementasi. Bukan template "policy overview" generik — wajib menelusuri sampai layer turunan operasional.
Audience: founder yang validasi compliance sebelum masuk sektor regulated, in-house counsel yang siapkan memo legal, atau analyst yang harus jawab "boleh tidak Indonesia mengizinkan model bisnis X".
Pakai sebelum tim produk / sales / engineering mulai build feature yang sentuh sektor regulated (finansial, kesehatan, telco, transportasi, energi, data pribadi, aset kripto).

## Variables

- `{{topic_one_line}}` — string. Topik regulasi yang dipetakan dalam satu kalimat (mis. "model BNPL untuk konsumen ritel di Indonesia").
- `{{sector_classification}}` — string. Sektor + sub-sektor sesuai klasifikasi regulator (mis. "fintech IKD - innovative credit scoring di bawah OJK").
- `{{key_question}}` — string. Pertanyaan hukum/regulasi utama (mis. "apakah model X harus terdaftar atau berizin di OJK").
- `{{decision_to_inform}}` — string. Keputusan operasional yang menunggu (mis. "go/no-go build BNPL skill di product").
- `{{compliance_horizon}}` — string. Horison waktu compliance (mis. "siap launch Q3 2026, post-pre-launch legal review").
- `{{primary_regulator}}` — string. Regulator utama yang owns implementasi.
- `{{secondary_regulators}}` — string. Regulator lain yang punya overlap jurisdiksi.

## Template

---
template: research-brief-regulasi-id
language: id
register: kamu
purpose: memetakan rantai regulasi UU → PP → Permen → SE
---

# Research Brief — Lanskap Regulasi Indonesia

**Topik:** {{topic_one_line}}
**Klasifikasi sektor:** {{sector_classification}}
**Pertanyaan kunci:** {{key_question}}
**Keputusan yang menunggu:** {{decision_to_inform}}
**Horison compliance:** {{compliance_horizon}}
**Regulator utama:** {{primary_regulator}}
**Regulator pendamping:** {{secondary_regulators}}

---

## Struktur laporan akhir

### Layer 1: Undang-Undang (UU)

Wajib berisi:

- **UU induk** — nomor + tahun + judul lengkap (mis. "UU Nomor 4 Tahun 2023 tentang Pengembangan dan Penguatan Sektor Keuangan / UU P2SK").
- **Perubahan UU** — kalau UU induk pernah diubah (lewat UU lain, Perppu, atau UU Cipta Kerja), sebut perubahan eksplisit + pasal yang berubah.
- **Pasal kunci** — kutip pasal yang langsung mengatur topik. Sertakan nomor pasal + ayat + bunyi pasal (parafrase pendek + link ke jdih).
- **Sumber teks resmi** — link ke jdih.go.id (DPR, Setneg, atau kementerian terkait).

> Hanya UU yang sudah diundangkan (lembaran negara) yang masuk Layer 1. RUU di Prolegnas masuk Bagian "Tren regulasi" terpisah.

### Layer 2: Peraturan Pemerintah (PP)

Wajib berisi:

- **PP turunan UU** — nomor + tahun + judul. PP biasanya mengatur teknis implementasi UU (mis. PP 71/2019 tentang PSE sebagai turunan UU ITE).
- **Pasal kunci** — kutip pasal yang relevan + bunyi parafrase.
- **PP yang sudah dicabut atau diubah** — kalau ada PP lama yang direvisi, sebut PP yang berlaku saat ini + cantumkan riwayat singkat.

### Layer 3: Peraturan Menteri / Lembaga (Permen / POJK / PBI / Perka)

Wajib berisi:

- **Peraturan teknis** — nomor + tahun + judul + lembaga penerbit.
  - Permen [Kementerian] = Peraturan Menteri
  - POJK = Peraturan OJK
  - PBI = Peraturan Bank Indonesia
  - Perka BKPM / Perka BNPB / dll = Peraturan Kepala Lembaga
  - PBPP = Peraturan Badan Pengawas Perdagangan Berjangka (untuk komoditas)
- **Pasal operasional** — pasal yang mengatur persyaratan teknis (modal minimum, pelaporan, pengawasan, sanksi).
- **Status berlaku** — aktif / dicabut / digantikan. Cek tanggal pencabutan kalau dicabut.

### Layer 4: Surat Edaran (SE) + Petunjuk Teknis

Wajib berisi:

- **SE pengawas** — nomor + tahun + lembaga + judul. SE biasanya guidance teknis operasional (SEOJK, SEBI, SE Dirjen).
- **Petunjuk teknis (juknis) / petunjuk pelaksanaan (juklak)** — kalau ada juknis turunan Permen.
- **FAQ resmi atau press release** — kalau regulator publish klarifikasi via press release / FAQ, sebut sebagai referensi tapi flag bahwa FAQ bukan instrumen hukum yang mengikat.

### Bagian: Regulator + enforcement

Wajib berisi:

- **Regulator yang owns implementasi** — sebut nama + Direktorat / Departemen spesifik (mis. "OJK Departemen Pengawasan IKNB 1B - Direktorat Pengaturan dan Perizinan Inovasi Keuangan Digital").
- **Mekanisme enforcement** — bagaimana sanksi dijatuhkan (administrasi, perdata, pidana). Sebut rentang sanksi yang ada di UU/Permen.
- **Kasus enforcement publik** — kalau ada putusan, press release sanksi, atau pencabutan izin yang publik, sebut sebagai precedent.

### Bagian: Tren regulasi 12-24 bulan ke depan

Wajib berisi:

- **RUU di Prolegnas** — RUU yang sedang dibahas DPR + status (di Baleg, di Komisi, pembahasan Tingkat 1).
- **Draft Permen / RPOJK / RPBI** — peraturan turunan yang sedang dikonsultasikan publik. Sumber: laman konsultasi publik regulator, atau reporting Hukumonline / DDTC News.
- **Konteks politik** — kalau ada agenda DPR / pemilu / pergantian menteri yang potensi mempengaruhi timeline.

> Wajib disclose tingkat ketidakpastian — RUU bisa berubah signifikan sebelum diundangkan; draft Permen bisa dicabut sebelum ditandatangani.

### Bagian: Jawaban pertanyaan kunci

Berikan jawaban langsung ke pertanyaan kunci, dengan struktur:

1. **Jawaban ringkas** — 1-2 kalimat, sebut dasar hukum + pasal.
2. **Persyaratan operasional** — list konkret yang harus dipenuhi (perizinan, modal minimum, pelaporan rutin, batasan produk).
3. **Risiko regulatori** — area di mana regulasi belum eksplisit + risiko interpretasi.
4. **Rekomendasi langkah** — what to do next (konsultasi PPID regulator, ajukan permohonan izin, tunggu konsultasi publik draft Permen).

---

## Anti-pola yang harus dihindari

- Mengutip pasal tanpa nomor pasal/ayat ("UU PDP mengatur consent" — tidak cukup; sebut Pasal 22 ayat 1).
- Skip Layer 4 (SE + juknis) — sering di sinilah persyaratan operasional yang detail dijabarkan.
- Pakai berita Hukumonline / DDTC News sebagai dasar hukum primer — itu sumber sekunder; primer harus teks resmi di jdih.
- Klaim "tidak ada regulasi yang mengatur" tanpa cek jdih.kemenkumham.go.id + jdih kementerian sektor.
- Mengabaikan konflik antar lembaga (mis. Bappebti vs OJK soal aset kripto pre-UU P2SK; OJK vs BI soal QRIS lintas batas).
- Memperlakukan Permenkominfo, POJK, PBI sebagai sejajar UU — hierarki berbeda, kekuatan berbeda.

## Tone guide

Brief regulasi tidak menafsirkan — brief regulasi memetakan. Kalau ada area di mana teks regulasi ambigu, tulis "ambigu, perlu konfirmasi PPID regulator" — jangan tebak. Bahasa Indonesia, kamu form, tanpa tanda seru. Klaim hukum tanpa pasal eksplisit ditolak. Kutipan UU pakai format "UU Nomor X Tahun YYYY tentang [judul]" minimal sekali saat pertama disebut; setelah itu boleh "UU [singkatan]".
