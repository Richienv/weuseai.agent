# Template — Reply (decline)

Dipakai saat menolak permintaan dengan elegan — undangan yang tidak bisa diambil, scope tambahan yang tidak masuk, vendor yang tidak dipilih. Audiens: pengirim asli pesan. Tujuan: tutup pintu tanpa membakar jembatan.

## Variables

- `{{sender_name}}` — string, nama pengirim
- `{{empathy_line}}` — string, satu kalimat yang mengakui niat baik atau effort pengirim (mis. "Terima kasih sudah mempertimbangkan aku untuk panel ini.")
- `{{decline_statement}}` — string, pernyataan menolak yang jelas dan langsung, tanpa "mungkin" atau "sepertinya". 1-2 kalimat.
- `{{brief_reason}}` — string, alasan singkat tanpa over-explain. Boleh kosong kalau alasan tidak perlu dibagi (mis. "Jadwal di tanggal itu sudah penuh komitmen yang sulit dipindah.")
- `{{alternative_or_referral}}` — string opsional, alternatif yang ditawarkan kalau ada (mis. "Kalau tetap butuh perspektif serupa, [nama] di [tempat] kerjanya mirip dan mungkin tertarik.") atau kosong kalau memang tidak ada
- `{{warm_close}}` — string, penutup yang tetap hangat (mis. "Semoga acaranya lancar.")
- `{{customer_signature_name}}` — string, nama customer

## Template

Halo {{sender_name}},

{{empathy_line}}

{{decline_statement}} {{brief_reason}}

{{alternative_or_referral}}

{{warm_close}}

Salam,
{{customer_signature_name}}

## Tone guide

Empati nyata, ketegasan jelas, penutup hangat. Hindari "maaf" yang berlebihan — sekali cukup, lebih dari itu jadi terdengar bersalah. Decline statement harus tidak ambigu: "Aku belum bisa ambil ini" lebih jelas dari "Kayaknya berat ya." Alasan singkat, tidak panjang lebar — over-explain memberi pintu untuk dinegosiasi balik. Kalau ada alternatif tulus, tawarkan; kalau tidak, jangan dipaksakan.
