# Hashtag Mix Strategy

> Default strategy yang dipakai `hashtag-research` skill. Stage-aware mix berdasarkan goal customer.

---

## Default mix: 30/50/20

| Layer | % | Volume range | Purpose |
|---|---|---|---|
| Emerging | 30% | 1k-100k posts | Easier ranking, upside |
| Peak / niche | 50% | 100k-5M posts | Strong fit, qualified audience |
| Branded / spesifik | 20% | <50k posts | Brand-build + algorithmic discovery |

---

## Goal-specific tweaks

### Reach-first (40/40/20)
Lean ke peak. Trade off: lebih saturated, harus hook lebih sharp.
```
40% emerging + 40% peak + 20% branded
```

### Engagement-first (20/60/20)
Niche dominate. Comments lebih qualified, fewer scrollers.
```
20% emerging + 60% peak/niche + 20% branded
```

### Brand-build (20/30/50)
Branded heavy. Build hashtag equity over time.
```
20% emerging + 30% peak + 50% branded/super-niche
```

### Cold-start (40/30/30)
New account, no brand equity yet. Lean emerging + branded ultra-niche.
```
40% emerging + 30% peak + 30% branded
```

---

## Hashtag count per platform

| Platform | Total hashtags | Notes |
|---|---|---|
| TikTok | 4-8 | Algorithm rewards relevance, not quantity |
| Reels | 5-10 | Slight upside from more tags, plateau at 10 |
| Shorts | 3-5 | Title + description weight more than tags |

---

## Indonesian-context hashtag guide

### Standard niche tags (Indonesia-flavored)
- Fintok: `#fintokid`, `#duitmuda`, `#keuanganId`, `#millennialmoney`
- Kuliner: `#kulinerJakarta`, `#wisatakuliner`, `#makananIndonesia`
- Fashion: `#fashionId`, `#ootdId`, `#stylekita`
- Tech: `#techId`, `#programmerId`, `#startupId`
- Edukasi: `#edukasi`, `#beasiswa`, `#mahasiswa`

### City-specific (high-engagement niche)
- `#Jakarta`, `#Bandung`, `#Yogyakarta`, `#Surabaya`, `#Bali`
- City + niche: `#kulinerBandung`, `#fashionJakarta` — qualified local audience

### Banned / spam-y patterns
- `#fyp #foryou #foryoupage` — algorithmic value debated; not banned but doesn't help relevance score
- `#viral #viralvideo` — over-used, neutral effect
- Tag-stuffing 20+ tags — diminishing returns + spam signal

---

## Branded hashtag building

Pattern recommendations:
- **Short** (≤12 char): easier to remember, type
- **Brandable**: own the tag (no existing 100k+ posts using it)
- **Conversational**: feels like words, not corporate slug
- **Search intent**: people might naturally type it

Examples (Indonesian style):
- `#weuseai` — short, brandable, search-friendly
- `#duitwajibtau` — conversational, niche-specific
- `#bareng[brand]` — community angle

Avoid:
- All-caps brand tag (looks shouty)
- Numbers (year-bound, dates poorly)
- Special chars (most platforms strip)

---

## Validation rules

Hashtag pattern: `^#[a-zA-Z0-9_]+$` (no spaces, no special chars, no emoji).

Skill rejects:
- Tags with banned platform-flagged terms
- Tags >30 chars (most platforms truncate)
- Mix that exceeds platform max (TikTok ~150 char total caption incl tags)
