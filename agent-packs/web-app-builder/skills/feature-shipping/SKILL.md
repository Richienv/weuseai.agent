---
skill_kind: playbook
name: feature-shipping
bundle: web-app-builder
flow_state_playbook_id: feature-shipping
total_steps: 8
use_cases:
  - "Tambah fitur baru ke website atau app yang sudah live — dari deskripsi sampai promote ke production"
  - "Customer minta perubahan satu halaman dengan dua titik henti supaya hasil dicek dulu sebelum dipromosikan"
  - "Fitur yang menyentuh pembayaran QRIS atau IDR butuh QA dry-run sebelum diakses pengunjung sungguhan"
  - "Iterasi rutin di site yang sudah deploy ke Vercel, mobile-first karena pengunjung Indonesia mayoritas dari ponsel"
prerequisites:
  - "Customer pakai tier Pro atau Studio"
  - "Site target sudah pernah deploy ke Vercel — playbook ini iterasi di atas project yang ada, bukan bikin dari nol"
  - "VERCEL_TOKEN sudah tersimpan di setelan customer — deploy preview di Langkah 6 dan promote di Langkah 8 butuh ini"
  - "Customer bisa cerita halaman target dan apa yang ingin diubah, atau bisa diklarifikasi di Langkah 1"
escalation_to: customer
---

# feature-shipping — web-app-builder playbook

Playbook ini menjalankan satu siklus pengiriman fitur untuk website atau app yang sudah hidup — dari deskripsi fitur, draft spec, breakdown implementasi, testing checklist, QA dry-run, deploy ke preview, sampai promote ke production. Dua titik henti — satu sebelum implementasi mulai dan satu sebelum promote — memastikan customer melihat hasil sebelum tiap lompatan besar.

Bedanya dengan langsung menyusun fitur lalu deploy: di sini state-machine menjaga posisi langkah, jadi alur tetap utuh walau ada jeda antar pesan customer, dan kedua checkpoint dijamin tidak terlewat. Customer tidak pernah menemukan fitur sudah live tanpa dia approve URL preview-nya dulu.

## Kapan dipakai

Customer minta menambah atau mengubah satu fitur di site yang sudah deploy. Trigger phrases:

- "tambah fitur baru di landing"
- "ubah section pricing di halaman home"
- "aku mau ada form WhatsApp di halaman contact"
- "tambah halaman blog baru ke site aku"
- "fitur QRIS checkout di halaman product"
- "iterasi fitur di site yang udah live"

Kalau customer minta bikin site baru dari nol, pakai playbook `site-launch`. Kalau hanya minta deploy folder lokal yang sudah jadi, pakai `vercel-deploy-orchestrator` langsung.

## Cara kerja

Playbook ini dijalankan oleh state-machine engine `flow-state`. Engine menyimpan posisi langkah dan hasil tiap langkah, jadi alur tetap utuh walau ada jeda berjam-jam antara pesan customer.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "feature-shipping", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai:

- `start` — mulai run baru. Kirim `total_steps: 8`. Cursor balik ke Langkah 1, status `in_progress`, `state_data` kosong.
- `get` — baca run berjalan: `current_step`, `status`, dan `state_data` (gabungan output semua langkah sebelumnya).
- `advance` — catat output langkah ini lewat `step_output` (di-shallow-merge ke `state_data`), geser cursor +1. Opsional `set_status`.
- `complete` — tandai run selesai.
- `abort` — batalkan run.

Status run: `in_progress`, `awaiting_customer` (parkir lunak — menunggu balasan customer di sebuah checkpoint), `escalated` (parkir di gerbang keras), `completed`, `aborted`. Playbook ini tidak punya gerbang keras — kedua titik hentinya checkpoint lunak.

Loop yang diikuti agent:

1. Pesan trigger pertama dari customer → panggil `get` dulu. Kalau tidak ada run yang bisa dilanjutkan, panggil `start` dengan `total_steps: 8`. Jangan `start` di atas run yang masih berjalan — itu mereset cursor dan menghapus `state_data`.
2. Tiap pesan customer berikutnya → panggil `get` dulu untuk lihat `current_step` dan `state_data` yang sudah terkumpul → jalankan langkah itu → panggil `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → panggil `advance` dengan `set_status: "awaiting_customer"`, sampaikan ke customer apa yang kamu butuh, lalu berhenti dan kembalikan kontrol.
4. Saat customer membalas → panggilan berikutnya `get`, melihat status parkir, dan melanjutkan dari langkah yang ditunjuk cursor.
5. Setelah Langkah 8 selesai → panggil `complete`.

Satu langkah satu kali jalan. Jangan loncat langkah, jangan gabung dua langkah dalam satu giliran.

### Konteks Indonesia: mobile-first dan QRIS/IDR

Mayoritas pengunjung site Indonesia datang dari ponsel, jadi tiap fitur yang menyentuh layout, navigasi, atau form ditest di viewport mobile lebih dulu sebelum desktop — ini di-encode di testing checklist Langkah 4 dan QA dry-run Langkah 5. Kalau fitur menyentuh pembayaran, anggap QRIS sebagai metode default dan format harga sebagai IDR (titik thousand, tanpa desimal); ini juga masuk testing checklist supaya tidak ketinggalan.

## Langkah-langkah

### Langkah 1 — Intake fitur dan halaman target  ·  estimasi 3-5 menit

- **Aksi:** Kumpulkan deskripsi fitur dan halaman target dari pesan customer — `feature_description`, `target_page` (path atau nama halaman di site yang sudah deploy), `vercel_project_name`, `touches_payment` (boolean — apakah fitur menyentuh pembayaran QRIS atau IDR), dan `success_signal` (apa yang customer harap berbeda setelah fitur live). Cek juga apakah `VERCEL_TOKEN` sudah tersedia di setelan customer, karena deploy preview di Langkah 6 dan promote di Langkah 8 butuh itu. Kalau ada field penting yang kosong, tanya dalam satu pesan ringkas. Lalu panggil `start` pada flow-state dengan `total_steps: 8`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `start`
- **Input yang diharapkan:** Pesan trigger customer berisi deskripsi fitur dan halaman tujuan.
- **Output yang diharapkan:** Intake ke `step_output` — `{ "feature_description", "target_page", "vercel_project_name", "touches_payment": true|false, "success_signal", "vercel_token_ready": true|false }`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:** `feature_description` dan `target_page` wajib terisi. `vercel_project_name` menunjuk project yang ada di akun Vercel customer. `touches_payment` jelas true atau false.

  | Kondisi | Tindakan |
  |---|---|
  | Intake lengkap dan token siap | Lanjut, `advance` ke Langkah 2 |
  | Intake lengkap tapi token belum disetel | `advance` ke Langkah 2, catat `vercel_token_ready: false` — spec dan implementasi tetap jalan, tapi ingatkan customer setel token sebelum Langkah 6 |
  | Field intake penting kosong | Tetap di Langkah 1, tanya satu pesan ringkas berisi field yang kurang |

- **Gerbang eskalasi:** `none`. Klarifikasi di langkah ini pertanyaan pembuka biasa, bukan parkir state-machine. Agent baru `advance` setelah intake cukup lengkap.
- **Error handling:** Kalau panggilan `start` gagal, ulangi `start` sekali. Kalau masih gagal, sampaikan ke customer "Aku belum bisa mulai prosesnya, coba lagi sebentar" dan jangan lanjut ke langkah berikutnya.

### Langkah 2 — Draft spec fitur  ·  estimasi 4-6 menit

- **Aksi:** Susun spec fitur dari intake — `behavior` (apa yang user lihat dan lakukan), `ui_changes` (komponen yang ditambah atau diubah di halaman target), `data_flow` (kalau fitur tarik atau kirim data, jalurnya seperti apa), `edge_cases` (input kosong, jaringan lambat, viewport sempit), dan `out_of_scope` (apa yang tidak dikerjakan supaya cakupan tidak melebar). Kalau `touches_payment: true`, tambahkan section `payment_notes` — QRIS sebagai metode default, format harga IDR titik thousand tanpa desimal.
- **Tautan/endpoint:** `hermes-skill:landing-page-builder` mode `feature-spec` (komposisi spec dari intake)
- **Input yang diharapkan:** Intake dari `state_data` (hasil Langkah 1).
- **Output yang diharapkan:** Spec ke `step_output` — `{ "spec_markdown", "behavior", "ui_changes", "data_flow", "edge_cases", "out_of_scope", "payment_notes" }`. `payment_notes` boleh kosong kalau `touches_payment: false`.
- **Validasi:** Spec mencakup semua section, dan tiap section yang kosong ditandai eksplisit "Tidak ada" daripada dihilangkan diam-diam.

  | Kondisi | Tindakan |
  |---|---|
  | Spec lengkap dan jelas | `advance` ke Langkah 3 |
  | Intake masih ambigu setelah dicoba disusun | Tetap di Langkah 2, tanya satu pertanyaan tertutup ke customer untuk mengisi ambiguitas |

- **Gerbang eskalasi:** `none`. Spec dibawa ke Langkah 5 sebagai checkpoint pertama — di langkah ini agent menyusun, belum minta approval.
- **Error handling:** Kalau penyusunan spec gagal, ulangi Langkah 2 dengan intake yang sama dari `state_data`. Tidak perlu mengulang Langkah 1.

### Langkah 3 — Breakdown implementasi  ·  estimasi 3-5 menit

- **Aksi:** Pecah spec jadi langkah implementasi konkret — `files_to_touch` (path file yang akan diubah atau ditambah), `components_added` (komponen baru kalau ada), `dependencies_added` (paket npm baru kalau ada — minimal, hindari kecuali wajib), dan `estimated_effort_min` (perkiraan menit untuk eksekusi). Susun urutan implementasi yang membuat fitur bisa di-test selangkah demi selangkah, bukan baru bisa di-test di akhir.
- **Tautan/endpoint:** `hermes-skill:landing-page-builder` mode `implementation-breakdown`
- **Input yang diharapkan:** Spec dari `state_data` (hasil Langkah 2) dan `target_page` dari Langkah 1.
- **Output yang diharapkan:** Breakdown ke `step_output` — `{ "files_to_touch": [...], "components_added": [...], "dependencies_added": [...], "implementation_order": [...], "estimated_effort_min" }`.
- **Validasi:** Tiap entry di `files_to_touch` adalah path yang konsisten dengan struktur project customer. `dependencies_added` hanya berisi paket yang benar-benar dibutuhkan; kalau ada, sertakan alasan singkat.

  | Kondisi | Tindakan |
  |---|---|
  | Breakdown jelas dan urut | `advance` ke Langkah 4 |
  | Spec ternyata butuh komponen di luar template yang ada | Tetap di Langkah 3, flag keterbatasan itu ke customer di checkpoint Langkah 5 — jangan mulai implementasi tanpa customer tahu |

- **Gerbang eskalasi:** `none`. Breakdown dibawa ke checkpoint Langkah 5 bersama spec, supaya customer review sekali untuk dua hal.
- **Error handling:** Kalau breakdown gagal disusun, ulangi Langkah 3. Kalau tetap gagal, tahan di Langkah 3 dan sampaikan ke customer apa yang menghambat, jangan loncat ke Langkah 4 dengan breakdown kosong.

### Langkah 4 — Susun testing checklist  ·  estimasi 2-4 menit

- **Aksi:** Susun checklist verifikasi untuk fitur ini. Wajib mencakup mobile-first — tiap item UI ditest di viewport mobile (375px width) dulu sebelum desktop. Kalau `touches_payment: true`, sertakan item QRIS dry-run dan format harga IDR. Item lain disesuaikan spec — happy path, edge case dari Langkah 2, dan regresi pada halaman lain yang share komponen.
- **Tautan/endpoint:** `hermes-skill:landing-page-builder` mode `testing-checklist`
- **Input yang diharapkan:** Spec dari `state_data` (hasil Langkah 2), breakdown dari Langkah 3, dan `touches_payment` dari Langkah 1.
- **Output yang diharapkan:** Checklist ke `step_output` — `{ "checklist_items": [ { "id", "description", "viewport": "mobile"|"desktop"|"both", "category": "happy_path"|"edge_case"|"payment"|"regression" } ], "mobile_first_items_count" }`. `mobile_first_items_count` minimal 1 supaya konteks mobile Indonesia tidak terlewat.
- **Validasi:** Checklist punya minimal satu item mobile. Kalau `touches_payment: true`, ada minimal satu item QRIS dan satu item format harga IDR.

  | Kondisi | Tindakan |
  |---|---|
  | Checklist lengkap, mobile-first item ada | `advance` ke Langkah 5 |
  | `touches_payment: true` tapi checklist tidak punya item QRIS atau IDR | Tetap di Langkah 4, tambahkan item yang kurang sebelum lanjut |
  | Tidak ada item mobile sama sekali | Tetap di Langkah 4, tambahkan minimal satu item mobile sebelum lanjut |

- **Gerbang eskalasi:** `none`. Checklist dibawa ke checkpoint Langkah 5 sebagai bagian paket review.
- **Error handling:** Kalau penyusunan checklist gagal, ulangi Langkah 4 dengan spec dan breakdown yang sama dari `state_data`.

### Langkah 5 — Checkpoint: review spec, breakdown, dan checklist  ·  estimasi tunggu customer

- **Aksi:** Tampilkan ke customer paket review berisi `spec_markdown` dari Langkah 2, ringkasan `implementation_order` dan `files_to_touch` dari Langkah 3, plus `checklist_items` dari Langkah 4. Minta customer konfirmasi sebelum implementasi mulai dijalankan. Panggil `advance` dengan `set_status: "awaiting_customer"` lalu berhenti.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`
- **Input yang diharapkan:** `spec_markdown`, `implementation_order`, `files_to_touch`, dan `checklist_items` dari `state_data` (hasil Langkah 2, 3, dan 4).
- **Output yang diharapkan:** Saat customer membalas, rekam keputusan mereka ke `step_output` — `{ "spec_approved": true|false, "spec_revisions", "scope_adjustments" }`. Lalu cursor lanjut ke Langkah 6 (atau kembali ke Langkah 2 kalau revisi besar).
- **Validasi:** Balasan customer harus berupa keputusan yang bisa ditindaklanjuti — approve, revisi yang konkret, atau scope adjustment yang jelas.

  | Balasan customer | Tindakan |
  |---|---|
  | "lanjut" / "setuju" / "kerjain" | Rekam `spec_approved: true`, `advance` ke Langkah 6 untuk implementasi dan deploy preview |
  | Minta revisi spec atau breakdown | Rekam revisi, kembali jalankan Langkah 2 atau 3 untuk menerapkannya, lalu kembali ke checkpoint ini |
  | Minta tambah atau kurangi item di checklist | Rekam adjustment, kembali ke Langkah 4 untuk update checklist, lalu kembali ke checkpoint ini |
  | Customer belum jelas mau apa | Tetap di Langkah 5, tanya satu pertanyaan, jaga status `awaiting_customer` |

- **Gerbang eskalasi:** `checkpoint`. Gerbang ini selalu aktif. Implementasi mengubah file di project customer dan menghasilkan deploy preview hidup, jadi agent berhenti di sini supaya customer cek arah sebelum hasil dijalankan. Yang agent sampaikan ke customer: paket review tiga bagian (spec, breakdown, checklist), lalu satu pertanyaan tertutup — "Aku lanjut implementasi sesuai paket ini, atau ada yang mau diadjust dulu?". Setelah itu agent berhenti dan menunggu balasan.
- **Error handling:** Kalau panggilan `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau tetap gagal, tetap sampaikan paket review ke customer dan minta mereka membalas — saat membalas, `get` berikutnya akan menyinkronkan ulang posisi.

### Langkah 6 — QA dry-run dan deploy preview  ·  estimasi 6-12 menit

- **Aksi:** Jalankan implementasi sesuai `implementation_order` dari Langkah 3. Setelah implementasi selesai, jalankan QA dry-run lokal lewat checklist dari Langkah 4 — tandai tiap item pass atau fail beserta catatan. Hanya kalau semua item pass (atau yang fail sudah diperbaiki ulang), lanjut deploy. Jalankan `vercel-deploy-orchestrator` dengan `target=preview` dan `vercel_project_name` dari `state_data`. Hasil deploy menghasilkan satu URL preview hidup.
- **Tautan/endpoint:** `hermes-skill:vercel-deploy-orchestrator` (`target=preview`)
- **Input yang diharapkan:** Spec, breakdown, dan checklist dari `state_data` (hasil Langkah 2, 3, 4), plus `vercel_project_name` dari Langkah 1. `VERCEL_TOKEN` harus tersedia.
- **Output yang diharapkan:** Hasil QA dan deploy ke `step_output` — `{ "qa_results": [ { "id", "status": "pass"|"fail", "note" } ], "qa_all_pass": true, "preview_url", "deploy_target": "preview" }`. `qa_all_pass` harus true sebelum `preview_url` boleh dihasilkan.
- **Validasi:** Tiap item di `qa_results` punya status. `qa_all_pass` true. `preview_url` terisi dan deploy mencapai status siap.

  | Kondisi | Tindakan |
  |---|---|
  | Implementasi sukses, semua QA pass, deploy preview hidup | `advance` ke Langkah 7 |
  | Sebagian QA fail | Tetap di Langkah 6, perbaiki, ulangi QA dry-run sampai semua pass, baru deploy |
  | `VERCEL_TOKEN` belum disetel | Tetap di Langkah 6, minta customer setel token dulu — implementasi sudah jadi, tinggal token yang kurang |
  | Deploy gagal di sisi penyedia hosting | Tetap di Langkah 6, ulangi deploy sekali, lalu sampaikan ke customer kalau masih tersendat |

- **Gerbang eskalasi:** `none`. Deploy ke preview tidak menyentuh halaman utama yang dilihat pengunjung dan tidak mengeluarkan biaya — ini langkah yang bisa diulang dengan aman. Persetujuan untuk promote diminta di checkpoint Langkah 7.
- **Error handling:** Kalau implementasi gagal di tengah jalan, ulangi langkah yang gagal dari `implementation_order`, jangan ulang seluruh playbook. Kalau QA gagal berkali-kali untuk item yang sama, tahan di Langkah 6 dan sampaikan ke customer supaya bisa diputuskan: scope dikurangi, revisi spec, atau di-abort.

### Langkah 7 — Post-deploy verifikasi  ·  estimasi 3-5 menit

- **Aksi:** Verifikasi `preview_url` hidup dan fitur bekerja sesuai spec. Cek mobile dulu (viewport 375px), lalu desktop. Jalankan ulang item kritis dari checklist langsung di URL preview — mobile rendering, navigasi, dan kalau ada, QRIS flow dan format IDR. Catat temuan apa pun yang berbeda antara hasil lokal Langkah 6 dan preview hidup.
- **Tautan/endpoint:** `hermes-skill:landing-page-builder` mode `post-deploy-check`
- **Input yang diharapkan:** `preview_url` dari `state_data` (hasil Langkah 6), `checklist_items` dari Langkah 4, dan `touches_payment` dari Langkah 1.
- **Output yang diharapkan:** Hasil verifikasi ke `step_output` — `{ "verification_results": [ { "id", "status": "pass"|"fail", "note", "viewport" } ], "verification_all_pass": true, "mobile_render_ok": true, "payment_flow_ok": true|null }`. `payment_flow_ok` null kalau `touches_payment: false`.
- **Validasi:** `verification_all_pass` true sebelum lanjut. `mobile_render_ok` true wajib karena pengunjung Indonesia mayoritas mobile.

  | Kondisi | Tindakan |
  |---|---|
  | Verifikasi semua pass, mobile dan desktop OK | `advance` ke Langkah 8 |
  | Mobile render bermasalah di preview meski lokal OK | Tetap di Langkah 7, kembali ke Langkah 6 untuk fix, deploy preview ulang, verifikasi ulang |
  | Ada item fail di QRIS atau IDR di preview | Tetap di Langkah 7, kembali ke Langkah 6 untuk fix, deploy preview ulang |
  | Verifikasi gagal di tengah jalan | Tetap di Langkah 7, ulangi verifikasi sekali, kalau tetap gagal sampaikan ke customer |

- **Gerbang eskalasi:** `none`. Verifikasi adalah cek otomatis — keputusan promote diminta di checkpoint Langkah 8 setelah verifikasi pass.
- **Error handling:** Kalau verifikasi gagal karena `preview_url` tidak responsif, ulangi sekali. Kalau tetap gagal, kembali ke Langkah 6 untuk cek apakah deploy benar-benar siap atau perlu deploy ulang.

### Langkah 8 — Checkpoint approve, promote ke production, dan kirim  ·  estimasi tunggu customer + 2-4 menit promote

- **Aksi:** Kirim ke customer `preview_url` plus ringkasan hasil verifikasi Langkah 7. Minta persetujuan eksplisit sebelum fitur dipromosikan ke production. Panggil `advance` dengan `set_status: "awaiting_customer"` lalu berhenti. Saat customer membalas approve, jalankan `vercel-deploy-orchestrator` dengan `target=production` dan `vercel_project_name` dari `state_data`. Kirim URL production ke customer, lalu panggil `complete`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"`, lalu `hermes-skill:vercel-deploy-orchestrator` (`target=production`), lalu `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete`
- **Input yang diharapkan:** `preview_url`, `verification_results`, `vercel_project_name` dari `state_data` (hasil Langkah 1, 6, 7).
- **Output yang diharapkan:** Saat customer approve dan promote sukses, `step_output` berisi — `{ "promotion_approved": true, "production_url", "deployed_at" }`. Run berstatus `completed`.
- **Validasi:** Balasan customer harus berupa persetujuan eksplisit. Deploy production mencapai status siap dan `production_url` terisi sebelum `complete`.

  | Balasan customer | Tindakan |
  |---|---|
  | "promote" / "lanjut" / "deploy ke production" | Rekam `promotion_approved: true`, jalankan promote, kirim `production_url`, panggil `complete` |
  | Minta revisi setelah lihat URL hidup | Rekam revisi, kembali ke Langkah 6 untuk fix, deploy preview ulang, lalu kembali ke checkpoint ini |
  | Customer minta tahan dulu, belum mau promote | Tahan di Langkah 8, jaga status `awaiting_customer`. Preview tetap hidup sampai customer siap |
  | Customer belum jelas mau apa | Tetap di Langkah 8, tanya satu pertanyaan, jaga status `awaiting_customer` |
  | Deploy production gagal setelah customer approve | Jangan `complete`. Ulangi deploy sekali, lalu kalau masih gagal sampaikan ke customer bahwa URL preview tetap hidup sebagai hasil sementara |

- **Gerbang eskalasi:** `checkpoint`. Gerbang ini selalu aktif — promote ke production menyentuh halaman yang dilihat pengunjung sungguhan, jadi customer harus approve dulu. Promote bisa di-rollback dari dashboard Vercel kalau ada masalah pasca-promote, jadi gerbangnya checkpoint lunak, bukan gerbang keras. Yang agent sampaikan ke customer: `preview_url`, ringkasan verifikasi, lalu satu pertanyaan tertutup — "Kalau tampilan di preview sudah pas, balas 'promote' dan aku jadikan production. Kalau ada yang mau diubah, sebut bagiannya.". Setelah itu agent berhenti dan menunggu balasan.
- **Error handling:** Kalau panggilan `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau promote gagal setelah customer approve, jangan `abort` playbook — URL preview dari Langkah 6 masih hidup, sampaikan itu ke customer sebagai hasil sementara dan tawarkan mengulang promote.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue")
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh customer
- Tidak ada error code numerik atau acronim tech bocor ke customer — kalau flow-state gagal, sampaikan dalam bahasa biasa
- Kalimat pendek. Satu ide per kalimat
- Calm-premium register — playbook ini dibaca sebagai siklus pengiriman fitur yang tertata, bukan rentetan perintah deploy
- Surface progress tiap langkah selesai, bukan diam lalu kirim URL final sekaligus
- Mobile-first language saat menjelaskan testing dan verifikasi — pengunjung Indonesia mayoritas dari ponsel, framing-nya menyesuaikan
- Zero exclamation marks

## Decline criteria

- **Fitur yang melanggar policy hosting.** Konten judi, scam, spam, atau ilegal — aku decline dengan alasan singkat, playbook tidak diteruskan.
- **Promote tanpa preview di-approve.** Aku tidak melewati checkpoint Langkah 8. Kalau customer minta langsung production tanpa cek preview, aku jelaskan preview ditunjukkan dulu, lalu jalankan checkpoint seperti biasa.
- **Mulai implementasi tanpa spec di-approve.** Aku tidak melewati checkpoint Langkah 5. Implementasi mengubah file project customer; arah harus dikonfirmasi dulu supaya rework tidak menumpuk.
- **Setup payment gateway baru tanpa customer hadir.** Kalau fitur menyentuh integrasi payment baru (bukan menyentuh QRIS flow yang sudah ada), aku tahan dulu dan minta customer hadir untuk approve kredensial. Itu uang customer yang lewat.
- **Skip mobile testing untuk fitur UI.** Pengunjung Indonesia mayoritas dari ponsel, jadi item mobile di checklist wajib ada. Kalau customer minta skip mobile dan langsung promote, aku jelaskan kenapa cek mobile dipertahankan sebelum lanjut.
- **Tambah dependency yang tidak diperlukan.** Aku hindari menambah paket npm baru kecuali jelas perlu. Kalau breakdown butuh dependency baru, aku surface alasan di Langkah 3 supaya customer tahu sebelum di-approve.

## Decline kalau missing context

Kalau cuma "tambah fitur dong" tanpa deskripsi atau halaman target — tanya: "Fitur apa yang mau ditambah, dan di halaman mana? Itu menentukan komponen yang aku susun dan testing yang aku siapkan." Klarifikasi ini terjadi di Langkah 1 sebelum run dimulai.
