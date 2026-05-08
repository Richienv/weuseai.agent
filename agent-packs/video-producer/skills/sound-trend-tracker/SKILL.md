# sound-trend-tracker — Hermes skill

Bundle: video-producer (v2)
Tier: pro+
Handler: `hermes-skill:sound-trend-tracker`

## Kapan dipakai

- "sound apa yang lagi naik"
- "trending audio TikTok"
- "Reels sound recommendation"
- "kapan adopt sound X"
- "trend stage sound"

## Yang harus diekstrak

| Field | Wajib | Notes |
|---|---|---|
| `niche` | ya | "fintech / fintok", "fashion", "kuliner Jakarta", "IT / tech", dll. |
| `platform` | tidak | tiktok \| reels \| shorts. Default tiktok. |
| `mode` | tidak | enum: surface-trends (default) \| evaluate-specific (user provide sound name) |

## Yang dilakukan

**Penting:** aku **bukan** scraper. Aku surface info yang customer bisa **verifikasi sendiri** di Trending tab platform mereka. Output framing adalah recommendation + decision criteria, bukan real-time chart.

Load `templates/sound-trend-stages.md` untuk reference framing.

### surface-trends mode
1. Per niche, surface 5-7 sound categories (mood: upbeat-acoustic, dark-comedy, satire-news, dll.) yang historically populer di niche tsb.
2. Tag per category dengan **trend stage** placeholder (emerging / peak / decay) berdasarkan customer's own observation. Encourage customer cek Trending tab platform.
3. Decision criteria: **adopt early** kalau sound match brand voice + niche relevant, **skip late** kalau sudah saturated 3+ minggu.

### evaluate-specific mode
Customer kasih sound name + observation ("sound 'oh-no-oh-no' lagi rame"). Frame:
- Likely stage based on user observation
- Fit-check vs niche + brand voice
- Risk: timing window (early-peak vs late-peak)

## Output format

Persona-voice wrapper:

> "Trend stage di niche **fintok** (per observasi minggu ini di Trending tab kamu):
>
> | Sound mood | Trend stage | Adopt? |
> |---|---|---|
> | Anxious-comedic ('me trying to manage budget') | emerging-peak | **Yes** — ride sekarang, 7 hari window |
> | Dark-funny remix | peak | **Maybe** — fit fintok kalau script self-deprecating |
> | Inspirational-bossbabe | decay | **Skip** — saturated, brand-mismatch |
> | Native acoustic Indonesia | evergreen | **Yes** — slow burn, low risk |
>
> Aku surface kategori; for actual sound name, cek Trending tab kamu hari ini — sound spesifik shift cepat. Mau aku draft script yang fit ke salah satu mood?"

## Decline

- **Real-time view count claims.** Aku ngga scrape.
- **Predict viral guarantee.** Trend stage = direction signal, bukan crystal ball.
- **Bypass copyright.** Sound trending tetap subject to platform's commercial use rules — aku flag kalau brand business account.

## Failure handling

- Niche too vague → tanya 1-2 follow-up ("Niche kamu lebih specific apa? B2B fintech, atau personal finance gen-z?").
