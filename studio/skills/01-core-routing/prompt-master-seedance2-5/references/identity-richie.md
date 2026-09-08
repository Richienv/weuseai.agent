# Richie identity lock

Read this whenever the subject is **Richie** (the user / him / `<<<richie_*>>>`).
Paste the **FACE LOCK** into REFERENCES verbatim. Do not summarize it as
"same person as the still."

**Source of truth is his phone selfies, not a generated beauty plate.**
The first generated hero / 6-angle sheet looked *close* in isolation and
then poisoned every scene: the model slims him into a generic handsome
East-Asian / K-drama lead (especially when he smiles, laughs, or wears a
beanie that hides the hair). Scene stills that used those generated plates
as hero do **not** look like him. Real selfies do.

Same law as Renita: real crops first. Generated sheet is a helper only.

Image stills and video prompts use the same contract.

## Attachment order (do not reorder)

1. `<<<richie_hero>>>` — `richie-id-hero.png` — **real front selfie**
   (hotel/lobby, full face including mouth and chin). Face + hair 100%.
   Wins every conflict. Do not use a crop that cuts off the mouth.
2. `<<<richie_3q>>>` — `richie-id-hero-3q.png` — **real 3/4 selfie**.
3. `<<<richie_smile>>>` — `richie-id-hero-smile.png` — **real small smile**.
   Use this whenever he is happy / laughing so the smile cannot become a
   different person.
4. `<<<richie_raw>>>` — `richie-id-hero-raw.png` — uncropped front selfie.
   Same skull, stops beautify.
5. `<<<richie_soul>>>` — `richie-soul-pack.png` — real-photo pack. No
   AirPods. Cannot override the hero crop.
6. `<<<richie_sheet>>>` — `richie-id-sheet.png` — 6-angle helper only.
   Cannot override the real crops.
7. `<<<richie_body>>>` — `richie-id-body.png` — torso / full body only.
   Height **174 cm**, 68 kg. Face still comes from the real hero.
8. Scene stills / film screenshots — **camera, wardrobe, light, blocking
   only**. They donate **zero face**. Never "match this actor."

Never attach `richie-id-hero-studio.png` as a face source. If a scene still
and the real hero disagree, keep Richie's skull and restyle only clothes,
weather, and pose.

**Best scene proof (user-confirmed):** `shot04-sparklers.png` /
`richie-look-sparklers.png` — him holding sparklers. Attach this AFTER the
real selfies as corroboration of "this face in a scene." It cannot override
the hotel selfie. Prefer it over ski/beanie stills when generating new
frames.

## FACE LOCK — paste verbatim into REFERENCES

```text
<<<richie_hero>>> <<<richie_3q>>> <<<richie_smile>>> — Richie, 100%, from
phone selfies. Not a generic handsome East-Asian lead. Not a K-drama
plate. Not the actor in any scene screenshot.

Richie, 24, East Asian, 174 cm, 68 kg, lean-athletic.

ANTI-BEAUTIFY (the model will try these — forbid them):
Never slim the midface. Never lengthen the skull into a long oval idol.
Never V-line the jaw. Never gaunt the cheeks. Never thin or sharpen the
nose. Never enlarge the eyes into bright idol eyes. Never drop the sleepy
lid into a wide-awake K-drama stare. Never turn a laugh into a different
person. Never porcelain / beauty-filter skin. Never hide all the hair
under a beanie.

Skull: medium-width, slightly SHORT and FULL — not long-narrow. Real
fullness beside the mouth. Cheeks are not flat and not round-apple like a
child. Not a square K-drama jaw.

Forehead: medium. Natural hairline with a small center peak, not receding.

Hair: KEY LOCK whenever it is visible. Jet black. HIGH volume and lift on
the crown and front. Swept back and slightly to HIS left. Textured, not
gel-slick. Shorter sides, short nape, short sideburns. Profile is tall on
top. A beanie may sit on the crown but black hair must still show at the
forehead and temples. Never long bangs over the eyes, never a slick
side-part, never a bowl.

Brows: dark, medium-thick, gentle low arch, close to the eyes.

Eyes: KEY LOCK. Dark brown. Medium-small. Slightly sleepy / heavy upper
lid. Low crease. Not large bright idol eyes. Outer corners level.

Nose: KEY LOCK. Wider and more rounded than a model nose. Visible alae
from the front. Modest bridge. Rounded, not-sharp tip. Do not thin it.

Mouth: medium width. Soft Cupid's bow. Lower lip slightly fuller. Real
smile is SMALL and mostly closed, corners up a little — same skull as the
selfie. A laugh cannot change the nose or eye size.

Jaw / chin: medium tapered jaw, rounded corners. Chin medium and rounded.
Not a block, not pointed.

Ears: empty. No AirPods, no piercings, no jewelry.

Skin: real selfie skin. Pores. Small moles including near the left eye /
cheek. Not porcelain.

Body: 174 cm, 68 kg, lean-athletic.
```

## How to write it in the prompt

In REFERENCES, after the paste:

- `Face, skull, hair 100% as <<<richie_hero>>> + <<<richie_3q>>> + <<<richie_smile>>>.`
- If a scene file exists: `<<<scene>>> — composition / wardrobe / light /
  camera only. This file donates zero face.`
- In LOCKS, identity is lock 1:
  `Richie as <<<richie_hero>>> FACE LOCK from real selfies. Generated
  sheets and scene stills cannot replace the skull. Ears empty. Hair as
  hero unless a beanie covers only the crown — temples still show.`

## Still generation (image-to-video refs)

Same law. Attach **real** hero, then 3q, then smile, then soul. Put any
film screenshot last, marked composition-only. Do **not** attach the
generated studio hero as the face. If identity still drifts, drop the
screenshot and keep only real crops + a text description of blocking.

When he wears a beanie: pull it back so the black volume hair still reads.
When he smiles or laughs: lock to `<<<richie_smile>>>` — do not invent a
wide idol grin.

## What "looks like him" means

Pass if a stranger could match the real front selfie to the generated
frame on skull, hair volume, eye size, nose width, and mouth. Fail if it
only matches wardrobe and lighting, or if he looks like a cousin / K-drama
lead.
