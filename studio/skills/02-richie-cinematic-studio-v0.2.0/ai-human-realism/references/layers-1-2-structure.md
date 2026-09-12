# Layers 1–2 — Structure: Skeleton + Muscle/Fat (the inner architecture)

These are the deepest, least-prompted, and most-determinant layers. If they're wrong, no surface
detail can save the image. Fix here first.

## Layer 1 — Skeleton (proportion, silhouette, weight)

The skeleton is the ground truth all other layers reference. It sets head-to-body ratio, limb ratios,
and how weight is carried.

**Bony landmarks** (bone directly under skin — the non-negotiable proportion anchors):
zygomatic arch (face width), clavicle + sternum (shoulder/chest), iliac crest (waist-to-hip),
patella (leg anchor), ulna (forearm silhouette).

**Weight & balance (contrapposto):** a real standing figure at rest is never square — one hip rides
higher, one shoulder drops, weight favors one foot. Square, evenly-weighted stances read as
mannequins.

Prompt vocabulary:
```
anatomically correct proportions, correct head-to-body ratio, natural weight distribution,
contrapposto stance, weight shifted onto [left/right] foot, one hip slightly raised, relaxed balance
```
Common failures to counter: stretched/short limbs, misaligned or impossible joints, both feet flat
and evenly weighted (stiff), oversized or undersized head.

## Layer 2 — Muscle + Fat (volume and tension)

Muscle sits on the skeleton and creates the 3D volume — but **fat and skin thickness sit on the
muscle**, and that's what most AI humans are missing.

Surface-driving muscle groups (don't memorize all; these move the silhouette):

| Region | Key muscles | Surface effect |
|--------|-------------|----------------|
| Torso | pectorals, serratus, obliques | chest volume, ribcage, waist taper |
| Back | trapezius, latissimus | shoulder width, V-taper |
| Arms | deltoid, biceps, triceps | arm shape, flexion bulges |
| Legs | quadriceps, hamstrings, gastrocnemius | thigh mass, calf definition |
| Face | masseter, temporalis, orbicularis | jaw, cheek, mouth structure |

**The "shrink-wrap" problem** — the single most reliable AI tell at this layer: skin rendered as if
vacuum-sealed straight onto muscle, with every fiber visible and zero softness. Real bodies have
**subcutaneous fat and tissue thickness** that softens muscle and pools in body- and gender-specific
places: lower abdomen, thighs/inner knee, posterior upper arm, hips/buttocks, under the chin and cheeks.

Prompt vocabulary:
```
subcutaneous fat softening muscle definition, natural tissue thickness, soft skin padding over muscle,
realistic body fat distribution, not shrink-wrapped, soft transitions between muscle groups
```
Use sparingly for very lean/athletic subjects, but never to zero — even shredded bodies have skin
thickness and soft transitions. A totally fatless render always looks synthetic.
