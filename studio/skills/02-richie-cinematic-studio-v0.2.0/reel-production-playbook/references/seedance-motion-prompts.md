# Seedance motion prompts — handheld image-to-video

Model `seedance_2_0`, role `start_image`, `duration: 5`, `aspect_ratio: "16:9"`,
`resolution: "1080p"`. One action + one camera move per clip. Keep each prompt ~120–160 words.

## The template (fill the brackets)

```
Total: 5s / 1 shot / 16:9. Animate this still as the first frame — keep the EXACT same [subject],
same face, same [wardrobe], same [scene], same grade. Photoreal live-action, ARRI Alexa LF,
anamorphic lens, shallow depth of field, 35mm grain, halation, desaturated teal-blue grade.
SUBJECT+ACTION: [one small believable action — breath, blink, jaw clench, slow head turn, weight
shift]. [atmosphere: mist drift, haze shimmer]. CAMERA: handheld, a camera operator [slowly walking
in / standing close] — natural walking bounce, micro jitter, subtle unstable push-in, slight focus
breathing. One move only. 逆光薄雾，手持轻微晃动，镜头缓慢推近，蓝橙对比，胶片颗粒. Keep the same
person, same facial features, same hairstyle — no identity drift, no morphing. No beauty filter,
natural imperfections, no extra people.
```

Mandarin tail options (pick by lighting): backlit mist → `逆光薄雾，手持轻微晃动，镜头缓慢推近，蓝橙对比，胶片颗粒`;
low-key side light → `低调侧光，手持微晃，缓慢呼吸，蓝橙对比，胶片颗粒`; hard side key →
`硬光侧面，手持微晃，缓慢推近，蓝橙对比，胶片颗粒`.

## The 6 winning prompts (now-you vs younger-you reel)

**S1 — WIDE, current self, exhausted.**
> Total: 5s / 1 shot / 16:9. Animate this still as the first frame — keep the EXACT same man, same
> face, same navy hoodie, same misty floodlit field, same grade. Photoreal live-action, ARRI Alexa
> LF, anamorphic lens, shallow DoF, 35mm grain, halation, desaturated teal-blue grade.
> SUBJECT+ACTION: an exhausted young man stands alone on a dark misty football field; he breathes
> slowly and heavily, shoulders rising and falling, head dipping slightly, heavy eyes. Ground mist
> drifts, floodlight haze shimmers. CAMERA: handheld, a camera operator slowly walking in — natural
> walking bounce, micro jitter, subtle unstable push-in, slight focus breathing. One move only.
> 逆光薄雾，手持轻微晃动，镜头缓慢推近，蓝橙对比，胶片颗粒. Keep the same person... no identity drift,
> no morphing. No beauty filter, natural imperfections, no extra people.

**S2 — MEDIUM, current self, tired but composed.**
> ...a tired but composed young man in medium shot, half his face in deep shadow; one slow heavy
> breath, a slow weighted blink, a small swallow, faint sweat sheen catching the key light, eyes
> worn but steady. CAMERA: handheld, operator standing close — gentle micro-sway, tiny unstable
> drift, very slight push-in, focus breathing. 低调侧光，手持微晃，缓慢呼吸，蓝橙对比，胶片颗粒...

**S3 — WIDE two selves (behind current, younger distant).** Keep the distant younger face shadowed.
> ...foreground (left) a man from behind, hood down, hair rim-lit; far across the misty field
> (right) a young footballer in a red jersey, small and distant, face kept in shadow and mist. The
> foreground man stands still, shoulders breathing; the distant footballer holds with a faint sway;
> mist rolls across the pitch. CAMERA: handheld, operator slowly walking forward behind the
> foreground man — walking bounce, micro jitter, subtle push-in toward the field. 逆光薄雾，手持轻微
> 晃动，镜头缓慢推近，蓝橙对比，胶片颗粒. Keep both people identical, distant face shadowed... A calm
> cinematic sports drama scene, fully clothed, no extra people.  ← (the "calm... fully clothed" line
> clears the false NSFW flag)

**S4 — REVERSE (younger silhouette foreground, current lit across).**
> ...younger self as a dark silhouette in the foreground; across the field the lit current self in a
> navy hoodie breathes and slowly lifts his head to look back. Mist drifts. CAMERA: handheld,
> operator standing — micro-sway, slight unstable drift, very small push-in. 逆光薄雾，手持微晃...

**S5 — Reverse POV (behind younger, current distant).**
> ...foreground (right) a young footballer in a red jersey seen from behind, hair rim-lit; far
> across the misty field (left) a man in a navy hoodie small and distant. The foreground footballer
> stands still, shoulders breathing, a faint shift; the distant man holds. CAMERA: handheld,
> operator slowly walking forward behind the foreground footballer — push-in toward the distant
> figure. ...A calm cinematic sports drama scene, fully clothed, no extra people.

**S6 — MEDIUM younger close (NOT extreme close-up).**
> ...a dead-serious slim 18-year-old in a MEDIUM shot, half his face in shadow; a slow blink, a
> subtle jaw clench, a slow breath, faint sweat sheen, stare hardening with quiet intensity, the
> smallest weight shift. CAMERA: handheld, operator close — gentle micro-sway, tiny unstable drift,
> very small push-in. 硬光侧面，手持微晃，缓慢推近，蓝橙对比，胶片颗粒. Keep half the face in shadow...

## Casting / scale notes

- Match scale across a shot/reverse pair: S3 ↔ S5 are mirror POVs (foreground figure large + lower
  third; the other small and distant across negative space). Mirror the side (left vs right).
- A foreground figure seen from behind can turn to a rim-lit ¾ profile mid-clip — a strong, natural
  beat that also keeps the face mostly hidden.
- Reserve the one clearly-lit face for a MEDIUM (S6), never an extreme close-up — closer framing
  exposes the likeness gap.
