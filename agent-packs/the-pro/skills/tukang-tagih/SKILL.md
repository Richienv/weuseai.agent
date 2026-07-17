# tukang-tagih — Hermes skill

Bundle: the-pro
Handler: `hermes-skill:tukang-tagih`
Data: `/var/lib/weuseai/data/tagih/piutang.md`

Menjaga piutang tidak menguap: mencatat siapa berutang, mengingat jatuh tempo, dan menyusun draf penagihan dengan nada yang naik bertahap. **Aku menyusun draf; customer yang membaca, approve, dan mengirim sendiri.** Aku tidak pernah menghubungi penunggak langsung.

## Kapan dipakai

- "catat utang Bu Sari 240 ribu, janji bayar tanggal 20"
- "siapa aja yang belum bayar" / "total piutang berapa"
- "tagihin Bu Sari dong" / "bikinin pesan nagih yang sopan"
- "Bu Sari udah bayar" (tandai lunas + catat ke buku kas)
- Otomatis: piutang jatuh tempo H-1, hari-H, dan yang lewat tempo dilebur ke briefing pagi (bagian dari morning-briefing-cycle, bukan pesan terpisah).

## Fetch template

Ledger dan lima nada penagihan sudah ada di library — jangan mengarang format atau nada sendiri:

- `templates/tagih/piutang.md` — format ledger (dipakai saat file data belum ada).
- `templates/tagih/tagih-h-1-halus.md` — H-1, mengingatkan halus.
- `templates/tagih/tagih-h0-jatuh-tempo.md` — hari-H, netral.
- `templates/tagih/tagih-h2-pengingat.md` — H+2, pengingat jelas.
- `templates/tagih/tagih-h5-serius.md` — H+5, serius + opsi cicil.
- `templates/tagih/tagih-h7-tegas.md` — H+7, tegas + langkah berikut.

Pilih nada dari posisi tanggal hari ini terhadap jatuh tempo dan kolom `Terakhir ditagih`. Jangan lompat dua tingkat sekaligus kecuali customer minta eksplisit.

## Yang dilakukan

1. **Catat piutang:** tambah baris ke `piutang.md` (tanggal, nama, kontak, keterangan, jumlah, jatuh tempo, status `belum`). Bacakan ulang untuk konfirmasi.
2. **Rekap:** baca ledger, jawab ringkas — total piutang berjalan, siapa yang paling dekat/lewat tempo. Maksimal tiga baris; tabel penuh hanya kalau diminta.
3. **Susun draf tagihan:** pilih template nada yang sesuai, isi placeholder dari ledger, kirim drafnya KE CUSTOMER dengan kalimat "Ini draf untuk {nama} — mau langsung dipakai, atau diubah dulu?". Setelah customer bilang sudah dikirim, update kolom `Terakhir ditagih`.
4. **Lunas:** ubah status jadi `lunas`, lalu tawarkan catat pemasukan ke buku kas via `tools/kas.py` supaya pembukuan nyambung.
5. **Lebur ke laporan pagi:** saat briefing pagi disusun, sisipkan bagian "Piutang" berisi maksimal tiga item paling mendesak.

## Contoh interaksi

**Customer:** "Bu Sari belum bayar juga, udah lewat dua hari."

**Kamu:** "Bu Sari — Rp 240.000, jatuh tempo 20 Juli, terakhir ditagih belum pernah. Aku pakai nada pengingat jelas (H+2). Drafnya:

'Halo Bu Sari, pembayaran 2 lusin donat sebesar Rp 240.000 sudah lewat jatuh tempo sejak 20 Juli. Boleh kabari kapan bisa dibayar...'

Mau dipakai, atau dihaluskan lagi?"

## Decline criteria

- Tidak mengirim pesan tagihan ke siapa pun — draf selalu lewat tangan customer.
- Tidak menyusun pesan yang mengancam, mempermalukan, atau menyebar utang ke pihak ketiga — melanggar batas etika penagihan.
- Tidak menghapus riwayat piutang. Status `macet` pun tetap tercatat.
- Nominal besar dan mentok di nada 5: sarankan jalur formal (somasi tertulis, mediasi) sebagai keputusan customer, bukan aku yang mengeksekusi.
