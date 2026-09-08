# Master Prompt Architecture — modular blocks for full human realism

Build a realistic-human prompt by stacking modular blocks, inner layer → outer layer. Include the inner
blocks even when the user only asked about a surface detail — that's what prevents the plastic look.
Trim blocks the subject doesn't need (e.g. expression for a back view), but never skip anatomy/skin/SSS.

## Full block template

```
[ANATOMY BLOCK]  (Layers 1–2)
anatomically correct proportions, natural weight distribution, contrapposto stance,
subcutaneous fat softening muscle definition, natural tissue thickness, relaxed posture

[MACRO SKIN BLOCK]  (Layer 3)
natural skin with gravity response, age-appropriate texture, skin folds at compression points,
subtle facial asymmetry

[MICRO SKIN BLOCK]  (Layer 4)  ← the SKIN-BLOCK
matte skin texture with microrelief, natural imperfections: visible pores, freckles, scars, moles,
slight sweat and shine in the T-zone, subsurface scattering, skin translucency

[FACE / EXPRESSION BLOCK]  (Layers 5,7)
genuine [Duchenne] expression with cheeks raised and eye crinkle [if smiling], iris texture with
limbal ring, catchlights in the eyes, aligned gaze, natural eyelash variation, slightly off-white teeth

[BODY LANGUAGE BLOCK]  (Layer 6)
natural body language, weight shifted to [left/right] foot, open relaxed posture,
hands [relaxed at sides / specific motivated gesture], body oriented toward [target]

[HAIR BLOCK]  (Layer 5)
individual hair strands visible, natural flyaways, baby hairs at the hairline, volume with gravity

[LIGHTING BLOCK]  (Layer 9)
lit by [specific source, e.g. large north window], raking 45° key, soft fill opposite,
ambient occlusion in facial crevices, catchlights matching the key, [time of day if outdoor]

[TECHNICAL BLOCK]
shot on [camera + lens, e.g. 85mm], shallow depth of field, unretouched, no beauty filter,
no skin smoothing, no flawless skin, fine grain
[model flags: --style raw (Midjourney) / CFG 7–12 (Flux) / quality: high (GPT Image)]
```

## Reusable mini-blocks (grab as needed)

**SKIN-BLOCK** (the highest-value single insert):
```
matte skin texture with microrelief, natural imperfections: visible pores, freckles, scars, moles,
slight sweat and shine in the T-zone, subsurface scattering, skin translucency, unretouched, no beauty filter
```

**EXPRESSION-BLOCK** (genuine emotion via FACS):
```
genuine Duchenne smile, lip corners raised, cheeks raised, crinkles at the outer eyes, warmth reaching
the eyes, aligned gaze, catchlights
```
(For non-smiling emotions, swap in the brow/eye AUs from layer-7-facs-expression.md.)

**LIGHTING-BLOCK** (texture + grounding + life, three layers at once):
```
raking 45° soft key light, subtle fill from the opposite side, ambient occlusion in the eye sockets,
under the nose and chin, catchlights in the eyes matching the key
```

## Worked example — realistic 35-year-old man, half-body, window-lit

```
A 35-year-old man, half-body, anatomically correct proportions, weight shifted to his right foot,
slight contrapposto, subcutaneous fat softening muscle definition;
natural skin with subtle asymmetry and age-appropriate texture, faint nasolabial lines;
matte skin with microrelief, visible pores, a few freckles, a small scar on the brow, slight T-zone
shine, subsurface scattering, skin translucency;
calm genuine expression, soft Duchenne warmth in the eyes, iris texture with limbal ring, catchlights,
aligned gaze, natural eyelash variation, slightly off-white teeth just visible;
relaxed open posture, hands loosely at his sides; individual hair strands with natural flyaways and
baby hairs at the hairline;
lit by a large north-facing window camera-left, soft diffuse raking light, gentle fill camera-right,
ambient occlusion under the chin and in the eye sockets, catchlights from the window;
shot on 85mm, shallow depth of field, unretouched, no beauty filter, no skin smoothing, fine grain
```

## Reminder

Order is not cosmetic — it mirrors the dependency stack. If the result still looks off, go back to the
*deepest* block (anatomy/skin/SSS), not the surface one.
