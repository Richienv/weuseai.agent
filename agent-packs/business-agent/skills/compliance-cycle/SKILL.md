---
skill_kind: playbook
name: compliance-cycle
bundle: business-agent
flow_state_playbook_id: compliance-cycle
total_steps: 5
use_cases:
  - "Customer minta dijalankan satu siklus compliance — cek kewajiban jatuh tempo lalu siapkan filing sampai siap submit"
  - "Customer mau lapor PPN atau SPT bulan ini dan minta dipandu dari enumerasi kewajiban sampai draft filing"
  - "Customer minta dibuatkan jadwal reminder compliance plus draft untuk filing yang paling dekat jatuh tempo"
  - "Customer mau satu filing disiapkan dengan titik konfirmasi eksplisit sebelum apa pun disubmit ke pemerintah"
prerequisites:
  - "Customer pakai tier Studio dengan phase_5_enabled aktif — playbook ini department-grade, tidak tersedia di tier Pro"
  - "Status badan usaha customer diketahui — pre-incorporation, PT aktif, atau CV aktif — atau bisa diklarifikasi di Langkah 1"
  - "Customer punya channel Telegram terpasang untuk menerima dan menjawab permintaan persetujuan filing"
escalation_to: customer
---

# compliance-cycle — business-agent playbook

Playbook ini menjalankan satu siklus compliance berkala dari awal sampai filing siap submit. Lima langkah berurutan: identifikasi kewajiban yang jatuh tempo, kumpulkan input filing, siapkan draft filing, gerbang keras persetujuan filing, lalu serahkan draft yang siap submit dan catat siklusnya.

Bedanya dengan skill `compliance-checker` tunggal yang sekali jalan: di sini customer dipandu sampai filing siap, dengan satu gerbang keras yang menahan langkah submit sampai customer menyetujui filing itu secara eksplisit. Tidak ada filing yang diajukan tanpa persetujuan yang tercatat dan masih berlaku.

## Kapan dipakai

Customer minta dijalankan satu siklus compliance, bukan sekadar daftar tanggal jatuh tempo. Trigger phrases:

- "jalankan siklus compliance bulan ini"
- "bantu aku lapor PPN dari awal sampai siap submit"
- "siapin SPT, nanti aku approve sebelum disubmit"
- "cek kewajiban yang jatuh tempo lalu siapkan filing-nya"
- "pandu aku compliance dari cek sampai draft filing"

Kalau customer cuma minta satu hal — "kasih reminder pajak" atau "due date SPT kapan" — itu skill `compliance-checker` tunggal, bukan playbook ini. Playbook ini dipakai saat customer mau alur penuh sampai filing siap submit, dengan titik persetujuan di tengah.

Item compliance yang sifatnya advisory saja — review pricing, cek threshold UMKM, penjelasan istilah — tidak melewati gerbang keras. Hanya filing yang nyata (submission SPT atau PPN ke pemerintah) yang membutuhkan persetujuan di Langkah 4.

## Cara kerja

Playbook ini menyusun dua lapisan state yang berbeda. Keduanya saling melengkapi, tidak saling menggantikan.

**Lapisan pertama — flow-state, untuk urutan langkah.** Mesin `flow-state` mencatat posisi langkah dan hasil tiap langkah, jadi siklus tetap utuh walau ada jeda antar pesan customer. Lapisan ini menjawab "kita sudah sampai langkah mana".

Kontrak flow-state — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "compliance-cycle", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi: `start` (mulai atau ulang run — kirim `total_steps: 5`, cursor balik ke Langkah 1, status `in_progress`), `get` (baca run aktif — `current_step`, `status`, `state_data`), `advance` (catat output langkah ini via `step_output` yang di-shallow-merge ke `state_data`, geser cursor +1, opsional `set_status`), `complete`, `abort`.

Status run: `in_progress`, `awaiting_customer` (parkir lunak — menunggu balasan customer di checkpoint), `escalated` (parkir keras — menunggu persetujuan filing customer), `completed`, `aborted`.

**Lapisan kedua — approval queue, untuk persetujuan filing yang durabel.** Gerbang keras di Langkah 4 menyiapkan satu filing yang menyentuh uang dan submission ke pemerintah. Persetujuan untuk filing itu tidak boleh hilang kalau customer butuh waktu memikirkan, dan punya batas waktu sendiri. Untuk itu Langkah 4 membuka satu permintaan persetujuan di approval queue — catatan persetujuan yang durabel, ber-expiry, dan muncul di Telegram customer. Lapisan ini menjawab "apakah filing ini sudah disetujui ya atau tidak".

Kontrak approval queue:

```
POST {WEUSEAI_APPROVAL_QUEUE_URL}
Headers: Content-Type: application/json
Body: { "customer_id", "action_kind": "regulatory_filing", "action_summary", "action_payload", "proposed_by_agent": "business-agent" }
```

Permintaan `regulatory_filing` punya masa berlaku 48 jam terhitung dari saat dibuat. Saat customer membalas approve di Telegram, status permintaan menjadi `approved`. Kalau 48 jam lewat tanpa balasan, permintaan menjadi `expired`.

Pembagian peran kedua lapisan: flow-state adalah "posisi kita di urutan langkah", approval queue adalah "keputusan ya atau tidak yang durabel untuk filing itu". Status `escalated` di flow-state hanya menandai run sedang terparkir — bukan catatan persetujuan. Persetujuan filing yang sebenarnya hidup di approval queue.

Loop runtime:

1. Pesan trigger pertama dari customer → panggil `start` dengan `total_steps: 5`.
2. Setiap pesan customer berikutnya → panggil `get` dulu. Baca `current_step` plus `state_data` yang sudah terkumpul. Jalankan langkah itu. Lalu `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → `advance` dengan `set_status` `awaiting_customer` (checkpoint lunak) atau `escalated` (gerbang keras). Sampaikan ke customer apa yang dibutuhkan, lalu berhenti dan kembalikan kontrol.
4. Saat customer membalas, invokasi berikutnya `get` lagi, lihat status terparkir, dan lanjut dari langkah yang ditunjuk cursor.
5. Langkah 5 selesai → panggil `complete`.

Satu langkah satu kali jalan. Jangan loncat langkah, jangan gabung dua langkah dalam satu giliran.

## Langkah-langkah

### Langkah 1 — Intake status compliance  ·  estimasi 2-3 menit

- **Aksi:** Baca pesan customer. Tarik `business_status` (pre-incorporation, pt-active, cv-active) dan `has_employees`. Kalau salah satu belum jelas dan berpengaruh ke daftar kewajiban, tanya dalam satu pesan ringkas. Lalu panggil `start` pada flow-state dengan `total_steps: 5`. Sebelum `start`, panggil `get` dulu — kalau sudah ada run yang belum selesai, lanjutkan run itu alih-alih memulai dari nol.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `get` lalu `start`
- **Input yang diharapkan:** Pesan trigger customer, idealnya menyebut status badan usaha dan apakah sudah ada karyawan.
- **Output yang diharapkan:** `step_output` berisi `{ business_status, has_employees, cycle_period }` — masuk ke `state_data`. `cycle_period` adalah periode siklus ini, mis. bulan berjalan.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | `business_status` jelas | `advance` ke Langkah 2 |
  | `business_status` belum jelas | Tetap di Langkah 1, tanya satu pertanyaan, jangan `advance` |
  | Customer berstatus pre-incorporation | Sampaikan bahwa kewajiban filing belum ada sampai badan usaha berdiri, tawarkan playbook `incorporation-walkthrough`, jangan lanjut |

- **Gerbang eskalasi:** `none` — klarifikasi di sini adalah pertanyaan pembuka biasa, bukan parkir state-machine. Agent baru `advance` setelah status cukup jelas.
- **Error handling:** Kalau `get` atau `start` tidak bisa diakses, ulangi sekali. Kalau masih gagal, sampaikan "Aku belum bisa mulai siklus compliance-nya, coba lagi sebentar" dan jangan lanjut ke langkah berikutnya.

### Langkah 2 — Enumerasi kewajiban aktif  ·  estimasi 3-5 menit

- **Aksi:** Jalankan `compliance-checker` untuk menyaring kewajiban Indonesia yang relevan dengan `business_status` dan `has_employees` dari `state_data`. Kumpulkan daftar kewajiban aktif lengkap dengan pola tanggal jatuh tempo, dokumen wajib, dan penalti kalau telat.
- **Tautan/endpoint:** `hermes-skill:compliance-checker` — referensi tanggal di template `compliance/indonesian-due-dates.md`
- **Input yang diharapkan:** `business_status` dan `has_employees` dari `state_data` (hasil Langkah 1).
- **Output yang diharapkan:** `step_output` berisi `{ obligations: [ { obligation_id, nama, due_pattern, dokumen_wajib, penalti, jenis } ] }` — masuk ke `state_data`. `jenis` salah satu dari `filing` (butuh submission ke pemerintah) atau `advisory` (hanya untuk dibaca).
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Daftar kewajiban tersusun | `advance` ke Langkah 3 |
  | Tidak ada kewajiban filing yang aktif untuk periode ini | `advance` ke Langkah 3, catat di `step_output` bahwa periode ini tidak ada filing — siklus akan berhenti rapi di Langkah 3 |

- **Gerbang eskalasi:** `none` — langkah ini auto-advance. Customer melihat hasilnya di Langkah 3.
- **Error handling:** Kalau `compliance-checker` gagal, ulangi Langkah 2 dengan input yang sama dari `state_data`. Jangan ulang seluruh playbook. Kalau gagal berulang, sampaikan ke customer bahwa enumerasi tersendat dan minta dia coba lagi sebentar.

### Langkah 3 — Pilih filing dan kumpulkan input  ·  estimasi tunggu customer

- **Aksi:** Tampilkan ke customer kewajiban yang paling dekat jatuh tempo plus jadwal reminder yang diusulkan. Kalau ada lebih dari satu kewajiban berjenis `filing`, minta customer memilih satu filing untuk siklus ini — playbook menyiapkan satu filing per run. Kumpulkan input yang dibutuhkan filing terpilih (periode, angka, dokumen pendukung). Panggil `advance` dengan `set_status: "awaiting_customer"`, lalu berhenti sampai customer membalas.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`
- **Input yang diharapkan:** `obligations` dari `state_data` (hasil Langkah 2). Saat customer membalas: pilihan filing dan input filing dari customer.
- **Output yang diharapkan:** `step_output` berisi `{ selected_filing_id, filing_inputs, reminder_schedule }` — masuk ke `state_data`. `filing_inputs` adalah input mentah yang dipakai Langkah 4 untuk menyusun draft.
- **Validasi:**

  | Balasan customer | Tindakan |
  |---|---|
  | Customer pilih satu filing dan input cukup | Rekam pilihan, `advance` ke Langkah 4 |
  | Customer pilih filing tapi input belum lengkap | Tetap di Langkah 3, tanya input yang kurang, jaga status `awaiting_customer` |
  | Periode ini tidak ada filing — hanya item advisory | Sampaikan jadwal reminder, lalu `complete` run tanpa masuk ke gerbang keras |

- **Gerbang eskalasi:** `checkpoint` — gerbang lunak ini aktif kalau ada filing yang perlu disiapkan. Yang agent sampaikan ke customer: daftar kewajiban dekat jatuh tempo, jadwal reminder, dan satu pertanyaan tertutup — "Filing mana yang mau kita siapkan siklus ini, dan boleh aku minta angka serta dokumen pendukungnya". Setelah itu agent berhenti dan menunggu balasan. Kalau periode ini ternyata tidak ada filing, langkah ini tidak memarkir — siklus selesai rapi di sini dengan `complete`.
- **Error handling:** Kalau `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau tetap gagal, tetap sampaikan ringkasan kewajiban ke customer dan minta dia membalas — saat dia membalas, `get` berikutnya menyinkronkan ulang posisi.

### Langkah 4 — Gerbang keras: siapkan filing dan tunggu persetujuan  ·  estimasi tunggu customer

- **Aksi:** Susun draft filing untuk `selected_filing_id` dari `filing_inputs` di `state_data`. Lalu buka satu permintaan persetujuan di approval queue dengan `action_kind: "regulatory_filing"` — sertakan ringkasan angka di `action_summary` dan draft terstruktur di `action_payload`. Panggil `advance` pada flow-state dengan `set_status: "escalated"`. Sampaikan ke customer bahwa draft sudah siap dan persetujuan menunggu di Telegram. Berhenti dan kembalikan kontrol. Tidak ada submission yang terjadi di langkah ini.
- **Tautan/endpoint:** `POST {WEUSEAI_APPROVAL_QUEUE_URL}` operasi `create` (`action_kind: "regulatory_filing"`), lalu `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "escalated"`
- **Input yang diharapkan:** `selected_filing_id` dan `filing_inputs` dari `state_data` (hasil Langkah 3).
- **Output yang diharapkan:** `step_output` berisi `{ filing_draft, approval_request_id }` — masuk ke `state_data`. `approval_request_id` adalah id permintaan persetujuan yang menjadi rujukan saat customer membalas.
- **Validasi:** Langkah 5 hanya boleh berjalan kalau permintaan persetujuan berstatus `approved`. Saat customer membalas, klasifikasikan responnya:

  | Status persetujuan / respons customer | Tindakan |
  |---|---|
  | Permintaan `regulatory_filing` berstatus `approved` | `advance` ke Langkah 5 |
  | Customer minta revisi draft ("ganti angka X", "periode salah") | Susun ulang draft, buka permintaan persetujuan baru, tetap di Langkah 4 dengan status `escalated` |
  | Customer belum membalas, permintaan masih `pending` | Run tetap `escalated`, tidak ada aksi — tunggu balasan |
  | Permintaan berstatus `expired` (48 jam lewat tanpa balasan) | Run tetap terparkir `escalated`. Sampaikan ke customer bahwa persetujuan sudah kedaluwarsa dan filing belum diajukan. Kalau filing masih relevan, buka permintaan persetujuan baru — run tidak otomatis lanjut |

- **Gerbang eskalasi:** `hard-gate` — ini gerbang keras. Filing compliance menyentuh uang, kewajiban hukum, dan submission ke pemerintah, jadi tidak ada submission yang terjadi tanpa persetujuan yang tercatat dan masih berlaku. Urutan filing dipegang oleh flow-state yang terparkir di `escalated`. Keputusan ya atau tidak atas filing itu dipegang oleh permintaan `regulatory_filing` di approval queue. Langkah 5 hanya berjalan kalau permintaan itu berstatus `approved`. Kalau permintaan `expired`, run tetap terparkir — tidak ada submission, dan customer harus membuka persetujuan baru kalau masih mau melanjutkan. Business Director tidak file dokumen apa pun atas nama customer tanpa persetujuan yang masih berlaku (SOUL.md hard limit). Yang disampaikan ke customer saat memarkir: ringkasan filing yang sudah disiapkan plus "Aku belum submit apa pun. Filing diajukan hanya setelah kamu approve permintaan di Telegram, dan persetujuan ini berlaku 48 jam."
- **Error handling:** Kalau pembukaan permintaan persetujuan gagal, ulangi sekali. Kalau masih gagal, sampaikan ke customer bahwa permintaan persetujuan belum bisa dibuat dan jangan `advance` ke `escalated` — run harus tetap di Langkah 4 dengan draft tersimpan sampai permintaan berhasil dibuka. Tanpa permintaan persetujuan, Langkah 5 tidak pernah dipanggil.

### Langkah 5 — Serahkan filing siap submit dan catat siklus  ·  estimasi 2-3 menit

- **Aksi:** Serahkan draft filing yang sudah disetujui ke customer dalam bentuk dokumen siap submit. Customer yang mengajukan submission lewat kanal resmi pemerintah — Business Director tidak submit atas nama customer. Sampaikan jadwal reminder untuk kewajiban berikutnya, lalu panggil `complete`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete`
- **Input yang diharapkan:** `filing_draft` versi final dan `approval_request_id` berstatus `approved` dari `state_data`. `reminder_schedule` dari Langkah 3.
- **Output yang diharapkan:** `step_output` berisi `{ delivered_filing, next_reminders }`, lalu `complete` operation. Run berstatus `completed`.
- **Validasi:**

  | Kondisi | Tindakan |
  |---|---|
  | Draft final tersedia dan persetujuan tercatat `approved` | Serahkan dokumen, sampaikan jadwal reminder, `complete` run |
  | Dokumen final gagal disiapkan | Jangan `complete`. Sampaikan "Dokumen filing-nya belum berhasil disiapkan, mau aku coba lagi" dan tahan run |

- **Gerbang eskalasi:** `none` — langkah ini hanya berjalan setelah gerbang keras Langkah 4 lolos dengan persetujuan `approved`. Tanpa persetujuan, Langkah 5 tidak pernah dipanggil.
- **Error handling:** Kalau penyerahan dokumen gagal, jangan `abort`. Tahan run dan tawarkan ke customer untuk mencoba lagi — `state_data` masih menyimpan draft yang sudah disetujui.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue") — sesuai SOUL.md Business Director
- Nada experienced-cofounder, decisive, Indonesia-savvy — framing what's-next-and-why
- Kalimat pendek. Satu ide per kalimat
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh customer
- Tidak ada error code numerik atau acronim tech (HMAC, JWT, RLS) bocor ke customer — kalau lapisan state gagal, sampaikan dalam bahasa biasa
- Zero exclamation marks
- Calm-premium register — playbook ini dibaca sebagai satu siklus compliance yang tertata, bukan sesi tanya-jawab
- Filing yang disiapkan diserahkan apa adanya untuk customer review — tidak ada angka yang ditebak

## Decline criteria

Business Director decline atau berhenti playbook ini kalau:

- Customer minta filing disubmit tanpa dia menyetujui draft-nya dulu — gerbang keras Langkah 4 tidak bisa dilewati.
- Customer minta Business Director submit dokumen atas nama dia ke portal pajak atau OSS — submission selalu customer yang lakukan, agent hanya menyiapkan draft.
- Permintaan mengarah ke tax evasion atau circumvent regulasi — hard decline, jelaskan alasannya.
- Customer minta advice pajak spesifik yang butuh konsultan berlisensi — playbook ini menyiapkan filing dan reminder, bukan menggantikan akuntan atau konsultan pajak.
- Customer berstatus pre-incorporation — belum ada kewajiban filing sampai badan usaha berdiri; arahkan ke playbook `incorporation-walkthrough`.

Saat decline, sampaikan alasannya singkat dan sopan, lalu tawarkan jalur yang sesuai hard limits.
