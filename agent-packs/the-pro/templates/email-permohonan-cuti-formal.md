# Template — Email permohonan cuti formal (HR / atasan langsung)

Dipakai untuk surat permohonan cuti tahunan, cuti melahirkan, cuti penting (menikah, anggota keluarga inti meninggal), atau cuti karena alasan kesehatan. Audiens: HR Manager atau atasan langsung yang berwenang menyetujui — dengan CC ke atasan satu level di atas kalau formalitas perusahaan menuntut.

Sengaja dibuat formal — bukan WhatsApp izin sehari. Untuk izin cepat, customer pakai template chat sendiri, bukan ini.

## Variables

- `{{hr_or_manager_title_name}}` — string, sapaan formal lengkap (mis. "Bapak Bambang Pratama, HR Manager", "Ibu Sari, Atasan Langsung Bagian Marketing").
- `{{cc_recipients}}` — string opsional, daftar CC (mis. "Bapak Hendro Direktur Operasional"). Kosongkan kalau tidak ada.
- `{{employee_full_name}}` — string, nama lengkap customer sesuai dokumen kepegawaian.
- `{{employee_id_or_nik}}` — string, NIK kepegawaian atau employee ID.
- `{{employee_position}}` — string, jabatan customer (mis. "Senior Account Manager, Divisi Penjualan Korporat").
- `{{leave_type}}` — enum: `cuti_tahunan` | `cuti_melahirkan` | `cuti_penting` | `cuti_sakit` | `cuti_haji`. Menentukan referensi pasal UU yang relevan.
- `{{leave_reason_short}}` — string, alasan ringkas (mis. "menghadiri pernikahan adik kandung di Surabaya", "pemulihan pasca operasi", "ibadah haji bersama orang tua").
- `{{leave_start_date}}` — string, tanggal mulai cuti format Indonesia (mis. "Senin, 7 September 2026").
- `{{leave_end_date}}` — string, tanggal akhir cuti format Indonesia (mis. "Jumat, 11 September 2026").
- `{{leave_duration_working_days}}` — integer, jumlah hari kerja yang diambil (tidak termasuk Sabtu/Minggu/hari libur nasional di antaranya).
- `{{leave_balance_remaining}}` — integer opsional, sisa kuota cuti tahunan setelah pengajuan ini disetujui. Sertakan untuk cuti_tahunan supaya HR tidak perlu cek manual.
- `{{handover_person_name}}` — string, nama kolega yang menjadi PIC pengganti selama cuti.
- `{{handover_summary}}` — string, 1-2 kalimat yang menjelaskan apa saja yang sudah diserahterimakan (mis. "Semua follow-up klien aktif sudah saya brief ke Bapak Andi dengan dokumentasi di Notion shared workspace tim.").
- `{{contact_during_emergency}}` — string opsional, nomor WhatsApp yang bisa dihubungi untuk emergency saja. Kosongkan kalau benar-benar tidak ingin diganggu (cuti melahirkan, cuti haji).
- `{{attached_documents}}` — markdown bullet list dokumen lampiran (mis. "- Fotokopi KTP", "- Surat keterangan dokter dari RS Pondok Indah", "- Surat undangan resmi dari panitia").

## Template

Kepada Yth.
{{hr_or_manager_title_name}}
{{#if cc_recipients}}cc: {{cc_recipients}}{{/if}}

Perihal: **Permohonan {{leave_type}} — {{employee_full_name}}**

Dengan hormat,

Bersama surat ini, saya yang bertanda tangan di bawah ini:

- Nama lengkap: **{{employee_full_name}}**
- NIK / Employee ID: **{{employee_id_or_nik}}**
- Jabatan: **{{employee_position}}**

Mengajukan permohonan {{leave_type}} dengan rincian sebagai berikut:

- Alasan: {{leave_reason_short}}
- Tanggal mulai: {{leave_start_date}}
- Tanggal akhir: {{leave_end_date}}
- Total hari kerja: {{leave_duration_working_days}} hari
{{#if leave_balance_remaining}}- Sisa kuota cuti tahunan setelah pengajuan ini: {{leave_balance_remaining}} hari{{/if}}

## Dasar hukum

{{#if leave_type == "cuti_tahunan"}}
Permohonan ini sesuai dengan ketentuan **Pasal 79 ayat (2) huruf c Undang-Undang Nomor 13 Tahun 2003 tentang Ketenagakerjaan** yang menetapkan hak cuti tahunan sekurang-kurangnya 12 hari kerja bagi pekerja yang telah bekerja selama 12 bulan secara terus-menerus. Permohonan ini juga merujuk pada Surat Keputusan Perusahaan tentang Tata Cara Pengambilan Cuti yang berlaku.
{{/if}}

{{#if leave_type == "cuti_melahirkan"}}
Permohonan ini diajukan berdasarkan **Pasal 82 ayat (1) Undang-Undang Nomor 13 Tahun 2003 tentang Ketenagakerjaan** yang memberikan hak istirahat selama 1,5 bulan sebelum dan 1,5 bulan sesudah melahirkan. Total durasi sesuai estimasi medis dari dokter kandungan terlampir.
{{/if}}

{{#if leave_type == "cuti_penting"}}
Permohonan ini sesuai dengan **Pasal 93 ayat (4) Undang-Undang Nomor 13 Tahun 2003 tentang Ketenagakerjaan** yang mengatur cuti penting dengan tetap memperoleh upah penuh. Bukti pendukung terlampir.
{{/if}}

{{#if leave_type == "cuti_sakit"}}
Permohonan ini berdasarkan **Pasal 93 ayat (2) huruf a Undang-Undang Nomor 13 Tahun 2003 tentang Ketenagakerjaan** mengenai pekerja yang sakit dengan keterangan dokter. Surat keterangan dokter terlampir.
{{/if}}

{{#if leave_type == "cuti_haji"}}
Permohonan ini sesuai dengan **Pasal 93 ayat (2) huruf e Undang-Undang Nomor 13 Tahun 2003 tentang Ketenagakerjaan** mengenai pekerja yang menjalankan ibadah yang diperintahkan agamanya. Bukti pendaftaran haji terlampir.
{{/if}}

## Penyerahan tugas (handover)

Selama saya cuti, PIC pengganti untuk pekerjaan saya adalah **{{handover_person_name}}**.

{{handover_summary}}

{{#if contact_during_emergency}}Untuk situasi darurat yang benar-benar mendesak dan tidak dapat ditangani PIC pengganti, saya dapat dihubungi di nomor {{contact_during_emergency}}. Untuk hal-hal rutin, mohon diteruskan kepada PIC pengganti.{{/if}}

## Lampiran

{{attached_documents}}

Demikian permohonan ini saya sampaikan. Saya berharap permohonan ini dapat dipertimbangkan dan disetujui. Atas perhatian dan persetujuan Bapak/Ibu, saya ucapkan terima kasih.

Hormat saya,

{{employee_full_name}}
{{employee_position}}
{{date_of_submission}}

## Tone guide

Formal-administratif, sesuai konvensi surat permohonan kepegawaian Indonesia. Berbeda dari template balasan lain yang lebih natural — surat permohonan cuti adalah artefak yang masuk ke arsip kepegawaian, jadi struktur kaku justru profesional di sini.

Tiga prinsip:

1. **Dasar hukum eksplisit.** Menyebut pasal spesifik UU 13/2003 atau SK Perusahaan menunjukkan customer paham haknya — bukan sekadar minta-minta. Ini juga melindungi customer kalau di kemudian hari ada pertanyaan dari HR tentang validitas pengajuan.
2. **Handover yang konkret.** Section "penyerahan tugas" dengan nama PIC pengganti adalah pembeda antara surat cuti yang disetujui cepat vs yang nyangkut di meja manager. Tanpa handover yang jelas, manager wajar menunda persetujuan.
3. **Lampiran sesuai jenis cuti.** Cuti melahirkan butuh surat dokter kandungan; cuti penting (pernikahan, kematian) butuh undangan/surat keterangan; cuti haji butuh bukti pendaftaran. Lampiran kosong = pengajuan dipertanyakan.

Pakai "Bapak/Ibu" sepanjang surat (bukan "kamu" — ini kanal formal). Penutup wajib "Hormat saya" lengkap dengan tanggal pengajuan. Subject baris email harus eksplisit jenis cuti + nama supaya HR bisa filter inbox.

Untuk perusahaan multinasional atau startup yang pakai format inggris untuk leave request, template ini tetap relevan sebagai backup formal — banyak HR Indonesia tetap minta versi formal Bahasa untuk file kepegawaian, terutama untuk cuti panjang.
