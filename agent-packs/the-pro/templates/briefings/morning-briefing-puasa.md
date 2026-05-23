# Template — Briefing pagi selama bulan Ramadhan

Varian briefing pagi yang sadar ritme puasa selama bulan Ramadhan. Disesuaikan dengan jam sahur/buka di Jakarta (default), pergeseran jam kantor yang umum berlaku di banyak perusahaan Indonesia (08.00-15.00 atau 09.00-16.00 dengan dispensasi), dan rekomendasi penjadwalan yang menghormati ibadah ashar-maghrib.

Audiens: customer sendiri, dibaca setelah sahur atau sebelum subuh. Briefing yang sama struktur dengan `morning-briefing.md` tapi dengan dua section tambahan: timing puasa dan rekomendasi rapat.

## Variables

- `{{first_name}}` — string, nama panggilan customer.
- `{{date_long_hijri}}` — string, tanggal lengkap dengan Hijriah (mis. "Senin, 5 Maret 2026 / 15 Ramadhan 1447 H").
- `{{date_long}}` — string, tanggal panjang Bahasa Indonesia (mis. "Senin, 5 Maret 2026").
- `{{imsak_time}}` — string, jam imsak format 24h WIB (mis. "04.31 WIB").
- `{{subuh_time}}` — string, jam subuh format 24h WIB (mis. "04.41 WIB").
- `{{maghrib_time}}` — string, jam maghrib / buka puasa format 24h WIB (mis. "18.03 WIB").
- `{{ashar_time}}` — string, jam ashar format 24h WIB (mis. "15.18 WIB"). Dipakai untuk rekomendasi window rapat sore.
- `{{adjusted_office_hours}}` — string, jam kantor yang disesuaikan kalau perusahaan customer ikut pola Ramadhan (mis. "08.00 – 15.00 WIB", "09.00 – 16.00 WIB"). Kosongkan kalau jam kantor tetap normal.
- `{{calendar_summary}}` — markdown bullet list, ringkasan acara hari ini dengan annotation kalau ada yang konflik dengan window ibadah (mis. "- 15.30 WIB Rapat strategi Q3 — **catatan: mendekati waktu ashar, pertimbangkan reschedule atau set hard-end 15.20**").
- `{{email_important}}` — markdown bullet list, email penting hari ini.
- `{{email_followup}}` — markdown bullet list, email follow-up.
- `{{email_noise_count}}` — integer, jumlah email noise.
- `{{day_intensity_note}}` — string, satu kalimat yang sadar puasa (mis. "Hari ini cukup ringan — 2 meeting pagi, sisa hari untuk fokus dalam. Energi biasanya turun pasca dzuhur, schedule deep work sebelum jam 12.").
- `{{ngabuburit_note}}` — string opsional, catatan kalau jam sore (sekitar 16.00-18.00) ada agenda yang sebaiknya tidak diisi rapat berat karena banyak orang sudah dalam mode ngabuburit (mis. "Window 16.30-18.00 ngabuburit — hindari rapat strategis, banyak tim sudah dalam mode persiapan buka.").
- `{{reflection_prompt}}` — string, satu pertanyaan reflektif yang sadar konteks puasa (mis. "Satu hal yang kamu ingin selesaikan sebelum berbuka hari ini?").

## Template

Assalamu'alaikum, {{first_name}}. Selamat berpuasa.

# Briefing pagi Ramadhan — {{date_long_hijri}}

## Waktu ibadah hari ini

- Imsak: **{{imsak_time}}**
- Subuh: **{{subuh_time}}**
- Ashar: **{{ashar_time}}**
- Maghrib / Buka: **{{maghrib_time}}**

{{#if adjusted_office_hours}}**Jam kantor disesuaikan:** {{adjusted_office_hours}}{{/if}}

## Rekomendasi penjadwalan hari ini

- **Deep work window:** pagi setelah subuh sampai dzuhur (sekitar 05.30 – 11.30 WIB). Energi mental paling tinggi sebelum siang, sebelum efek puasa terasa.
- **Hindari rapat strategis:** window ashar-maghrib (sekitar 15.00 – 18.00 WIB). Banyak peserta dalam mode persiapan buka, fokus turun.
- **Last-call meeting:** idealnya semua rapat penting selesai sebelum 15.30 WIB. Setelah itu, biasakan hanya internal sync ringan.
{{#if ngabuburit_note}}- **Ngabuburit window:** {{ngabuburit_note}}{{/if}}

## Kalender

{{calendar_summary}}

## Email

### Penting
{{email_important}}

### Follow-up
{{email_followup}}

### Noise ({{email_noise_count}})
Newsletter, promo, otomatis. Aman dilewati.

---

{{day_intensity_note}}

## Refleksi pagi

{{reflection_prompt}}

## Tone guide

Tenang, hormat-ibadah, sadar-fisik. Berbeda dari briefing biasa yang berorientasi produktivitas — versi Ramadhan menyeimbangkan target kerja dengan respect terhadap ritme spiritual dan kapasitas tubuh yang menurun akibat puasa.

Tiga prinsip:

1. **Pembuka "Assalamu'alaikum" untuk customer Muslim yang puasa.** Kalau customer non-Muslim atau Muslim yang tidak puasa karena alasan kesehatan/perjalanan, skill engine harus pakai briefing biasa, bukan versi Ramadhan ini. Pembuka salam adalah marker spiritual yang penting — jangan dipakai generik.
2. **Surface jam ibadah sebagai data, bukan reminder.** Customer Muslim dewasa sudah punya aplikasi adzan. Briefing menampilkan jam supaya konteks scheduling jelas — bukan sebagai dakwah. Tetap netral.
3. **Window ashar-maghrib adalah aturan operasional, bukan opsional.** Banyak founder Indonesia masih schedule rapat jam 16.00-17.30 di bulan puasa dan kemudian heran kenapa attendance rendah atau peserta lesu. Briefing eksplisit kasih frame "hindari rapat strategis" sebagai default — supaya customer pakai data untuk negosiasi reschedule.

Versi ini default untuk Jakarta (WIB) — kalau customer di Bali (WITA) atau Indonesia Timur (WIT), skill engine harus offset jam ibadah sesuai zona waktu. Default ke WIB karena mayoritas customer di Jabodetabek.

Catatan kultural: untuk industri F&B, hospitality, atau retail yang justru peak season di bulan puasa (jelang Lebaran), template ini perlu disesuaikan — beberapa tim memang kerja shift sore-malam untuk handle volume buka puasa dan persiapan Idul Fitri. Customer di industri ini bisa request varian khusus, briefing default ini mengasumsikan customer kantoran corporate yang ikut pola standar.
