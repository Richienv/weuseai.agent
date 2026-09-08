---
name: richie-persona
description: >-
  Richie's personal character-consistency profile (his own face/likeness). Use this skill
  WHENEVER generating, editing, prompting, or animating any image or video of Richie himself —
  i.e. when the user says "me", "my face", "my character", "my persona", "my avatar", wants a
  portrait/selfie/reel/clip of himself, or "put me in [scene]". Apply his locked Character DNA
  (exact eyes, nose, lips, face shape) and the anti-idealization rules so the output actually
  looks like HIM, not an idealized stranger — image models keep sharpening his jaw, enlarging his
  eyes, and slimming his face, and this skill exists to stop that. Always prefer editing his real
  photos and multi-referencing his real photos; never feed AI outputs back as identity references.
  Triggers on any request to depict Richie. Do NOT use for other people or non-human subjects.
---

# Richie Persona — lock his real face, every time

Richie is a real person; you generate his likeness only at his own request from his own real
photos. The recurring failure across dozens of attempts: **models idealize him** — they hand back
a sharper-jawed, bigger-eyed, "model-handsome" face that is NOT him. This skill encodes his exact
features and the workflow that keeps the output looking like the real Richie.

**Approved canonical look:** "DNA-v2 A" (his own sign-off). Match that softness and proportion.

## The five non-negotiables

1. **Real photos only as identity references.** Attach 3–4 of his real photos (see
   `references/assets.md`). NEVER use a previous AI output as a reference — it compounds drift.
2. **Prefer editing his real photo over generating from scratch.** From-scratch tops out ~85–90% and
   idealizes; a real-photo image-to-video / image-edit preserves the true face. Generate from scratch
   only when an edit isn't possible.
3. **Paste the Identity Block verbatim** (`references/identity-block.md`) — paraphrasing drifts.
4. **Always include the anti-idealization negatives:** `do not beautify, do not idealize, do not slim
   the face, no sharp jaw, no defined cheekbones, keep soft round face and full cheeks, narrow
   monolid eyes (not large/double-lidded), low flat nose bridge with soft tip, exact real features.`
5. **No filler words** (cinematic, epic, stunning, masterpiece, beautiful). Use shot types, named
   lighting, materials, concrete camera moves (see `references/consistency-workflow.md`).

## Who he is (condensed — full block in references/identity-block.md)

24-year-old Indonesian-Chinese man, fit. **Soft, round, youthful, boyish** face — full soft cheeks,
soft rounded jaw, small soft chin (NOT chiselled). **Narrow, monolid-leaning** eyes, faint low crease,
generous brow-to-eye gap. **Low, flat** nose bridge, soft short tip, moderately wide nostrils. Dark
straight flat brows. Medium lips, fuller lower lip, gentle half-smile. Thick black hair swept up and
back, tapered sides, slight temple recession. Warm light-to-medium true skin tone — expose the face,
never darken it. Age always reads ~24. His jaw has real width/presence (don't render it too small).
He also has a documented **younger self** (~18, slim) — see `references/younger-self.md`.

For any cinematic or video work, aim for a real **Hollywood film still, not a photo**, and use
**half-face shadow** to read as cinema and hide any likeness gap — see `references/cinematic-shots.md`.

## Workflow (full detail in references/consistency-workflow.md)

- **Stills (looks-like-me):** edit a real photo (nano_banana_2 / GPT Image 2 edit) — change scene/
  wardrobe, hard-preserve the face. Or multi-ref his real photos + Identity Block + anti-idealization.
- **Video:** Seedance blocks real-face uploads, so animate from an approved AI keyframe (motion-only
  prompt, identity locked, no morph). Build sequences shot-by-shot, then edit — never one mega-clip.
- **Model pick:** nano_banana_pro / GPT Image 2 for stills + edits; Seedance 2.0 for image-to-video.
- After every generation, eyeball against his real photo; if it reads as a sharper stranger, it
  idealized — re-run with the anti-idealization negatives stronger.

## Reference map

- `references/identity-block.md` — full Character DNA for his CURRENT self (paste verbatim).
- `references/younger-self.md` — his YOUNGER self (~18, slim, ~6 years younger) DNA + younger reference IDs.
- `references/cinematic-shots.md` — the Hollywood-film-still standard, the half-face-shadow trick, and cross-shot consistency rules. Read this for any cinematic/video work.
- `references/shot-templates.md` — the proven "now-you vs younger-you" 5-shot sequence template.
- `references/consistency-workflow.md` — the three-phase pipeline, banned words, Seedance face policy, shot ledger.
- `references/assets.md` — his real reference photo IDs, the approved anchors, and what NOT to use.

## Do NOT use for

Other people, non-human subjects, or stylized/cartoon renders of Richie. This skill is only for
photoreal depiction of the real Richie. Pairs with `higgsfield-cinematic-video` (direction) and
`ai-human-realism` (skin/eyes/lighting).
