# Alert Rule Schema

> Output schema dari `alert-watcher`. Satu rule per baris di `/var/lib/weuseai/customer-grown/alerts.jsonl` (append-only JSONL).

---

## Schema

```json
{
  "version": "alert/1.0",
  "rule_id": "string",
  "customer_id": "string",
  "created_at": "ISO 8601 timestamp",
  "ticker": "BBCA",
  "asset_class": "idx-stock | crypto",
  "condition": "price-above | price-below | volume-spike | news-trigger",
  "threshold": "10500",
  "expires_at": "ISO 8601 timestamp",
  "status": "active | triggered | cancelled | expired",
  "triggered_at": "ISO 8601 timestamp | null",
  "last_checked_at": "ISO 8601 timestamp"
}
```

---

## Field rules

### `ticker`
IDX ticker (BBCA, ASII, INDF) atau crypto pair (BTCUSDT, ETHUSDT). Validasi formatnya sebelum simpan.

### `condition`
- `price-above` / `price-below` — `threshold` angka harga.
- `volume-spike` — `threshold` multiplier vs rata-rata (mis. `"3x"`).
- `news-trigger` — `threshold` keyword atau topik berita.

### `threshold`
String — bisa angka harga, multiplier, atau keyword tergantung `condition`.

### `expires_at`
Default 30 hari dari `created_at` kalau customer tidak set.

### `status`
- `active` — sedang dipantau cron.
- `triggered` — threshold tercapai, alert sudah dikirim. Rule tidak fire lagi.
- `cancelled` — customer batalkan. Tidak dihapus — riwayat tetap disimpan.
- `expired` — lewat `expires_at` tanpa trigger.

---

## Aturan polling

- Cron 1-menit interval baca `alerts.jsonl`, cek tiap rule `status=active`.
- Begitu threshold tercapai: kirim Telegram one-liner, set `status=triggered` + `triggered_at`.
- Rule tidak pernah dihapus — cancel dan expire cuma ubah `status`, riwayat tetap utuh.
- Polling 1-menit bukan untuk kebutuhan sub-detik. Customer yang butuh latency rendah pakai alert native exchange.

---

## Catatan

`alert-watcher` fire alert, tidak execute trade. Setiap alert disertai pengingat bahwa keputusan beli / jual tetap di tangan customer.
