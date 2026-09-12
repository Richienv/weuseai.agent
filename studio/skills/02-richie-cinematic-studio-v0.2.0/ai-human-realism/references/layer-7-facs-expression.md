# Layer 7 — Facial Expression (FACS) and Emotional Signaling

The Facial Action Coding System (Ekman & Friesen) is the validated standard for decomposing facial
movement into **Action Units (AUs)** — observable contractions of specific muscles. ~44 AUs (~30
voluntary), each with intensity A (trace) → E (max). It's the most reliable framework for generating
and evaluating facial realism.

## Key Action Units for creators

| AU | Muscle | Effect |
|----|--------|--------|
| AU1 | inner frontalis | inner brow raise (sadness, worry) |
| AU2 | outer frontalis | outer brow raise (surprise) |
| AU4 | corrugator | brow lower/furrow (anger, concentration) |
| AU6 | orbicularis oculi (orbital) | cheek raise — the **Duchenne** marker |
| AU7 | orbicularis oculi (palpebral) | lid tightening (anger, threat) |
| AU12 | zygomaticus major | lip-corner pull (smile) |
| AU17 | mentalis | chin raise (disgust, sadness) |
| AU25 | depressor labii | lips part |
| AU43/45 | orbicularis oculi | eye closure / blink |

## The Duchenne smile rule (most important finding)

A genuine smile = **AU12 (lip corners up) + AU6 (cheek raise that crinkles under/around the eyes).** A
fake smile is AU12 only — which is exactly why AI smiles look plastic: the eyes don't respond.
```
genuine Duchenne smile, lip corners raised, cheeks raised, crinkles at the outer corners of the eyes,
warmth reaching the eyes
```

## Eye-over-mouth ratio

Humans read emotion more from the **eyes/brow** than the mouth. Systems that drive expression only from
the mouth miss the subtlety. Prioritize upper-face control: brow position, lid tension, eye crinkle.
For any emotion, specify what the **brow and eyes** do, not just the mouth.

## Micro-expressions (video)

Brief (~1/15–1/25s) involuntary flashes of true emotion before masking. Prompting `micro-expression
flicker, brief involuntary expressions, authentic emotional leakage` can raise perceived genuineness in
video.

## Translate emotions to AUs (examples)

- Genuine joy: AU6 + AU12.
- Sadness: AU1 + AU4 + AU15 (lip corners down), gaze down.
- Surprise: AU1 + AU2 + AU5 (upper-lid raise) + AU25/26 (jaw drop).
- Anger: AU4 + AU5 + AU7 + AU23 (lip tighten).
- Concentration: AU4, steady gaze, slight lid tension.

Describe the muscles, not the label, and the expression lands instead of looking pasted on.
