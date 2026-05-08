# Voice Fit Rubric

> Scoring framework yang dipakai `voice-consistency-checker`. 7 dimensi, 0-3 per dimensi, total 0-21.

---

## Scoring scale (per dimension)

| Score | Meaning |
|---|---|
| 3 | Perfect match — indistinguishable from locked profile |
| 2 | Good match — small drift, generally consistent |
| 1 | Partial match — recognizable shift, signals to fix |
| 0 | Mismatch — feels off-brand, requires re-draft |

---

## Dimension 1: Register

**Profile signal:** `register` field (e.g., "calm-edukasi").

**Score signals:**
- 3: Tone matches throughout. No formal-casual oscillation.
- 2: Mostly matches; 1 sentence drifts (e.g., one corporate-formal phrase in calm-edukasi profile).
- 1: 2-3 sentences off-register.
- 0: Wholesale mismatch (playful draft from premium-formal profile).

**Common drift signals:**
- "Excited to announce!" in calm profile (too marketing-energy)
- "Hari ini gua mau bahas..." in formal profile (slang shift)
- "Apakah Anda pernah..." in kamu-profile (form shift)

---

## Dimension 2: Sentence length

**Profile signal:** `sentence_length.bracket` (short / medium / long) + `avg_words`.

**Score signals:**
- 3: Sentence avg within ±2 words of profile.
- 2: Avg within ±4 words.
- 1: Avg drift ≥5 words; 1-2 outlier sentences (e.g., 35-word sentence in 14-word profile).
- 0: Wholesale shift (short profile → long flowing).

---

## Dimension 3: Banned words

**Profile signal:** `banned_words` array (CLAUDE.md global + brand-specific).

**Score signals:**
- 3: Zero banned words.
- 2: 1 banned word, but appears non-critical (e.g., quoted from external source).
- 1: 2 banned words.
- 0: 3+ banned words OR critical banned words (revolutionary, 10x, game-changer).

**Auto-flag dengan word + position dalam draft.**

---

## Dimension 4: Signature phrases

**Profile signal:** `signature_phrases` array.

**Score signals:**
- 3: ≥1 signature phrase used naturally.
- 2: 0 signature phrases, but draft is short (<3 sentences) where 1 wouldn't fit.
- 1: 0 signature phrases in 3+ sentence draft (missed opportunity).
- 0: Used a signature phrase incorrectly (wrong context).

---

## Dimension 5: Emoji

**Profile signal:** `emoji_policy.max_per_post`, `preferred_set`, `placement`.

**Score signals:**
- 3: Count + placement + set match.
- 2: Count match, placement slight shift, set OK.
- 1: Count exceeds max by 1, OR uses non-preferred emoji.
- 0: Count exceeds by 2+, OR all-emoji-stuffed.

---

## Dimension 6: Punctuation

**Profile signal:** `punctuation.exclamation_count_per_post`, em-dash freq.

**Score signals:**
- 3: Exclamation count matches; em-dash usage feels natural.
- 2: 1 unintended exclamation.
- 1: 2 unintended exclamations OR em-dash overused.
- 0: Wholesale punctuation shift (e.g., zero-exclamation profile getting 4 exclamations).

---

## Dimension 7: Address form

**Profile signal:** `address_form` ("kamu" / "Anda" / "lo" / "mix").

**Score signals:**
- 3: Consistent throughout draft.
- 2: 1 instance of mixed form (e.g., 4x kamu, 1x Anda).
- 1: 2-3 instances of mix.
- 0: Wholesale wrong form (entire draft in Anda when profile is kamu).

---

## Aggregate scoring

| Total | Fit Label |
|---|---|
| 18-21 | **high** — ship as-is |
| 14-17 | **medium** — flag specific dimensions, suggest tweaks |
| 0-13 | **low** — re-draft from scratch suggested |

---

## Output format (skill-side)

```json
{
  "overall_fit": "high | medium | low",
  "total_score": 17,
  "max_score": 21,
  "dimensions": [
    { "name": "Register", "score": 3, "max": 3, "note": "Calm-edukasi match" },
    { "name": "Sentence length", "score": 2, "max": 3, "note": "Sentence #3 32 kata, profile avg 14" },
    { "name": "Banned words", "score": 3, "max": 3, "note": "Clean" },
    { "name": "Signature phrases", "score": 1, "max": 3, "note": "Missing 'kasih tahu' / 'coba dulu' / 'save buat'" },
    { "name": "Emoji", "score": 2, "max": 3, "note": "2 emoji, profile max 1" },
    { "name": "Punctuation", "score": 2, "max": 3, "note": "1 exclamation, profile zero" },
    { "name": "Address form", "score": 4, "max": 3, "note": "Mix kamu+Anda" }
  ],
  "tweak_suggestions": [
    "Split sentence #3 ke dua kalimat 14-18 kata",
    "Ganti 1 emoji dari 2",
    "Ganti exclamation di akhir body jadi titik",
    "Ganti 'Anda' ke 'kamu' di sentence #5",
    "Tambahkan 'save buat reminder' di CTA"
  ]
}
```

---

## Drift detection (weekly)

Aggregate fit scores across last 30 days:
- Average per dimension
- Flag drift if dimension avg drops ≥1.5 points vs prior 30-day window
- Suggest re-lock voice profile if 3+ dimensions drift simultaneously
