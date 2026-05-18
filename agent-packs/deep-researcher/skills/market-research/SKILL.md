---
skill_kind: playbook
name: market-research
bundle: deep-researcher
flow_state_playbook_id: market-research
total_steps: 6
use_cases:
  - "Riset pasar untuk launch produk baru — ukuran pasar, segmen, tren permintaan"
  - "Competitor scan satu industri — siapa pemain, positioning, pangsa"
  - "Literature review topik kebijakan atau regulasi untuk keputusan bisnis"
  - "Sintesis laporan riset siap pakai dengan citation lengkap"
prerequisites:
  - "Customer pakai tier Pro atau Studio"
  - "LLM BYOK customer punya akses web (web search aktif) — riset web butuh ini"
  - "Topik riset dan tujuan pakai sudah jelas, atau bisa diklarifikasi di Langkah 1"
escalation_to: customer
---

# market-research — deep-researcher playbook

Playbook ini menjalankan satu permintaan riset pasar dari awal sampai laporan jadi. Empat skill Deep Researcher yang sebelumnya berjalan terpisah — web-research, source-evaluator, citation-builder, synthesis-report — dirangkai jadi satu alur yang berurutan, punya checkpoint, dan tahan jeda antar pesan.

## Kapan dipakai

Customer minta riset pasar atau riset topik kompleks yang butuh hasil utuh, bukan sekadar daftar link. Trigger phrases:

- "riset pasar soal [topik]"
- "bantu aku riset [topik] dari awal sampai laporan"
- "market analysis [industri / produk]"
- "scan kompetitor lengkap di [market]"
- "bikin laporan riset utuh soal [topik]"

Bedanya dengan skill `web-research` tunggal: di sini customer mau alur penuh sampai laporan, dengan satu titik henti untuk mereka cek arah sebelum sintesis. Kalau customer cuma minta satu langkah (mis. "evaluasi sumber ini saja"), pakai skill tunggal yang sesuai, bukan playbook ini.

## Cara kerja

Playbook ini dijalankan oleh state-machine engine `flow-state`. Engine menyimpan posisi langkah dan hasil tiap langkah, jadi alur tetap utuh walau ada jeda berjam-jam antara pesan customer.

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "market-research", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai:

- `start` — mulai atau ulang run. Kirim `total_steps: 6`. Cursor balik ke Langkah 1, status `in_progress`.
- `get` — baca run berjalan: `current_step`, `status`, dan `state_data` (gabungan output semua langkah sebelumnya).
- `advance` — catat output langkah ini lewat `step_output` (di-shallow-merge ke `state_data`), geser cursor +1. Opsional `set_status`.
- `complete` — tandai run selesai.
- `abort` — batalkan run.

Status run: `in_progress`, `awaiting_customer` (parkir — menunggu balasan customer), `escalated` (parkir di gerbang keras — menunggu approval eksplisit customer), `completed`, `aborted`.

Loop yang diikuti agent:

1. Pesan trigger pertama dari customer → panggil `start` dengan `total_steps: 6`.
2. Tiap pesan customer berikutnya → panggil `get` dulu untuk lihat `current_step` dan `state_data` yang sudah terkumpul → jalankan langkah itu → panggil `advance` dengan `step_output` langkah tersebut.
3. Di gerbang eskalasi → panggil `advance` dengan `set_status` `awaiting_customer` (checkpoint lunak) atau `escalated` (gerbang keras), sampaikan ke customer apa yang kamu butuh, lalu berhenti dan kembalikan kontrol.
4. Saat customer membalas → panggilan berikutnya `get`, melihat status parkir, dan melanjutkan dari langkah yang ditunjuk cursor.
5. Setelah Langkah 6 selesai → panggil `complete`.

## Langkah-langkah

### Langkah 1 — Intake dan scoping pertanyaan riset  ·  estimasi 2-4 menit

- **Aksi:** Baca pesan customer, tarik parameter scoping: `topic`, `scope` (quick-scan / standard / deep-dive), `time_period`, `geography`, `source_preference`, dan tujuan pakai hasil. Kalau ada yang kosong dan penting, tanya satu pertanyaan klarifikasi. Lalu panggil `start` pada flow-state dengan `total_steps: 6`.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `start`
- **Input yang diharapkan:** Pesan trigger customer berisi topik riset dan, kalau ada, batas waktu, geografi, kedalaman.
- **Output yang diharapkan:** Objek scope ke `step_output` — `{ "topic", "scope", "time_period", "geography", "source_preference", "purpose" }`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:** `topic` wajib terisi dan cukup spesifik untuk disusun jadi sub-pertanyaan.

  | Kondisi | Tindakan |
  |---|---|
  | `topic` jelas dan spesifik | Lanjut, `advance` ke Langkah 2 |
  | `topic` ada tapi terlalu luas (mis. "riset teknologi") | Tetap di Langkah 1, tanya satu pertanyaan untuk mempersempit |
  | Tidak ada topik sama sekali | Tetap di Langkah 1, tanya topik dan tujuan |

- **Gerbang eskalasi:** `none`. Klarifikasi di langkah ini adalah pertanyaan pembuka biasa, bukan parkir state-machine. Agent baru `advance` setelah scope cukup lengkap.
- **Error handling:** Kalau panggilan `start` gagal, ulangi `start` sekali. Kalau masih gagal, sampaikan ke customer "Aku belum bisa mulai run riset, coba lagi sebentar" dan jangan lanjut ke langkah berikutnya.

### Langkah 2 — Kumpulkan sumber lewat web-research  ·  estimasi 5-12 menit

- **Aksi:** Pecah `topic` jadi 3-6 sub-pertanyaan, jalankan riset web per sub-pertanyaan, scrape dan parse halaman relevan, dedup sumber yang isinya sama. Kumpulkan source set mentah dengan metadata per sumber.
- **Tautan/endpoint:** `hermes-skill:web-research`
- **Input yang diharapkan:** Objek scope dari `state_data` (hasil Langkah 1).
- **Output yang diharapkan:** Source set mentah ke `step_output` sebagai `{ "sources": [ { "title", "author", "published_at", "url", "source_type", "key_quote", "sub_question" } ], "sub_questions": [...] }`. Minimum 5 sumber primer untuk scope standard, lebih untuk deep-dive.
- **Validasi:** Hitung jumlah sumber primer terhadap target scope.

  | Kondisi | Tindakan |
  |---|---|
  | Jumlah sumber memenuhi target scope | `advance` ke Langkah 3 |
  | Sumber kurang dari target | `advance` ke Langkah 3 tapi catat "sumber terbatas" di `step_output`, jangan tambal dengan generalisasi |
  | Tidak ada sumber sama sekali | Tetap di Langkah 2, sampaikan ke customer bahwa topik ini sumbernya tipis, tawarkan mempersempit atau menggeser angle |

- **Gerbang eskalasi:** `none`. Langkah ini auto-advance ke grading. Customer melihat hasil gabungan di checkpoint Langkah 4.
- **Error handling:** Kalau riset web gagal di tengah jalan, ulangi Langkah 2 saja dari sub-pertanyaan yang belum selesai — jangan ulang seluruh playbook. Output sub-pertanyaan yang sudah berhasil tetap dipakai.

### Langkah 3 — Grading kredibilitas sumber  ·  estimasi 3-6 menit

- **Aksi:** Nilai tiap sumber pakai rubrik kredibilitas lima dimensi (authority, recency, primary/secondary, bias, corroboration). Beri tiap sumber tier akhir A, B, C, atau D.
- **Tautan/endpoint:** `hermes-skill:source-evaluator` — rubrik di template `source-credibility-rubric.md`
- **Input yang diharapkan:** Source set mentah dari `state_data` (hasil Langkah 2).
- **Output yang diharapkan:** Source set yang sudah dinilai ke `step_output` — tiap sumber dapat field `tier` (A/B/C/D) dan `grading_note` singkat. Tambah ringkasan `{ "tier_counts": { "A", "B", "C", "D" } }`.
- **Validasi:** Tiap sumber punya tepat satu tier. Sumber yang tidak bisa diakses ditandai `tier: "uneval"` dengan catatan, bukan dipaksa masuk A-D.

  | Kondisi | Tindakan |
  |---|---|
  | Ada minimal satu sumber Tier A atau B | `advance` ke Langkah 4 |
  | Semua sumber Tier C atau D | `advance` ke Langkah 4, tandai jelas di checkpoint bahwa anchor kuat belum ada |

- **Gerbang eskalasi:** `none`. Hasil grading dibawa ke checkpoint Langkah 4 untuk dilihat customer.
- **Error handling:** Kalau grading gagal, ulangi Langkah 3 dengan source set yang sama dari `state_data`. Source set mentah tidak hilang, jadi tidak perlu ulang Langkah 2.

### Langkah 4 — Checkpoint: tinjau sumber dan scope  ·  estimasi tunggu customer

- **Aksi:** Tampilkan ke customer source set yang sudah dinilai per tier, plus scope yang diusulkan untuk sintesis (klaim utama disandarkan ke Tier A dan B). Minta customer mengonfirmasi atau menyesuaikan sebelum sintesis dimulai. Panggil `advance` dengan `set_status: "awaiting_customer"` lalu berhenti.
- **Tautan/endpoint:** `—`
- **Input yang diharapkan:** Source set yang sudah dinilai dari `state_data` (hasil Langkah 3).
- **Output yang diharapkan:** Saat customer membalas, rekam keputusan mereka ke `step_output` — `{ "scope_confirmed": true|false, "scope_adjustments", "sources_to_drop", "sources_to_add" }`. Lalu cursor lanjut ke Langkah 5.
- **Validasi:** Balasan customer harus berupa keputusan yang bisa ditindaklanjuti — konfirmasi, atau penyesuaian yang konkret.

  | Balasan customer | Tindakan |
  |---|---|
  | "lanjut" / setuju | Rekam `scope_confirmed: true`, `advance` ke Langkah 5 |
  | Minta drop / tambah sumber atau ubah scope | Rekam penyesuaian. Kalau perlu sumber baru, kembali jalankan Langkah 2 lalu Langkah 3 untuk sumber tambahan, baru `advance` ke Langkah 5 |
  | Customer belum jelas mau apa | Tetap di Langkah 4, tanya satu pertanyaan, jaga status `awaiting_customer` |

- **Gerbang eskalasi:** `checkpoint`. Gerbang ini selalu aktif. Sintesis menghabiskan token dan waktu, jadi agent berhenti di sini supaya customer bisa mengoreksi arah dulu. Yang agent sampaikan ke customer: ringkasan sumber per tier, scope yang diusulkan, lalu satu pertanyaan tertutup — "Aku lanjut sintesis dengan sumber ini, atau kamu mau adjust dulu?". Setelah itu agent berhenti dan menunggu balasan.
- **Error handling:** Kalau panggilan `advance` ke `awaiting_customer` gagal, ulangi sekali. Kalau tetap gagal, tetap sampaikan ringkasan ke customer dan minta mereka membalas — saat membalas, panggilan `get` berikutnya akan menyinkronkan ulang posisi.

### Langkah 5 — Susun citation  ·  estimasi 2-4 menit

- **Aksi:** Format citation untuk source set final (setelah penyesuaian Langkah 4) dan susun daftar pustaka. Default gaya footnote-numbered. Tandai sumber yang metadata-nya tidak lengkap, jangan menebak field yang tidak diketahui.
- **Tautan/endpoint:** `hermes-skill:citation-builder`
- **Input yang diharapkan:** Source set final dari `state_data` — sumber yang sudah dinilai, dikurangi yang di-drop dan ditambah yang diminta di Langkah 4.
- **Output yang diharapkan:** Citation set ke `step_output` — `{ "citations": [ { "ref_number", "formatted_entry", "source_id", "metadata_complete" } ], "style" }`.
- **Validasi:** Penomoran berurutan, tidak ada nomor dipakai dua sumber, tidak ada nomor yatim. Sumber metadata kurang ditandai `metadata_complete: false`.
- **Gerbang eskalasi:** `none`. Citation set langsung dibawa ke Langkah 6.
- **Error handling:** Kalau penyusunan citation gagal, ulangi Langkah 5 dengan source set final yang sama dari `state_data`. Tidak perlu mengulang langkah pengumpulan atau grading.

### Langkah 6 — Sintesis laporan dan kirim  ·  estimasi 5-10 menit

- **Aksi:** Susun laporan riset terstruktur dari source set yang sudah dinilai dan di-citation. Ikut kerangka tetap: TL;DR, key findings dengan evidence, detail per sub-section, konflik antar sumber, gaps, lalu daftar sumber. Sandarkan tiap klaim ke Tier A atau B. Kirim laporan ke customer, lalu panggil `complete`.
- **Tautan/endpoint:** `hermes-skill:synthesis-report` — kerangka di template `synthesis-structure.md`
- **Input yang diharapkan:** Source set yang sudah dinilai plus citation set dari `state_data` (hasil Langkah 3, 4, dan 5).
- **Output yang diharapkan:** Laporan riset final ke `step_output` — `{ "report_markdown", "format" }`. Run berstatus `completed`.
- **Validasi:** Tiap key finding punya citation. Klaim yang tidak terverifikasi ditandai `[unverified]` atau `[limited sources]`. Konflik antar sumber ditampilkan, bukan dirata-rata.

  | Kondisi | Tindakan |
  |---|---|
  | Laporan lengkap, semua klaim ter-citation | Kirim ke customer, panggil `complete` |
  | Ada sub-section tanpa sumber | Tinggalkan sub-section itu dengan catatan terbuka, tetap kirim, panggil `complete` |

- **Gerbang eskalasi:** `none`. Pengiriman laporan adalah hasil akhir yang sudah disetujui arahnya di checkpoint Langkah 4, jadi tidak butuh gerbang lagi.
- **Error handling:** Kalau sintesis gagal, ulangi Langkah 6 dengan data yang sama dari `state_data`. Kalau gagal berulang, sampaikan ke customer bahwa sintesis tersendat dan tawarkan mengirim source set yang sudah dinilai sebagai hasil sementara — jangan `abort` tanpa memberi customer pilihan.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue")
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh pelanggan
- Tidak ada error code numerik atau acronim tech bocor ke pelanggan
- Kalimat pendek. Satu ide per kalimat
- Calm-premium register — playbook ini dibaca sebagai satu alur riset yang tertata, bukan sesi tanya-jawab
- Zero exclamation marks

## Decline criteria

- **Riset yang butuh akses berbayar / paywall.** Aku surface metadata dan abstract yang publik, tandai "[full text di balik paywall]". Aku tidak mengarang isi yang tidak aku akses.
- **Topik yang sumbernya tipis atau tidak ada.** Aku bilang terus terang "sumber terbatas" di checkpoint dan tampilkan apa yang ada, bukan menambal dengan generalisasi.
- **Laporan yang menyimpulkan lebih dari yang sumbernya dukung.** Aku tidak menarik kesimpulan kuat dari evidence tipis. Kalau sumber terbatas, laporannya bilang begitu.
- **Citation sebagai dekorasi.** Kalau customer minta "tambahin referensi biar terlihat kredibel" tanpa sumber asli, aku decline. Citation menunjuk ke sumber nyata.
- **Real-time fact-check yang butuh data detik-ini.** Aku tandai timestamp data dan batasi klaim ke periode yang aku verifikasi.

## Decline kalau missing context

Kalau cuma "riset pasar dong" tanpa topik — tanya: "Pasar atau topik apa yang mau diriset, dan untuk keperluan apa? Itu ngebantu aku set scope dan pilih jenis sumber." Klarifikasi ini terjadi di Langkah 1 sebelum run dimulai.
