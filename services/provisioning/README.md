# Provisioning service

Service yang dipanggil oleh Xendit webhook setelah pelanggan bayar. Tugas utama: spawn VPS pelanggan baru, install Hermes container, notify pelanggan.

## Run

```bash
npm install
npm run dev    # localhost:8080
```

## Endpoints

### `POST /spin-up`

Header: `Authorization: Bearer ${PROVISIONING_AUTH_TOKEN}`

Body:
```json
{
  "customerId": "uuid",
  "tier": "starter" | "pro",
  "telegramChatId": "string (optional, sent after onboarding)"
}
```

Response: `200 { vpsId, ip, status: "provisioning" }`

Behind the scenes:
1. Map tier → IDCloudHost spec (vcpu, ram, disk)
2. Generate cloud-init dengan Docker install + Hermes pull
3. Call IDCloudHost API → create VM
4. Save ke Supabase `vps_instances` (status: provisioning)
5. Background poll: tunggu VM `running` → tunggu Hermes `/health` → update status `running`
6. Kirim Telegram notif ke pelanggan (kalau chatId ada)

### `POST /tear-down`

Hapus VPS pelanggan. Dipanggil saat subscription cancel.

### `GET /status?customerId=uuid`

Cek status VPS pelanggan.

## Flow integration

```
[Xendit webhook] → [Supabase Edge Function] → POST /spin-up → [provisioning service]
                                                                       ↓
                                                              [IDCloudHost API]
                                                                       ↓
                                                                 [VPS pelanggan]
                                                                       ↓
                                                          [Hermes container hidup]
                                                                       ↓
                                                              [Notif Telegram]
```

## Catatan

- Service ini jalan di Mac Mini kamu (atau later, Railway/Fly.io)
- Idempotent: kalau dipanggil dua kali untuk customer sama, nggak duplicate VPS
- Auto-retry sekali kalau provisioning gagal di tengah jalan
- Error → notif Richie via Telegram + log ke Supabase
