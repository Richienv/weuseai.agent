# hashtag-research — Hermes skill

Bundle: video-producer (v2)
Tier: pro+
Handler: `hermes-skill:hashtag-research`

## Kapan dipakai

- "hashtag mix untuk topic X"
- "tag apa yang fit"
- "research hashtag fintok"
- "branded hashtag aku apa"

## Yang harus diekstrak

| Field | Wajib | Notes |
|---|---|---|
| `topic` | ya | Content topic (e.g. "tips budgeting gen-z") |
| `niche` | ya | Vertical: fintok, fashion, kuliner, dll. |
| `platform` | tidak | tiktok \| reels \| shorts. Default tiktok. |
| `goal` | tidak | enum: reach (default) \| engagement \| brand-build |
| `branded_tag` | tidak | Customer's own hashtag (mis. `#weuseai`) untuk brand-build mode |

## Yang dilakukan

Load `templates/hashtag-mix-strategy.md` untuk default strategy.

Default mix (30/50/20):
- **30% emerging** — volume rendah (1k-100k posts), upside tinggi. Easier to rank.
- **50% peak / niche** — volume menengah (100k-5M posts), strong fit niche.
- **20% branded / spesifik** — own brand tag + super-niche tags untuk algorithmic discovery.

Goal-specific tweak:
- `reach` → 40/40/20 (lean lebih ke peak)
- `engagement` → 20/60/20 (niche dominate, comments lebih qualified)
- `brand-build` → 20/30/50 (branded heavy, build hashtag equity)

Output: 8-12 hashtags total, tagged dengan stage label.

## Output format

> "Mix hashtag untuk topic '**tips budgeting gen-z**' di niche fintok (goal: reach):
>
> **Emerging (30%):**
> - `#fintokid` — 8k posts, growing
> - `#duitmuda` — 12k posts, fresh angle
>
> **Peak / niche (50%):**
> - `#fintok` — 1.2M posts, core niche
> - `#keuanganId` — 800k posts, established
> - `#millennialmoney` — 600k posts, audience overlap
> - `#tipskeuangan` — 450k posts, high search intent
>
> **Branded / spesifik (20%):**
> - `#budgetGenZ` — 50k posts, ultra-niche
> - `#duitwajibtau` — 15k posts, conversational
>
> Volume estimate based on customer's own platform check (data cepat berubah). Mau aku draft caption yang inject tags ini natural?"

## Fetch template

Sebelum susun mix hashtag, panggil `bundle-fetch` dengan `agent_slug` `video-producer` dan filter `kind` ke `reference`. Kalau template registry punya entry yang cocok (mis. `hashtag-mix-strategy.md` untuk default 30/50/20 rule emerging/peak/branded + context-specific variants per goal reach/engagement/brand-build), pakai itu sebagai starting frame. Kalau registry tidak punya match untuk niche atau goal tertentu, log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus compose dari nol.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Decline

- **Real-time exact volume.** Aku surface order-of-magnitude estimate; customer verifikasi di platform sendiri.
- **Hashtag yang misleading / spam.** Tag-stuffing strategy aku tolak.
- **Platform-banned tags.** Kalau tag flagged risky (mis. wellness gray-area), aku flag jangan pakai.

## Failure handling

- Niche unclear → tanya specific vertical sebelum surface mix.
- Branded_tag belum ada → suggest naming pattern (short, brandable, ngga conflict dengan existing tags besar).
