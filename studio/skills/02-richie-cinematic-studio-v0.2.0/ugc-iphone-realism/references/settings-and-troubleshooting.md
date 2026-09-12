# Settings & troubleshooting — the operations layer

This is the single home for settings, troubleshooting, and credit math. Everything below is
measured on a live Higgsfield account or pulled from high-volume operators. The prompt craft lives
elsewhere — see `iphone-look-and-realism.md` for the realism-lock stack and the six-part cluster,
`prompt-templates.md` for copy-paste templates, `prompt-libraries.md` for the asset/library URLs,
and `ugc-ad-structure.md` for the ad arc and hooks. This file owns the knobs: how you set them, how
you recover a bad render fast, how you hold a character across shots, and how you do all of it
without burning credits.

## Contents
- Technical settings (community-recommended)
- Instagram tech strip
- Prompt-engineering decision tree
- Consistency tricks (character, environment, voice)
- Credit-aware workflow

## Technical settings (community-recommended for max realism)

| Setting | Value | Reason |
|---------|-------|--------|
| Aspect | 9:16 | TikTok/Reels/Shorts native — non-negotiable for the platforms UGC ships to |
| Resolution | **720p** | Sharper texture on lens flare and ambient detail — counterintuitively better for UGC realism than 1080p, AND it's half the credits. Free win. |
| Duration | 8–12s | Hook + demo + proof + CTA. Content-driven, not cost-driven (see below) |
| Prompt length | 50–150 words | Too long = conflicting instructions that break the natural feel |
| Reference image | blurry/unclear person image | Prevents Seedance character-uniformity bias; also bypasses face-detection filters |
| Camera keyword | **"Filmed with iPhone"** (NOT "Shot on phone") | Stronger aesthetic trigger in Seedance's training |

**On 720p — say it out loud to yourself:** for UGC this is the one place where the cheap setting IS
the better-looking setting. 1080p is 9 credits/sec; 720p is 4.5 credits/sec (half) and the
community prefers it for the crisper grain on flares and ambient reflection. Don't default to 1080p
out of habit — that habit belongs to the cinematic skill, not here.

## Instagram tech strip

Paste at the bottom of the prompt for Reels delivery — it loads the exact phone-sensor vocabulary:

```
iPhone 15 Pro, 26mm lens, 24fps, natural HDR, handheld imperfections, autofocus breathing, subtle compression artifacts
```

9:16 is non-negotiable for Reels. The strip is most useful when the body of the prompt is light on
artifact cues — it backfills sensor behavior without bloating the scene description.

## Prompt-engineering decision tree (when outputs miss)

The rule before the rules: **give yourself two fast re-prompts, ~5 min total. If two rerolls don't
land it, stop re-prompting — change the reference image or the shot choice instead.** Re-rolling a
third time from the same prompt rarely converges; you're just spending credits to confirm the prompt
is fighting the model. Downstream edits (cutting, masking, fixing in post) cost more than fixing the
input.

Match the failure to the fix:

| Symptom | Fix → what to change |
|---------|---------------------|
| Framing wrong but action right | **re-prompt** — tighten Camera first (shot size + ONE movement); keep Subject and Action identical |
| Motion too wobbly / too speedy | **re-prompt** — swap handheld↔gimbal and set a speed; don't touch Style yet |
| Style/color drifts | **re-prompt** — replace the Style line with one stronger anchor; remove extra adjectives |
| Subject mutating (extra people / changing props) | **change reference** — simplify Subject to fewer descriptors, one noun |
| Artifacts repeat across 3 tries (hands/labels/flares) | **change constraints or shot plan** — a close-up may be fighting the model; step back to medium |

Change one axis per reroll. Changing Camera + Style + Subject at once tells you nothing about which
move helped.

## Consistency tricks (hold character, environment, and voice)

These exist because re-rolling a talking creator from scratch loses the face, the room, AND the
voice every time. Use the right trick per job:

- **Edit-and-Extend → character + environment + VOICE across one continuous beat.** Generate the
  first clip, feed it back, and prompt "extend this and make the actor continue saying…". This is
  the only reliable way to keep VOICE — even Veo 3 couldn't hold voice across separate generations.
  It's also the cheaper path: you're extending an approved clip, not gambling a fresh roll.
- **Blurry/unclear reference image → unique, consistent character without rejection.** A sharp
  close-up of a real person usually gets rejected by the face filter; a partially blurry image slips
  through AND produces a more distinct, more stable character (it sidesteps Seedance's
  character-uniformity bias that homogenizes faces toward a generic look).
- **Upload a shaky real iPhone clip → multi-shot campaigns with authentic phone energy.** Seedance
  preserves the original performance and wraps an AI layer over it, so the handheld motion and
  timing stay genuinely human across every shot in the set. This is the reference-of-choice when you
  need several shots to feel like the same person filmed them the same day.

## Credit-aware workflow

UGC cost is mostly fixed by content: a talking ad needs 8–12s for hook + demo + proof + CTA, so you
**cannot** shrink it to the 4s floor the way a silent cinematic beat can be trimmed. Manage spend on
the axes you control:

- **`get_cost: true` preflight (free).** Returns exact credits before you spend a single one. Run it
  whenever duration, resolution, or count changes — it costs nothing and prevents surprise burns.
- **count 1.** `count` is a flat multiplier (count 2 = 2× the credits). Roll one, judge it, reroll
  deliberately. Don't fan out count 4 hoping one lands.
- **720p.** Half the per-second cost of 1080p and the preferred look for UGC. Already covered above —
  it's the single biggest lever.
- **Nail the prompt first try, then Edit-and-Extend for consistency** rather than re-rolling whole
  clips from scratch. A from-scratch reroll pays full price and loses the voice; an extend keeps the
  character and costs less.
- **Generate stills at 2K on Nano Banana Pro.** It's a flat 2 credits regardless, so there's no
  reason to go lower — a clean keyframe saves rerolls downstream.

**On "batching":** parallel-submit + collective-poll + multi-shot-in-one-generation saves your
round-trips and tokens, NOT credits. Seedance pricing is linear per second, so batching never
discounts the render — reach for it to move faster, not cheaper.

Connector note: the Higgsfield connector (Seedance 2.0 + Nano Banana Pro) must be enabled or none of
the above runs.
