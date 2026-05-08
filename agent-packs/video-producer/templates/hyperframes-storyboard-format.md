# HyperFrames Storyboard JSON Format

> Spec for the JSON output produced by `hyperframes-storyboard` skill. Input to off-platform render tools (Runway, Sora, Pika, CapCut Auto-Cut).

---

## Schema

```json
{
  "version": "hyperframes/1.0",
  "metadata": {
    "aspect_ratio": "9:16",
    "target_renderer": "runway",
    "total_duration_sec": 30,
    "style_direction": "cinematic"
  },
  "scenes": [
    {
      "scene_id": 1,
      "timestamp": "0:00-0:03",
      "visual_prompt": "string — descriptive prompt fit target_renderer's prompt language",
      "motion_hint": "string — slow zoom in / handheld pan-right / static medium shot",
      "duration_sec": 3.0,
      "audio_cue": "voiceover: '...' | sound effect: ... | music swells | silence",
      "transition_to_next": "cut | match-cut | whip-pan | dissolve | fade-out"
    }
  ]
}
```

---

## Field rules

### `version`
Locked to `hyperframes/1.0`. Future versions bump major when schema breaks.

### `metadata.aspect_ratio`
- `9:16` — vertical (TikTok, Reels, Shorts default)
- `16:9` — horizontal (YouTube standard)
- `1:1` — square (Instagram feed legacy)

### `metadata.target_renderer`
Affects how `visual_prompt` is phrased:
- `runway` — cinematographic vocab ("medium shot", "shallow depth of field", "natural light")
- `sora` — natural-language paragraph, longer prompts OK
- `pika` — concise, motion-forward
- `capcut` — focus on stock-style description (CapCut auto-matches)
- `generic` — neutral descriptive, works as fallback

### `metadata.total_duration_sec`
Sum of all `scenes[].duration_sec`. Should equal video target length (15/30/60/90).

### `scenes[].scene_id`
1-indexed. Sequential.

### `scenes[].timestamp`
Format `mm:ss-mm:ss`. Must align with cumulative duration.

### `scenes[].visual_prompt`
- 20-200 chars
- No copyright-protected character names ("Mickey Mouse", "Spider-Man")
- No real-person likeness without disclaimer
- Avoid platform-banned content (gore, sexual, hate)

### `scenes[].motion_hint`
Common values:
- `slow zoom in` / `slow zoom out`
- `handheld pan-left` / `handheld pan-right`
- `static medium shot` / `static wide shot`
- `dolly forward` / `dolly back`
- `crane up` / `crane down`
- `whip-pan transition`
- `parallax slide` (for stills)

### `scenes[].duration_sec`
Float, 0.5–10 typical range. Sub-second OK for cuts.

### `scenes[].audio_cue`
Format options:
- `voiceover: "..."` — line-level VO text
- `sound effect: ...` — SFX description
- `music swells` / `music drops` / `music silent`
- `silence` — intentional pause
- `ambient: ...` — natural ambience

### `scenes[].transition_to_next`
- `cut` — hard cut (default for fast-paced)
- `match-cut` — match action across scenes
- `whip-pan` — fast pan blur transition
- `dissolve` — soft cross-fade
- `fade-out` — to black (only for final scene)

---

## Example: 30s budgeting tutorial

```json
{
  "version": "hyperframes/1.0",
  "metadata": {
    "aspect_ratio": "9:16",
    "target_renderer": "runway",
    "total_duration_sec": 30,
    "style_direction": "vlog"
  },
  "scenes": [
    {
      "scene_id": 1,
      "timestamp": "0:00-0:03",
      "visual_prompt": "POV close-up of phone screen showing low bank balance figure, soft natural light, slight handheld shake",
      "motion_hint": "slow zoom in",
      "duration_sec": 3,
      "audio_cue": "voiceover: 'Pernah cek saldo, langsung kaget?'",
      "transition_to_next": "cut"
    },
    {
      "scene_id": 2,
      "timestamp": "0:03-0:08",
      "visual_prompt": "Medium shot, person sitting at kitchen table with notebook open, writing categories, warm afternoon light",
      "motion_hint": "static medium shot",
      "duration_sec": 5,
      "audio_cue": "voiceover: 'Coba 50/30/20 rule.'",
      "transition_to_next": "match-cut"
    },
    {
      "scene_id": 3,
      "timestamp": "0:08-0:18",
      "visual_prompt": "Animated overlay text: '50% Kebutuhan / 30% Keinginan / 20% Tabungan' with simple icons appearing left-to-right",
      "motion_hint": "parallax slide left",
      "duration_sec": 10,
      "audio_cue": "voiceover: 'Setengah buat kebutuhan, 30% keinginan, 20% tabungan.'",
      "transition_to_next": "dissolve"
    },
    {
      "scene_id": 4,
      "timestamp": "0:18-0:25",
      "visual_prompt": "Calculator screen showing real numbers being split, hand visible, top-down angle",
      "motion_hint": "static top-down",
      "duration_sec": 7,
      "audio_cue": "voiceover: 'Misal gaji 5 juta, jadi 2.5 / 1.5 / 1 juta.'",
      "transition_to_next": "cut"
    },
    {
      "scene_id": 5,
      "timestamp": "0:25-0:30",
      "visual_prompt": "Direct-to-camera medium shot, friendly smile, text overlay 'SAVE INI' bottom-third",
      "motion_hint": "static medium shot",
      "duration_sec": 5,
      "audio_cue": "voiceover: 'Save video ini buat reminder pas gajian.'",
      "transition_to_next": "fade-out"
    }
  ]
}
```

---

## Validation rules (skill-side)

- `metadata.total_duration_sec` ≈ sum of `scenes[].duration_sec` (±0.5s tolerance)
- `scenes[].scene_id` sequential starting at 1
- All required fields present per scene
- `transition_to_next` of last scene typically `fade-out` or `cut` (no dangling)
- `visual_prompt` does not include copyrighted character names (basic regex check)

If validation fails, skill returns explanation + suggested fix.
