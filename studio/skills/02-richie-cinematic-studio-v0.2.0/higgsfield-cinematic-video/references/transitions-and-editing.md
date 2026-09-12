# Transitions & editing — change the world at the cut, not inside the take

The AI **morph/cross-dissolve** is the single loudest "this is fake" signal. Real films almost never
morph; they **cut**. A great transition is an *editing* decision between two clean shots, designed so
the cut feels intentional and slick. This is how you do a "transformation" without any melting.

## Never do this

- Feeding a video model two different keyframes (past person → future person) and asking it to blend.
- Asking a single clip to dissolve day→night or child→adult.
- Long cross-fades between mismatched shots.
These produce the drifting, gooey look the audience reads as AI instantly.

## Do this instead — real transition techniques

**1. Match cut (the workhorse).** End shot A and begin shot B on the same shape, motion, or framing,
then hard-cut. Example: A ends as he starts to turn his head left; B starts mid-turn in the new
time/place and completes it. The brain stitches it into one continuous motion — the world has changed
but the movement is unbroken. This is the right way to do a glow-up/past→future.

**2. Cut on action.** Hard-cut in the middle of a strong movement (a step down, sitting, a hand swipe).
Motion masks the cut; it feels energetic and deliberate.

**3. Whip-pan / motion blur transition.** Shot A ends with a fast pan (blur); shot B starts with a
matching fast pan settling into the new scene. Cut at peak blur. Reads as a snappy in-camera move.
(Shoot the whip as part of each clip, or add it in the edit.)

**4. Object/foreground wipe.** Something crosses the lens and momentarily fills frame — a passing
person, a pillar, a flag edge, a hand. Cut while the frame is covered; reveal the new scene as it
clears. Clean, cinematic, and easy to hide a cut behind.

**5. Light/flash cut.** A motivated flash (camera flash, lightning, headlight sweep, a hard step into
shadow→light) bridges A and B at the bright/dark frame. Use sparingly.

**6. Sound-led cut.** Let audio carry across the cut (a beat drop, a breath, a whoosh). Cutting picture
on a sound hit makes even a plain cut feel designed.

## How to build them in practice

- Shoot each shot so its **first and last frames** are transition-friendly: plan shot A to end on the
  motion/shape that shot B will continue. You control this by how you write the ACTION and where the
  camera move ends.
- For a match cut, generate A and B from keyframes that share framing/scale, with the same camera
  move direction, so the cut lines up.
- Assemble in an editor:
  - Quick cuts: `ffmpeg` concat of the trimmed clips.
  - Whip/flash/wipe finesse, speed-ramps, and sound: the user's NLE (CapCut/Premiere/Resolve), or
    describe the exact edit so they can do it in seconds.
- Speed-ramp into and out of the cut (ease-in, fast at the cut, ease-out) for the modern reel feel —
  this is an edit, not a generation.

## Sound design (half of "high budget")

A clip lives or dies on audio. Even a perfect picture feels fake when silent or scored with stock.
- Layer: ambience (room tone, wind, city), foley (footsteps, cloth, breath) on the action, and one
  music bed.
- Land the transition on a music/sfx hit (whoosh, impact, bass drop).
- If using dialogue, prefer **voiceover** over on-camera lip-sync (lip-sync is a tell).

## Continuity across shots (so it's one film, not three clips)

- Same grade, grain, and aspect on every shot.
- Consistent wardrobe, lighting direction, and lens family unless a cut intends a change.
- Keep eyelines and screen direction consistent (if he looks frame-left in A, he's still oriented
  frame-left after the cut) so it feels authored.

The payoff: change anything you want — time, place, age, mood — but do it **on a cut** masked by motion,
an object, or a sound. That's indistinguishable from a high-budget edit, because it *is* one.
