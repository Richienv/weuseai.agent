# engagement-log-tracker — Hermes skill

Bundle: social-conductor (v2)
Tier: pro+
Handler: `hermes-skill:engagement-log-tracker`

## Kapan dipakai

- "log comment ini"
- "draft balas DM"
- "engagement queue hari ini"
- "ada yang perlu dibalas?"
- "track mention"

## Yang harus diekstrak

| Field | Wajib | Notes |
|---|---|---|
| `mode` | ya | enum: log-new \| draft-reply \| daily-digest \| mark-replied |
| `entry` | ya untuk log-new | { platform, type, source_handle, content, priority? } |
| `entry_id` | ya untuk draft-reply / mark-replied | DB row reference |

## Yang dilakukan

Load `templates/engagement-schema.md` + `templates/reply-pattern-library.md`.

DB shape (`/var/lib/weuseai/customer-grown/engagement-log.sqlite`):
```
id, customer_id, platform, type (comment/dm/mention/reply),
source_handle, content, priority (high/normal/low),
status (pending/replied/escalated/skipped),
draft_reply, replied_at, escalation_reason,
logged_at
```

### log-new mode
1. Customer drop entry (paste comment text + platform + handle).
2. Auto-classify priority:
   - **high**: complaint, sensitive question, customer business inquiry, >100 followers handle
   - **normal**: standard appreciation, casual question, peer interaction
   - **low**: emoji-only, generic spam-y, repeat duplicate
3. Insert ke DB, status `pending`.

### draft-reply mode
1. Load entry, classify response type via `reply-pattern-library.md`:
   - Appreciative (terima kasih response)
   - Clarifying (need-more-info)
   - Redirect-to-DM (sensitive / private follow-up)
   - Escalation flag (complaint, political, sensitive)
2. Generate draft sesuai voice-locker profile + reply pattern.
3. Update DB row dengan `draft_reply`. Status tetap `pending` sampai customer mark replied.

### daily-digest mode
Surface pending entries, sorted by priority + age:
- Show top 10 pending
- Flag yang >24h pending dengan high priority
- Suggest batch processing approach

### mark-replied mode
Customer paste replied screenshot atau confirms manually → status updated, `replied_at` set.

## Output

Persona-voice wrapper untuk daily-digest:

> "Engagement queue hari ini:
>
> **High priority (3):**
> - [DM] @customer_kecil — pertanyaan tentang harga produk + cara order. Pending 18 jam. Draft: appreciative + redirect-to-DM with detail.
> - [Comment IG] @creator_X — request kolaborasi. Pending 6 jam. Draft: appreciative + clarifying (apa scope kolaborasi yang dia bayangkan).
> - [Mention X] @journalist_Y — quote dari post lama, no question. Pending 2 jam. Draft: appreciative-soft.
>
> **Normal (12):**
> - 7 appreciation comment, 3 clarifying question, 2 emoji-react.
>
> **Low (5):**
> - emoji / generic. Suggest skip atau react-only.
>
> Mau aku surface 3 high priority drafts buat kamu approve manual? Atau batch normal dulu?"

## Fetch template

Sebelum draft reply, panggil `bundle-fetch` dengan `agent_slug` `social-conductor` dan filter `kind` ke `schema-spec`, `reference`, atau `response`. Kalau template registry punya entry yang cocok (mis. `engagement-schema.md` untuk DB shape log, `reply-pattern-library.md` untuk pattern appreciative / clarifying / redirect-to-DM / escalation, `engagement-response.md` untuk 5 tone variant helpful / curious / playful / firm / redirect-to-DM), pakai itu sebagai starting frame. Kalau registry tidak punya match untuk tone atau pattern tertentu, log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus draft dari nol.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Decline

- **Auto-send reply.** Tidak. Kamu copy-paste manual ke platform.
- **Engage troll / political tanpa explicit approval.** Default escalate, ngga draft.
- **Draft response yang violate platform community guidelines.** Aku flag, suggest alternatif.

## Failure handling

- Voice profile not locked → output minimal-template reply + flag ke voice-locker.
- Entry malformed → ask customer to re-paste with platform + handle context.
