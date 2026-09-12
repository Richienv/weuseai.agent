# Layers 3–4 — Skin: Macro structure + Micro detail (incl. subsurface scattering)

Skin is the largest, most visually complex surface the model must render. Address both scales.

## Layer 3 — Macro skin (gross structure)

- **Gravity response:** skin sags, folds, drapes; it stretches over raised bone and compresses in
  creases. Pronounced with age.
- **Skin folds** form wherever skin compresses between moving parts: knuckles, elbow crease, neck when
  the head lowers, belly when seated.
- **Regional variation:** face, hands, elbows, knees differ in thickness/texture from torso or inner arm.
- **Age-appropriate texture:** young = smoother, fewer lines; older = deeper nasolabial folds, crow's
  feet, looser texture under chin/eyes.
- **Asymmetry — critical:** humans are *perfectly imperfect*. One eye slightly different, one mouth
  corner higher. **Perfect bilateral symmetry is one of the strongest uncanny-valley triggers.**

Prompt vocabulary:
```
natural skin with gravity response, age-appropriate texture, skin folds at natural compression points,
subtle facial asymmetry, one eyebrow slightly higher, realistic skin drape, [for older: deeper
nasolabial folds, crow's feet, looser skin under the chin]
```

## Layer 4 — Micro skin (pores, texture, SSS)

The layer everyone over-focuses on — but it only works if Layers 1–3 are right.

**The core trap:** "realistic" → smooth, filtered skin (models equate realistic with polished
photography). To get real texture you must **explicitly describe imperfection.**

**Texture triggers (positive):**
```
visible pores, pore-level detail, microrelief, micro-texture, skin grain, peach fuzz (great for
close-ups), freckles, minor blemishes, moles, fine scars, natural imperfections, unretouched,
slight sweat and shine in the T-zone
```
**Anti-perfection (negative):**
```
no beauty filter, no skin smoothing, no flawless skin, no poreless, no plastic skin, no airbrushing
```
**Lighting that reveals texture:** `raking 45° sidelight` (the most effective single choice),
`strong directional light`, `harsh shadows`, `macro photography style`.

### Subsurface scattering (SSS) — the most important physical phenomenon for skin

Light enters the skin, scatters through the dermis and blood, and re-exits nearby — giving skin its
translucent, living glow. Without it, skin looks opaque and waxy (the core "plastic" failure).
- Thin areas (ears, nostrils, fingertips, eyelids) glow warm red/pink from blood beneath.
- Scattering radius controls softness.
- Keywords: `subsurface scattering, translucent skin, skin translucency, soft skin glow, light passing
  through the ears`.

### The SKIN-BLOCK (master formula — paste near the front of any portrait)
```
matte skin texture with microrelief, natural imperfections: visible pores, freckles, scars, moles,
slight sweat and shine in the T-zone, subsurface scattering, skin translucency
```
Pair it with `unretouched, no beauty filter` and a `raking 45° sidelight`, and most "plastic skin"
complaints disappear.

## Skin-tone fidelity (don't let lighting darken the real complexion)

Texture is only half of skin realism — **tone** is the other half, and it's where moody looks go wrong.
Low-key, desaturated, or under-exposed lighting drags the complexion darker and muddier than the person
actually is (a frequent "why do I look so dark / that's not my color" complaint). Fixes:
- Name the **true complexion** ("warm light-to-medium / fair / deep [whatever is accurate]") and require
  it be **accurately exposed**: `evenly and brightly exposed, luminous, true-to-life skin tone, accurate
  white balance, not darkened, not dim, not muddy, no crushed shadows on the face`.
- **Expose for the subject, not the mood** — keep a key on the face and a fill to lift the shadow side
  even when the background stays dark. A dark *background* must not become dark *skin*.
- Watch the grade: heavy "desaturated / bleach-bypass" looks pull warmth and life out of skin — dial
  them back when accurate tone matters.

## Age fidelity (match the stated age — models drift older)

Heavy macro texture, deep nasolabial folds, eye-bags, hard contrast, and stubble all add years. Match the
texture and lighting to the **stated age**:
- Young adult (late teens–20s): `youthful, smooth healthy skin with fine subtle pores, soft contrast, no
  wrinkles, no eye bags, no nasolabial folds, rested`. Go light on macro texture; soften the key.
- Older: layer in the macro folds, deeper texture, and harder light deliberately.
Always state the exact age (e.g. "24 years old") so the model doesn't average toward middle-aged.
