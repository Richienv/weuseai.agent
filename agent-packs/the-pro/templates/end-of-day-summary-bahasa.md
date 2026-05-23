# Template — Ringkasan akhir hari Bahasa (Jakarta-pace)

Dipakai sebagai penutup hari dalam register executive-assistant Bahasa Indonesia. Audiens: customer sendiri, dibaca sekitar jam 17.30-18.30 WIB sebelum tutup laptop, atau sebagai forward ke staf admin yang membantu prepare hari berikutnya.

Berbeda dari `daily-summary.md` yang lebih kontemplatif-personal (untuk customer sendiri, fokus refleksi) — versi ini lebih operasional dan to-the-point, dengan section "perlu konfirmasi" yang khusus untuk pace Jakarta business di mana follow-up lintas hari sering slip karena pihak lain juga sibuk atau telat balas.

## Variables

- `{{first_name}}` — string, nama panggilan customer.
- `{{date_short}}` — string, tanggal singkat Indonesia (mis. "Senin, 5 Maret 2026").
- `{{done_today}}` — markdown bullet list, semua hal kerja yang selesai hari ini — besar atau kecil. Setiap item harus past-tense konkret (mis. "- Kirim revisi proposal ke PT Adhi Karya, di-acknowledge oleh Pak Anwar via WA jam 14.20.", "- Selesai review portfolio Q3 Bu Sari, sudah upload ke shared drive.").
- `{{still_outstanding}}` — markdown bullet list, hal yang seharusnya selesai hari ini tapi belum — dengan alasan singkat (mis. "- Belum kirim laporan ke Direktur — masih nunggu data dari finance, mereka janji besok pagi."). Eksplisit alasan supaya besok tidak perlu mikir ulang konteks.
- `{{notes_for_tomorrow}}` — markdown bullet list, hal-hal yang harus diingat untuk besok — bukan to-do list, tapi konteks atau warning (mis. "- Pak Hadi expect follow-up jam 9 pagi soal pricing.", "- Hindari schedule sebelum 10.00 — ada jam macet karena demo di Sudirman."). Maksimal 3-5 item supaya tetap actionable.
- `{{perlu_konfirmasi}}` — markdown bullet list, item yang menunggu respon stakeholder — dengan nama pihak, kapan terakhir di-ping, dan kapan harus follow-up lagi kalau belum balas (mis. "- Pak Andi (Marketing Hero): proposal Q4 — di-kirim Kamis, belum dibalas. Follow-up Senin pagi kalau masih hening.", "- Bu Lina (HRD Bank Mandiri): jadwal training tim — di-ping kemarin, expect balas hari ini, kalau belum minggu depan tanya status."). Section ini paling kritis untuk Jakarta-pace di mana banyak hal slip overnight.
- `{{tomorrow_first_thing}}` — string, satu hal konkret yang akan customer lakukan saat duduk besok pagi (mis. "Cek email semalam (biasanya ada balasan dari klien yang sibuk), lalu review draft kontrak PT Sentral sebelum meeting jam 10.").
- `{{customer_signature_name}}` — string, nama untuk tanda tangan kalau ringkasan ini di-forward ke staf admin / executive assistant. Kosongkan kalau hanya untuk konsumsi sendiri.

## Template

# Ringkasan akhir hari — {{date_short}}

Selamat sore, {{first_name}}.

## Yang sudah dikerjakan

{{done_today}}

## Yang masih outstanding

{{still_outstanding}}

## Perlu konfirmasi

{{perlu_konfirmasi}}

Item di atas adalah hal yang masih menunggu respon pihak lain — bukan tanggung jawab kamu untuk mengejar, tapi penting untuk diingat supaya tidak hilang dari radar. Kalau sudah lewat hari kerja yang ditargetkan, follow-up dijadwalkan sesuai catatan.

## Catatan untuk besok

{{notes_for_tomorrow}}

**Langkah pertama besok:** {{tomorrow_first_thing}}

---

Selamat istirahat, {{first_name}}.

{{#if customer_signature_name}}
Disusun oleh: {{customer_signature_name}}
{{/if}}

## Tone guide

Tenang, operasional, transparan. Berbeda dari daily-summary yang reflektif-personal — versi ini lebih dekat ke "operational handover catatan" yang berguna baik untuk customer sendiri maupun untuk staf admin/EA yang membantu prepare hari berikutnya.

Tiga prinsip:

1. **"Perlu konfirmasi" adalah section yang paling jarang ada di template ringkasan harian — tapi paling kritis untuk Jakarta-pace.** Banyak follow-up slip bukan karena lupa, tapi karena tidak ada tracking eksplisit kapan terakhir di-ping dan kapan harus follow-up lagi. Section ini fungsinya sebagai "external dependencies radar" supaya minggu depan tidak ada surprise "ternyata vendor X tidak pernah dibalas".
2. **"Outstanding" eksplisit dengan alasan, bukan rasa bersalah.** Jangan biarkan customer menulis "belum selesai laporan — sorry kepleset." Alasan eksternal (nunggu data, vendor lambat) berbeda penanganannya dari alasan internal (terlalu banyak meeting hari ini). Catatan alasan kasih konteks untuk besok, bukan undangan untuk self-flagellation.
3. **"Langkah pertama besok" maksimal satu kalimat.** Lebih dari itu jadi to-do list yang membebani. Tujuannya: customer besok pagi tidak perlu mikir "mulai dari mana", tinggal eksekusi.

Pembuka "Selamat sore" sapaan netral profesional. Penutup "Selamat istirahat" eksplisit menandai batas jam kerja — Jakarta business sering tidak punya batas jelas, ringkasan ini memberinya.

Optional signature `{{customer_signature_name}}` muncul hanya kalau ada — supaya template fleksibel untuk dua use case: (a) konsumsi sendiri (signature kosong, lebih casual) atau (b) forward ke EA/asisten (signature ada, lebih formal handover document).

Zero tanda seru sepanjang template. Ringkasan akhir hari yang pakai tanda seru terasa kayak laporan staff junior ke bos — bukan tone executive-assistant The Pro.
