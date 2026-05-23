# Template — Balasan klien Indonesia yang sulit (Bahasa)

Dipakai saat klien Indonesia kirim email frustrasi, komplain berat, atau marah eksplisit. Audiens: pengirim (klien Indonesia, biasanya Bapak/Ibu yang lebih senior atau decision-maker di perusahaan klien). Tujuan: akui kemarahan tanpa membela diri, redam emosi tanpa terdengar membela, tawarkan satu langkah konkret dalam 24 jam kerja.

Berbeda dari `reply-decline` atau `reply-professional` yang netral English-business — di sini register-nya hangat-tegas khas Indonesia: pakai "Bapak/Ibu", akui dengan kalimat seperti "Saya mengerti", dan tutup tanpa kata "maaf" yang berlebihan (lebih dari sekali jadi terdengar bersalah dan justru memperburuk).

## Variables

- `{{sender_title_name}}` — string, sapaan formal lengkap (mis. "Bapak Hendra", "Ibu Sari", "Pak Widodo"). Pakai Bapak/Ibu kecuali klien eksplisit minta dipanggil nama saja.
- `{{specific_acknowledgment}}` — string, satu kalimat yang akui keluhan dengan detail spesifik supaya klien tahu kamu benar-benar baca (mis. "Saya mengerti laporan yang Bapak terima Kamis lalu masih belum sesuai dengan revisi yang sudah disepakati di meeting minggu sebelumnya."). Hindari acknowledgment generic seperti "kami mengerti kekecewaan Bapak".
- `{{root_cause_short}}` — string opsional, satu kalimat penjelasan akar masalah tanpa membela diri. Kosongkan kalau penyebab belum jelas — lebih baik diam daripada menebak (mis. "Ada miskomunikasi internal di tim kami soal versi file yang seharusnya dikirim."). Jangan tulis "kami sedang mengusahakan" — itu kosong.
- `{{concrete_next_step}}` — string, satu langkah konkret dengan waktu spesifik dalam jam kerja Indonesia (mis. "Saya akan kirim versi yang benar paling lambat besok pagi sebelum jam 10.00 WIB, beserta ringkasan perubahan yang sudah disepakati."). Hindari "secepatnya" atau "sesegera mungkin" — klien marah butuh angka.
- `{{availability_for_call}}` — string opsional, tawaran panggilan langsung kalau kasus berat (mis. "Kalau Bapak berkenan, saya bisa video call hari ini antara jam 14.00-16.00 WIB untuk membahas langsung."). Kosongkan untuk komplain ringan.
- `{{customer_signature_name}}` — string, nama customer untuk tanda tangan.
- `{{customer_role_company}}` — string, jabatan + perusahaan customer untuk konteks formal (mis. "Direktur Operasional, PT Sentral Niaga").

## Template

Bapak/Ibu {{sender_title_name}},

Terima kasih sudah menyampaikan ini secara langsung kepada saya.

{{specific_acknowledgment}}

{{root_cause_short}}

Berikut langkah yang akan saya ambil: {{concrete_next_step}}

{{availability_for_call}}

Saya hargai kesabaran Bapak/Ibu dan komitmen Bapak/Ibu untuk menyampaikan ini dengan jelas. Kami akan tindaklanjuti dengan serius.

Hormat saya,
{{customer_signature_name}}
{{customer_role_company}}

## Tone guide

Hangat-tegas, bukan defensif, bukan menunduk berlebihan. Tiga prinsip:

1. **Akui dulu, jelaskan kemudian.** Kalimat pertama setelah sapaan harus mengakui spesifik keluhan klien — bukan defensif, bukan menjelaskan. Klien marah perlu tahu kamu mendengar sebelum kamu bicara.
2. **Satu kata "maaf" maksimum.** Lebih dari sekali jadi terdengar bersalah dan justru mengundang eskalasi. Indonesian business expects acknowledgment of fault through action, bukan banyaknya kata maaf.
3. **Angka, bukan adverb.** "Besok jam 10.00 WIB" lebih dipercaya dari "secepatnya". Klien marah butuh komitmen yang bisa diukur, bukan empati yang melayang.

Tutup dengan "Hormat saya" (bukan "Salam" yang terlalu casual untuk kasus berat) dan tanda tangan lengkap dengan jabatan + perusahaan — formalitas penuh menegaskan keseriusan.

Bahasa Indonesia eksekutif formal sepanjang email. Hindari campuran English yang terkesan menjauh dari klien (jangan: "kami akan follow up", pakai: "kami akan tindaklanjuti").
