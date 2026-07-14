# Template — Daily summary

Dipakai di akhir hari (default 17:30-18:30 WIB) sebagai penutup untuk customer sendiri — bukan untuk dikirim ke orang lain. Audiens: customer, dibaca pelan sebagai cara menutup hari kerja sebelum pindah ke ruang pribadi.

## Variables

- `{{first_name}}` — string, nama panggilan customer
- `{{date_short}}` — string, tanggal singkat (mis. "Jumat, 8 Mei")
- `{{accomplishments}}` — markdown bullet list, 3-5 hal yang selesai hari ini (besar atau kecil, yang penting nyata)
- `{{tomorrow_focus}}` — string, satu hal utama yang akan jadi fokus besok pagi
- `{{tomorrow_first_action}}` — string, satu langkah konkret yang dimulai dalam 30 menit pertama besok
- `{{win_to_remember}}` — string, satu momen kecil dari hari ini yang layak diingat — bukan harus hasil besar, bisa momen ringan (mis. "Kopi sore di Setiabudi setelah meeting selesai cepat.")

## Template

# Penutup hari — {{date_short}}

Selamat sore, {{first_name}}.

## Yang selesai hari ini

{{accomplishments}}

## Fokus besok

{{tomorrow_focus}}

**Langkah pertama saat duduk besok:** {{tomorrow_first_action}}

---

## Satu kemenangan kecil untuk diingat

{{win_to_remember}}

Selamat istirahat.

## Tone guide

Lembut, menutup, personal. Berbeda dari weekly recap yang reflektif analitis — daily summary lebih kontemplatif, lebih dekat ke "selamat istirahat" daripada "evaluasi hari". Bagian "kemenangan untuk diingat" sengaja kecil — bukan achievement profesional, bisa momen personal yang menenangkan. Penutup eksplisit ("selamat istirahat") menandai batas antara kerja dan ruang pribadi.
