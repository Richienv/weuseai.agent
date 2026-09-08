# Anti-AI-Tell catalog — what gives it away and how to kill it

Viewers can't always explain why a clip "feels AI," but their subconscious flags broken physics,
inconsistent faces, and impossible motion instantly (the uncanny valley). Each tell below has a
cause and a concrete fix you bake into the prompt or the shoot plan. Read this before finalizing
any shot, and check against it again before shipping.

## The tells, causes, and fixes

**1. Melting / drifting face, identity changes mid-shot**
- Cause: no identity anchor; clip too long; subject turns away and back.
- Fix: feed a clean `start_image`; keep clips ≤6s; "preserve face and identity precisely";
  never have the subject turn 180°. Add to NEGATIVE: "no face distortion, no identity drift".

**2. Morphing / cross-dissolve transformation**
- Cause: asking one clip to change age, body, location, or time-of-day.
- Fix: split into separate shots and change the world at the CUT (see transitions-and-editing.md).
  NEGATIVE: "no morphing, no melting, no transformation".

**3. Extra / fused / bending fingers, warping hands, morphing held objects**
- Cause: the model prioritizes face/body and under-resolves hands and secondary items.
- Fix: keep hands simple (in pockets, at sides, holding nothing — or holding ONE simple solid
  object described as "held firmly, rigid, not deforming"). NEGATIVE: "no extra fingers, no
  fused fingers, no deformed hands, no morphing objects".

**4. Flickering background, crawling textures, shimmering patterns**
- Cause: busy patterns (plaid, stripes, dense logos, foliage detail, crowds) the model can't
  keep temporally stable.
- Fix: solid-color wardrobe, simple sets, shallow DoF to blur busy backgrounds, fewer background
  people. NEGATIVE: "no flickering, no shimmering, no crawling textures".

**5. Weightless, floaty, too-smooth motion**
- Cause: no physical cues; over-smooth interpolation.
- Fix: describe weight and timing ("heavy steps", "settles", "inertia"); add subtle handheld;
  add "24fps natural motion blur". NEGATIVE: "no floating, no weightless motion, no slow-motion
  unless intended".

**6. Plastic, poreless, over-glossy skin; HDR "AI sheen"**
- Cause: default model bias toward smooth, over-lit beauty.
- Fix: "natural skin texture, visible pores, real skin", "soft contrast", add film grain, avoid
  over-bright key. NEGATIVE: "no plastic skin, no waxy CGI look, no over-smoothing".

**7. Glowing orbs, halos, rim lights from nowhere, unmotivated backlight**
- Cause: model loves to add pretty light it can't justify.
- Fix: motivated light only, named sources. NEGATIVE: "no glowing orb, no halo, no rim-light
  beam, no unmotivated backlight, no lens-flare spam".

**8. Impossible/eerie eyes, dead stare, mis-timed blinks, lip-sync mush**
- Cause: micro-expressions are the hardest thing to fake; dialogue makes it worse.
- Fix: keep gaze and expression simple and motivated ("calm gaze toward camera, one natural
  blink"); avoid close-up dialogue unless the model/tool is built for it; prefer voiceover over
  on-camera lip-sync. NEGATIVE: "no dead eyes, no uncanny expression, no lip-sync errors".

**9. Background people warping, duplicating, sliding**
- Cause: crowds are expensive to keep coherent.
- Fix: few or no background extras; blur them with DoF; keep them static or far. NEGATIVE:
  "no duplicated people, no warping crowd".

**10. Too clean / too stable / too perfect = synthetic**
- Cause: no grain, locked-off perfection, no lens character.
- Fix: add grain, a real grade, 1–2% handheld, lens vignetting/aberration, a foreground occluder.
  Imperfection is what reads as "a camera was here."

## Negative-prompt library (copy what's relevant per shot)

Baseline (almost always):
```
no morphing, no melting, no face distortion, no identity drift, no flickering, no shimmering,
no warping background, no extra fingers, no fused fingers, no deformed hands, no extra limbs,
no floating or weightless motion, no plastic or waxy skin, no over-smoothing, no cartoon or
stylized or 3D-render look, no text, no watermark, no logo
```

Lighting hygiene (night/dramatic):
```
no glowing orb, no halo, no rim-light beam, no unmotivated backlight, no lens-flare spam,
no neon glow that has no source
```

People/objects:
```
no duplicated people, no warping crowd, no morphing held objects, no deformed accessories,
no changing clothing, no changing hairstyle mid-shot
```

Motion/timing:
```
no abrupt speed changes, no unintended slow motion, no jitter, no strobing, no frame tearing
```

## The ship test

Watch the clip at full size, twice. First pass: faces, hands, eyes. Second pass: background,
edges, motion weight, light sources. If anything on this page shows up, reshoot **that one shot**
with the matching fix — don't rationalize a tell into the final cut. One bad shot is what gets a
whole video labeled "AI."

## Seedance / Higgsfield failure → fix (quick table)

| Failure | Cause | Fix |
|---------|-------|-----|
| Rubbery / plastic skin | default style mode | add `no 3D, no cartoon, no VFX, natural imperfections` |
| Character appearance changes | no identity anchor | `@Image1 as character reference` + constraint line, or Soul ID |
| Random camera movement | no camera spec | open with a camera rule (`slow dolly-in`, or `no cuts, no zoom`) |
| Prompt rejected | over-literal action language | reframe in film terms (`low-angle tracking shot`) as a moderation buffer |
| Broken hands | fast finger actions | slow the motion, keep hands larger in frame, avoid intricate gestures |
| Stiff / unnatural motion | vague motion | specific speed (`sprinting quickly`, not `moving dynamically`) |
| Too many cuts in a POV shot | missing negative | add `no cuts, no zoom, natural head movement` |
| Generic AI aesthetic | adjective over-reliance | swap to metadata: lens + camera + film stock |
| Prompt ignored after ~150 words | too long | keep under ~200 words; use timeline structure, not paragraphs |
| Audio doesn't match | no sound direction | write an SFX list, `NO MUSIC — only raw SFX`, or describe the score |
| Subject too dark / dim skin | low-key or desaturated grade under-exposes the complexion | expose for the face, lift the fill, accurate white balance — a dark background ≠ dark skin; state the true skin tone |
| Person looks older than intended | hard shadows + heavy contrast + heavy texture add years | state the exact age, soften the key, reduce contrast, ease texture for young subjects |
