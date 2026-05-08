# voice-consistency-checker — Hermes skill

Bundle: social-conductor (v2)
Tier: pro+
Handler: `hermes-skill:voice-consistency-checker`

## Kapan dipakai

- "fit-check draft ini"
- "voice ini cocok ngga"
- "score draft"
- "drift detected"
- "review weekly voice consistency"

## Yang harus diekstrak

| Field | Wajib | Notes |
|---|---|---|
| `mode` | ya | enum: score-draft \| weekly-drift-check |
| `draft_text` | ya untuk score-draft | Text yang mau di-score |
| `dimensions_to_focus` | tidak | Optional override (default: all dimensions) |

## Yang dilakukan

Load `templates/voice-fit-rubric.md` + voice profile customer dari voice-locker.

### score-draft mode
Per dimension, score 0-3 (mismatch / partial / good / perfect):

| Dimension | Signal yang dicek |
|---|---|
| Register | Match formal/kasual/playful/edukasi level? |
| Sentence length | Avg words per sentence di-bracket profile? |
| Banned words | Ada banned words global / brand? |
| Signature phrases | Ada minimal 1 signature phrase (kalau profile contain)? |
| Emoji | Count + placement match policy? |
| Punctuation | Exclamation count match? em-dash usage match? |
| Address form | kamu / Anda / lo consistent? |

Aggregate:
- Total ≥ 18/21 = **high** fit
- Total 14-17/21 = **medium** fit + suggest tweak per dimension yang lemah
- Total <14/21 = **low** fit + suggest re-draft

### weekly-drift-check mode
Pull last 30 days output dari engagement-log + post-drafter history. Score average per dimension. Surface drift kalau ada dimension dengan score drop ≥1.5 vs previous month.

## Output

Persona-voice wrapper untuk score-draft:

> "Voice-fit: **medium** (15/21).
>
> | Dimension | Score | Note |
> |---|---|---|
> | Register | 3/3 | Calm-edukasi match |
> | Sentence length | 2/3 | Sentence #3 panjang banget (32 kata), profile avg 14 |
> | Banned words | 3/3 | Clean |
> | Signature phrases | 1/3 | Ngga ada 'kasih tahu' / 'coba dulu' / 'save buat' |
> | Emoji | 2/3 | 2 emoji, profile policy max 1 per post |
> | Punctuation | 2/3 | 1 exclamation di body, profile zero |
> | Address form | 2/3 | Mix 'kamu' (3x) + 'Anda' (1x) |
>
> Tweak suggestion:
> 1. Split sentence #3 ke dua kalimat 14-18 kata.
> 2. Ganti emoji 1 dari 2.
> 3. Ganti exclamation di akhir body jadi titik.
> 4. Ganti 'Anda' ke 'kamu'.
> 5. Tambahkan 1 signature phrase di CTA ('save buat reminder').
>
> Mau aku iterate?"

## Decline

- **Score draft yang ngga punya voice profile lock.** Output: outline-only review, suggest run voice-locker dulu.
- **Score for someone else's content.** Voice profile = customer's own; ngga apply ke konten orang lain.

## Failure handling

- Voice profile missing → return error + redirect ke voice-locker.
- Draft empty / <10 char → return error + ask resubmit.
