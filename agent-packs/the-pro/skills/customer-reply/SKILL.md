---
skill_kind: playbook
name: customer-reply
bundle: the-pro
flow_state_playbook_id: customer-reply
total_steps: 5
use_cases:
  - "Customer minta dibantu balas email atau chat dari klien, rekan, atau atasan"
  - "Customer forward pesan masuk dan bilang 'tolong susun balasannya'"
  - "Customer mau menjawab follow-up dari briefing pagi dalam gaya nulis dia sendiri"
  - "Customer minta draft balasan untuk pesan sensitif yang harus dia approve dulu"
prerequisites:
  - "Pesan masuk yang mau dibalas tersedia — customer forward isinya atau sebut konteksnya"
  - "Customer punya channel terhubung untuk pengiriman akhir (email digest atau chat)"
  - "Thread sebelumnya dengan kontak itu bisa diakses lewat memori lintas sesi"
escalation_to: customer
---

# customer-reply — the-pro playbook

Playbook untuk menyusun balasan atas pesan masuk dalam gaya nulis customer, lalu mengirimnya hanya setelah customer setuju eksplisit. Draft disiapkan otomatis, pengiriman tidak pernah otomatis.

## Kapan dipakai

Customer minta dibantu membalas pesan dari orang lain. Trigger phrases:

- "tolong bantu balas email ini"
- "susun balasan buat pesan dari [nama]"
- "draftin reply buat klien"
- "bantu jawab chat ini"
- "bikinin balasan, nanti aku cek dulu"
- "reply ke atasan soal ini gimana ya"

Juga: dipakai sebagai lanjutan dari `daily-briefing` kalau customer menunjuk satu email follow-up dan minta dibalas.

## Cara kerja

Playbook ini punya 5 langkah berurutan yang saling bergantung. Progress disimpan oleh mesin `flow-state` supaya playbook tetap jalan walau ada jeda antar pesan customer.

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "customer-reply", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Alur runtime:

- Pesan trigger pertama dari customer → `start` dengan `total_steps: 5`. Run reset ke langkah 1, status `in_progress`.
- Setiap pesan customer berikutnya → `get` dulu untuk baca `current_step` + `state_data` yang sudah terkumpul.
- Jalankan langkah itu, lalu `advance` dengan `step_output` langkah tersebut. `step_output` di-merge dangkal ke `state_data`.
- Di gerbang eskalasi: `advance` dengan `set_status` `awaiting_customer` (gerbang lunak) atau `escalated` (gerbang keras), sampaikan ke customer apa yang dibutuhkan, lalu berhenti dan kembalikan kontrol.
- Saat customer balas, invokasi berikutnya `get`, melihat status terparkir, lalu lanjut dari langkah yang tepat.

Langkah 4 adalah gerbang keras. Sebelum langkah kirim, run diparkir dengan status `escalated`. Tidak ada pengiriman yang terjadi tanpa persetujuan eksplisit customer.

## Langkah-langkah

### Langkah 1 — Klasifikasi pesan masuk  ·  estimasi 1 menit

- **Aksi:** Baca pesan masuk yang customer kasih. Tentukan tipe (pertanyaan, permintaan, follow-up, keluhan, sosial), tingkat urgensi (rendah, sedang, tinggi), dan siapa pengirimnya plus relasinya dengan customer (klien, rekan, atasan, vendor).
- **Tautan/endpoint:** —
- **Input yang diharapkan:** Isi pesan masuk dari pesan customer, atau rujukan ke email yang sudah disebut di `daily-briefing`.
- **Output yang diharapkan:** `step_output` berisi `{ message_type, urgency, sender, sender_relation, topic_ringkas }` — masuk ke `state_data`.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Pesan masuk jelas, pengirim teridentifikasi | `advance` ke langkah 2 |
  | Isi pesan tidak lengkap atau pengirim tidak jelas | Lihat Gerbang eskalasi |

- **Gerbang eskalasi:** `checkpoint` — kalau isi pesan atau pengirim tidak jelas, `advance` dengan `set_status` `awaiting_customer` dan tanya satu hal: "Aku belum lihat isi pesan lengkapnya. Bisa kamu forward atau salin teksnya ke sini." Berhenti sampai customer balas.
- **Error handling:** Kalau `flow-state` tidak bisa diakses, sampaikan "Aku lagi tidak bisa simpan progres balasannya. Coba lagi sebentar." dan jangan lanjut ke langkah berikut.

### Langkah 2 — Ingat konteks thread sebelumnya  ·  estimasi 1 menit

- **Aksi:** Ambil riwayat percakapan customer dengan kontak itu dari memori lintas sesi. Catat komitmen terbuka, janji, dan nada percakapan terakhir yang relevan dengan pesan masuk.
- **Tautan/endpoint:** Memori lintas sesi Hermes (cross-session memory built-in).
- **Input yang diharapkan:** `sender` dan `topic_ringkas` dari `state_data` langkah 1.
- **Output yang diharapkan:** `step_output` berisi `{ prior_context_ringkas, open_commitments, nada_terakhir }` — masuk ke `state_data`. Kalau tidak ada riwayat, isi `prior_context_ringkas` dengan `"tidak ada thread sebelumnya"`.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Ada atau tidak ada riwayat, hasil tercatat | `advance` ke langkah 3 |
  | Memori menyimpan janji yang bertabrakan dengan pesan masuk | Lihat Gerbang eskalasi |

- **Gerbang eskalasi:** `checkpoint` — kalau ada komitmen terbuka yang bertabrakan dengan pesan masuk, `advance` dengan `set_status` `awaiting_customer` dan sampaikan trade-off-nya: "Minggu lalu kamu janji [X] ke [nama]. Pesan ini minta [Y]. Mau balasannya tetap pegang janji lama, atau update." Berhenti sampai customer putuskan.
- **Error handling:** Kalau memori tidak bisa diambil, lanjut dengan `prior_context_ringkas: "memori tidak tersedia"` dan sebut ke customer bahwa draft disusun tanpa konteks thread lama.

### Langkah 3 — Susun draft dalam gaya nulis customer  ·  estimasi 2 menit

- **Aksi:** Tulis draft balasan yang menjawab pesan masuk. Pakai gaya nulis customer yang sudah dipelajari — formal vs santai, panjang vs ringkas, Bahasa Indonesia vs campur English. Sandarkan isi pada konteks thread dari langkah 2.
- **Tautan/endpoint:** —
- **Input yang diharapkan:** Seluruh `state_data` — `message_type`, `urgency`, `sender_relation`, `prior_context_ringkas`, `open_commitments`.
- **Output yang diharapkan:** `step_output` berisi `{ draft_text, channel_tujuan, catatan_asumsi }` — masuk ke `state_data`. `catatan_asumsi` mencatat hal yang ditebak supaya bisa dikoreksi customer.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Draft menjawab semua poin pesan masuk, gaya konsisten | `advance` ke langkah 4 |
  | Draft butuh data yang belum dimiliki (angka, tanggal, keputusan) | Tandai bagian itu dengan placeholder, lanjut ke langkah 4, sebutkan di draft |

- **Gerbang eskalasi:** `none` — langkah ini auto-lanjut ke gerbang keras di langkah 4. Draft belum pernah ditampilkan sebagai final di sini.
- **Error handling:** Kalau pesan masuk butuh keputusan yang hanya customer bisa ambil, jangan menebak isinya — tulis placeholder eksplisit di draft dan biarkan langkah 4 yang menanyakannya.

### Langkah 4 — Gerbang persetujuan: tampilkan draft, tunggu approval  ·  estimasi menunggu customer

- **Aksi:** `advance` dengan `set_status` `escalated`. Tampilkan `draft_text` lengkap apa adanya ke customer, sebut channel tujuan, dan sebut `catatan_asumsi`. Minta persetujuan eksplisit. Berhenti dan kembalikan kontrol.
- **Tautan/endpoint:** —
- **Input yang diharapkan:** `draft_text`, `channel_tujuan`, `catatan_asumsi` dari `state_data`.
- **Output yang diharapkan:** Tidak ada `step_output` baru sampai customer membalas. Saat customer balas, klasifikasikan responnya:

  | Respons customer | Tindakan |
  |---|---|
  | Persetujuan eksplisit dan tidak ambigu ("kirim", "ya kirim", "approved", "oke kirim") | `advance` ke langkah 5 |
  | Permintaan revisi ("ganti X", "lebih singkat", "nadanya kurang pas") | Kembali ke langkah 3 — susun ulang draft dengan revisi, lalu balik lagi ke langkah 4 |
  | Ambigu, ragu, atau bukan jawaban langsung ("hmm", "oke" tanpa konteks, pertanyaan balik) | Tetap terparkir `escalated`, tanya ulang: "Aku tahan dulu. Balas 'kirim' kalau draft ini sudah pas, atau sebut bagian yang mau diubah." |

- **Validasi:** Pengiriman di langkah 5 hanya boleh berjalan kalau respons customer adalah persetujuan eksplisit dan tidak ambigu. Diam, emoji, atau jawaban setengah bukan persetujuan.
- **Gerbang eskalasi:** `hard-gate` — ini gerbang keras. The Pro tidak pernah meniru customer di pesan yang belum di-approve (SOUL.md). Run tetap di status `escalated` sampai ada kata setuju yang jelas. Permintaan revisi sekecil apa pun mengembalikan playbook ke langkah 3, bukan meneruskan ke langkah 5. Apa pun yang ambigu → tetap terparkir, tanya lagi, jangan kirim. Yang disampaikan ke customer saat memarkir: draft penuh + "Aku belum kirim apa pun. Kirim hanya setelah kamu approve."
- **Error handling:** Kalau customer minta revisi tapi maksudnya tidak jelas, tanya satu pertanyaan klarifikasi sebelum kembali ke langkah 3. Jangan menebak arah revisi.

### Langkah 5 — Kirim dan konfirmasi  ·  estimasi 1 menit

- **Aksi:** Kirim draft yang sudah di-approve ke `channel_tujuan`. Setelah terkirim, beri konfirmasi singkat ke customer dan `complete` run-nya.
- **Tautan/endpoint:** Channel terhubung customer (email digest atau chat) lewat pengiriman pesan keluar Hermes.
- **Input yang diharapkan:** `draft_text` versi final yang sudah di-approve dan `channel_tujuan` dari `state_data`. Bendera persetujuan dari langkah 4.
- **Output yang diharapkan:** `step_output` berisi `{ sent_at, channel }`, lalu `complete` operation. Konfirmasi ke customer: "Balasan ke [nama] sudah terkirim. Aku catat ini di thread kalian."
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Pengiriman sukses | `complete` run, konfirmasi ke customer |
  | Pengiriman gagal | Jangan `complete`. Sampaikan "Balasannya belum berhasil terkirim. Mau aku coba lagi." dan tahan draft |

- **Gerbang eskalasi:** `none` — langkah ini hanya berjalan setelah gerbang keras langkah 4 lolos. Tanpa approval, langkah 5 tidak pernah dipanggil.
- **Error handling:** Kalau channel tujuan tidak terhubung, jangan kirim ke channel lain — sebut ke customer channel mana yang perlu disiapkan, dan tahan draft sampai siap.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue")
- Nada calm, observasional, anticipatory — seperti executive assistant yang sudah lama kerja sama customer
- Kalimat pendek. Satu ide per kalimat
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh customer
- Tidak ada error code numerik atau acronim tech (OAuth, JWT, HMAC) bocor ke customer
- Zero exclamation marks
- Draft yang ditampilkan di langkah 4 dipakai apa adanya — jangan tambah emoji, jangan ubah gaya yang sudah dipelajari

## Decline criteria

The Pro decline atau berhenti playbook ini kalau:

- Customer minta balasan dikirim tanpa dia lihat draft-nya dulu — gerbang keras langkah 4 tidak bisa dilewati.
- Customer minta meniru tanda tangan atau identitas orang lain, bukan dirinya sendiri.
- Pesan masuk minta komitmen uang atau transaksi — itu butuh konfirmasi eksplisit terpisah, di luar approval balasan ini.
- Isi pesan masuk tidak pernah tersedia walau sudah ditanya di langkah 1.

Saat decline, sampaikan alasannya singkat dan sopan, lalu tawarkan jalur yang sesuai hard limits.
