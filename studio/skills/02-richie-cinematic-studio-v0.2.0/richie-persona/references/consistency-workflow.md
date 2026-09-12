# Consistency Workflow — how to keep it looking like Richie

## The core truth
- His **real photo = 100% him.** Any **from-scratch generation idealizes (~85–90%)** and drifts toward
  a sharper, more conventionally handsome stranger. Plan around this.
- For maximum likeness, **edit his real photo** (image-to-image / image-edit): keep the face, change
  scene/wardrobe/light. Use from-scratch only when an edit can't do the job.

## Three-phase pipeline
1. **Anchor (stills):** start from a real photo edit, or multi-reference 3–4 real photos + the Identity
   Block + anti-idealization negatives. Neutral, evenly-lit references read best; save dramatic light
   for the final shot, not the reference.
2. **Lock identity for scenes:** keep the Identity Block verbatim every prompt; vary only the scene
   block (location, wardrobe, action, light). Never re-describe the face loosely ("handsome face") —
   use the bone-structure block.
3. **Animate (video):** Seedance/Kling run a **face filter that blocks real-photo uploads of real
   people** — so animate from an **approved AI keyframe**, not a raw selfie. Motion-only prompt,
   identity locked, no morph. Build multi-shot sequences **shot-by-shot, then edit** — never ask one
   clip to do several shots or a transformation (that's where faces melt).

## Prompt hygiene
- **Banned filler:** cinematic, epic, stunning, masterpiece, beautiful. They don't render and degrade
  output. Replace with: shot type (medium shot, OTS), named lighting (soft wrap key, Rembrandt, single
  overhead key), materials, and one or two concrete camera moves (slow dolly-in, handheld micro-shake).
- **Always append the anti-idealization negative tail** (see identity-block.md).
- **Tone & age:** expose the face (a dark background must not darken his skin); soften hard light so it
  doesn't age him; keep age ~24.

## Shot-by-shot ledger (for series / multi-shot)
Track per shot: Shot ID · Identity Block (verbatim) · Scene block · reference images used · pass/fail
vs the real photo. Before export, audit: identity anchors present? features intact (eyes/nose/jaw not
drifted sharper)? lighting/tone consistent across shots? reads as the same person?

## Model pick
- Stills & edits: **nano_banana_pro** (quality, multi-ref) or **GPT Image 2** (edits, hard preserve,
  dense text). nano_banana_2 for fast iteration.
- Image-to-video: **Seedance 2.0** (identity + atmosphere); **Kling** for precise camera/dialogue.
- After every generation: compare to his real photo. If it reads as a sharper stranger → it idealized
  → re-run with stronger anti-idealization negatives or switch to a real-photo edit.
