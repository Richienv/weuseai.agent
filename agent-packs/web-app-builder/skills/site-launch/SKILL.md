---
skill_kind: playbook
name: site-launch
bundle: web-app-builder
flow_state_playbook_id: site-launch
total_steps: 6
use_cases:
  - "Bikin website dari nol sampai live — brief, build, preview, deploy — dalam satu alur"
  - "Customer mau lihat preview dulu sebelum site-nya dipromosikan ke production"
  - "Landing page atau multi-page site yang diantar berurutan, bukan diserahkan jadi sekaligus"
  - "Build yang butuh dua titik henti — review copy lokal lalu approve URL preview hidup"
prerequisites:
  - "Customer pakai tier Pro atau Studio"
  - "VERCEL_TOKEN sudah tersimpan di dashboard customer — deploy butuh ini, dicek di Langkah 1"
  - "Customer bisa cerita nama bisnis dan value prop, atau bisa diklarifikasi di Langkah 1"
escalation_to: customer
---

# site-launch — web-app-builder playbook

Playbook ini membawa satu build website dari brief sampai hidup di production. Empat skill Web Creator yang sebelumnya berjalan terpisah — landing-page-builder atau multi-page-site-builder, lalu vercel-deploy-orchestrator dua kali — dirangkai jadi satu alur berurutan, dengan dua titik henti supaya customer cek hasil sebelum lanjut.

Bedanya dengan memanggil `landing-page-builder` lalu `vercel-deploy-orchestrator` sendiri-sendiri: di sini state-machine menjaga posisi langkah, jadi alur tetap utuh walau ada jeda antar pesan, dan kedua checkpoint dijamin tidak terlewat. Customer tidak pernah menemukan site sudah live tanpa dia approve dulu.

## Kapan dipakai

Customer minta dibikinkan website dan diantar sampai live, bukan sekadar satu langkah saja. Trigger phrases:

- "bikin website aku sampai live"
- "buatin landing page terus deploy"
- "aku mau site dari nol sampai online"
- "bikin website lalu publish ke Vercel"
- "site lengkap, tapi aku mau cek preview dulu"
- "launch website bisnis aku"

Kalau customer cuma minta satu langkah — "bikin landing page saja" tanpa deploy, atau "deploy folder ini" untuk site yang sudah ada — pakai skill tunggal yang sesuai (`landing-page-builder`, `multi-page-site-builder`, atau `vercel-deploy-orchestrator`), bukan playbook ini.

## Cara kerja

Playbook ini dijalankan oleh state-machine engine `flow-state`. Engine menyimpan posisi langkah dan hasil tiap langkah, jadi alur tetap utuh walau ada jeda berjam-jam antara pesan customer.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "site-launch", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai:

- `start` — mulai atau ulang run. Kirim `total_steps: 6`. Cursor balik ke Langkah 1, status `in_progress`.
- `get` — baca run berjalan: `current_step`, `status`, dan `state_data` (gabungan output semua langkah sebelumnya).
- `advance` — catat output langkah ini lewat `step_output` (di-shallow-merge ke `state_data`), geser cursor +1. Opsional `set_status`.
- `complete` — tandai run selesai.
- `abort` — batalkan run.

Status run: `in_progress`, `awaiting_customer` (parkir lunak — menunggu balasan customer di sebuah checkpoint), `escalated` (parkir di gerbang keras), `completed`, `aborted`. Playbook ini tidak punya gerbang keras — kedua titik hentinya adalah checkpoint lunak.

Loop yang diikuti agent:

1. Pesan trigger pertama dari customer → panggil `get` dulu. Kalau tidak ada run yang bisa dilanjutkan, panggil `start` dengan `total_steps: 6`. Jangan `start` di atas run yang masih berjalan — itu mereset cursor dan menghapus `state_data`.
2. Tiap pesan customer berikutnya → panggil `get` dulu untuk lihat `current_step` dan `state_data` yang sudah terkumpul → jalankan langkah itu → panggil `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → panggil `advance` dengan `set_status: "awaiting_customer"`, sampaikan ke customer apa yang kamu butuh, lalu berhenti dan kembalikan kontrol.
4. Saat customer membalas → panggilan berikutnya `get`, melihat status parkir, dan melanjutkan dari langkah yang ditunjuk cursor.
5. Setelah Langkah 6 selesai → panggil `complete`.

Satu langkah satu kali jalan. Jangan loncat langkah, jangan gabung dua langkah dalam satu giliran.

## Langkah-langkah

### Langkah 1 — Intake brief dan cek kesiapan deploy  ·  estimasi 3-5 menit

- **Aksi:** Kumpulkan brief dasar dari pesan customer — `business_name`, `value_prop`, jenis site (landing satu halaman atau multi-page), `template_kind`, dan `contact_method` plus `contact_value`. Cek juga apakah `VERCEL_TOKEN` sudah tersedia di setelan customer, karena deploy di Langkah 4 dan 6 butuh itu. Kalau ada field penting yang kosong, tanya dalam satu pesan ringkas. Lalu panggil `start` pada flow-state dengan `total_steps: 6`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `start`
- **Input yang diharapkan:** Pesan trigger customer berisi nama bisnis dan gambaran site yang diinginkan.
- **Output yang diharapkan:** Brief ke `step_output` — `{ "business_name", "value_prop", "site_type": "landing"|"multipage", "template_kind", "contact_method", "contact_value", "vercel_token_ready": true|false }`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:** `business_name` dan `value_prop` wajib terisi. `site_type` jelas. Cek `vercel_token_ready`.

  | Kondisi | Tindakan |
  |---|---|
  | Brief lengkap dan token siap | Lanjut, `advance` ke Langkah 2 |
  | Brief lengkap tapi token belum disetel | `advance` ke Langkah 2, catat `vercel_token_ready: false` — build tetap jalan, tapi ingatkan customer setel token sebelum Langkah 4 |
  | Field brief penting kosong | Tetap di Langkah 1, tanya satu pesan ringkas berisi field yang kurang |

- **Gerbang eskalasi:** `none`. Klarifikasi di langkah ini adalah pertanyaan pembuka biasa, bukan parkir state-machine. Agent baru `advance` setelah brief cukup lengkap. Soal token, agent tidak memarkir run — dia hanya mengingatkan customer lebih awal supaya deploy tidak tersendat di tengah jalan dengan kalimat seperti "Aku butuh akses Vercel kamu sebelum site-nya bisa dipublish. Kamu bisa siapkan tokennya di dashboard, simpannya aman di sisi kamu."
- **Error handling:** Kalau panggilan `start` gagal, ulangi `start` sekali. Kalau masih gagal, sampaikan ke customer "Aku belum bisa mulai prosesnya, coba lagi sebentar" dan jangan lanjut ke langkah berikutnya.

### Langkah 2 — Build site  ·  estimasi 4-8 menit

- **Aksi:** Susun site sesuai brief. Untuk `site_type` `landing`, jalankan `landing-page-builder` — pilih template, isi copy, tulis 3-5 blok pendukung. Untuk `site_type` `multipage`, jalankan `multi-page-site-builder` — susun home, about, services, contact dengan navigasi konsisten. Catat path output lokal supaya langkah deploy bisa membacanya.
- **Tautan/endpoint:** `hermes-skill:landing-page-builder` atau `hermes-skill:multi-page-site-builder` (tergantung `site_type`)
- **Input yang diharapkan:** Brief dari `state_data` (hasil Langkah 1).
- **Output yang diharapkan:** Hasil build ke `step_output` — `{ "build_skill", "source_path", "pages": [...], "preview_summary" }`. `source_path` adalah path lokal persis hasil build (`/tmp/web-creator-out/...`) yang akan dipakai langkah deploy.
- **Validasi:** `source_path` terisi dan file build benar-benar ada.

  | Kondisi | Tindakan |
  |---|---|
  | Build jadi, `source_path` valid | `advance` ke Langkah 3 |
  | Kebutuhan customer butuh komponen di luar template | Tetap di Langkah 2, flag keterbatasan itu ke customer dan tawarkan alternatif sebelum lanjut |

- **Gerbang eskalasi:** `none`. Langkah ini auto-advance ke checkpoint. Customer melihat hasilnya di checkpoint Langkah 3.
- **Error handling:** Kalau build gagal di tengah jalan, ulangi Langkah 2 dengan brief yang sama dari `state_data` — jangan ulang seluruh playbook. Kalau template yang dipilih ternyata tidak cocok, kembali tanya `template_kind` ke customer lalu ulangi Langkah 2.

### Langkah 3 — Checkpoint: tinjau preview lokal  ·  estimasi tunggu customer

- **Aksi:** Tunjukkan ke customer preview lokal site yang sudah dibuat — ringkasan copy per halaman dan tautan preview lokal. Minta customer mengecek isi dan struktur sebelum site dideploy. Panggil `advance` dengan `set_status: "awaiting_customer"` lalu berhenti.
- **Tautan/endpoint:** `—`
- **Input yang diharapkan:** Hasil build dari `state_data` (hasil Langkah 2).
- **Output yang diharapkan:** Saat customer membalas, rekam keputusan mereka ke `step_output` — `{ "copy_approved": true|false, "copy_revisions" }`. Lalu cursor lanjut ke Langkah 4.
- **Validasi:** Balasan customer harus berupa keputusan yang bisa ditindaklanjuti — konfirmasi, atau revisi yang konkret.

  | Balasan customer | Tindakan |
  |---|---|
  | "lanjut" / setuju | Rekam `copy_approved: true`, `advance` ke Langkah 4 |
  | Minta revisi copy atau struktur | Rekam revisi, kembali jalankan Langkah 2 untuk menerapkannya, lalu kembali ke checkpoint ini |
  | Customer belum jelas mau apa | Tetap di Langkah 3, tanya satu pertanyaan, jaga status `awaiting_customer` |

- **Gerbang eskalasi:** `checkpoint`. Gerbang ini selalu aktif. Deploy menghasilkan URL hidup, jadi agent berhenti di sini supaya customer bisa mengoreksi copy dulu selagi masih lokal. Yang agent sampaikan ke customer: ringkasan copy per halaman, tautan preview lokal, lalu satu pertanyaan tertutup — "Aku lanjut deploy site ini ke preview, atau kamu mau adjust copy-nya dulu?". Setelah itu agent berhenti dan menunggu balasan.
- **Error handling:** Kalau panggilan `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau tetap gagal, tetap sampaikan ringkasan preview ke customer dan minta mereka membalas — saat membalas, panggilan `get` berikutnya akan menyinkronkan ulang posisi.

### Langkah 4 — Deploy ke preview  ·  estimasi 2-4 menit

- **Aksi:** Deploy site ke lingkungan preview. Jalankan `vercel-deploy-orchestrator` dengan `target=preview` dan `source_path` dari `state_data`. Hasil deploy menghasilkan satu URL preview hidup yang bisa customer buka di mobile dan desktop.
- **Tautan/endpoint:** `hermes-skill:vercel-deploy-orchestrator` (`target=preview`)
- **Input yang diharapkan:** `source_path` dari `state_data` (hasil Langkah 2), brief dari Langkah 1. `VERCEL_TOKEN` harus tersedia.
- **Output yang diharapkan:** Hasil deploy preview ke `step_output` — `{ "preview_url", "project_name", "deploy_target": "preview" }`. Run berstatus `in_progress` di Langkah 5.
- **Validasi:** Deploy mencapai status siap dan `preview_url` terisi.

  | Kondisi | Tindakan |
  |---|---|
  | Deploy preview sukses, URL hidup | `advance` ke Langkah 5 |
  | `VERCEL_TOKEN` belum disetel | Tetap di Langkah 4, minta customer setel token dulu — site sudah jadi di Langkah 2, tinggal token yang kurang |
  | Deploy gagal di sisi penyedia hosting | Tetap di Langkah 4, ulangi deploy sekali, lalu sampaikan ke customer kalau masih tersendat |

- **Gerbang eskalasi:** `none`. Deploy ke preview tidak menyentuh domain utama customer dan tidak mengeluarkan biaya — ini langkah yang bisa diulang dengan aman. Persetujuan untuk URL preview diminta di checkpoint Langkah 5.
- **Error handling:** Kalau deploy gagal, ulangi Langkah 4 dengan `source_path` yang sama dari `state_data` — tidak perlu membangun ulang site. Kalau token belum siap, tahan di Langkah 4 dan minta customer menyiapkannya, jangan `advance`.

### Langkah 5 — Checkpoint: approve URL preview  ·  estimasi tunggu customer

- **Aksi:** Kirim URL preview hidup ke customer dan minta mereka membukanya di mobile dan desktop. Minta persetujuan eksplisit sebelum site dipromosikan ke production. Panggil `advance` dengan `set_status: "awaiting_customer"` lalu berhenti.
- **Tautan/endpoint:** `—`
- **Input yang diharapkan:** `preview_url` dan `project_name` dari `state_data` (hasil Langkah 4).
- **Output yang diharapkan:** Saat customer membalas, rekam keputusan mereka ke `step_output` — `{ "preview_approved": true|false, "preview_revisions", "custom_domain" }`. `custom_domain` diisi kalau customer sudah punya domain dan ingin dihubungkan. Lalu cursor lanjut ke Langkah 6.
- **Validasi:** Balasan customer harus berupa persetujuan eksplisit atau revisi yang konkret.

  | Balasan customer | Tindakan |
  |---|---|
  | "promote" / "lanjut" / setuju | Rekam `preview_approved: true`, `advance` ke Langkah 6 |
  | Minta revisi setelah lihat URL hidup | Rekam revisi, kembali ke Langkah 2 untuk menerapkannya, lalu jalan lagi lewat Langkah 3 dan 4 |
  | Customer sebut punya domain sendiri | Rekam `custom_domain`, `advance` ke Langkah 6 supaya domain itu dihubungkan saat promote |
  | Customer belum jelas mau apa | Tetap di Langkah 5, tanya satu pertanyaan, jaga status `awaiting_customer` |

- **Gerbang eskalasi:** `checkpoint`. Gerbang ini selalu aktif. SOUL.md Web Creator menetapkan preview ditunjukkan dulu sebelum promote ke production — checkpoint ini menegakkan aturan itu. Promote ke production bisa dibalik dan tidak mengeluarkan biaya customer, jadi gerbangnya checkpoint lunak, bukan gerbang keras. Yang agent sampaikan ke customer: URL preview, ajakan mengeceknya di mobile dan desktop, lalu satu pertanyaan tertutup — "Kalau tampilannya sudah pas, balas 'promote' dan aku jadikan production. Kalau ada yang mau diubah, sebut bagiannya.". Setelah itu agent berhenti dan menunggu balasan.
- **Error handling:** Kalau panggilan `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau tetap gagal, tetap kirim URL preview ke customer dan minta mereka membalas — saat membalas, `get` akan tetap menunjuk Langkah 5 dan checkpoint bisa diselesaikan.

### Langkah 6 — Promote ke production dan kirim  ·  estimasi 2-4 menit

- **Aksi:** Promosikan site ke production. Jalankan `vercel-deploy-orchestrator` dengan `target=production`. Kalau `custom_domain` ada di `state_data`, hubungkan domain itu dan siapkan daftar pengaturan DNS yang perlu customer pasang di penyedia domainnya. Kirim URL final ke customer, lalu panggil `complete`.
- **Tautan/endpoint:** `hermes-skill:vercel-deploy-orchestrator` (`target=production`), lalu `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete`
- **Input yang diharapkan:** `source_path`, `project_name`, `preview_approved`, dan `custom_domain` (kalau ada) dari `state_data` (hasil Langkah 2, 4, dan 5).
- **Output yang diharapkan:** Hasil deploy final ke `step_output` — `{ "production_url", "custom_domain_linked": true|false, "dns_records": [...] }`. Run berstatus `completed`.
- **Validasi:** Deploy production mencapai status siap dan `production_url` terisi.

  | Kondisi | Tindakan |
  |---|---|
  | Deploy production sukses, tanpa custom domain | Kirim `production_url` ke customer, panggil `complete` |
  | Deploy sukses, custom domain dihubungkan | Kirim `production_url` plus daftar pengaturan DNS, ingatkan propagasi 1-24 jam, panggil `complete` |
  | Deploy production gagal | Jangan `complete`. Ulangi deploy sekali, lalu kalau masih gagal sampaikan ke customer bahwa URL preview tetap hidup sebagai hasil sementara |

- **Gerbang eskalasi:** `none`. Promote ke production adalah hasil akhir yang arahnya sudah disetujui di checkpoint Langkah 5, jadi tidak butuh gerbang lagi.
- **Error handling:** Kalau promote gagal, jangan `abort` playbook. URL preview dari Langkah 4 masih hidup — sampaikan itu ke customer sebagai hasil sementara dan tawarkan mengulang promote. Kalau penghubungan custom domain gagal tapi deploy production sukses, tetap kirim `production_url`, catat domain belum terhubung, dan tawarkan menghubungkannya lagi terpisah.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue")
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh customer
- Tidak ada error code numerik atau acronim tech bocor ke customer — kalau flow-state gagal, sampaikan dalam bahasa biasa
- Kalimat pendek. Satu ide per kalimat
- Calm-premium register — playbook ini dibaca sebagai satu alur build-ke-live yang tertata, bukan rentetan perintah deploy
- Surface progress tiap langkah selesai, bukan diam lalu kirim URL final sekaligus
- Zero exclamation marks

## Decline criteria

- **Konten yang melanggar policy hosting.** Site yang berisi judi, scam, spam, atau konten ilegal — aku decline dengan alasan singkat, playbook tidak diteruskan.
- **Klaim kredensial yang customer tidak punya.** Kalau brief menyebut sertifikasi atau afiliasi tanpa bukti, aku tanya konfirmasi sebelum menulis copy itu.
- **Promote tanpa preview di-approve.** Aku tidak melewati checkpoint Langkah 5. Kalau customer minta langsung production tanpa cek preview, aku jelaskan preview ditunjukkan dulu, lalu jalankan checkpoint seperti biasa.
- **Beli domain atas nama customer.** Aku tidak checkout domain. Kalau customer butuh domain baru, aku arahkan ke skill `domain-advisory` untuk perbandingan, customer beli sendiri, lalu domain itu dihubungkan di Langkah 6.
- **Setup payment gateway atau e-commerce checkout tanpa customer hadir.** Itu uang customer yang lewat — di luar scope playbook ini, customer yang validasi sendiri.

## Decline kalau missing context

Kalau cuma "bikin website dong" tanpa nama bisnis atau gambaran site — tanya: "Website untuk bisnis apa, dan kamu mau satu halaman atau multi-halaman? Itu ngebantu aku pilih template dan susun copy-nya." Klarifikasi ini terjadi di Langkah 1 sebelum run dimulai.
