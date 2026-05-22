# Template — Reply (handoff)

Dipakai untuk meneruskan permintaan ke kolega, vendor, atau channel lain yang lebih tepat. Audiens: pengirim asli, dan secara implisit memperkenalkan ke pihak yang dialihkan. Tujuan: redirect yang jelas tanpa membuat pengirim merasa dilempar.

## Variables

- `{{sender_name}}` — string, nama pengirim
- `{{brief_acknowledgment}}` — string, satu kalimat yang mengakui isi pesan supaya tidak terasa langsung ditolak (mis. "Terima kasih sudah menghubungi aku soal integrasi payment ini.")
- `{{handoff_reason}}` — string, alasan singkat kenapa di-handoff (mis. "Sebenarnya bagian ini ditangani oleh tim teknis kami, bukan aku langsung.")
- `{{recipient_name_and_role}}` — string, nama dan peran orang yang dituju (mis. "Andi (Tech Lead)" atau "tim support di support@perusahaan.example")
- `{{recipient_contact}}` — string, cara menghubungi pihak baru (email, channel, link, atau "aku CC dia di pesan ini")
- `{{context_handed_over}}` — string, satu kalimat yang menyebut konteks apa yang sudah/akan disampaikan ke pihak baru supaya pengirim tidak perlu repeat (mis. "Aku sudah teruskan ringkasan permintaan kamu ke dia, jadi tidak perlu kamu jelaskan ulang.")
- `{{closing_courtesy}}` — string, penutup ringan (mis. "Semoga prosesnya lancar dari sana.")

## Template

Halo {{sender_name}},

{{brief_acknowledgment}}

{{handoff_reason}} Yang lebih tepat untuk membantu adalah {{recipient_name_and_role}}, bisa dihubungi di {{recipient_contact}}.

{{context_handed_over}}

{{closing_courtesy}}

## Tone guide

Tegas tapi ramah, jelas tapi tidak dingin. Handoff yang baik memberi tiga hal: alasan singkat, nama + cara kontak yang spesifik, dan jaminan bahwa konteks sudah/akan diteruskan. Hindari frase seperti "bukan urusan saya" — selalu reframe sebagai siapa yang LEBIH tepat. Kalau bisa CC pihak baru langsung di balasan, sebut ini eksplisit supaya pengirim tahu bola sudah pindah.
