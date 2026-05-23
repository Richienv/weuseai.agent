# Template — Balasan WhatsApp atasan di luar jam kerja

Dipakai saat atasan kirim pesan WhatsApp di luar jam kerja (malam, akhir pekan, hari libur). Audiens: atasan langsung atau atasan di level lebih tinggi. Tujuan: respon yang menunjukkan kamu lihat pesannya, dapat dipercaya untuk besok pagi, tanpa terjebak "iya Pak, langsung saya kerjakan" yang merusak batas hidup-kerja.

Tiga register variant dipilih berdasarkan hubungan customer-atasan: `super_senior` untuk komisaris/direksi level atau Boss yang very-senior, `peer_senior` untuk atasan langsung yang dekat secara hubungan, `startup_flat` untuk lingkungan startup yang flat hierarchy.

## Variables

- `{{register}}` — enum: `super_senior` | `peer_senior` | `startup_flat`. Default `peer_senior` kalau tidak yakin.
- `{{boss_name_or_title}}` — string. Untuk super_senior pakai "Bapak/Ibu" + jabatan (mis. "Pak Direktur", "Bu Komisaris", "Pak Sutopo"). Untuk peer_senior pakai "Pak/Bu" + nama (mis. "Pak Andi", "Bu Lina"). Untuk startup_flat pakai nama saja (mis. "Reza").
- `{{message_summary}}` — string, satu frasa yang acknowledge isi pesan supaya jelas kamu baca, bukan auto-reply (mis. "soal angka revenue Q3", "soal slide untuk pitch besok").
- `{{action_for_tomorrow}}` — string, kapan tepatnya kamu akan handle besok dengan jam jelas dalam WIB (mis. "Saya cek begitu sampai kantor, sebelum jam 9 pagi.", "Saya kirim revisinya sebelum meeting jam 10.00 WIB."). Jangan tulis "secepatnya" — itu jebakan tetap on-call.
- `{{escalation_question}}` — string opsional, hanya kalau memang urgent dan kamu butuh klarifikasi (mis. "Boleh saya konfirmasi apakah ini perlu dijawab sebelum pagi atau bisa first thing besok?"). Kosongkan untuk default — push semua ke besok.

## Template — register: super_senior (komisaris / direksi / Boss very-senior)

{{#if register == "super_senior"}}
Selamat malam, {{boss_name_or_title}}.

Baik, saya catat untuk {{message_summary}}. {{action_for_tomorrow}}

{{escalation_question}}

Terima kasih.
{{/if}}

## Template — register: peer_senior (atasan langsung yang dekat)

{{#if register == "peer_senior"}}
Malam, {{boss_name_or_title}}.

Noted soal {{message_summary}}. {{action_for_tomorrow}}

{{escalation_question}}
{{/if}}

## Template — register: startup_flat (lingkungan flat / sesama founder)

{{#if register == "startup_flat"}}
{{boss_name_or_title}}, noted soal {{message_summary}}. {{action_for_tomorrow}}

{{escalation_question}}
{{/if}}

## Tone guide

Tiga prinsip yang berlaku di semua register:

1. **Acknowledge spesifik, bukan auto-reply.** Phrase seperti "soal {{message_summary}}" menunjukkan kamu sudah baca isi pesan, bukan sekadar balas "siap". Ini yang membedakan respon dewasa dari respon refleks.
2. **Komit angka, bukan adverb.** "Sebelum jam 9 pagi" jauh lebih kredibel daripada "secepatnya". Atasan yang kirim malam ingin tahu kapan, bukan janji kosong.
3. **Jangan over-promise saat ini juga.** "Baik Pak, langsung saya kerjakan" malam-malam adalah jebakan: mendorong budaya always-on, dan kalau kamu tidak benar-benar selesai malam itu, kepercayaan turun lebih besar. "Saya catat untuk besok" lebih jujur.

Perbedaan register:

- **super_senior** pakai "Selamat malam" lengkap + "Bapak/Ibu" + tanpa singkatan. Penutup "Terima kasih" karena formalitas penuh diharapkan. Cocok untuk komisaris utama, direktur senior, atau atasan yang generasi 50+ yang formal.
- **peer_senior** pakai "Malam" (lebih singkat) + "Pak/Bu" + nama. Phrase seperti "Noted" sudah masuk vocabulary peer-senior modern di Jakarta business. Bisa skip penutup formal kalau hubungan kerja sehari-hari sudah dekat.
- **startup_flat** skip sapaan formal sama sekali, langsung pakai nama. "Noted soal X" sudah cukup. Ini register founder-to-founder atau di tim yang flat.

Untuk semua register: zero tanda seru. WhatsApp business Indonesia sudah sangat tergoda pakai banyak tanda seru — kamu tidak perlu ikut. Periode-titik lebih dewasa.

Catatan situasional: kalau pesan benar-benar krisis (mis. server production down, klien batalkan kontrak), template ini tidak cocok — keluar dari template dan respon langsung. Template ini untuk 90% pesan malam yang sebenarnya bisa menunggu pagi.
