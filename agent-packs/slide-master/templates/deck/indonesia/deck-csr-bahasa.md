# Template — Deck CSR Bahasa Indonesia

Audience: Direksi PT, Komisaris, Dinas Lingkungan Hidup (untuk PROPER), pemangku kepentingan komunitas, atau press. Use case: laporan tahunan CSR (Tanggung Jawab Sosial dan Lingkungan / TJSL) untuk PT bidang Sumber Daya Alam (per Pasal 74 UU PT 40/2007), laporan PROPER ke KLHK, atau update CSR ke board.

Beda dari deck CSR generik: rujukan eksplisit ke Pasal 74 UU PT 40/2007 (kewajiban CSR untuk PT bidang SDA), peraturan pelaksana PP 47/2012, integrasi dengan SDGs Indonesia (Bappenas Roadmap SDGs Indonesia 2030), dan kerangka PROPER (PermenLHK 1/2021) untuk PT yang terdaftar di program PROPER.

## Variables

- `{{nama_pt}}` — nama lengkap PT
- `{{bidang_usaha}}` — bidang usaha (perkebunan, pertambangan, kehutanan, migas, atau industri lain)
- `{{periode_laporan}}` — periode laporan (contoh: "Tahun 2025" atau "Q1 2026")
- `{{penanggung_jawab_csr}}` — nama dan jabatan penanggung jawab CSR (umumnya Direktur HSSE, atau Head of Sustainability)
- `{{anggaran_csr_idr}}` — anggaran CSR periode laporan dalam IDR
- `{{realisasi_csr_idr}}` — realisasi anggaran CSR dalam IDR
- `{{program_csr}}` — daftar program CSR yang dijalankan (per pilar: lingkungan, sosial, ekonomi, tata kelola)
- `{{lokasi_program}}` — lokasi geografis program (provinsi, kabupaten, desa)
- `{{penerima_manfaat}}` — jumlah penerima manfaat per program
- `{{peringkat_proper}}` — peringkat PROPER terakhir (Emas / Hijau / Biru / Merah / Hitam) kalau peserta PROPER
- `{{indikator_sdgs}}` — SDGs yang dipetakan ke program (dari 17 SDGs, sesuai Roadmap SDGs Indonesia Bappenas)
- `{{stakeholder_engagement}}` — engagement dengan stakeholder: pemerintah daerah, masyarakat sekitar, NGO mitra, akademisi
- `{{rencana_periode_depan}}` — rencana program periode berikutnya

## Template

```
---
template: deck-csr-bahasa
audience: direksi-komisaris-klhk-stakeholder
duration_minutes: 45
slide_count: 12
language: id
register: formal-sustainability
---

# Slide 1 — Cover
**Title:** Laporan Tanggung Jawab Sosial dan Lingkungan — {{nama_pt}}
**Visual:** Logo PT + nama lengkap + periode {{periode_laporan}} + nama penanggung jawab {{penanggung_jawab_csr}} + tanggal pelaporan
**Speaker note:** Buka dengan sapaan resmi. Untuk audience Direksi-Komisaris, gunakan register Pasal 74 UU PT 40/2007. Untuk audience KLHK PROPER, gunakan register PermenLHK 1/2021. ~45 detik.

# Slide 2 — Landasan Hukum
**Title:** Landasan Hukum
**Visual:** Daftar peraturan: UU PT 40/2007 Pasal 74 (kewajiban TJSL untuk PT bidang SDA), PP 47/2012 (peraturan pelaksana), PermenLHK 1/2021 (PROPER), Pedoman GRI Standards, Roadmap SDGs Indonesia 2030 Bappenas
**Speaker note:** Pasal 74 UU PT 40/2007 ayat (1): "Perseroan yang menjalankan kegiatan usahanya di bidang dan/atau berkaitan dengan sumber daya alam wajib melaksanakan Tanggung Jawab Sosial dan Lingkungan." Ayat (2): biaya TJSL dianggarkan dan diperhitungkan sebagai biaya Perseroan yang pelaksanaannya dengan memperhatikan kepatutan dan kewajaran. ~75 detik.

# Slide 3 — Profil PT & Bidang Usaha
**Title:** Profil {{nama_pt}}
**Visual:** Bidang usaha {{bidang_usaha}}, lokasi operasional (peta), jumlah karyawan, kategorisasi kewajiban CSR (wajib per Pasal 74 untuk SDA / sukarela untuk non-SDA), status PROPER (peserta / non-peserta)
**Speaker note:** Sebut status kewajiban CSR eksplisit. PT bidang SDA wajib per UU; non-SDA sukarela. Status PROPER ditentukan oleh KLHK berdasarkan kategori dampak lingkungan industri (PermenLHK 1/2021). ~60 detik.

# Slide 4 — Anggaran & Realisasi
**Title:** Anggaran & Realisasi CSR
**Visual:** Anggaran {{anggaran_csr_idr}} vs Realisasi {{realisasi_csr_idr}} dalam IDR, persentase realisasi, breakdown alokasi per pilar (lingkungan / sosial / ekonomi / tata kelola)
**Speaker note:** Anggaran CSR per Pasal 74 ayat (2) dianggarkan sebagai biaya Perseroan dengan kepatutan dan kewajaran. Praktik industri umum: 1-3% laba bersih untuk PT bidang SDA. Realisasi yang signifikan di bawah anggaran adalah signal eksekusi yang perlu dijelaskan. ~90 detik.

# Slide 5 — Program Pilar Lingkungan
**Title:** Pilar Lingkungan
**Visual:** Per program lingkungan {{program_csr}}: deskripsi, lokasi {{lokasi_program}}, output (luas lahan rehabilitasi dalam hektar, jumlah pohon ditanam, pengurangan emisi CO2 dalam ton, pengurangan limbah dalam ton), penerima manfaat {{penerima_manfaat}}, anggaran terealisasi dalam IDR
**Speaker note:** Untuk PT bidang SDA, program lingkungan adalah pilar utama. Sebut output yang terukur — luas hektar, ton emisi, ton limbah. Output kuantitatif jadi basis PROPER assessment. ~120 detik.

# Slide 6 — Program Pilar Sosial
**Title:** Pilar Sosial
**Visual:** Per program sosial: deskripsi, lokasi, output (jumlah siswa beasiswa, jumlah pasien layanan kesehatan gratis, jumlah desa binaan, fasilitas umum dibangun), penerima manfaat, anggaran terealisasi
**Speaker note:** Program sosial yang paling dipantau pemangku kepentingan: pendidikan (beasiswa, pelatihan vokasi), kesehatan (posyandu, klinik), infrastruktur dasar (akses air bersih, listrik, jalan), pemberdayaan perempuan. ~90 detik.

# Slide 7 — Program Pilar Ekonomi
**Title:** Pilar Ekonomi
**Visual:** Per program pemberdayaan ekonomi: UMKM binaan (jumlah, omzet rata-rata), pelatihan keterampilan, kemitraan agrikultur (untuk PT perkebunan/agribisnis), procurement lokal (% supplier lokal), tenaga kerja lokal (% karyawan dari komunitas sekitar)
**Speaker note:** Pemberdayaan ekonomi mengukur multiplier effect operasional PT ke ekonomi lokal. Untuk PT migas dan tambang, local content (TKDN) per Permenperin 02/2014 dan Permen ESDM 15/2013 wajib dilaporkan. ~90 detik.

# Slide 8 — Program Pilar Tata Kelola
**Title:** Pilar Tata Kelola
**Visual:** Sertifikasi (ISO 14001 Lingkungan, ISO 45001 K3, SMK3 per PP 50/2012), audit eksternal CSR, mekanisme grievance untuk komunitas, transparansi pelaporan (GRI Standards, SR Report publikasi publik)
**Speaker note:** Tata kelola CSR adalah pilar yang membedakan PROPER Hijau vs Biru, dan Emas vs Hijau. Mekanisme grievance yang accessible ke komunitas adalah keharusan PROPER Hijau. ~90 detik.

# Slide 9 — Pemetaan ke SDGs Indonesia
**Title:** Pemetaan ke SDGs Indonesia
**Visual:** Matrix {{indikator_sdgs}} — 17 SDGs di kolom, program CSR di baris, dengan ceklis di intersection. Highlight SDGs yang paling relevan dengan bidang usaha PT
**Speaker note:** Roadmap SDGs Indonesia 2030 (Perpres 59/2017) menetapkan target nasional per 17 SDGs. SDGs yang paling sering dipetakan PT bidang SDA: SDG 13 (Climate Action), SDG 15 (Life on Land), SDG 6 (Clean Water), SDG 8 (Decent Work). ~90 detik.

# Slide 10 — Stakeholder Engagement
**Title:** Engagement Pemangku Kepentingan
**Visual:** Per stakeholder {{stakeholder_engagement}}: jenis (pemerintah daerah / masyarakat sekitar / NGO mitra / akademisi), frekuensi engagement, output (MoU, FGD, public consultation), grievance yang diterima dan diselesaikan
**Speaker note:** Pemangku kepentingan adalah determinant social license to operate. Untuk PT bidang SDA, engagement dengan masyarakat sekitar wajib didokumentasikan untuk RKL-RPL (Rencana Kelola dan Pemantauan Lingkungan). ~90 detik.

# Slide 11 — Status PROPER
**Title:** Status PROPER {{periode_laporan}}
**Visual:** Peringkat PROPER terakhir {{peringkat_proper}} (Emas / Hijau / Biru / Merah / Hitam) dengan visualisasi peringkat 5-tier. Bandingkan dengan periode sebelumnya. Sertakan aspek penilaian: dokumen lingkungan, pengendalian pencemaran air dan udara, pengelolaan limbah B3, sistem manajemen lingkungan, eficiensi sumber daya, community development
**Speaker note:** PROPER (Program Penilaian Peringkat Kinerja Perusahaan) per PermenLHK 1/2021 adalah benchmark CSR resmi pemerintah. Hijau dan Emas mengindikasikan beyond compliance. Merah dan Hitam mengindikasikan ketidakpatuhan dan berisiko sanksi administratif. ~120 detik.

# Slide 12 — Rencana Periode Berikutnya
**Title:** Rencana CSR {{periode_berikutnya}}
**Visual:** Rencana {{rencana_periode_depan}}: program prioritas, target output, anggaran indikatif dalam IDR, target peringkat PROPER
**Speaker note:** Tutup dengan komitmen kontinuitas. CSR adalah investasi jangka panjang, bukan one-off. Rencana periode berikutnya idealnya menunjukkan eskalasi dampak — bukan replikasi program yang sama. ~75 detik.
```

## Tone guide

- Register formal-sustainability. Bahasa Indonesia formal-korporat. Audience Direksi-Komisaris-KLHK-stakeholder menuntut presisi dan rujukan hukum yang tepat.
- Pasal 74 UU PT 40/2007 dan PP 47/2012 wajib dirujuk eksplisit untuk PT bidang SDA. Jangan sebut "CSR sukarela" untuk PT bidang SDA — itu kewajiban hukum.
- Bidang SDA per Pasal 74 ayat (1): perkebunan, pertambangan, kehutanan, migas, dan kegiatan yang berkaitan dengan SDA. PT non-SDA juga bisa melakukan CSR sukarela, tetapi tidak wajib per UU.
- Semua angka uang dalam IDR dengan format titik ribuan: `Rp 25.000.000,-`.
- Output program wajib kuantitatif: hektar lahan, ton emisi, ton limbah, jumlah penerima manfaat, jumlah UMKM binaan. PROPER assessment basis-nya kuantitatif.
- PROPER per PermenLHK 1/2021 punya 5 peringkat: Emas (sangat baik), Hijau (baik), Biru (taat), Merah (kurang taat), Hitam (tidak taat). Biru adalah baseline compliance; Hijau dan Emas adalah beyond compliance.
- SDGs Indonesia mengikuti Roadmap SDGs Indonesia 2030 Bappenas (Perpres 59/2017). 17 SDGs yang sama dengan global, dengan target nasional yang dilokalisasi.
- Stakeholder engagement wajib didokumentasikan untuk PT bidang SDA — bagian dari RKL-RPL (Rencana Kelola dan Pemantauan Lingkungan) per PP 22/2021.
- Pelaporan GRI Standards adalah praktik terbaik. Publikasi Sustainability Report tahunan menjadi bukti transparansi.
- Bahasa Indonesia primer. English untuk istilah teknis sustainability internasional (GRI, SDGs, ESG, materiality assessment) tapi paralel dengan istilah Indonesia.
- Tidak ada exclamation marks. Tidak ada klaim "green" tanpa output kuantitatif (anti-greenwashing).
