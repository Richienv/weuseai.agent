# Template — Balasan customer service untuk pelanggan marah (Bahasa)

Dipakai untuk pelanggan retail / end-user yang komplain marah via email, DM Instagram, atau channel customer service lain. Audiens: pelanggan akhir Indonesia (B2C), biasanya tidak punya gelar profesional formal — pakai "Bapak/Ibu" + nama panggilan, bukan jabatan.

Berbeda dari `reply-tough-client-bahasa` (yang untuk B2B klien senior) — di sini register CS retail: empati di depan, akui tanpa janji palsu, tawarkan resolusi konkret dengan timeline yang masuk akal untuk operasi CS Indonesia (bukan "kami akan tindak lanjut dalam 24 jam" yang sering meleset).

## Variables

- `{{customer_sapaan_nama}}` — string, sapaan + nama (mis. "Bapak Hendra", "Ibu Sari", "Mas Reza", "Mbak Lina"). "Bapak/Ibu" untuk default formal; "Mas/Mbak" boleh untuk brand yang lebih casual seperti F&B atau e-commerce.
- `{{specific_complaint_acknowledgment}}` — string, satu kalimat yang mention masalah spesifik dengan nomor order/booking/produk supaya pelanggan tahu kamu cek case-nya (mis. "Saya mengerti rasa kecewa Ibu terhadap pesanan #ORD-48291 yang tidak sampai sesuai jadwal pengiriman yang dijanjikan."). Jangan auto-template "kami mengerti kekecewaan Anda" — pelanggan marah membaca cepat dan langsung tahu kalau itu copy-paste.
- `{{impact_acknowledgment}}` — string opsional, satu kalimat yang akui dampak nyata ke pelanggan (mis. "Saya paham ini mengganggu rencana Ibu yang memang menunggu paket ini untuk acara keluarga akhir pekan ini."). Pakai kalau pelanggan eksplisit sebut konteks personal — skip kalau kasus rutin.
- `{{resolution_path}}` — string, langkah resolusi konkret yang bisa langsung dieksekusi (mis. "Kami akan kirim ulang paket pengganti hari ini juga via JNE YES dengan estimasi sampai besok sore.", "Saya proses refund penuh ke rekening yang sama, biasanya masuk dalam 3-5 hari kerja."). Hindari "akan kami tindaklanjuti" tanpa langkah spesifik.
- `{{timeline_realistic}}` — string, timeline yang jujur — bukan janji aspirasional (mis. "Update status pengiriman akan saya kirim ke Bapak paling lambat besok pagi sebelum jam 11.00 WIB."). Lebih baik janji 48 jam yang ditepati daripada 24 jam yang meleset.
- `{{compensation_offer}}` — string opsional, kompensasi konkret kalau ada wewenang (mis. "Sebagai bentuk permintaan maaf, kami berikan voucher belanja senilai Rp 100.000 yang sudah aktif di akun Ibu."). Jangan over-promise kompensasi yang harus minta approval atasan — kalau perlu eskalasi, sebutkan dengan jujur di section eskalasi.
- `{{escalation_path}}` — string opsional, kalau case di luar kewenangan customer (mis. "Untuk penyelesaian biaya kerusakan, saya teruskan kepada supervisor saya, Bapak Sutrisno. Beliau akan menghubungi Bapak langsung paling lambat besok siang."). Kosongkan kalau resolusi tuntas di level kamu.
- `{{contact_channel_for_followup}}` — string, channel yang customer bisa pakai untuk lanjut komunikasi (mis. "WhatsApp official kami di 0811-xxxx-xxxx atau balas email ini langsung — saya yang handle case ini sampai selesai.").
- `{{cs_agent_name}}` — string, nama agent CS untuk tanda tangan.

## Template

Bapak/Ibu {{customer_sapaan_nama}},

Saya mengerti rasa frustrasi Bapak/Ibu, dan terima kasih sudah menyampaikan keluhan ini langsung kepada kami.

{{specific_complaint_acknowledgment}}

{{impact_acknowledgment}}

Berikut langkah yang langsung kami ambil: {{resolution_path}}

{{timeline_realistic}}

{{compensation_offer}}

{{escalation_path}}

Kalau ada hal yang belum jelas atau Bapak/Ibu butuh update status sebelum waktu yang dijanjikan, mohon hubungi kami melalui {{contact_channel_for_followup}}.

Sekali lagi, terima kasih sudah memberi kami kesempatan untuk memperbaiki ini.

Hormat kami,
{{cs_agent_name}}

## Tone guide

Empati-tulus, transparan-soal-kapasitas, konkret-soal-waktu. Tiga prinsip yang membedakan reply CS Indonesia yang menyembuhkan dari yang memperburuk:

1. **"Saya mengerti rasa frustrasi" bukan "kami mengerti kekecewaan Anda".** "Saya" lebih personal daripada "kami" — pelanggan marah ingin tahu ada manusia di balik email. "Rasa frustrasi" lebih jujur daripada "kekecewaan" yang terdengar diplomatic. Hindari frase Western seperti "we apologize for any inconvenience caused" yang diterjemahkan kaku jadi "kami mohon maaf atas ketidaknyamanan yang ditimbulkan" — itu sinyal copy-paste yang justru memicu eskalasi.
2. **Timeline realistis, bukan aspirasional.** CS Indonesia sering jatuh ke "akan kami tindak lanjut dalam 24 jam" yang sering meleset karena dependency operasi (ekspedisi, vendor, internal approval). Lebih baik janji "paling lambat besok pagi sebelum jam 11.00 WIB" dan ditepati daripada "secepat mungkin" yang tidak terukur.
3. **Jujur soal eskalasi.** Kalau case di luar wewenang customer (refund besar, kompensasi tinggi, sengketa kualitas), katakan terus terang dan sebut siapa yang akan handle berikutnya dengan nama + posisi. Customer marah lebih tenang ketika tahu prosesnya, bukan ketika dijanjikan kewenangan yang tidak ada.

Pakai "Bapak/Ibu" sebagai default untuk brand formal (perbankan, asuransi, telco, B2B retail). "Mas/Mbak" untuk brand muda yang positioning-nya friendly (D2C, kuliner, fashion lokal). Jangan campuran "Anda" — pelanggan Indonesia merasa berjarak dengan "Anda" di konteks CS, kecuali brand sangat tinggi-end seperti private banking.

Zero tanda seru sepanjang email. Email CS yang pakai tanda seru berlebihan terlihat panik atau over-eager, bukan profesional.

Penutup "Hormat kami" (jamak — mewakili brand, bukan personal "saya") cocok untuk CS official, sedangkan tanda tangan tetap individual nama agent supaya pelanggan tahu siapa yang bertanggung jawab.
