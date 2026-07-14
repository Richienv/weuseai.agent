# Template — Status report mingguan ke direksi

Dipakai untuk laporan status project mingguan ke direksi PT atau dewan komisaris. Audiens: Direktur Utama, Direktur, atau Komisaris yang mensponsori project. Register formal (Bapak/Ibu), struktur seperti laporan resmi rapat direksi, bukan email kasual. Beda dengan `coordination/status-report.md` yang lebih executive-sponsor agnostik — template ini khusus format direksi PT Indonesia.

> **NOTE: TEMPLATE OPERASIONAL.** Untuk laporan ke OJK, Bursa, atau pihak regulator, gunakan template terpisah dengan struktur sesuai POJK / SEOJK terkait.

## Variables

- `{{nama_project}}` — string, nama project resmi
- `{{nomor_laporan}}` — string, nomor laporan internal (mis. "SR-FY26W21-001")
- `{{periode_laporan}}` — string, periode (mis. "Minggu ke-21 Tahun 2026 — Senin 18 Mei sampai Jumat 22 Mei 2026")
- `{{tanggal_laporan}}` — string, tanggal laporan diterbitkan
- `{{nama_project_manager}}` — string, nama PM atau koordinator project
- `{{jabatan_project_manager}}` — string, jabatan formal (mis. "Manager Operasional")
- `{{addressee_utama}}` — string, nama direktur utama yang dituju (mis. "Bapak Budi Santoso")
- `{{addressee_jabatan}}` — string, jabatan addressee (mis. "Direktur Utama PT Surya Niaga Sentosa")
- `{{tembusan}}` — markdown bullet list, daftar tembusan dengan nama + jabatan
- `{{status_rag}}` — string, salah satu dari "Hijau", "Kuning", "Merah"
- `{{ringkasan_eksekutif}}` — string, 2-3 kalimat ringkasan utuh
- `{{progress_vs_target}}` — markdown table, perbandingan progress aktual vs target rencana
- `{{milestone_status}}` — markdown table, milestone dengan target, aktual, status
- `{{blocker_list}}` — markdown bullet list, blocker aktif (kalau tidak ada, tulis "Tidak ada blocker yang memerlukan eskalasi minggu ini.")
- `{{keputusan_dibutuhkan}}` — markdown numbered list, keputusan direksi yang dibutuhkan (kalau tidak ada, tulis "Tidak ada keputusan direksi yang dibutuhkan minggu ini.")
- `{{outlook_minggu_depan}}` — string, 2-3 kalimat tentang fokus minggu depan
- `{{lampiran}}` — markdown bullet list, lampiran (kalau tidak ada, tulis "Tidak ada lampiran.")

## Template

# LAPORAN STATUS MINGGUAN

**Nomor:** {{nomor_laporan}}
**Periode:** {{periode_laporan}}
**Tanggal terbit:** {{tanggal_laporan}}
**Project:** {{nama_project}}

---

Kepada Yth.
{{addressee_utama}}
{{addressee_jabatan}}

Dengan hormat,

Bersama ini saya sampaikan laporan status mingguan untuk project {{nama_project}} periode {{periode_laporan}}.

## I. Ringkasan Eksekutif

**Status keseluruhan: {{status_rag}}**

{{ringkasan_eksekutif}}

Konvensi status:
- **Hijau** — project berjalan sesuai rencana, tidak ada risiko material
- **Kuning** — ada risiko atau deviasi yang sedang dikelola tim, tidak memerlukan intervensi direksi
- **Merah** — ada blocker atau risiko material yang memerlukan keputusan atau intervensi direksi

## II. Progress vs Target Rencana

{{progress_vs_target}}

## III. Status Milestone

{{milestone_status}}

## IV. Blocker Aktif

{{blocker_list}}

## V. Keputusan yang Dibutuhkan dari Direksi

{{keputusan_dibutuhkan}}

## VI. Outlook Minggu Depan

{{outlook_minggu_depan}}

## VII. Lampiran

{{lampiran}}

---

Demikian laporan ini saya sampaikan. Apabila Bapak/Ibu memerlukan klarifikasi atau penjelasan lebih lanjut, saya siap dihubungi untuk pertemuan tatap muka atau panggilan telepon di luar siklus pelaporan mingguan ini.

Hormat saya,

{{nama_project_manager}}
{{jabatan_project_manager}}

**Tembusan:**

{{tembusan}}

---

## Tone guide

Register formal Indonesia korporat — "Bapak/Ibu" sebagai sapaan, "saya" sebagai kata ganti pertama, bukan "kami" kecuali memang tim. Hindari Inggris ("update", "blocker", "deadline") dalam kalimat utama — gunakan padanan Indonesia ("pembaruan", "hambatan", "tenggat") meski tetap diperbolehkan dalam tabel teknis. Status RAG ditulis "Hijau / Kuning / Merah", bukan Green/Yellow/Red — konvensi laporan direksi Indonesia. Ringkasan eksekutif harus 2-3 kalimat — direksi membaca ini di awal rapat, bukan satu paragraf panjang. Bagian "Keputusan yang Dibutuhkan" paling load-bearing — di sinilah project manager menarik leverage direksi. Kalau bagian ini selalu kosong, direksi mulai bertanya kenapa perlu dilibatkan; kalau selalu penuh, project mungkin under-empowered di level operasional. Tidak ada exclamation mark. Tidak ada hedge — kalau status Kuning, sebut alasan spesifik dalam ringkasan, jangan ditutupi. Penutup formal pakai "Hormat saya" bukan "Salam hangat" — konteks direksi.

## Catatan format

- Nomor laporan sebaiknya pakai konvensi internal yang konsisten supaya mudah dirujuk di rapat direksi (mis. "SR-FY26W21-001" — Status Report, Fiscal Year 2026 Week 21, sequence 001)
- Tembusan biasanya termasuk Komisaris (jika dilaporkan ke Direksi penuh), Direktur lain yang relevan, dan PIC HR atau Sekretaris Perusahaan untuk arsip
- Lampiran umum: chart Gantt, sheet anggaran, foto progress lapangan, atau dokumen pendukung — tidak embed dalam body laporan
- Distribusi sebaiknya via email resmi perusahaan dengan subject jelas: "[STATUS] {{nama_project}} - Minggu W21 - {{status_rag}}"
