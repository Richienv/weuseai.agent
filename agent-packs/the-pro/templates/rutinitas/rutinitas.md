# Daftar rutinitas

Sumber kebenaran semua rutinitas "tiap X → Y" yang customer minta. Hidup di `/var/lib/weuseai/data/rutinitas/rutinitas.md`. Tiap baris di sini harus punya pasangan entri cron di crontab user `weuseai` — file ini yang dibaca manusia, crontab yang dieksekusi mesin.

| Aktif sejak | Jadwal (bahasa manusia) | Cron | Yang dilakukan | Status |
|---|---|---|---|---|
| 2026-07-17 | tiap hari jam 06.30 | 30 6 * * * | kirim pengingat minum obat | aktif |
| 2026-07-17 | tiap Senin jam 08.00 | 0 8 * * 1 | rekap penjualan minggu lalu dari buku kas | aktif |

Status: `aktif`, `jeda`, `berhenti`. Rutinitas berhenti tetap ditulis (ubah status), barisnya jangan dihapus — sejarah berguna saat customer minta "hidupkan lagi yang dulu".

## Aturan pemakaian

- Satu rutinitas = satu baris di sini + satu baris crontab dengan komentar penanda `# weuseai-rutinitas: <slug>`.
- Sebelum menulis crontab, bacakan jadwal dalam bahasa manusia dan minta konfirmasi customer sekali.
- Zona waktu server harus Asia/Jakarta — cek `timedatectl` sebelum pasang rutinitas pertama.
- Maksimal 10 rutinitas aktif. Lebih dari itu, ajak customer merapikan dulu — pengingat yang terlalu banyak berhenti dibaca.
