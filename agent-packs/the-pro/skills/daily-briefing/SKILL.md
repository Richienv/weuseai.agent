# daily-briefing — Hermes skill

Bundle: the-pro
Tier: starter
Handler: `edge-fn:daily-briefing-handler` (composes structured markdown from calendar + email + news fixtures)

## Kapan dipakai

Customer minta briefing pagi atau ringkasan harian. Trigger phrases:

- "briefing pagi"
- "kasih ringkasan hari ini"
- "summary hari ini"
- "apa yang penting hari ini"
- "rangkum kalender pagi ini"
- "executive summary harian"
- "recap hari ini"
- "what's on my plate today"

Juga: cron-triggered tiap pagi jam 7 WIB via Hermes scheduler (kalau customer enable).

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `date` | string YYYY-MM-DD | tidak | Default: today (Asia/Jakarta) |
| `sources` | array | tidak | Default: `["calendar", "email", "news"]`. Customer bisa narrow ke satu/dua sumber. |

Kalau customer bilang "rangkum email aja", set `sources: ["email"]`.

## Yang dilakukan

1. Apply defaults (date=today WIB, sources=all).
2. POST ke workflow-execute Edge Function:

   ```
   POST $WEUSEAI_WORKFLOW_EXECUTE_URL
   Body: {
     "customer_id": "$WEUSEAI_CUSTOMER_ID",
     "workflow_id": "<resolved from local manifest by slug>",
     "parameters": {
       "date": "2026-05-08",
       "sources": ["calendar", "email", "news"]
     }
   }
   ```

3. Server returns: `{ run_id, status, output: { format: 'markdown', text, date, sources_loaded, warnings } }`.
4. Wrap the markdown body dengan persona voice di awalnya:
   - Kalau briefing pagi (≤09:00 WIB): "Pagi, [first_name]. Berikut briefing hari ini:"
   - Kalau briefing siang/sore: "Update siang ini, [first_name]:"
5. Append `output.text` apa adanya — jangan re-format markdown yang sudah deterministic.
6. Kalau `output.warnings.length > 0`, sebut singkat di akhir: "Note: calendar/email connector belum terhubung — bisa kita setup nanti."

## Contoh interaksi

**Customer (07:02 WIB):** "Briefing pagi dong"

**Kamu (The Pro):**

Pagi, Jason. Berikut briefing hari ini:

# Briefing pagi — Jumat, 8 Mei 2026

## Kalender

- **09:00–09:15** — Standup mingguan · Zoom (2 attendees)
- **11:00–11:30** — 1:1 dengan Sarah · Office (1 attendee)
- **12:30–13:30** — Lunch — Mama · Senayan
- **14:00–15:00** — Customer call — PT Maju · Google Meet (2 attendees)
- **16:00–17:00** — Product review Q2 · Zoom (2 attendees)

## Email

### Penting (3)
- **Re: Proposal Q2 — pertanyaan tentang scope** — anto@ptmaju.example
  Halo, terima kasih proposalnya...
- **Q2 review tomorrow — agenda update** — sarah@weuseai.example
  Bisa pindah ke jam 2 siang?...
- **Invoice payment received — terima kasih** — billing@idcloudhost.example
  Pembayaran invoice INV-26-04 sebesar Rp 1.450.000 telah kami terima.

### Follow-up (2)
- **Re: Pricing partnership — follow up Selasa?** — andre@weuseai.example
  Sip, mari ketemu Selasa minggu depan...
- **Re: Term sheet review — pertanyaan klarifikasi** — marcus@law-firm.example
  Tolong info ketersediaan kamu...

### Noise (5)
Newsletter, promo, otomatis. Aman dilewati.

## Berita

Tidak ada headline baru pagi ini.

---

Hari ini cukup padat — 5 meeting, total ~3 jam. Ada 2 follow-up yang butuh respons minggu ini.

## Hard limits

- Tidak open atau reply email atas nama customer tanpa approval per-pesan
- Tidak share detail meeting/email ke pihak luar kalau ditanya orang lain
- Calendar + email source sekarang masih mock fixture (Phase 2C-2 wires real Gmail/Calendar MCP). Briefing tetap accurate tapi data fixed.
