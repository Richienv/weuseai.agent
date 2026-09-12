# Character sheet face bar

Whenever we make a character sheet, look-lock grid, 6-angle, or new
wardrobe plate that includes a face, the ECU must match this quality
AND the `richie-ecu` composition (tight frontal, hair clipped, collar
only). Read `~/.cursor/skills/richie-ecu/SKILL.md` before generating.
A usable body with a fashion-cousin head is a fail. Regen the face or
crop the head.

## Canonical plate

`/Users/richiekidnovell/weuseai-launch-treadmill/refs/13-A-gaze-hi.png`

Also copied to `japan-montage/shots/13-A-gaze-hi.png`.

MEC / park wardrobe ECU (user-approved 2026-08-27):
`/Users/richiekidnovell/richie-mec-park/refs/40-face-lock-ecu.png`
Park stills must copy this head. Do not invent a new skull.

**Do not chain generated faces.** Every new still attaches real
crops first (hero, 3q, smile, raw, soul), then `13-A-gaze-hi`,
then `40` if this wardrobe. Never attach 44 / 45 / 50 / 51 / 52 /
53 or any other generated park/3q as a face. That is why likeness
flickers: cousin in, cousin out.

This is the **approved generated face**. It does not beat the hotel
selfie on skull. It beats every other generated head on skin.

## Pass

- Tight ECU. Eyes, pores, and collar fill the frame.
- Real leftover skin: pores, oil sheen on nose and forehead, peach
  fuzz / faint stubble, fine lines, the moles (right cheek, near the
  right eye).
- Hotel-selfie skull: short-full midface, sleepy medium-small eyes,
  wider rounded nose, high-volume black hair, empty ears.
- Sukajan white rib + gold stitch is cloth only. Do not copy it onto
  every sheet.

## Fail

- Porcelain, beauty-filter, or uniformly smooth skin
- Slim midface, V-line jaw, thin nose, idol eyes
- Sparkler still (`09-richie-look-sparklers.png`) — AI, never attach
- Old studio sheets (`02-richie-sheet.png`, `03-richie-body.png`)
- Headless iconic plates used as a face

## Paused movie (required on every still)

A sheet panel that includes a body in a place is **frame 0 of a take**,
not a catalog pose. Mid-verb. Same lamp on face, cloth, and ground.
Slight motion softness on the unfinished part. Seedance must be able
to start exactly there. Full law: `~/.cursor/skills/taste/look-lock.md`.

Hand-on-chest, both feet planted, studio face on a park body = fail.

## How to make the next sheet

1. Attach real crops first: `01-richie-hero`, `01b-richie-3q`,
   `01c-richie-smile`.
2. Attach `13-A-gaze-hi` as the generated skin + gaze bar.
3. Generate the ECU first. Do not build the grid until the ECU passes.
4. Body / wardrobe / turnaround after. If a body panel fails the face
   bar, crop to neck or regen — do not keep the cousin.
5. Any still meant as a Seedance first frame: mid-action, one exposure.
6. Copy keepers to the job folder. Never leave finals only in
   `.cursor/projects/.../assets`.
