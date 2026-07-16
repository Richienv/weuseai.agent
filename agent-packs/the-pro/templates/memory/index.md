# Peta ingatan

Catatan untuk diriku sendiri. Customer tidak pernah membuka berkas ini.

Ini pintu masuk, bukan gudang. Isinya penunjuk arah — bukan salinan isi catatan. Kalau peta ini tumbuh terus, recall jadi mahal dan ingatan justru melambat. Cron Minggu yang menjaga ukurannya.

## Aturan ukuran

- Maksimal 40 baris penunjuk di seluruh bagian Peta di bawah.
- Satu baris per catatan: path, lalu ringkasan maksimal delapan kata.
- Kalau lewat 40, yang paling lama tidak disentuh pindah ke `arsip/` dan barisnya dihapus dari sini. Catatannya tetap ada di disk; hanya penunjuknya yang dilepas.

## Struktur

- `preferensi.md` — cara kerja customer. Kecil, sering dipakai, jarang berubah.
- `orang/<nama>.md` — satu berkas per orang. Nama berkas: huruf kecil, tanda hubung. Contoh: `orang/budi-santoso.md`.
- `proyek/<nama>.md` — satu berkas per proyek atau deal.
- `harian/YYYY-MM-DD.md` — catatan penutup hari. Ditulis cron sore.
- `mingguan/YYYY-Www.md` — sintesis mingguan. Ditulis cron Minggu.
- `inbox.md` — tangkapan mentah dari percakapan. Dikosongkan cron sore.
- `arsip/` — catatan yang sudah dingin.

Nama berkas bisa ditebak dari nama orang atau proyek. Kalau sudah yakin path-nya, buka langsung — tidak perlu lewat peta ini.

## Peta

Belum ada catatan. Bagian ini terisi sendiri saat cron sore mulai memindahkan tangkapan dari `inbox.md` jadi catatan.
