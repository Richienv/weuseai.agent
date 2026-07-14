# Template — Retrospective

Dipakai untuk retro sprint atau retro penutup project. Audiens: team yang mengeksekusi pekerjaan — bukan stakeholder, bukan sponsor. Tujuannya bukan blame, tujuannya menemukan apa yang perlu diubah sebelum siklus berikutnya. Sesi retro biasanya 45-90 menit; template ini dipakai sebagai catatan bersama yang diisi selama sesi atau dikirim ke peserta untuk persiapan.

## Variables

- `{{retro_subject}}` — string, apa yang di-retro (mis. "Sprint 12", "Project launch checkout flow")
- `{{retro_date}}` — string, tanggal retro
- `{{facilitator}}` — string, nama fasilitator retro
- `{{participants}}` — markdown bullet list, peserta yang hadir
- `{{theme}}` — string opsional, satu tema yang muncul dari sesi — ditulis di akhir setelah diskusi, bukan di awal
- `{{what_worked}}` — markdown bullet list, hal yang berjalan baik. Spesifik — bukan "team-nya bagus", tapi "pairing review hari Rabu menghemat 2 hari rework"
- `{{what_didnt_work}}` — markdown bullet list, hal yang tidak berjalan baik. Fokus pada sistem dan proses, bukan orang
- `{{surprises}}` — markdown bullet list, hal yang tidak terduga — baik positif maupun negatif. Bagian ini sering jadi sumber insight paling kuat karena memunculkan asumsi yang sebelumnya tidak terlihat
- `{{actions_next_cycle}}` — markdown bullet list, 2-4 action konkret untuk siklus berikutnya. Tiap action wajib punya owner dan deadline. Format: "[Action] — owner: [nama] · target: [tanggal]"
- `{{parking_lot}}` — markdown bullet list opsional, hal yang muncul tapi tidak cocok ditangani di sini — diparkir untuk dibawa ke forum lain

## Template

# Retrospective — {{retro_subject}}

**Tanggal:** {{retro_date}}
**Fasilitator:** {{facilitator}}

## Peserta

{{participants}}

## Yang berjalan baik

{{what_worked}}

## Yang tidak berjalan baik

{{what_didnt_work}}

## Hal tak terduga

{{surprises}}

## Action untuk siklus berikutnya

{{actions_next_cycle}}

## Parking lot

{{parking_lot}}

## Tema yang muncul

{{theme}}

## Prompt untuk fasilitator

Beberapa prompt yang bisa kamu pakai untuk mendorong refleksi yang jujur tanpa membuat orang defensif:

- "Kalau kita mulai sprint ini lagi besok, satu hal apa yang kamu ubah dari awal?"
- "Hal apa yang membuat kerja kamu lebih lambat minggu ini daripada seharusnya?"
- "Hal apa yang kamu pelajari minggu ini yang kamu harap kamu tahu di awal?"
- "Apa yang membuat kamu ragu untuk angkat tangan minggu ini?"
- "Kalau ada satu hal yang aku, sebagai fasilitator atau lead, bisa lakukan beda lain kali, apa itu?"

## Catatan psychological safety

- **Atribusi ke sistem, bukan ke orang.** "Review siklus terlalu panjang" — bukan "Pak Budi terlalu lambat review". Kalau orang harus disebut, sebut dalam frame yang bisa diubah, bukan label personal.
- **Fasilitator bicara terakhir.** Kalau fasilitator atau lead bicara duluan, peserta lain cenderung menyetujui atau diam. Beri ruang untuk peserta yang paling junior bicara dulu kalau perlu.
- **Jangan langsung debat di "yang tidak berjalan baik".** Catat dulu semua poin, baru diskusi setelah daftar lengkap. Ini mencegah satu suara mendominasi awal sesi.
- **Action konkret, bukan niat.** "Lebih komunikatif" bukan action. "Renita kirim status update Telegram tiap Jumat sebelum jam 17:00" itu action.
- **Maksimal 3-4 action.** Lebih dari itu tidak akan dikerjakan; siklus berikutnya retro yang sama akan muncul dengan keluhan yang sama.

## Tone guide

Retro adalah forum jujur, bukan forum performance. Bahasa tetap kamu form karena ini sesi internal team yang sudah saling kenal — formalitas justru menghambat. Tema yang muncul ditulis di akhir, bukan di awal — kalau ditulis di awal, ia mengarahkan diskusi alih-alih disimpulkan dari diskusi. "Yang berjalan baik" sengaja muncul pertama supaya sesi tidak masuk dengan energi negatif — tapi jangan jadi performative; kalau memang ada hal kecil yang berjalan, sebut hal kecil itu dengan spesifik daripada superlatif kosong. Surprises adalah bagian yang sering di-skip pemula tapi paling berharga — di sinilah asumsi yang tidak diucapkan muncul ke permukaan. Zero exclamation marks; retro yang baik terasa pelan, bukan upbeat.
