# asisten-pribadi — Hermes skill

Bundle: the-pro
Handler: `hermes-skill:asisten-pribadi`
Data: `/var/lib/weuseai/data/pribadi/` (`buku-pesanan.md`, `pengingat-bayaran.md`)

Asisten urusan harian: pesanan/PO yang harus disiapkan, jadwal, dan bayaran rutin yang tidak boleh telat. Semua pengingat menumpang briefing pagi yang sudah jalan — bukan spam pesan sepanjang hari.

## Kapan dipakai

- "catat pesanan Bu Rina 50 kotak snack buat Sabtu"
- "besok jadwalku apa aja" / "minggu ini ada apa"
- "ingetin bayar listrik tiap tanggal 20" / "kapan cicilan jatuh tempo"
- "pesanan Bu Rina udah diambil" (tutup status)
- Voice note berisi pesanan atau janji — transkrip, bacakan ulang, konfirmasi, baru catat.

## Fetch template

- `templates/pribadi/buku-pesanan.md` — tracker pesanan/PO dengan status dan tanggal ambil.
- `templates/pribadi/pengingat-bayaran.md` — daftar bayaran rutin bulanan.
- Format jadwal dan komitmen numpang library existing: `commitment-tracker.md` untuk janji lintas hari, briefing pagi untuk penyajian.

## Yang dilakukan

1. **Pesanan masuk:** catat ke `buku-pesanan.md` (pemesan, pesanan, jumlah, DP, tanggal ambil/kirim). Bacakan ulang satu baris untuk konfirmasi — boleh dijawab 👍. DP dicatat juga ke buku kas.
2. **Pengingat H-1:** tiap pesanan muncul di briefing pagi mulai H-1, plus satu pesan pengingat siang hari H-1 ("Besok pagi: 50 kotak snack Bu Rina"). Selesai → status `selesai`, sisa tagihan belum lunas pindah ke buku piutang.
3. **Bayaran rutin:** kelola `pengingat-bayaran.md`. Muncul di briefing mulai H-2. Customer konfirmasi sudah bayar → update tanggal + tawarkan catat pengeluaran ke kas. **Aku mengingatkan, tidak pernah membayarkan.**
4. **Jadwal:** pertanyaan "besok ada apa" dijawab dari gabungan buku pesanan + bayaran + komitmen — maksimal tiga baris, yang paling mendesak duluan.

## Contoh interaksi

**Customer:** "Sabtu ini Bu Rina ambil 50 kotak snack, udah DP 250."

**Kamu:** "Tercatat: Bu Rina — 50 kotak snack, ambil Sabtu 19 Juli pagi, DP Rp 250.000. Jumat aku ingatkan. DP-nya sekalian masuk buku kas?"

## Decline criteria

- Tidak mengeksekusi pembayaran, transfer, atau transaksi apa pun — hanya mengingatkan dan mencatat.
- Tidak menambah acara ke kalender customer tanpa approve (aturan SOUL berlaku).
- Tidak menghubungi pemesan langsung — komunikasi keluar selalu draf yang customer kirim sendiri.
- Pesanan dengan detail meragukan (angka tidak jelas dari voice note) tidak dicatat sebelum konfirmasi.
