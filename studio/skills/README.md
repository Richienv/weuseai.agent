# Studio skill stack

Packaged 2026-09-02 from the Higgsfield / Seedance skill install.
This folder is the written law. `api/_shared/ai-video-skill-stack.ts`
is the runtime that every Studio generate and look-lock still must pass.

Large PNG anchors from `richie-persona/assets/` stay out of git.
Richie likeness in Studio uses `/assets/ads/hf/sheet-richie-adidas.png`.

## Routing priority

1. Named Richie or Renita identity: paste FACE LOCK from
   `01-core-routing/prompt-master-seedance2-5/references/identity-*.md`
2. One copy-paste Seedance prompt: `prompt-master-seedance2-5`
3. Multi-scene shotlist: emit one 9-heading prompt per generate,
   never one stuffed montage
4. Cinematic direction: Richie Cinematic Studio
   `higgsfield-cinematic-video` (prefer `02-` over `03-`)
5. Reference-driven couple / POV: `reference-video-director`
6. Realism, persona, reel assembly: support skills in `02-`

Prefer `01-core-routing` and `02-richie-cinematic-studio-v0.2.0`
over `03-generic-legacy`.

## Studio emit contract

Every video prompt leaves the compiler as one English block with
these headings, in this order:

SCENE, REFERENCES, PHYSICS, LIGHT, CAMERA, TIMELINE, PERFORMANCE, SOUND, LOCKS

Banned in the emit: `higgsfield`, `cadence`, `@[Name](uuid)`, raw UUIDs.
Allowed handles: `Image 1`–`Image 30` and `@Image1`–`@Image30`.
Seedance 2.5 image cap is 30. The marketed 50 slots include video and audio.

Character sheets attach as `reference_image`. Scene stills may be
`first_frame`. Sheets never become frame one.

Look-lock stills are frame 0: mid-action, one lamp, anti-beautify.
They compile first. Paid video generate stays a separate job.
