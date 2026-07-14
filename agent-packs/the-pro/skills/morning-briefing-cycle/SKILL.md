---
skill_kind: playbook
name: morning-briefing-cycle
bundle: the-pro
flow_state_playbook_id: morning-briefing-cycle
total_steps: 5
use_cases:
  - "Cron 07:00 WIB harian — auto-deliver briefing pagi ke Telegram customer"
  - "Customer minta 'kasih briefing pagi sekarang' di luar jadwal cron"
  - "Customer baru aktif sebelum cron fires dan minta briefing on-demand"
  - "Briefing varian — hari libur nasional, cuti bersama, atau Ramadhan — auto-pilih template sesuai konteks"
prerequisites:
  - "Customer tier Starter / Pro / Studio (The Pro available di semua tier)"
  - "Channel Telegram terhubung — customer sudah onboarding bot token"
  - "Timezone customer ter-set (default Asia/Jakarta) supaya cron 07:00 WIB tepat"
escalation_to: customer
---

# morning-briefing-cycle — the-pro playbook

Playbook untuk satu siklus briefing pagi harian. Mulai dari intake tanggal dan klasifikasi konteks (hari libur, Ramadhan, hari kerja biasa), pull konteks kemarin yang masih outstanding, assemble briefing pakai template yang tepat, lalu kirim ke Telegram customer. Cron 07:00 WIB jadi trigger default tiap hari, customer juga bisa request manual.

Briefing pagi sampai langsung tanpa lewat persetujuan — ini briefing untuk customer sendiri, bukan dokumen yang dilihat orang lain. Gerbang eskalasi semua langkah `none` karena tidak ada cabang yang butuh approval eksternal. Customer yang mau adjust isi atau jadwal — bisa lewat percakapan terpisah, bukan parkir di tengah cycle.

## Kapan dipakai

Cron 07:00 WIB harian default fires, atau customer minta on-demand. Trigger phrases:

- "kasih briefing pagi sekarang"
- "briefing dong"
- "apa agenda hari ini"
- "rangkum pagi"
- "kirim morning briefing"

Kalau customer minta varian khusus — "briefing tanpa weather", "briefing singkat aja" — adjust di Langkah 4 saat komposisi, tidak perlu cycle baru.

## Cara kerja

Playbook dijalankan oleh state-machine engine `flow-state`. Engine menyimpan posisi langkah dan hasil tiap langkah, jadi alur tetap utuh walau ada jeda antara fetch konteks dan pengiriman.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "morning-briefing-cycle", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai:

- `start` — mulai run baru. Kirim `total_steps: 5`. Cursor balik ke Langkah 1, status `in_progress`, `state_data` kosong.
- `get` — baca run berjalan: `current_step`, `status`, dan `state_data` (gabungan output semua langkah sebelumnya).
- `advance` — catat output langkah ini lewat `step_output` (di-shallow-merge ke `state_data`), geser cursor +1.
- `complete` — tandai run selesai setelah Langkah 5 sukses.
- `abort` — batalkan run (mis. channel Telegram putus).

### Trigger dari cron, satu run per hari

Run morning-briefing-cycle berumur satu hari. Cron 07:00 WIB memanggil `start` baru tiap pagi — tidak `get` + `advance` ke run kemarin. Kalau run kemarin masih `in_progress` saat cron fire (mis. customer tidak online sepanjang hari atau pengiriman gagal terus), run lama di-`abort` dulu, lalu run baru di-`start`. Begini supaya briefing hari ini tidak terkontaminasi state kemarin.

### Klasifikasi konteks di Langkah 1 menentukan template di Langkah 4

Langkah 1 klasifikasi tanggal hari ini ke salah satu kategori: `libur_nasional`, `cuti_bersama`, `akhir_pekan`, `ramadhan`, atau `hari_kerja`. Kategori ini ditulis ke `state_data.day_kind`. Langkah 4 baca `state_data.day_kind` dan pilih template sesuai:

- `libur_nasional` / `cuti_bersama` / `akhir_pekan` → `briefings/morning-briefing-hari-libur.md`
- `ramadhan` → `briefings/morning-briefing-puasa.md`
- `hari_kerja` (default) → `briefings/morning-briefing.md`

Engine tidak punya cabang khusus — agent yang membaca `day_kind` dan memilih template path.

## Langkah-langkah

### Langkah 1 — Intake tanggal dan klasifikasi konteks hari  ·  estimasi 1 menit

- **Aksi:** Identifikasi trigger — cron 07:00 WIB atau pesan customer. Catat tanggal hari ini (timezone customer, default Asia/Jakarta). Klasifikasi `day_kind`: cek kalender Indonesia (Kepmen Menaker / SKB tiga menteri) untuk libur nasional atau cuti bersama; cek Sabtu/Minggu untuk akhir pekan; cek kalender Hijriyah untuk Ramadhan; default `hari_kerja`. Pull jadwal meeting hari ini dari kalender customer. Panggil `start` flow-state dengan `total_steps: 5`. Kalau run kemarin belum `completed`, `abort` dulu lalu mulai run baru.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `start`
- **Input yang diharapkan:** Payload cron berisi `customer_id` dan tanggal, atau pesan customer trigger. Akses kalender customer untuk pull meeting hari ini.
- **Output yang diharapkan:** Objek intake ke `step_output` — `{ "date_iso", "date_long", "day_kind", "holiday_name"?, "scheduled_meetings": [...], "trigger": "cron"|"customer" }`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:** `date_iso` valid format YYYY-MM-DD. `day_kind` salah satu dari lima enum. Untuk `libur_nasional` atau `cuti_bersama`, `holiday_name` terisi. `scheduled_meetings` boleh kosong kalau hari libur atau memang tidak ada meeting.

  | Kondisi | Tindakan |
  |---|---|
  | Klasifikasi sukses, kalender terbaca | `advance` ke Langkah 2 |
  | Kalender customer tidak bisa diakses | `advance` ke Langkah 2 dengan `scheduled_meetings: []` dan catatan `calendar_unavailable: true` |
  | Tanggal tidak valid (mis. cron payload corrupt) | Jangan `start`, log error, tunggu cron berikutnya |

- **Gerbang eskalasi:** `none`. Klasifikasi otomatis dari data publik (kalender libur, kalender customer) — tidak butuh keputusan customer di langkah ini.
- **Error handling:** Kalau `start` gagal, ulangi sekali. Kalau tetap gagal dan trigger cron, log dan tunggu siklus berikutnya. Untuk trigger customer, sampaikan "Aku belum bisa siapkan briefing-nya, coba lagi sebentar."

### Langkah 2 — Pull outstanding dari kemarin  ·  estimasi 1-2 menit

- **Aksi:** Tarik item dari ringkasan akhir hari kemarin yang masih outstanding atau perlu konfirmasi — task yang belum tuntas, pesan stakeholder yang belum dibalas, follow-up yang tertunda. Sumber data: memori lintas sesi Hermes (run `end-of-day-summary` kemarin kalau ada), plus thread email/chat yang masih open.
- **Tautan/endpoint:** Memori lintas sesi Hermes (cross-session memory built-in).
- **Input yang diharapkan:** `date_iso` dari `state_data` (Langkah 1) untuk window kemarin.
- **Output yang diharapkan:** Daftar carry-over ke `step_output` — `{ "outstanding_from_yesterday": [...], "perlu_konfirmasi_pending": [...], "first_thing_planned"?: "<note dari end-of-day kemarin kalau ada>" }`. Tiap item berisi deskripsi singkat, owner/stakeholder, dan kapan terakhir tersentuh.
- **Validasi:** Tiap item punya konteks cukup untuk muncul di briefing (deskripsi + alasan masih open). Item yang sudah resolved kemarin malam tapi belum ter-update di memori — di-filter.

  | Kondisi | Tindakan |
  |---|---|
  | Ada carry-over yang relevan | `advance` ke Langkah 3 |
  | Tidak ada outstanding (hari sebelumnya tuntas atau customer baru) | `advance` ke Langkah 3 dengan list kosong |
  | Memori tidak bisa diakses | `advance` ke Langkah 3 dengan list kosong dan catatan `memory_unavailable: true` |

- **Gerbang eskalasi:** `none`. Pull konteks adalah aksi internal — tidak butuh approval customer.
- **Error handling:** Kalau memori gagal diakses, lanjut dengan list kosong supaya briefing tetap bisa jadi. Sebut keterbatasan di langkah 4 sebagai catatan jujur, jangan sembunyikan.

### Langkah 3 — Pull konteks pagi: berita, cuaca, jadwal meeting  ·  estimasi 1-2 menit

- **Aksi:** Tarik konteks pagi yang relevan — headline berita Indonesia (3-5 baris), perkiraan cuaca Jakarta atau kota customer, jadwal meeting hari ini (sudah di-pull di Langkah 1, di-format ulang di sini). Untuk hari libur, skip jadwal meeting kerja; tetap surface acara personal kalau ada. Untuk Ramadhan, tambah waktu imsak/subuh/ashar/maghrib WIB.
- **Tautan/endpoint:** `hermes-skill:daily-briefing` mode `morning-context-fetch` untuk berita + cuaca; kalender customer untuk meeting; kalender Hijriyah untuk waktu shalat (saat `day_kind == "ramadhan"`).
- **Input yang diharapkan:** `date_iso`, `day_kind`, `scheduled_meetings` dari `state_data`.
- **Output yang diharapkan:** Konteks pagi ke `step_output` — `{ "news_headlines": [...], "weather_summary", "personal_calendar_today"?, "prayer_times"? }`. `prayer_times` hanya terisi saat `day_kind == "ramadhan"`.
- **Validasi:** Berita relevan (Indonesia-focused, bukan global noise). Cuaca punya angka konkret (suhu, kemungkinan hujan). Untuk Ramadhan, jam shalat dalam WIB dengan format jelas.

  | Kondisi | Tindakan |
  |---|---|
  | Semua konteks ter-fetch | `advance` ke Langkah 4 |
  | Sumber tertentu gagal (mis. berita timeout) | `advance` ke Langkah 4 dengan section yang gagal kosong, tandai di catatan |
  | Tidak ada konteks sama sekali (semua sumber down) | `advance` ke Langkah 4 dengan briefing minimal — tetap kirim, jangan skip |

- **Gerbang eskalasi:** `none`. Pull konteks publik tidak butuh approval customer.
- **Error handling:** Kalau fetch berita atau cuaca gagal, jangan retry agresif — briefing dengan section kosong yang ditandai lebih baik daripada tidak ada briefing sama sekali. Catat `partial_context: true` ke `state_data`.

### Langkah 4 — Assemble briefing pakai template sesuai day_kind  ·  estimasi 1-2 menit

- **Aksi:** Pilih template berdasarkan `state_data.day_kind`. Untuk `libur_nasional` / `cuti_bersama` / `akhir_pekan` pakai `briefings/morning-briefing-hari-libur.md`. Untuk `ramadhan` pakai `briefings/morning-briefing-puasa.md`. Untuk `hari_kerja` (default) pakai `briefings/morning-briefing.md`. Isi variable template dari `state_data` — `first_name`, `date_long`, `holiday_name` kalau ada, `personal_calendar_today` atau `scheduled_meetings`, `prayer_times` saat Ramadhan, `deferred_items` dari outstanding kemarin, `news_headlines`, `weather_summary`. Render ke teks markdown final siap kirim.
- **Tautan/endpoint:** `hermes-skill:daily-briefing` mode `template-render` dengan template path sesuai `day_kind`.
- **Input yang diharapkan:** Seluruh `state_data` — `day_kind`, `date_long`, `scheduled_meetings`, `outstanding_from_yesterday`, `news_headlines`, `weather_summary`, `prayer_times` kalau ada.
- **Output yang diharapkan:** Draft briefing final ke `step_output` — `{ "briefing_markdown", "template_used", "delivery_channel": "telegram" }`. `briefing_markdown` adalah teks final siap kirim ke Telegram.
- **Validasi:** Briefing mencakup semua section yang ada datanya. Section yang kosong (mis. tidak ada meeting hari libur) ditandai eksplisit "Hari ini tidak ada agenda kerja" daripada dilewati diam-diam. Template yang dipilih cocok dengan `day_kind`.

  | Kondisi | Tindakan |
  |---|---|
  | Render sukses, briefing siap kirim | `advance` ke Langkah 5 |
  | Template tidak bisa di-load | Ulangi sekali; kalau tetap gagal pakai fallback teks plain dengan section dasar |
  | Variable kunci hilang (mis. `first_name`) | Pakai placeholder netral ("Selamat pagi") dan lanjut |

- **Gerbang eskalasi:** `none`. Briefing pagi untuk customer sendiri — tidak butuh review pihak lain sebelum kirim. Langsung ke Langkah 5 untuk pengiriman.
- **Error handling:** Kalau komposisi gagal, ulangi dengan data yang sama dari `state_data` — tidak perlu mengulang fetch. Kalau tetap gagal, kirim briefing minimal text plain dengan tanggal dan tiga item teratas dari outstanding supaya customer tetap dapat sinyal pagi.

### Langkah 5 — Kirim briefing ke Telegram dan tutup siklus  ·  estimasi 1 menit

- **Aksi:** Kirim `briefing_markdown` ke channel Telegram customer. Setelah terkirim, panggil `complete`. Untuk trigger cron, tidak ada konfirmasi balasan ke customer — briefing sendiri yang jadi konfirmasi. Untuk trigger customer, briefing yang sampai sebagai jawaban langsung dari request.
- **Tautan/endpoint:** Channel Telegram terhubung customer lewat pengiriman pesan keluar Hermes. Lalu `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete`.
- **Input yang diharapkan:** `briefing_markdown` dan `delivery_channel` dari `state_data` (hasil Langkah 4).
- **Output yang diharapkan:** Konfirmasi pengiriman ke `step_output` — `{ "sent_at", "channel": "telegram", "message_id" }`. Run berstatus `completed`.
- **Validasi:** Channel Telegram terhubung. Briefing terkirim sukses (HTTP 200 dari Telegram Bot API). `message_id` tercatat untuk audit.

  | Kondisi | Tindakan |
  |---|---|
  | Pengiriman sukses | `complete` run |
  | Pengiriman gagal sekali | Ulangi sekali setelah jeda singkat |
  | Pengiriman gagal berulang | Jangan `complete`. Tahan briefing di `state_data`, log untuk debug, dan biarkan run berikutnya next cycle |
  | Channel Telegram putus | Jangan kirim ke channel lain — tandai run sebagai `aborted` dengan alasan `channel_disconnected` |

- **Gerbang eskalasi:** `none`. Langkah penutup — briefing pagi auto-deliver tanpa approval pihak lain. Untuk trigger customer, briefing yang sampai sebagai jawaban langsung.
- **Error handling:** Kalau Telegram unreachable, jangan `abort` agresif — tahan briefing dan retry sekali. Kalau channel customer memang putus (token revoked), tandai `aborted` dengan alasan jelas supaya log bisa dipakai customer-support untuk re-connect.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue")
- Nada calm, observasional, anticipatory — seperti executive assistant yang sudah lama kerja sama customer
- Kalimat pendek di briefing. Satu ide per kalimat
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh customer
- Tidak ada error code numerik atau acronim tech bocor ke customer — kalau fetch gagal, sampaikan dalam bahasa biasa
- Zero exclamation marks
- Untuk hari libur, eksplisit kasih izin istirahat — bukan dorong produktivitas
- Untuk Ramadhan, hormati ritme ibadah — pembuka "Assalamu alaikum" untuk customer Muslim yang berpuasa

## Decline criteria

- **Briefing tanpa channel terhubung.** Kalau Telegram customer belum siap, aku tidak kirim ke channel lain. Tahan briefing, log status `channel_disconnected`, tunggu customer re-connect.
- **Briefing dengan data palsu kalau semua sumber down.** Kalau berita, cuaca, kalender, dan memori semua gagal, aku kirim briefing minimal yang jujur tentang keterbatasan — bukan menambal dengan template generik yang menyamar sebagai data nyata.
- **Briefing kerja di hari libur nasional.** Untuk `libur_nasional` atau `cuti_bersama`, briefing pakai template hari-libur yang skip jadwal kerja dan kasih izin istirahat. Customer yang minta "tetap kasih briefing kerja walau libur" — aku tanya konfirmasi sekali sebelum override.
- **Run cycle yang ditinggalkan dari hari sebelumnya.** Tiap pagi adalah run baru. Run kemarin yang belum `completed` di-`abort` di Langkah 1 dan tidak dilanjutkan.

## Decline kalau missing context

Kalau customer minta "kasih briefing pagi" tapi belum onboarding (Telegram token belum di-set, kalender belum terhubung) — tanya: "Aku butuh akses Telegram dan kalender kamu dulu untuk siapkan briefing yang berguna. Mau kita set up sekarang." Tidak buat briefing kosong yang menyamar sebagai siap-pakai.
