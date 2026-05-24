---
skill_kind: playbook
name: end-of-day-summary
bundle: the-pro
flow_state_playbook_id: end-of-day-summary
total_steps: 6
use_cases:
  - "Cron 18:00 WIB harian — auto-deliver ringkasan akhir hari ke Telegram customer"
  - "Customer minta 'rangkum hari ini dong' sebelum cron fires"
  - "Customer tutup laptop lebih awal dan minta summary on-demand"
  - "Persiapan handover ke executive assistant atau staf admin keesokan paginya"
prerequisites:
  - "Customer tier Starter / Pro / Studio (The Pro available di semua tier)"
  - "Channel Telegram terhubung — customer sudah onboarding bot token"
  - "Timezone customer ter-set (default Asia/Jakarta) supaya cron 18:00 WIB tepat"
  - "Ada aktivitas hari ini yang bisa diringkas (meeting selesai, task tuntas, thread aktif)"
escalation_to: customer
---

# end-of-day-summary — the-pro playbook

Playbook untuk satu siklus ringkasan akhir hari operasional. Mulai dari intake (tanggal, jadwal meeting yang sudah selesai), pull task hari ini yang sudah tuntas, identifikasi outstanding untuk besok, flag item perlu-konfirmasi yang menunggu respon stakeholder, assemble ringkasan pakai template `end-of-day-summary-bahasa`, lalu kirim ke Telegram customer. Cron 18:00 WIB jadi trigger default tiap sore, customer juga bisa request manual.

Ringkasan akhir hari sampai langsung tanpa lewat persetujuan — ini ringkasan operasional untuk customer sendiri (atau di-forward ke staf admin oleh customer manual), bukan dokumen yang dilihat stakeholder eksternal. Gerbang eskalasi semua langkah `none` karena tidak ada cabang yang butuh approval eksternal.

## Kapan dipakai

Cron 18:00 WIB harian default fires, atau customer minta on-demand. Trigger phrases:

- "rangkum hari ini"
- "kasih summary akhir hari"
- "tutup hari ini gimana"
- "ringkasan operasional sore"
- "kirim end-of-day"

Kalau customer minta ringkasan reflektif-personal (bukan operasional), arahkan ke template `daily-summary.md` lewat skill `daily-briefing` mode `end-of-day-reflective` — bukan playbook ini. Playbook ini fokus Jakarta-pace operasional dengan section perlu-konfirmasi.

## Cara kerja

Playbook dijalankan oleh state-machine engine `flow-state`. Engine menyimpan posisi langkah dan hasil tiap langkah, jadi alur tetap utuh walau ada jeda antara fetch task dan pengiriman.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "end-of-day-summary", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai:

- `start` — mulai run baru. Kirim `total_steps: 6`. Cursor balik ke Langkah 1, status `in_progress`, `state_data` kosong.
- `get` — baca run berjalan: `current_step`, `status`, dan `state_data` (gabungan output semua langkah sebelumnya).
- `advance` — catat output langkah ini lewat `step_output` (di-shallow-merge ke `state_data`), geser cursor +1.
- `complete` — tandai run selesai setelah Langkah 6 sukses.
- `abort` — batalkan run (mis. channel Telegram putus).

### Trigger dari cron, satu run per hari

Run end-of-day-summary berumur satu hari. Cron 18:00 WIB memanggil `start` baru tiap sore — tidak `get` + `advance` ke run kemarin. Kalau run kemarin masih `in_progress` saat cron fire (mis. pengiriman gagal terus atau customer tidak online), run lama di-`abort` dulu lalu run baru di-`start`.

### Section perlu-konfirmasi adalah pembeda Jakarta-pace

Langkah 4 khusus flag item yang menunggu respon dari pihak eksternal — stakeholder, vendor, klien, atasan. Per item dicatat: nama pihak, kapan terakhir di-ping, kapan harus follow-up lagi kalau belum balas. Section ini paling kritis untuk pace Jakarta business di mana follow-up lintas hari sering slip karena pihak lain juga sibuk atau telat balas. Template `end-of-day-summary-bahasa.md` punya slot variable `{{perlu_konfirmasi}}` khusus untuk ini.

## Langkah-langkah

### Langkah 1 — Intake tanggal dan jadwal meeting yang selesai  ·  estimasi 1 menit

- **Aksi:** Identifikasi trigger — cron 18:00 WIB atau pesan customer. Catat tanggal hari ini (timezone customer, default Asia/Jakarta). Pull jadwal meeting hari ini dari kalender customer — yang sudah selesai (waktu mulai < sekarang) ditandai `completed`, yang lewat tanpa pertanda hadir ditandai `missed`. Panggil `start` flow-state dengan `total_steps: 6`. Kalau run kemarin belum `completed`, `abort` dulu lalu mulai run baru.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `start`
- **Input yang diharapkan:** Payload cron berisi `customer_id` dan tanggal, atau pesan customer trigger. Akses kalender customer untuk pull meeting hari ini.
- **Output yang diharapkan:** Objek intake ke `step_output` — `{ "date_iso", "date_short", "meetings_completed": [...], "meetings_missed": [...], "trigger": "cron"|"customer" }`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:** `date_iso` valid format YYYY-MM-DD. Daftar meeting konsisten dengan kalender (tidak ada duplikat, tidak ada acara besok yang nyasar masuk).

  | Kondisi | Tindakan |
  |---|---|
  | Klasifikasi sukses, kalender terbaca | `advance` ke Langkah 2 |
  | Kalender tidak bisa diakses | `advance` ke Langkah 2 dengan daftar meeting kosong dan catatan `calendar_unavailable: true` |
  | Tanggal tidak valid (mis. cron payload corrupt) | Jangan `start`, log error, tunggu cron berikutnya |

- **Gerbang eskalasi:** `none`. Klasifikasi dari data kalender — tidak butuh keputusan customer.
- **Error handling:** Kalau `start` gagal, ulangi sekali. Kalau tetap gagal dan trigger cron, log dan tunggu siklus berikutnya. Untuk trigger customer, sampaikan "Aku belum bisa siapkan ringkasan sore-nya, coba lagi sebentar."

### Langkah 2 — Pull task hari ini yang sudah tuntas  ·  estimasi 1-2 menit

- **Aksi:** Tarik daftar task / hal kerja yang selesai hari ini — dari memori lintas sesi Hermes (catatan customer sepanjang hari), thread email/chat yang ditutup, deliverable yang dikirim. Per item, catat deskripsi konkret dengan past-tense (mis. "Kirim revisi proposal ke PT Adhi Karya, di-acknowledge oleh Pak Anwar via WA jam 14.20").
- **Tautan/endpoint:** Memori lintas sesi Hermes (cross-session memory built-in).
- **Input yang diharapkan:** `date_iso` dari `state_data` (Langkah 1) untuk window hari ini.
- **Output yang diharapkan:** Daftar done ke `step_output` — `{ "done_today": [...] }`. Tiap item past-tense konkret dengan pihak yang relevan disebut nama-nya kalau ada.
- **Validasi:** Tiap item benar-benar selesai hari ini (bukan task yang sudah selesai kemarin tapi baru ter-log). Jumlah item realistis (1-15 typical, lebih dari 20 tanda salah filter).

  | Kondisi | Tindakan |
  |---|---|
  | Ada task yang selesai hari ini | `advance` ke Langkah 3 |
  | Hari sepi, tidak ada task selesai | `advance` ke Langkah 3 dengan `done_today: []` |
  | Memori tidak bisa diakses | `advance` ke Langkah 3 dengan list kosong dan catatan `memory_unavailable: true` |

- **Gerbang eskalasi:** `none`. Pull internal — tidak butuh approval customer.
- **Error handling:** Kalau memori gagal diakses, lanjut dengan list kosong supaya ringkasan tetap bisa jadi. Section "yang sudah dikerjakan" ditandai "Belum ter-log otomatis — kamu yang isi nanti" daripada kosong tanpa konteks.

### Langkah 3 — Identifikasi outstanding untuk besok  ·  estimasi 1-2 menit

- **Aksi:** Bandingkan daftar task hari ini dengan target awal hari (kalau briefing pagi tercatat di memori). Tandai task yang seharusnya selesai hari ini tapi belum sebagai outstanding. Tambah konteks alasan singkat per item — kenapa slip (mis. "masih nunggu data dari finance, mereka janji besok pagi"). Catat juga `notes_for_tomorrow` — warning atau konteks penting yang customer harus ingat besok.
- **Tautan/endpoint:** Memori lintas sesi Hermes — baca run `morning-briefing-cycle` hari ini untuk target awal.
- **Input yang diharapkan:** `date_iso` dan `done_today` dari `state_data`. Target awal hari dari run briefing pagi kalau ada.
- **Output yang diharapkan:** Daftar outstanding ke `step_output` — `{ "still_outstanding": [...], "notes_for_tomorrow": [...] }`. Tiap outstanding item berisi deskripsi + alasan slip + estimasi kapan bisa selesai.
- **Validasi:** Tiap item outstanding punya alasan eksplisit (bukan cuma "belum"). `notes_for_tomorrow` maksimal 3-5 item supaya tetap actionable.

  | Kondisi | Tindakan |
  |---|---|
  | Ada outstanding yang teridentifikasi | `advance` ke Langkah 4 |
  | Hari ini tuntas semua | `advance` ke Langkah 4 dengan `still_outstanding: []` |
  | Tidak ada briefing pagi yang bisa di-compare | `advance` ke Langkah 4 dengan outstanding inferred dari thread aktif yang belum closed |

- **Gerbang eskalasi:** `none`. Identifikasi internal — tidak butuh approval customer.
- **Error handling:** Kalau target awal hari tidak tercatat, jangan menebak agresif — outstanding berisi item yang jelas-jelas belum closed dari thread yang tersedia, tidak menambah item yang spekulatif.

### Langkah 4 — Flag item perlu-konfirmasi  ·  estimasi 1-2 menit

- **Aksi:** Scan thread email/chat untuk item yang customer kirim atau ping ke pihak eksternal tapi belum dapat balasan. Per item: nama pihak (Pak/Bu + nama + organisasi kalau ada), apa yang di-ping, kapan terakhir di-ping, dan rekomendasi kapan follow-up berikutnya (mis. "Senin pagi kalau masih hening", "minggu depan tanya status"). Section ini paling kritis untuk Jakarta-pace.
- **Tautan/endpoint:** Memori lintas sesi Hermes untuk thread yang masih open + commitment tracker customer kalau ada.
- **Input yang diharapkan:** `date_iso` dari `state_data`, plus akses ke thread yang masih open dari hari-hari sebelumnya.
- **Output yang diharapkan:** Daftar perlu-konfirmasi ke `step_output` — `{ "perlu_konfirmasi": [...] }`. Tiap item berisi `{ "pihak", "topik", "ping_terakhir_iso", "follow_up_recommendation" }`.
- **Validasi:** Tiap item punya nama pihak konkret (bukan "klien" generic). `ping_terakhir_iso` valid date. `follow_up_recommendation` ada — bukan "follow up later" generic.

  | Kondisi | Tindakan |
  |---|---|
  | Ada item perlu-konfirmasi | `advance` ke Langkah 5 |
  | Tidak ada thread open yang menunggu balasan | `advance` ke Langkah 5 dengan `perlu_konfirmasi: []` |
  | Akses thread terbatas | `advance` ke Langkah 5 dengan list parsial dan catatan `partial_thread_access: true` |

- **Gerbang eskalasi:** `none`. Flag adalah aksi internal — keputusan follow-up ada di customer setelah ringkasan sampai.
- **Error handling:** Kalau thread tidak bisa di-scan, jangan menebak — list kosong dengan catatan jujur lebih baik daripada item palsu yang menyesatkan customer.

### Langkah 5 — Assemble ringkasan pakai template end-of-day-summary-bahasa  ·  estimasi 1-2 menit

- **Aksi:** Render template `end-of-day-summary-bahasa.md` dengan variable dari `state_data` — `first_name`, `date_short`, `done_today`, `still_outstanding`, `notes_for_tomorrow`, `perlu_konfirmasi`, `tomorrow_first_thing` (satu hal konkret yang customer akan lakukan besok pagi, inferred dari outstanding atau notes), `customer_signature_name` kalau customer mau ringkasan ini bisa di-forward ke staf admin.
- **Tautan/endpoint:** `hermes-skill:daily-briefing` mode `template-render` dengan template `end-of-day-summary-bahasa.md`.
- **Input yang diharapkan:** Seluruh `state_data` — `date_short`, `done_today`, `still_outstanding`, `notes_for_tomorrow`, `perlu_konfirmasi`, plus profil customer untuk `first_name`.
- **Output yang diharapkan:** Draft ringkasan final ke `step_output` — `{ "summary_markdown", "template_used": "end-of-day-summary-bahasa.md", "delivery_channel": "telegram" }`. `summary_markdown` adalah teks final siap kirim.
- **Validasi:** Ringkasan mencakup semua section yang ada datanya. Section yang kosong (mis. tidak ada outstanding hari ini) ditandai eksplisit "Hari ini tuntas — tidak ada yang outstanding" daripada dilewati diam-diam. Section perlu-konfirmasi harus muncul kalau ada item (jangan di-merge ke outstanding).

  | Kondisi | Tindakan |
  |---|---|
  | Render sukses, ringkasan siap kirim | `advance` ke Langkah 6 |
  | Template tidak bisa di-load | Ulangi sekali; kalau tetap gagal pakai fallback teks plain dengan tiga section dasar (done / outstanding / perlu-konfirmasi) |
  | Data sepi total (semua section kosong) | `advance` ke Langkah 6 dengan ringkasan singkat "Hari sepi — tidak ada aktivitas yang ter-log" |

- **Gerbang eskalasi:** `none`. Ringkasan untuk customer sendiri — tidak butuh review pihak lain sebelum kirim.
- **Error handling:** Kalau komposisi gagal, ulangi dengan data yang sama dari `state_data` — tidak perlu mengulang fetch. Kalau tetap gagal, kirim ringkasan minimal supaya customer tetap dapat sinyal akhir hari.

### Langkah 6 — Kirim ringkasan ke Telegram dan tutup siklus  ·  estimasi 1 menit

- **Aksi:** Kirim `summary_markdown` ke channel Telegram customer. Setelah terkirim, panggil `complete`. Untuk trigger cron, tidak ada konfirmasi balasan ke customer — ringkasan sendiri yang jadi konfirmasi. Untuk trigger customer, ringkasan yang sampai sebagai jawaban langsung dari request.
- **Tautan/endpoint:** Channel Telegram terhubung customer lewat pengiriman pesan keluar Hermes. Lalu `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete`.
- **Input yang diharapkan:** `summary_markdown` dan `delivery_channel` dari `state_data` (hasil Langkah 5).
- **Output yang diharapkan:** Konfirmasi pengiriman ke `step_output` — `{ "sent_at", "channel": "telegram", "message_id" }`. Run berstatus `completed`.
- **Validasi:** Channel Telegram terhubung. Ringkasan terkirim sukses (HTTP 200 dari Telegram Bot API). `message_id` tercatat untuk audit.

  | Kondisi | Tindakan |
  |---|---|
  | Pengiriman sukses | `complete` run |
  | Pengiriman gagal sekali | Ulangi sekali setelah jeda singkat |
  | Pengiriman gagal berulang | Jangan `complete`. Tahan ringkasan di `state_data`, log untuk debug |
  | Channel Telegram putus | Jangan kirim ke channel lain — tandai run sebagai `aborted` dengan alasan `channel_disconnected` |

- **Gerbang eskalasi:** `none`. Langkah penutup — ringkasan akhir hari auto-deliver tanpa approval pihak lain.
- **Error handling:** Kalau Telegram unreachable, jangan `abort` agresif — tahan ringkasan dan retry sekali. Kalau channel customer memang putus (token revoked), tandai `aborted` dengan alasan jelas supaya log bisa dipakai customer-support untuk re-connect.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue")
- Nada operasional executive-assistant — to-the-point, faktual, jam WIB spesifik
- Kalimat pendek di ringkasan. Satu ide per kalimat
- Past-tense konkret untuk section "yang sudah dikerjakan" — bukan generalisasi
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh customer
- Tidak ada error code numerik atau acronim tech bocor ke customer
- Zero exclamation marks
- Section perlu-konfirmasi dengan nama pihak konkret + ping_terakhir + recommendation follow-up — tidak boleh generic

## Decline criteria

- **Ringkasan tanpa channel terhubung.** Kalau Telegram customer belum siap, aku tidak kirim ke channel lain. Tahan ringkasan, log status `channel_disconnected`, tunggu customer re-connect.
- **Ringkasan dengan data palsu kalau semua sumber down.** Kalau kalender, memori, dan thread semua gagal, aku kirim ringkasan minimal yang jujur tentang keterbatasan — bukan menambal dengan template generik.
- **Item perlu-konfirmasi tanpa nama pihak konkret.** Section perlu-konfirmasi harus berisi nama orang real dengan ping terakhir tercatat. Item generic ("ada beberapa klien yang belum balas") di-filter atau di-skip — tidak masuk ringkasan.
- **Run cycle yang ditinggalkan dari hari sebelumnya.** Tiap sore adalah run baru. Run kemarin yang belum `completed` di-`abort` di Langkah 1 dan tidak dilanjutkan.
- **Ringkasan reflektif-personal di playbook ini.** Kalau customer minta tone refleksi mendalam (bukan operasional), arahkan ke `daily-summary.md` lewat skill `daily-briefing` mode `end-of-day-reflective`. Playbook ini fokus operasional Jakarta-pace.

## Decline kalau missing context

Kalau customer minta "rangkum hari ini" tapi belum onboarding (Telegram token belum di-set, kalender belum terhubung) — tanya: "Aku butuh akses Telegram dan kalender kamu dulu untuk siapkan ringkasan yang berguna. Mau kita set up sekarang." Tidak buat ringkasan kosong yang menyamar sebagai siap-pakai.
