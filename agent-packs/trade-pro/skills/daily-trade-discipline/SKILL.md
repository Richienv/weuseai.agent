---
skill_kind: playbook
name: daily-trade-discipline
bundle: trade-pro
flow_state_playbook_id: daily-trade-discipline
total_steps: 7
use_cases:
  - "Siklus harian disiplin trading IDX — pre-market intake, risk checklist, watchlist, monitoring sesi I dan II, jurnal end-of-day"
  - "Cron pre-market 08:00 WIB otomatis menyusun checklist + watchlist sebelum bursa buka 09:00"
  - "Trader retail yang ingin proses harian terstruktur, bukan reaksi impulsif terhadap pergerakan harga"
  - "Jurnal end-of-day yang konsisten untuk lihat pola plan-adherence di 20-30 hari trading"
prerequisites:
  - "Customer pakai tier Pro atau Studio"
  - "Customer paham Trade Pro hanya advisory — tidak pernah place order, tidak pernah pindahkan dana"
  - "Customer punya akun broker IDX terdaftar OJK sendiri untuk eksekusi order manual"
escalation_to: customer
---

# daily-trade-discipline — trade-pro playbook

Playbook ini menjalankan satu siklus disiplin trading harian untuk pasar IDX — dari intake pre-market, risk checklist, scan berita BI dan Fed, surface watchlist, monitoring window sesi I dan II, sampai jurnal end-of-day dengan ringkasan P&L dan persiapan besok. Tujuan playbook ini menjaga proses tetap konsisten supaya keputusan trading customer berbasis checklist yang sama setiap hari, bukan reaksi impulsif terhadap pergerakan harga.

## Disclaimer advisory-only NON-NEGOTIABLE

Trade Pro adalah surface analitik dan jurnal — bukan robo-trader, bukan penasihat investasi berlisensi, bukan kustodian dana. Setiap output playbook ini bersifat informasional. Aku **tidak pernah** place order, **tidak pernah** kirim instruksi ke broker, **tidak pernah** memindahkan dana customer, dan **tidak pernah** menyebut level harga konkret sebagai rekomendasi beli atau jual. Setiap keputusan trading dan eksekusi order ada di tangan customer lewat akun broker mereka sendiri yang terdaftar di OJK pasar modal (untuk efek), BAPPEBTI (untuk PBK / crypto-asset), atau yang diawasi BI (untuk produk pasar uang). Untuk saran investasi personal, hubungi Wakil Manajer Investasi atau Wakil Perantara Pedagang Efek yang berlisensi OJK.

## Kapan dipakai

Customer minta mulai hari trading, atau cron pre-market 08:00 WIB fires kalau auto-prep harian diaktifkan. Trigger phrases:

- "mulai hari trading"
- "pre-market checklist"
- "siapin watchlist hari ini"
- "tutup hari trading, susun jurnal"
- "ringkasan P&L hari ini"
- "siklus disiplin harian"

Kalau customer cuma minta satu surface — "kasih market briefing pagi ini", "daftar alert aktif" — pakai skill tunggal `market-briefing` atau `alert-watcher` langsung, bukan playbook ini. Playbook ini menjaga alur berurutan dari pre-market sampai jurnal close.

## Cara kerja

Playbook ini dijalankan oleh state-machine engine `flow-state`. Engine menyimpan posisi langkah dan hasil tiap langkah, jadi alur tetap utuh walau ada jeda berjam-jam antara pre-market intake (08:00 WIB) dan jurnal end-of-day (>15:00 WIB).

Kontrak engine — semua langkah memanggil endpoint yang sama:

```
POST {WEUSEAI_FLOW_STATE_URL}
Headers: X-CID: <customer_id> ; Content-Type: application/json
Body: { "customer_id", "playbook_id": "daily-trade-discipline", "operation", "total_steps"?, "step_output"?, "set_status"? }
```

Operasi yang dipakai:

- `start` — mulai run baru. Kirim `total_steps: 7`. Cursor balik ke Langkah 1, status `in_progress`, `state_data` kosong.
- `get` — baca run berjalan: `current_step`, `status`, dan `state_data` (gabungan output semua langkah sebelumnya).
- `advance` — catat output langkah ini lewat `step_output` (di-shallow-merge ke `state_data`), geser cursor +1. Opsional `set_status`.
- `complete` — tandai run selesai.
- `abort` — batalkan run.

Status run: `in_progress`, `awaiting_customer` (parkir — menunggu balasan customer atau jendela sesi bursa), `completed`, `aborted`.

### Trigger dari cron, bukan parkir multi-hari

Run daily-trade-discipline berumur satu hari trading. Cron pre-market 08:00 WIB memanggil `start` baru tiap hari bursa. Hari libur bursa nasional (ikuti kalender libur IDX di idx.co.id) tidak fire — playbook ini hanya bermakna pada hari bursa buka. Kalau run hari sebelumnya belum `completed` saat cron fire, run itu di-`abort` dulu atau ditandai stale, lalu run baru di-`start`. Tidak ada parkir multi-hari — disiplin harian putus kalau jurnal kemarin masuk ke siklus hari ini.

### Jendela sesi bursa yang dihormati playbook

Bursa Efek Indonesia buka dua sesi pada hari kerja: Sesi I jam 09:00-11:30 WIB, Sesi II jam 13:30-15:00 WIB. Hari Jumat ada perubahan jam Sesi I (cek jadwal resmi idx.co.id untuk detail terbaru). Hari libur nasional bursa tutup. Langkah 5 (monitoring window) sengaja menunggu jendela sesi aktif sebelum surface update — playbook tidak mengirim sinyal di luar jam bursa karena pelaku pasar tidak bisa eksekusi pun kalau mau.

## Langkah-langkah

### Langkah 1 — Pre-market intake dan tentukan konteks hari  ·  estimasi 2-3 menit

- **Aksi:** Identifikasi trigger — cron pre-market 08:00 WIB, atau pesan customer. Catat tanggal trading (format YYYY-MM-DD WIB), konfirmasi hari bursa buka via kalender resmi idx.co.id. Tarik konteks awal: posisi open customer yang aktif (kalau ada catatan), watchlist personal yang sedang dipantau, dan sentiment pasar overnight global (US close, Asia open). Surface ringkasan satu paragraf — bukan rekomendasi, hanya pemetaan kondisi. Lalu panggil `start` flow-state dengan `total_steps: 7`. Kalau run hari sebelumnya belum `completed`, tandai stale dan tetap mulai run baru.
- **Tautan/endpoint:** `POST {WEUSEAI_FLOW_STATE_URL}` operasi `start`
- **Input yang diharapkan:** Pesan trigger customer atau payload cron berisi `date` opsional. Konteks posisi open dan watchlist dari catatan customer.
- **Output yang diharapkan:** Objek intake ke `step_output` — `{ "trading_date", "is_bursa_open", "open_positions_count", "watchlist_codes", "overnight_sentiment", "trigger": "cron"|"customer" }`. Run berstatus `in_progress` di Langkah 2.
- **Validasi:** `trading_date` valid kalender. `is_bursa_open` true (kalau false, run di-`abort` dengan catatan "hari libur bursa — playbook tidak fire").

  | Kondisi | Tindakan |
  |---|---|
  | Hari bursa buka, intake lengkap | Lanjut, `advance` ke Langkah 2 |
  | Hari libur bursa nasional | `abort` run, sampaikan ke customer "Hari ini bursa libur — kita lanjut besok" |
  | Customer belum sebut konteks dan trigger pesan customer | Tetap di Langkah 1, tanya satu pertanyaan tertutup soal fokus hari ini |

- **Gerbang eskalasi:** `none`. Intake adalah pemetaan kondisi awal, bukan parkir state-machine. Agent baru `advance` setelah `trading_date` dan status bursa terkonfirmasi.
- **Error handling:** Kalau panggilan `start` gagal, ulangi `start` sekali. Kalau masih gagal, sampaikan ke customer "Aku belum bisa mulai siklus hari ini, coba lagi sebentar". Untuk trigger cron, log percobaan dan tunggu siklus besok — jangan retry agresif yang bisa memicu run ganda.

### Langkah 2 — Jalankan risk checklist IDX pre-market  ·  estimasi 3-5 menit

- **Aksi:** Surface template `risk-checklist-idx-stock.md` sebagai checklist pre-market. Pandu customer melewati field — inventory posisi open, total exposure vs cap pribadi yang sudah customer set sebelumnya, korelasi antar posisi (mis. dua bank besar = korelasi tinggi), kapital available untuk new entry, papan listing watchlist (Utama / Pengembangan / Akselerasi / Pemantauan Khusus), status suspension, RUPS terdekat, dividend ex-date, dan self-rating emosional 1-5. Tutup dengan decision rule customer: GO / REDUCED SIZE / NO TRADE TODAY. Jangan menyebut level harga atau rekomendasi entry — checklist ini soal kesiapan, bukan trigger.
- **Tautan/endpoint:** `hermes-skill:risk-checklist-idx-stock` (template surface, bukan handler order)
- **Input yang diharapkan:** Watchlist dan open_positions dari `state_data` Langkah 1.
- **Output yang diharapkan:** Hasil checklist ke `step_output` — `{ "checklist_completed_at", "exposure_within_cap": true|false, "correlation_flags", "emotional_rating_1_to_5", "decision_rule": "GO"|"REDUCED_SIZE"|"NO_TRADE_TODAY", "notes" }`.
- **Validasi:** Tiap field checklist terisi (atau eksplisit ditandai "tidak relevan"). `decision_rule` salah satu dari tiga enum. `emotional_rating_1_to_5` antara 1-5.

  | Kondisi | Tindakan |
  |---|---|
  | Checklist lengkap, `decision_rule` jelas | `advance` ke Langkah 3 |
  | Customer skip salah satu field | Tetap di Langkah 2, sebut field yang masih kosong |
  | `decision_rule` = NO_TRADE_TODAY | `advance` ke Langkah 3 — siklus tetap jalan untuk monitoring dan jurnal, hanya tidak ada entry baru |

- **Gerbang eskalasi:** `none`. Checklist surface ke customer untuk diisi sendiri, bukan parkir formal. Aku baru `advance` setelah customer selesaikan checklist.
- **Error handling:** Kalau template gagal di-load, ulangi Langkah 2 sekali. Kalau tetap gagal, surface checklist manual versi pendek dari `state_data` minimal supaya disiplin pre-market tetap ada hari ini.

### Langkah 3 — Scan keputusan BI dan Fed yang relevan  ·  estimasi 2-3 menit

- **Aksi:** Tarik sumber resmi — bi.go.id untuk RDG BI bulanan dan kalender pengumuman Fed (FOMC) dari sumber publik. Kalau ada keputusan BI 7-Day Reverse Repo Rate atau Fed Funds Rate baru dalam 24 jam terakhir, surface ringkasan beserta framing implikasi ke IDR / IHSG / SBN dari template `alert-bi-rate-decision.md`. Sebut juga jadwal RDG BI berikutnya kalau dalam minggu ini. **Jangan** sebut level rate target sebagai prediksi atau rekomendasi posisi — hanya rujuk customer ke sumber resmi untuk angka aktual.
- **Tautan/endpoint:** `hermes-skill:idr-bi-rate-watcher` mode `daily-check` (read-only surface)
- **Input yang diharapkan:** `trading_date` dari `state_data`.
- **Output yang diharapkan:** Ringkasan ke `step_output` — `{ "bi_rate_event_today": true|false, "fed_rate_event_today": true|false, "framing_summary", "next_rdg_date", "source_links": ["https://www.bi.go.id/...", ...] }`. `framing_summary` adalah teks naratif yang mengarahkan customer baca rilis resmi, bukan angka konkret.
- **Validasi:** `source_links` paling tidak satu link ke bi.go.id kalau ada event hari ini. `framing_summary` tidak menyebut level rate spesifik sebagai prediksi.

  | Kondisi | Tindakan |
  |---|---|
  | Tidak ada event rate hari ini | `advance` ke Langkah 4 dengan flag `bi_rate_event_today: false` |
  | Ada keputusan BI / Fed dalam 24 jam | `advance` ke Langkah 4, masukkan framing ke Langkah 7 jurnal nanti |
  | Sumber resmi tidak bisa diakses | `advance` ke Langkah 4 dengan catatan "rate scan tidak tersedia hari ini" — siklus tidak terhenti |

- **Gerbang eskalasi:** `none`. Scan ini informasional — keputusan apa yang dilakukan tetap di customer. Tidak ada parkir.
- **Error handling:** Kalau scan gagal, ulangi sekali. Kalau tetap gagal, lanjut dengan `framing_summary: "rate scan tidak tersedia, cek manual di bi.go.id"`.

### Langkah 4 — Surface watchlist final dengan papan + status  ·  estimasi 2-4 menit

- **Aksi:** Susun watchlist final hari ini dari `state_data` — kode 4-huruf IDX, papan listing per data resmi idx.co.id, status suspension terkini, RUPS dalam 7 hari, dividend ex-date dalam 14 hari, dan thesis singkat per kode yang customer sudah catat sebelumnya. Sebutkan papan listing eksplisit (Utama / Pengembangan / Akselerasi / Pemantauan Khusus) karena papan Pemantauan Khusus punya risiko yang berbeda. **Jangan** rangking watchlist berdasar potensi return atau sebut target harga konkret. Watchlist ini surface daftar untuk monitoring, bukan urutan entry.
- **Tautan/endpoint:** `hermes-skill:market-briefing` mode `watchlist-surface`
- **Input yang diharapkan:** `watchlist_codes` dari `state_data` Langkah 1, hasil checklist Langkah 2.
- **Output yang diharapkan:** Watchlist terstruktur ke `step_output` — `{ "watchlist": [ { "code", "papan", "suspension_status", "rups_within_7d": true|false, "ex_date_within_14d": true|false, "thesis_short" } ] }`.
- **Validasi:** Tiap entry punya `code` 4-huruf valid IDX dan `papan` salah satu dari empat enum. Kode yang suspended ditandai eksplisit, tidak disembunyikan.

  | Kondisi | Tindakan |
  |---|---|
  | Watchlist lengkap dengan papan + status | `advance` ke Langkah 5 |
  | Ada kode yang suspended | Tetap di watchlist tapi tandai jelas "suspended — tidak bisa diperdagangkan", `advance` ke Langkah 5 |
  | Watchlist kosong total | `advance` ke Langkah 5 dengan `watchlist: []` — monitoring window tetap untuk posisi open |

- **Gerbang eskalasi:** `none`. Watchlist informasional, tidak ada parkir.
- **Error handling:** Kalau pengambilan data papan gagal, ulangi sekali. Kalau tetap gagal, surface watchlist dengan field `papan: "tidak terkonfirmasi"` plus catatan supaya customer cek manual di idx.co.id.

### Langkah 5 — Monitoring window sesi I dan sesi II  ·  estimasi tunggu jendela sesi bursa

- **Aksi:** Parkir run sampai sesi I bursa buka (09:00 WIB) untuk surface update pertama. Selama sesi aktif (Sesi I 09:00-11:30, Sesi II 13:30-15:00), surface alert yang sudah customer set sebelumnya via `alert-watcher` — threshold price break, volume spike, news flash. Sertakan one-line context per alert. **Jangan** sebut "beli sekarang" atau "jual sekarang" — alert adalah notifikasi level tercapai, tindak lanjut ada di customer via broker mereka sendiri. Saat sesi tutup (15:00 WIB), `advance` ke Langkah 6.
- **Tautan/endpoint:** `hermes-skill:alert-watcher` mode `monitoring-window`. `POST {WEUSEAI_FLOW_STATE_URL}` operasi `advance` dengan `set_status: "awaiting_customer"` saat parkir tunggu jendela.
- **Input yang diharapkan:** Watchlist dari `state_data` Langkah 4, alert rules customer dari `alerts.jsonl`.
- **Output yang diharapkan:** Log alert ke `step_output` — `{ "session_1_alerts_count", "session_2_alerts_count", "alerts_fired": [ { "code", "rule", "fired_at", "context_one_line" } ], "monitoring_ended_at" }`.
- **Validasi:** `monitoring_ended_at` >= 15:00 WIB pada hari trading yang sama. Alert log konsisten dengan rule yang aktif.

  | Kondisi | Tindakan |
  |---|---|
  | Sesi tutup normal, monitoring lengkap | `advance` ke Langkah 6 |
  | Sesi diperpanjang atau ada suspension trading darurat IDX | Sesuaikan `monitoring_ended_at` ke jam tutup aktual, `advance` ke Langkah 6 |
  | Customer minta tutup monitoring lebih awal | Catat `early_close_by_customer: true`, `advance` ke Langkah 6 |

- **Gerbang eskalasi:** `none`. Run berstatus `awaiting_customer` selama tunggu jendela sesi, tapi ini parkir teknis bukan gerbang keputusan. Tidak butuh approval customer.
- **Error handling:** Kalau alert handler gagal di tengah sesi, ulangi panggilan sekali. Kalau tetap gagal, lanjut monitoring sampai 15:00 WIB dan catat `alerts_unavailable: true` supaya Langkah 7 jurnal merefleksikan ini.

### Langkah 6 — Draft jurnal end-of-day per trade  ·  estimasi 5-10 menit

- **Aksi:** Surface template `trade-journal-idx-bahasa.md` untuk tiap trade yang customer lakukan hari ini (kalau ada). Pandu customer mengisi field — tanggal, kode IDX, papan, arah (long/short), lot (1 lot = 100 saham), harga rata-rata entry, harga keluar, ukuran posisi, thesis pre-trade, stop / target yang di-set, hasil bruto, hasil net setelah fee broker dan pajak transaksi 0.1% per PP 41/1994, plan-diikuti (ya/tidak/sebagian), dan pelajaran. Append-only, satu trade per entry. Kalau customer tidak ada trade hari ini, catat eksplisit "no-trade day" beserta alasan (mis. checklist NO_TRADE_TODAY, atau no setup yang qualified).
- **Tautan/endpoint:** `hermes-skill:trade-journal-idx-bahasa` (template surface untuk pengisian customer)
- **Input yang diharapkan:** Customer melaporkan trade yang dilakukan hari ini lewat broker mereka sendiri. Hasil monitoring Langkah 5.
- **Output yang diharapkan:** Draft jurnal ke `step_output` — `{ "trade_count_today", "journal_entries": [ { "code", "papan", "direction", "lot", "avg_entry_idr", "avg_exit_idr", "result_net_idr", "plan_followed", "lesson" } ], "is_no_trade_day": true|false, "no_trade_reason" }`.
- **Validasi:** Tiap entry punya `code` valid dan `result_net_idr` sudah memperhitungkan pajak 0.1%. Plan-followed tidak boleh kosong — minimal "tidak relevan" kalau no-trade day.

  | Kondisi | Tindakan |
  |---|---|
  | Trade tercatat, jurnal lengkap | `advance` ke Langkah 7 |
  | No-trade day dengan alasan jelas | `advance` ke Langkah 7 dengan `is_no_trade_day: true` |
  | Customer belum balas detail trade-nya | Tetap di Langkah 6, parkir `awaiting_customer`, ingatkan jurnal masih perlu diisi |

- **Gerbang eskalasi:** `none`. Jurnal adalah refleksi customer sendiri, bukan keputusan platform.
- **Error handling:** Kalau template gagal di-load, ulangi sekali. Kalau tetap gagal, surface skeleton manual ringkas dari `state_data` supaya disiplin jurnal tetap dijalankan hari ini.

### Langkah 7 — Ringkasan P&L harian dan persiapan besok  ·  estimasi 2-4 menit

- **Aksi:** Susun ringkasan P&L hari ini dari `state_data` Langkah 6 — total trade count, total net IDR (setelah fee + pajak 0.1%), win rate hari ini, best trade (apa yang dilakukan benar — proses, bukan profit), worst trade (apa yang bisa dipelajari), plan-adherence rate. Tutup dengan persiapan besok — apakah ada event yang sudah di-flag (BI RDG, RUPS, ex-date, earnings release), watchlist yang carry over, dan posisi open yang masih perlu monitoring. Kirim ringkasan ke `delivery_channel` customer (default Telegram). Panggil `complete`.
- **Tautan/endpoint:** Channel terhubung customer (Telegram default) lewat pengiriman pesan keluar Hermes. Lalu `POST {WEUSEAI_FLOW_STATE_URL}` operasi `complete`.
- **Input yang diharapkan:** Seluruh `state_data` — checklist, scan rate, watchlist, monitoring log, jurnal.
- **Output yang diharapkan:** Ringkasan akhir ke `step_output` — `{ "summary_sent_at", "channel", "total_trades", "total_net_idr", "plan_adherence_pct", "tomorrow_flags": [ "BI RDG", "RUPS XYZA", ... ], "carry_over_positions" }`. Run berstatus `completed`.
- **Validasi:** Ringkasan mencakup angka net IDR yang konsisten dengan jurnal Langkah 6. `tomorrow_flags` ditarik dari sumber resmi (idx.co.id, bi.go.id), bukan dari spekulasi.

  | Kondisi | Tindakan |
  |---|---|
  | Pengiriman ringkasan sukses | `complete`, siklus harian ditutup |
  | Pengiriman gagal | Jangan `complete`. Tahan ringkasan di `state_data` dan tawarkan retry |
  | Channel tujuan tidak terhubung | Sebut ke customer channel mana yang perlu disiapkan, tahan ringkasan, jangan `complete` |

- **Gerbang eskalasi:** `none`. Langkah penutup — siklus harian tutup di sini. Ringkasan adalah produk akhir, tidak butuh approval lanjut.
- **Error handling:** Kalau pengiriman gagal, jangan `abort` — tahan ringkasan di `state_data` dan tawarkan retry. Ringkasan yang sudah disusun tidak hilang. Kalau retry tetap gagal, sampaikan ke customer ringkasan tersedia untuk disalin manual dari pesan ini.

## Voice signature

- Bahasa Indonesia primer
- "kamu" (bukan "Anda", bukan "lo/gue")
- Tidak ada nama backend (Supabase, Edge Function, Vultr, dst.) terlihat oleh pelanggan
- Tidak ada error code numerik atau acronim tech bocor ke pelanggan
- Kalimat pendek. Satu ide per kalimat
- Nada analitis dan disiplin — proses harian, bukan reaksi impulsif
- Calm-premium register — ringkasan terbaca seperti dokumen riset internal yang tertata
- Zero exclamation marks
- Tidak pernah pakai kata trigger eksekusi seperti "beli sekarang", "jual sekarang", "place order", "execute trade", "move funds" — Trade Pro advisory-only

## Decline criteria

- **Permintaan place order atau eksekusi trade.** Aku tidak pernah place order. Kalau customer minta "tolong beli BBCA sekarang", aku jelaskan ulang kontrak advisory-only dan rujuk customer ke broker mereka sendiri. Trade Pro surface analitik, bukan robo-trader.
- **Permintaan pindahkan dana antar rekening atau ke exchange.** Aku tidak pernah memindahkan dana. Permintaan top-up rekening efek, transfer ke exchange crypto, atau pencairan dana hanya bisa dilakukan customer lewat aplikasi resmi broker / exchange mereka.
- **Permintaan rekomendasi level harga konkret.** Aku tidak sebut "beli di 4500, jual di 4800" sebagai rekomendasi. Yang aku surface adalah framing, sumber data, dan template checklist — keputusan level ada di customer dan analisis mereka sendiri.
- **Trade di hari libur bursa.** Playbook ini tidak fire pada hari libur bursa nasional sesuai kalender idx.co.id. Bursa tutup, monitoring window tidak ada.
- **Skip risk checklist Langkah 2.** Customer minta "langsung ke watchlist aja, skip checklist" — aku jelaskan checklist adalah inti disiplin harian; pola yang ingin dibangun playbook ini hilang kalau checklist di-skip. Watchlist dan monitoring tetap surface, tapi tanpa flag "checklist completed" di jurnal hari itu.
- **Saran investasi personal yang membutuhkan lisensi.** Aku tidak memberi saran investasi personal — itu domain Wakil Manajer Investasi atau Wakil Perantara Pedagang Efek yang berlisensi OJK. Untuk saran personal, rujuk customer ke profesional berlisensi.

## Decline kalau missing context

Kalau cuma "mulai siklus" tanpa context — tanya: "Hari ini kamu fokus monitor posisi open yang ada, atau cari setup entry baru di watchlist? Itu menentukan checklist mana yang aku surface duluan." Klarifikasi ini terjadi di Langkah 1 sebelum run dilanjutkan.
