# Ready blocks & templates — copy-paste arsenal (Seedance 2.0 / Higgsfield)

Community-validated, paste-ready building blocks. Fill the brackets, keep total prompt under ~200 words
(Seedance starts ignoring content past ~150–200 words — use the timeline structure, not long paragraphs).

## Shot-structure header (put this at the VERY top of every prompt)

Seedance needs the structure before anything else, or it defaults to random camera moves and framing.
```
Total: [X]s / [N] shots / [16:9 | 9:16 | 21:9]
```
Then: References → Style → Subject+Action → Camera → Timeline.

## The ARRI Alexa ultra-realism block (style suffix for almost anything)

The single most validated camera reference for realism. Paste as a suffix:
```
cinematic, photorealistic, shot on ARRI Alexa LF, anamorphic lens, shallow depth of field,
motion blur on fast actions, strong 35mm film look, heavy film grain, sharp but imperfect focus,
noticeable focus breathing, halation on highlights, soft highlight rolloff, slightly desaturated tones,
practical-VFX feel, minimal CGI look, natural imperfections
```
Short form: `shot on ARRI Alexa LF, anamorphic lens, shallow depth of field, motion blur`.

## Physical-realism block (humans / organic surfaces)
```
subsurface scattering, skin translucency, natural skin microrelief, visible pores,
no 3D, no cartoon, no VFX, grounded physics, temporal coherence, strict mesh stability
```

## Fluid / physics block (Seedance's strongest advantage)
```
physically accurate fluid dynamics, volumetric steam, true volumetric particles,
accurate index of refraction (IOR) for glass and liquid, ray-traced caustics,
zero morphing, consistent geometry, physically accurate motion
```

## Smartphone / UGC realism formula (authentic phone-shot look)
```
Ultra-realistic smartphone video, vertical 9:16. Unstable handheld movement, natural body dynamics,
micro jitters from a nervous grip, realistic walking bounce, imperfect stabilization wobble,
rolling-shutter distortion on quick moves, natural motion blur on fast turns, realistic autofocus hunts,
slight digital-zoom artifacts, phone HDR struggling with bright sky vs dark ground, sensor noise in shadows.
Raw observational realism. No cinematic moves, no professional framing, no soundtrack.
```

## 3D macro realism template (top community performer)
```
Ultra-realistic 3D render of [subject/action], macro cinematography. Physically accurate fluid dynamics.
Highly detailed [surfaces] with organic micro-textures and realistic subsurface scattering.
True volumetric [smoke/steam/particles], absolute mesh stability, accurate IOR for glass and liquid,
ray-traced caustics, cinematic warm lighting, strict temporal coherence, physically accurate motion,
zero morphing, consistent geometry.
```

## Timeline prompting (multi-shot sequences)

Mark beats with timestamps — this is what turns scattered clips into a sequence.
```
[0s]: [shot type]. [scene establishment]. [camera start].
[3-4s]: [first camera move / action]. [transition note].
[6-7s]: [second beat / emotional shift]. [camera adjustment].
[8-10s]: [hold, escalation, or exit].
[End]: [freeze frame / camera stop / slow dolly-in / fade].
```

### The 6-shot / 15s arc (highest-performing Seedance format)
```
Total: 15s / 6 shots / 16:9
Shot 1 (0-3s): calm establishment — medium shot, ambient action
Shot 2 (3-5s): tension introduced — wide shot
Shot 3 (5-7s): character reaction — close-up
Shot 4 (7-10s): escalation/turn — camera jolt on each beat
Shot 5 (10-13s): climax — wide low-angle, slow-motion beat
Shot 6 (13-15s): resolution/return — medium shot, camera settles
```
Closing methods: `freeze frame on peak expression` · `camera stop on final composition` ·
`slow dolly-in as the character looks away` · `fade to black with lingering atmosphere` ·
`camera pulls back to reveal full scale`.

## The compiled master template (fill and run)
```
Total: [X]s / [N] shots / [16:9 | 9:16]
@Image1 as first frame / character reference. @Video1 for camera movement & pacing. [@Audio1 if needed]

[STYLE] multi-shot [genre] [Hollywood/documentary/drama/commercial], cinematic, photorealistic,
35mm film, professional color grading, film grain, ARRI Alexa aesthetic.
No 3D, no cartoon, no VFX [organic subjects]. No anime feel, no plastic feel.

[SCENE+CHARACTER] [subject w/ specific detail]. [location — light, time, weather, surfaces].
[action + emotional intent].

[SHOTS]
Shot 1 (0-Xs): [type]. [action]. [camera]. [light].
Shot 2 (X-Ys): [type]. [action/escalation]. [camera move].
[...final shot + closing method]

[CAMERA] [movement], [lens], [DoF], [stability]. [COLOR] [grade].
[PHYSICS/VFX if any]. [AUDIO] NO MUSIC — only raw SFX: [list]  OR  [score: instrument+tempo+mood].
[ANTI-DEFAULTS] no beauty filter, no flawless skin, no perfect symmetry, natural imperfections.
```
Keep it tight: brackets filled, under ~200 words, structure over prose.
