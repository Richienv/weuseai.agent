# Template — Briefing pagi sadar hari libur

Varian briefing pagi yang sadar konteks hari libur Indonesia. Sebelum render, skill harus klasifikasi tanggal hari ini sebagai salah satu dari empat kategori: (1) hari libur nasional sesuai Kepmen Menaker / Kepmen Agama, (2) cuti bersama yang ditetapkan SKB tiga menteri, (3) akhir pekan biasa (Sabtu/Minggu), atau (4) hari kerja normal. Briefing menyesuaikan isi berdasarkan kategori.

Audiens: customer sendiri. Dibaca pagi hari sebelum buka laptop — supaya jelas hari ini "on" atau "off" dan apa yang ditunda.

## Variables

- `{{first_name}}` — string, nama panggilan customer.
- `{{date_long}}` — string, tanggal panjang Bahasa Indonesia (mis. "Senin, 17 Agustus 2026").
- `{{holiday_category}}` — enum: `libur_nasional` | `cuti_bersama` | `akhir_pekan` | `hari_kerja`. Klasifikasi by skill engine.
- `{{holiday_name}}` — string opsional, nama hari libur kalau ada (mis. "HUT Kemerdekaan RI ke-81", "Idul Fitri 1447 H", "Natal", "Tahun Baru Imlek"). Kosong untuk akhir pekan biasa.
- `{{holiday_context_note}}` — string, satu kalimat konteks kultural yang relevan (mis. "Kantor pemerintah dan bank tutup, sebagian besar perusahaan swasta juga libur. Lalu lintas Jakarta biasanya lebih lengang pagi sampai sore."). Spesifik per holiday.
- `{{personal_calendar_today}}` — markdown bullet list, hanya acara personal/keluarga yang sudah customer set untuk hari ini. Acara kerja di-skip kalau holiday_category bukan hari_kerja.
- `{{deferred_items}}` — markdown bullet list, hal kerja yang ditunda karena hari libur — dengan tanggal target follow-up di hari kerja berikutnya (mis. "- Kirim revisi proposal ke Pak Anwar — pindah ke Selasa, 18 Agustus pagi").
- `{{next_working_day}}` — string, nama + tanggal hari kerja berikutnya (mis. "Selasa, 18 Agustus 2026").
- `{{next_working_day_priorities}}` — markdown bullet list, 3 hal yang harus dibahas atau diselesaikan hari kerja pertama setelah libur.
- `{{rest_or_focus_prompt}}` — string opsional, satu pertanyaan reflektif. Untuk libur: "Apa yang ingin kamu lakukan untuk diri sendiri hari ini?" Untuk hari kerja: pakai prompt fokus seperti biasa.

## Template

Selamat pagi, {{first_name}}.

# Briefing pagi — {{date_long}}

## Status hari ini

{{#if holiday_category == "libur_nasional"}}
Hari ini **{{holiday_name}}** — libur nasional sesuai keputusan resmi pemerintah.

{{holiday_context_note}}
{{/if}}

{{#if holiday_category == "cuti_bersama"}}
Hari ini **cuti bersama** dalam rangka {{holiday_name}} — ditetapkan SKB tiga menteri sebagai hari libur fakultatif yang umum diambil mayoritas perusahaan.

{{holiday_context_note}}

Catatan: kalau perusahaan kamu tidak ikut cuti bersama, briefing tetap berlaku sebagai hari kerja biasa.
{{/if}}

{{#if holiday_category == "akhir_pekan"}}
Akhir pekan. Tidak ada agenda kerja yang dijadwalkan.

{{holiday_context_note}}
{{/if}}

{{#if holiday_category == "hari_kerja"}}
Hari kerja normal. Briefing lengkap tersedia di template `morning-briefing.md`.
{{/if}}

## Agenda personal hari ini

{{personal_calendar_today}}

## Yang ditunda karena libur

{{deferred_items}}

Semua sudah di-flag untuk follow-up di hari kerja berikutnya. Kamu tidak perlu menyimpan ini di kepala.

## Yang harus dibahas {{next_working_day}}

{{next_working_day_priorities}}

---

## Catatan pagi

{{rest_or_focus_prompt}}

## Tone guide

Tenang, melepaskan, anti-hustle. Berbeda dari briefing hari kerja yang aktif-anticipatory — versi hari libur lebih kontemplatif dan eksplisit memberi izin untuk tidak kerja. Tiga prinsip:

1. **Eksplisit kasih izin istirahat.** Phrase seperti "kamu tidak perlu menyimpan ini di kepala" adalah inti — orang Indonesia yang work-conscious sering tetap "on" di hari libur karena takut lupa. Briefing ini fungsinya jadi penjaga supaya kerja benar-benar di-hold.
2. **Hormati konteks hari libur.** Untuk libur keagamaan seperti Idul Fitri, Natal, Nyepi, Waisak — gunakan kalimat netral yang sadar mayoritas agama Indonesia (Islam) tapi tidak presumes customer perayaan tertentu. Untuk libur nasional sekuler seperti HUT Kemerdekaan, boleh lebih ekspresif.
3. **Sediakan jembatan ke hari kerja berikutnya.** Section "yang ditunda" dan "yang harus dibahas hari kerja berikutnya" adalah safety net — customer bisa istirahat karena tahu sudah ada catatan. Tanpa ini, banyak founder tetap buka laptop "sebentar saja" yang berakhir 3 jam.

Cuti bersama dapat catatan terpisah karena ambiguitas: beberapa perusahaan (terutama startup) tetap kerja, beberapa korporat besar tutup penuh. Briefing tidak memaksa kategori, customer yang putuskan.
