# TikTok / Reels / Shorts Script JSON Format

> Schema spec untuk Hermes saat generate script via `tiktok-script-builder`. Output JSON STRICT — handler validate per regex.

---

## Schema

```json
{
  "hook": "string (3-200 char) — first 3 seconds, read-aloud-fast",
  "body": "string (10-800 char) — main content, BI casual",
  "cta": "string (3-100 char) — last 3-5s call to action",
  "visual_scenes": [
    { "timestamp": "mm:ss", "description": "string (5-200 char)" }
  ],
  "sound_suggestion": "string (3-100 char) — sound name + trend stage",
  "hashtags": ["#tag1", "#tag2", "..."]
}
```

---

## Field rules

### `hook`
- 3-200 chars
- Pattern: question, stat, counterintuitive, POV, or reveal
- Avoid generic openers ("Hi guys", "Welcome back")

### `body`
- 10-800 chars
- BI casual register
- Banned words: basically, just, literally, honestly, kind of, pretty much, revolutionary, disrupt, 10x, game-changer, next-level
- Max 1 exclamation mark, only if natural

### `cta`
- 3-100 chars
- Action concrete (save, comment, share, follow with reason, link with reason)
- Avoid "follow us / link in bio" generic without context

### `visual_scenes`
- Array, 1-12 scenes
- `timestamp` regex: `^[0-9]{1,2}:[0-9]{2}$`
- Cumulative timestamps must align with video length
- `description` 5-200 chars, fit-for-shoot (camera angle, action, props hints)

### `sound_suggestion`
- Format: `<sound description> (<trend_stage>)` — e.g. "Anxious-comedic budget mood (peak, week 2)"
- Don't claim exact view counts

### `hashtags`
- 3-10 entries
- Each pattern: `^#[a-zA-Z0-9_]+$` (no spaces, special chars, emoji)
- Max 30 chars per tag
- Mix per `hashtag-research` strategy (30/50/20 default)

---

## Validation handler responses

| HTTP | Body | Action |
|---|---|---|
| 200 | `{ format: 'json', script: <validated> }` | Format ke customer dengan persona voice |
| 400 | `{ error: 'schema_validation_failed', details: [...] }` | Retry generation 1× dengan stricter prompt |
| 500 | `{ error: 'internal' }` | Customer-facing apology + log run_id |

---

## Example output

```json
{
  "hook": "Pernah cek saldo, langsung kaget?",
  "body": "Coba 50/30/20 rule. Setengah gaji buat kebutuhan pokok, 30% keinginan, 20% tabungan. Misal gaji 5 juta, jadi 2.5 juta kebutuhan, 1.5 juta keinginan, 1 juta tabungan.",
  "cta": "Save video ini buat reminder pas gajian.",
  "visual_scenes": [
    { "timestamp": "0:00", "description": "POV cek saldo HP, ekspresi kaget" },
    { "timestamp": "0:03", "description": "Cut to overlay text 50/30/20 rule" },
    { "timestamp": "0:18", "description": "Demo split di kalkulator" },
    { "timestamp": "0:25", "description": "Direct-to-camera CTA dengan teks 'save'" }
  ],
  "sound_suggestion": "Reflective acoustic Indonesia (evergreen)",
  "hashtags": ["#fintok", "#budgeting", "#keuanganId", "#millennialmoney"]
}
```
