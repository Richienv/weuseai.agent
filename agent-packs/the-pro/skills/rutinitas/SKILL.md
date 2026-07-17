# rutinitas — Hermes skill

Bundle: the-pro
Handler: `hermes-skill:rutinitas`
Data: `/var/lib/weuseai/data/rutinitas/rutinitas.md`

Mesin "tiap X → Y": customer sebut kebiasaan yang mau dijadwalkan, aku tulis ke daftar rutinitas DAN daftarkan cron di VPS ini supaya jalannya otomatis, bukan tergantung ingatanku.

⚡ spike-gated: crontab self-registration oleh Hermes (agent menulis crontab user `weuseai` sendiri) belum terverifikasi di VPS produksi. Alur ditulis lengkap di bawah; sampai spike lulus, langkah crontab bisa gagal — kalau gagal, catat rutinitas di file data, jujur ke customer bahwa penjadwalan otomatisnya menunggu update sistem, dan tetap layani manual lewat briefing pagi.

## Kapan dipakai

- "tiap hari jam setengah 7 ingetin aku minum obat"
- "tiap Senin pagi kirim rekap penjualan minggu lalu"
- "tiap tanggal 1 ingetin bayar sewa kios"
- "rutinitasku apa aja" / "matiin pengingat obat" / "ganti jamnya jadi jam 7"

## Fetch template

- `templates/rutinitas/rutinitas.md` — format daftar rutinitas + aturan pemakaian. Seed pertama kali ke data dir, lalu jadi sumber kebenaran yang dibaca manusia.

## Yang dilakukan

1. **Terjemahkan jadwal:** ubah bahasa manusia → ekspresi cron. Bacakan balik dalam bahasa manusia ("Tiap hari jam 06.30 WIB aku kirim pengingat minum obat — benar?") dan tunggu konfirmasi sekali. Zona waktu server harus Asia/Jakarta; cek `timedatectl` sebelum rutinitas pertama.
2. **Tulis dua tempat:** baris baru di `rutinitas.md` (jadwal manusia + cron + status `aktif`) DAN entri crontab via shell:

```
( crontab -l 2>/dev/null; echo '30 6 * * * hermes task run "kirim pengingat minum obat ke Telegram" # weuseai-rutinitas: minum-obat' ) | crontab -
```

   Tiap entri wajib berkomentar `# weuseai-rutinitas: <slug>` supaya bisa dicari dan dicabut bersih.
3. **Verifikasi:** `crontab -l | grep weuseai-rutinitas` — pastikan entri masuk. Gagal → jalankan fallback spike-gated di atas.
4. **Ubah/berhenti:** ubah jadwal = cabut entri lama (filter komentar slug), pasang baru, update baris file. Berhenti = cabut entri, status jadi `berhenti` — baris tidak dihapus.
5. **Batas sehat:** maksimal 10 rutinitas aktif. Lewat itu, ajak customer merapikan — pengingat kebanyakan berhenti dibaca.

## Contoh interaksi

**Customer:** "Tiap Jumat sore ingetin aku rekap kas mingguan."

**Kamu:** "Tiap Jumat jam 16.00 WIB aku kirim pengingat rekap kas mingguan — benar?" — setelah 👍: "Aktif. Sekarang ada 3 rutinitas: obat 06.30 harian, rekap Senin 08.00, rekap kas Jumat 16.00."

## Decline criteria

- Tidak memasang rutinitas yang mengeksekusi uang (auto-bayar, auto-transfer) — pengingat boleh, eksekusi tidak.
- Tidak memasang rutinitas yang mengirim pesan ke orang lain secara berulang tanpa approval per pesan — batas anti-spam.
- Tidak menghapus atau menimpa entri crontab di luar penanda `# weuseai-rutinitas:` — crontab sistem bukan wilayahku.
- Jadwal ambigu ("kadang-kadang pagi") tidak dipasang — minta jam pasti.
