# Layer 9 — Lighting, Environment, and Context

Lighting isn't a polish parameter — it's the physical context that **validates or invalidates every
other layer**. Wrong lighting destroys even perfect skin, anatomy, and expression.

## Critical concepts

- **Global illumination:** light bounces between surfaces, creating color bleeding and soft fill in
  shadows. Flat, shadowless light reads as artificial. `global illumination, soft bounced fill,
  color bleed from the environment`.
- **Ambient occlusion (AO):** the natural darkening in crevices — under the nose, in the ear, the neck
  crease, under the chin, between fingers. Without it, figures look pasted on / floating.
  `ambient occlusion in facial crevices, contact shadows`.
- **Catchlights:** reflections of the light source in the eyes — a biological signal of life. Place them
  consistently with the key light. `catchlights in the eyes matching the key light`.

## Lighting recipes (pick the source, not just the mood)

| Setup | Effect | Best for |
|-------|--------|----------|
| raking 45° sidelight | maximum skin-texture reveal | close-up portraits |
| Rembrandt (key high 45°, triangle on cheek) | dramatic, emotional depth | character studies |
| large soft window / north light | soft, relatable, everyday | documentary, natural |
| harsh direct sun | hard shadows, gritty realism | street/outdoor |
| golden hour | warm, enhances subsurface scattering | full-body, beauty |

## Environment coherence (the believability seal)

The environment must produce lighting consistent with the scene — a person "outdoors on an overcast
day" should NOT have hard shadows. **Describe the light source, not just the mood:**
```
lit by a large north-facing window, soft diffuse light, gentle wraparound, slight cool cast in the
shadows, ambient occlusion under the chin and in the eye sockets, catchlights from the window
```
Match color temperature, shadow hardness, and direction to the stated place and time. Consistency
between subject light and background light is what makes a composite or a generation feel "real," not
just well-rendered.

## Quick realism lighting default

When unsure: **raking 45° soft key + subtle fill from the opposite side + AO in crevices + catchlights**.
It reveals skin texture (Layer 4), grounds the form (AO), and proves a light source exists (catchlights)
— covering three layers at once.

## Expose for the subject — protect tone & age

Lighting is also where skin tone and apparent age go wrong. Low-key / moody / desaturated setups
under-expose the complexion (person reads darker, dimmer, muddier than they are) and the hard shadows
add years. A dark **background** must not become dark **skin**.

- Always put enough key on the **face** and a fill to lift the shadow side, even when the background
  stays dark. Add `evenly exposed face, true-to-life skin tone, accurate white balance`.
- For **young** subjects, soften the key and reduce contrast — hard raking light + deep shadow reads
  older and harsher. Save the dramatic hard-light, heavy-texture treatment for genuinely older faces.
- If a result comes back too dark or too old, the fix is almost always **lighting/exposure**, not more
  texture: brighten the key, lift the fill, warm the white balance, ease the contrast.
