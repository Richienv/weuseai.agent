# Layer 8 — Voice, Prosody, and Lip-Sync (video / interactive humans)

For video and interactive AI humans, **voice is often the strongest determinant of believability** —
sometimes more than the visuals. Prosody (rhythm, stress, intonation, pacing) is the primary signal
people use to judge authentic vs. synthetic.

## Prosody elements that matter

- **Pacing variation:** real speech is irregular — unexpected pauses, words running together, syllables
  stretching/compressing with emotion. Uniform rhythm = robotic.
- **Intonation:** the pitch contour must match the emotional content (rising for questions/uncertainty,
  falling for resolution).
- **Breath markers:** brief audible inhales between phrases break synthetic uniformity.
- **Filler sounds:** occasional "um," "uh," small hesitations signal thinking and humanity (use sparingly).
- **Accent consistency:** if an accent is claimed, keep it consistent at the phoneme level.

Direction vocabulary (for TTS / voice tools that accept it):
```
natural conversational pacing, varied rhythm, audible breath between phrases, occasional brief
hesitation, intonation matching emotion, not flat, not metronomic
```

## Lip-sync — the technical floor

Lip-sync quality (not avatar looks) is the primary driver of *trust* in AI presenters. Mouth shape must
align to phonemes at the frame level — even ~100ms of lag is consciously detectable.
- Prefer tools/models built for accurate lip-sync when there's on-camera dialogue.
- When sync can't be guaranteed, **prefer voiceover over on-camera lip movement** (cutaways, B-roll, or
  the speaker off-frame) — bad sync is a louder tell than no on-camera speech.
- Match mouth movement intensity to delivery (a calm line shouldn't have exaggerated mouth motion).

## Practical rule

If you can't nail sync + prosody, design around it: voiceover + B-roll, reaction shots, or text on
screen. A believable voice over indirect visuals beats a perfect face with robotic, mis-synced speech.
