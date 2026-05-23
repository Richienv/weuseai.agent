# Template — Deck Rapat Direksi PT

Audience: Direksi dan Komisaris Perseroan Terbatas (PT) Indonesia. Use case: Rapat Direksi bulanan / triwulan, RUPS Tahunan (Pasal 78 UU PT 40/2007), RUPS Luar Biasa, atau rapat gabungan Direksi-Komisaris. Format mengikuti tata kelola PT per UU PT 40/2007 dan praktik notula resmi.

Beda dari board update startup: konvensi tata kelola Indonesia (sebut Komisaris dengan "Pak/Ibu Komisaris", agenda mengikuti pasal-pasal UU PT, quorum check di awal per Pasal 79, action item dengan PIC dan deadline yang masuk notula resmi).

## Variables

- `{{nama_pt}}` — nama lengkap PT (contoh: "PT Sumber Makmur Indonesia")
- `{{periode_rapat}}` — periode rapat (contoh: "Q1 2026" atau "Mei 2026")
- `{{jenis_rapat}}` — Rapat Direksi / Rapat Direksi-Komisaris / RUPS Tahunan / RUPS Luar Biasa
- `{{tanggal_rapat}}` — tanggal rapat
- `{{tempat_rapat}}` — tempat (alamat fisik atau platform virtual)
- `{{pimpinan_rapat}}` — pimpinan rapat (umumnya Presiden Direktur atau Direktur Utama)
- `{{notulen}}` — nama notulen (Sekretaris Perusahaan atau yang ditunjuk)
- `{{peserta_direksi}}` — daftar Direksi yang hadir (nama + jabatan)
- `{{peserta_komisaris}}` — daftar Komisaris yang hadir (nama + jabatan)
- `{{quorum_status}}` — terpenuhi / tidak terpenuhi per Pasal 79 UU PT 40/2007
- `{{agenda_items}}` — daftar agenda (laporan keuangan, laporan operasional, keputusan strategis, lain-lain)
- `{{kinerja_keuangan}}` — ringkasan pendapatan, beban, laba bersih, posisi kas dalam IDR
- `{{aksi_korporasi}}` — aksi korporasi yang dibahas (akuisisi, divestasi, perubahan modal, dividen, dll.)
- `{{keputusan_butuh_persetujuan}}` — keputusan yang butuh persetujuan Direksi atau Komisaris

## Template

```
---
template: deck-rapat-direksi-pt
audience: direksi-komisaris-pt
duration_minutes: 60
slide_count: 12
language: id
register: formal-direksi
---

# Slide 1 — Cover
**Title:** {{jenis_rapat}} — {{nama_pt}}
**Visual:** Logo PT + nama lengkap PT + periode {{periode_rapat}} + tanggal {{tanggal_rapat}} + tempat {{tempat_rapat}}
**Speaker note:** Buka dengan sapaan resmi: "Selamat pagi, Bapak/Ibu Komisaris, Bapak/Ibu Direksi. Atas nama Direksi, saya {{pimpinan_rapat}} membuka {{jenis_rapat}} {{nama_pt}} periode {{periode_rapat}}." ~45 detik.

# Slide 2 — Daftar Hadir & Quorum
**Title:** Daftar Hadir
**Visual:** Tabel dua kolom — Direksi hadir {{peserta_direksi}} dengan jabatan, Komisaris hadir {{peserta_komisaris}} dengan jabatan. Footer: Quorum {{quorum_status}} per Pasal 79 UU PT 40/2007 (½ dari jumlah anggota Direksi/Komisaris)
**Speaker note:** Sebut nama dan jabatan masing-masing yang hadir. Konfirmasi quorum eksplisit — Pasal 79 mensyaratkan ½ jumlah anggota untuk Rapat Direksi/Komisaris (kecuali Anggaran Dasar menentukan lain). RUPS punya ketentuan quorum berbeda per Pasal 86. ~60 detik.

# Slide 3 — Agenda Rapat
**Title:** Agenda
**Visual:** Daftar bernomor {{agenda_items}} dengan estimasi waktu per agenda
**Speaker note:** Walk through agenda. Konfirmasi tidak ada penambahan agenda atau perubahan urutan. Untuk RUPS, agenda harus sesuai panggilan yang dikirim sesuai Pasal 81-82 UU PT 40/2007. ~45 detik.

# Slide 4 — Persetujuan Risalah Rapat Sebelumnya
**Title:** Risalah Rapat {{periode_rapat_sebelumnya}}
**Visual:** Ringkasan keputusan rapat sebelumnya + status tindak lanjut action item (tuntas / dalam proses / tertunda)
**Speaker note:** Minta persetujuan risalah rapat sebelumnya. Bahas action item yang tertunda — sebut PIC dan alasan penundaan. ~75 detik.

# Slide 5 — Laporan Kinerja Keuangan
**Title:** Kinerja Keuangan {{periode_rapat}}
**Visual:** 4 angka utama dalam IDR: Pendapatan (Rp X), Beban (Rp Y), Laba Bersih (Rp Z), Posisi Kas (Rp K). Bandingkan vs target dan vs periode sebelumnya. Sertakan margin gross profit dan EBITDA margin
**Speaker note:** {{kinerja_keuangan}} — sebut angka konkret dalam IDR. Untuk varians signifikan vs target, sebut root cause dalam satu kalimat. Detail laporan keuangan lengkap di lampiran. ~120 detik.

# Slide 6 — Laporan Operasional
**Title:** Operasional {{periode_rapat}}
**Visual:** KPI operasional per divisi: produksi (volume), penjualan (jumlah transaksi), customer (jumlah aktif), tenaga kerja (headcount), produktivitas (output per karyawan)
**Speaker note:** Setiap divisi 1-2 angka utama. Highlight pencapaian dan tantangan. Diskusi detail per divisi di rapat divisi, bukan di sini. ~120 detik.

# Slide 7 — Risiko & Kepatuhan
**Title:** Risiko & Kepatuhan
**Visual:** Per risiko: deskripsi, probability, impact, mitigasi, status. Kepatuhan regulasi: pajak (SPT Masa, SPT Tahunan), BPJS Ketenagakerjaan + Kesehatan, izin sektoral, audit internal
**Speaker note:** Surface risiko material proaktif. Untuk PT bidang Sumber Daya Alam, wajib bahas status CSR per Pasal 74 UU PT 40/2007. Kepatuhan pajak: status SPT bulanan dan tahunan. ~90 detik.

# Slide 8 — Aksi Korporasi
**Title:** Aksi Korporasi yang Dibahas
**Visual:** Per aksi {{aksi_korporasi}}: deskripsi, rasionalisasi strategis, dampak finansial dalam IDR, dampak terhadap pemegang saham, persetujuan yang dibutuhkan (Direksi / Komisaris / RUPS)
**Speaker note:** Aksi korporasi tertentu wajib persetujuan RUPS per UU PT 40/2007 (perubahan AD, penggabungan / peleburan / pengambilalihan per Pasal 89, pengurangan modal, pembubaran). Untuk dividen, persetujuan RUPS Tahunan per Pasal 71. Sebut yurisdiksi persetujuan dengan jelas. ~120 detik.

# Slide 9 — Keputusan yang Butuh Persetujuan
**Title:** Keputusan Hari Ini
**Visual:** Per keputusan {{keputusan_butuh_persetujuan}}: konteks, opsi, rekomendasi Direksi, dampak finansial, deadline implementasi
**Speaker note:** Eksplisit soal yurisdiksi: yang butuh persetujuan Direksi (per AD), yang butuh tanggapan Komisaris (fungsi pengawasan per Pasal 108), yang butuh RUPS. Sebut rekomendasi Direksi dengan alasan singkat. ~120 detik.

# Slide 10 — Tanggapan Komisaris
**Title:** Tanggapan Dewan Komisaris
**Visual:** Slide dengan ruang catatan untuk tanggapan formal Komisaris atas laporan Direksi dan keputusan yang diajukan
**Speaker note:** Slide untuk dipersilakan Komisaris memberi tanggapan. Pasal 108 UU PT 40/2007 menugaskan Komisaris mengawasi kebijakan dan jalannya kepengurusan Direksi. Notula resmi mencatat tanggapan Komisaris kata-per-kata. ~Q&A 10 menit.

# Slide 11 — Action Items
**Title:** Action Items
**Visual:** Tabel action item: No | Aksi | PIC (nama Direksi penanggung jawab) | Deadline | Status awal
**Speaker note:** Setiap action item dengan PIC tunggal (satu Direktur) dan deadline konkret. Action item tanpa PIC dianggap belum ditetapkan dan kembali ke agenda rapat berikutnya. ~45 detik.

# Slide 12 — Penutupan
**Title:** Penutupan Rapat
**Visual:** Ringkasan: jumlah keputusan disetujui, action item dikeluarkan, agenda rapat berikutnya, tanggal rapat berikutnya
**Speaker note:** Tutup formal: "Atas nama Direksi, saya menutup {{jenis_rapat}} {{nama_pt}} pada pukul [X]. Notula resmi akan disirkulasikan dalam 5 hari kerja oleh {{notulen}}." Slide ini juga jadi referensi untuk notula resmi yang dibuat Sekretaris Perusahaan. ~45 detik.
```

## Tone guide

- Register formal-direksi. Sapa "Bapak/Ibu Komisaris", "Bapak/Ibu Direksi". Tidak ada "kamu" atau "lo/gue" — register Indonesia korporat formal.
- Semua angka uang dalam IDR dengan format titik ribuan: `Rp 25.000.000.000,-` (untuk angka besar PT).
- Sebut pasal UU PT 40/2007 eksplisit untuk landasan hukum keputusan. Pasal kunci: 78 (jenis RUPS), 79 (quorum Direksi/Komisaris), 81-82 (panggilan RUPS), 86 (quorum RUPS), 89 (penggabungan), 108 (pengawasan Komisaris), 74 (CSR untuk PT SDA).
- Quorum check di Slide 2 adalah keharusan tata kelola — jangan skip. Tanpa quorum, keputusan yang diambil tidak sah.
- Action item wajib punya PIC tunggal (satu Direktur penanggung jawab) dan deadline konkret. Action item tanpa PIC tidak akan tereksekusi.
- Tanggapan Komisaris dicatat kata-per-kata dalam notula resmi — Komisaris menjalankan fungsi pengawasan per Pasal 108.
- Untuk RUPS Tahunan, agenda wajib sesuai panggilan yang dikirim ≥ 14 hari sebelum rapat per Pasal 82(1) UU PT 40/2007.
- Untuk PT bidang Sumber Daya Alam (perkebunan, pertambangan, kehutanan, migas), CSR adalah kewajiban hukum per Pasal 74 UU PT 40/2007 — wajib dibahas di laporan tahunan.
- Bahasa Indonesia formal-korporat. English untuk istilah finansial standar (EBITDA, gross margin, dividen) tapi paralel dengan istilah Indonesia.
- Tidak ada exclamation marks. Tidak ada superlatif. Tone Sekretaris Perusahaan ke Direksi.
