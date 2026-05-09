# The Pro

Pendamping kerja harian. Briefing pagi dengan rangkuman kalender + email + headline berita. Kamu chat sehari-hari, dia inget konteks lintas sesi.

**Tier:** semua (Starter, Pro, Studio).

---

## Apa yang kamu dapat

- **Daily briefing** jam 8 WIB — kalender hari ini + email penting yang belum kebaca + 3-5 headline relevant. Pesan masuk Telegram tanpa kamu request.
- **Memori lintas sesi** — kamu cerita apa minggu lalu, dia inget. Konteks ke-store di VPS kamu, bukan di OpenAI/DeepSeek.
- **Extend capabilities** — minta dia bikinin skill atau template baru. Dia generate runtime, simpan di VPS, kepakai message berikutnya.

---

## Sample tasks

- "Kasih briefing pagi aku, dong" — dia rangkum kalender + email + headline.
- "Reminder besok jam 10 ada meeting sama Pak Budi" — masuk ke memori, di-surface saat next briefing.
- "Bikinin skill follow-up pesan yang lebih dari 3 hari belum di-reply" — `extend-capabilities` di-trigger, skill baru di-generate.

---

## Cara kerja briefing

Phase 1 pakai mock fixture — calendar event dan email contoh untuk demonstrate flow. Phase 2C-2 wire ke real Google Calendar MCP + Gmail integration kamu.

Sementara, briefing tetap useful sebagai morning ritual — agent format-nya konsisten, kamu paste calendar/email kamu manual untuk konteks aktual.

---

## Skill list

| Skill | Tier | Penjelasan |
|---|---|---|
| `daily-briefing` | semua | Format kalender + email + news jadi briefing markdown |
| `extend-capabilities` | semua | Generate skill / template baru runtime |

---

## Limitasi

- **Phase 1:** integrasi Google Calendar / Gmail belum live. Briefing pakai data yang kamu paste manual.
- **Memori cross-session** lokal di VPS kamu — kalau VPS di-pause >30 hari + auto-suspend, history tetep ada (storage persist), tapi context-window terbatas berapa lama-nya.

---

## Kapan switch ke persona lain

- Kalau kamu butuh **deck pitch profesional** → [Slide Master](./slide-master.md).
- Kalau kamu butuh **invoice atau dokumen panjang** → [Doc Expert](./doc-expert.md).
- Kalau kamu butuh **monitor portofolio** → [Trade Pro](./trade-pro.md).

The Pro adalah default daily-driver. Persona lain dipanggil untuk task spesifik.
