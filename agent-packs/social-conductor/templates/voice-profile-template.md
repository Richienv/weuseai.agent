# Voice Profile Schema

> Output schema dari `voice-locker`. JSON file persisted di `/var/lib/weuseai/customer-grown/voice-profiles/{customer_id}.json`.

---

## Schema

```json
{
  "version": "voice/1.0",
  "customer_id": "string",
  "locked_at": "ISO 8601 timestamp",
  "sample_count": 23,
  "register": "calm-edukasi | playful-conversational | premium-formal | educational-formal | brand-build",
  "sentence_length": {
    "avg_words": 14,
    "stddev": 4,
    "bracket": "short | medium | long"
  },
  "banned_words": ["just", "literally", "basically", "..."],
  "signature_phrases": ["kasih tahu", "coba dulu", "save buat"],
  "emoji_policy": {
    "max_per_post": 1,
    "preferred_set": ["💡", "😉", "📌"],
    "placement": "end | inline | start"
  },
  "punctuation": {
    "exclamation_count_per_post": 0,
    "em_dash_freq": "occasional | frequent | rare",
    "ellipsis_usage": "rare"
  },
  "address_form": "kamu | Anda | lo | mix",
  "structural_patterns": {
    "preferred_opener": "question | stat | reveal | counterintuitive",
    "preferred_closer": "save-cta | comment-cta | reflection",
    "paragraph_length": "1-2 sentences typical"
  },
  "test_drafts": [
    { "id": 1, "content": "...", "fit_validated": true },
    { "id": 2, "content": "...", "fit_validated": true }
  ]
}
```

---

## Field rules

### `register`
Pre-set list. Customer can have hybrid mode if 2 strong signals (e.g., `calm-edukasi-with-playful-undertone`), but encourage one primary register.

### `sentence_length.bracket`
- `short`: avg 8-12 words
- `medium`: avg 13-18 words
- `long`: avg 19-25 words

### `banned_words`
Always includes CLAUDE.md global banned: `basically, just, literally, honestly, kind of, pretty much, revolutionary, disrupt, 10x, game-changer, next-level`.
Plus brand-specific words customer doesn't use.

### `signature_phrases`
Min 3 entries detected from sample. Used as fingerprint for fit-check.

### `emoji_policy.max_per_post`
- `0`: zero-emoji brand (premium-formal usually)
- `1`: minimalist (calm-edukasi default)
- `2-3`: playful brand
- `4+`: rejected as inconsistent with calm-premium register guideline

### `address_form`
Strict consistency for `kamu` / `Anda` / `lo`. Mix flagged unless intentional.

---

## Validation rules (skill-side)

- `sample_count` ≥ 20 (lock-new mode)
- `register` ∈ enum
- `banned_words` includes CLAUDE.md global list as superset
- `address_form` not "lo" (banned by CLAUDE.md voice rules)
- `test_drafts` ≥ 5, all `fit_validated` to lock

---

## Re-lock trigger

Profile auto-flags re-lock kalau:
- Drift detected ≥3 dimension shift in weekly-drift-check
- Customer manually requests re-lock
- 90+ days elapsed since last lock (aging)
