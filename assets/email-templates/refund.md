# refund

<!-- Variables
{{display_name}}        — string — customer's name from onboarding form
{{invoice_id}}          — string — Xendit invoice id used for the original charge
{{refund_amount_idr}}   — string — pre-formatted IDR string, e.g. "Rp 399.000"
{{refund_method}}       — string — payment method label, e.g. "QRIS", "kartu kredit", "transfer bank"
{{eta_business_days}}   — number — expected business days until funds arrive (typically 3-14)
-->

**Subject:** Pengembalian dana sudah kami proses — {{invoice_id}}

---

Halo {{display_name}},

Permintaan pengembalian dana kamu sudah kami proses hari ini. Dana sebesar {{refund_amount_idr}} akan dikembalikan lewat {{refund_method}}, jalur yang sama dengan pembayaran awal.

**Estimasi waktu**

Sekitar {{eta_business_days}} hari kerja sampai dana masuk ke akun kamu, tergantung bank atau e-wallet. Kalau lewat 14 hari kerja belum masuk, balas email ini dan kami bantu cek dengan Xendit.

**Yang terjadi dengan agent kamu**

Server kamu sudah dihentikan dan data agent dihapus sesuai kebijakan privasi kami. Detail prosedur ada di https://weuseai-agent.vercel.app/refund-policy.

**Kalau berubah pikiran**

Kamu selalu boleh kembali. Kalau suatu saat mau coba lagi, kabari kami dan kami siapkan setup baru tanpa biaya pendaftaran ulang.

—
Tim weuseai.agent
Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.
