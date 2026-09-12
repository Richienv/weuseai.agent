# Full Production Workflow: assets to shotlist to scenes

Use this reference for multi-scene ads, recurring characters, recurring products/props, and continuity-critical films. Seedance 2.5 is the preferred prompt target; keep the same asset logic for 2.0 compatibility.

## Stage 1: build and lock assets first

Build the product, cast, locations, props, wardrobe/state variants, and position maps before animation. A video model cannot repair an ambiguous or drifting source design.

Use the strongest available still-image tool for each job:

- GPT Image 2 or Nano Banana Pro: product sheets, precise edits, prop turnarounds, UI-safe source plates, and schematic maps.
- Soul Cinema: photoreal character and cinematic concept stills.
- Cinematic Locations or the strongest location model available: environment sheets.
- Seedance: animate approved assets after the locks are stable.

### Product and prop sheets

Create clean, neutral-background turnarounds showing every angle needed by the action. Lock silhouette, materials, colors, seams, controls, and proportions. Avoid relying on generated text or logos; composite exact branding in post.

### Character references

Create:

- One clear identity master.
- Useful face angles, preferably as separate single-face files.
- Full-body front and rear references for build and wardrobe.
- Separate assets for state changes such as wet/dry, clean/damaged, athletic/everyday, or age variants.

If a composite sheet causes drift, reduce it to one face and keep rear/body views face-free. Identity clarity beats reference density.

### Environment sheets

Use 2-3 views of each recurring location. Include a 3/4 angle so the model understands depth and camera travel. Lock architecture, materials, windows, practical-light positions, time of day, and weather.

### Schematic maps

For exact spatial relationships, build a top-down map with named subjects, distances, scale ratios, entrances, and direction of travel. Use maps for storefront layouts, vehicle positions, crowd lanes, or any prop that must stay fixed across cuts.

## Naming convention

Use the exact same handle in:

1. The element list supplied to the director.
2. Higgsfield Elements or uploaded media labels.
3. Every prompt that cites the asset.

Examples:

```
@hero
@boss
@product
@product_turnaround
@hero_wet
@kitchen
@street
@street_schematic
```

Never cite an unavailable handle. Map attachment order to `@image1`, `@image2`, and so on in every standalone prompt.

## Stage 2: write the shotlist

Attach the script and the locked assets. Build:

- One Reference Map.
- One immutable Style paragraph.
- One continuity ledger.
- Narrative prompts for exact story beats.
- Coverage-montage prompts only where editorial variety adds value.

Use heavy references for narrative continuity and lighter references for montage invention. Read `seedance-2-5-prompting.md` for the exact 2.5 contract.

## Stage 3: generate and edit

Generate approved blocks scene by scene. Do not animate assets that have not passed identity, product, and composition review.

For every paid request, state:

- Model/version.
- Aspect ratio and resolution.
- Duration.
- Count.
- Narrative versus coverage mode.
- Expected total credits if preflight is available.

After generation:

1. Pull the strongest source ranges.
2. Diagnose failed blocks; do not rerun unchanged prompts.
3. Bridge linked blocks on matching frames and sound tails.
4. Add music, captions, logos, UI, prices, and legal text in post.
5. Normalize, grade, grain, mix, and export locally.

## Choreography and recurring motifs

Write physical movement beat by beat. Replace generic instructions such as `he dances` with foot placement, weight transfer, shoulder isolation, hand action, timing, and recovery.

Use a recurring visual or sound motif to connect scenes: a headphone tap, door latch, breath, notification tone, hand gesture, or repeated camera move. Match-cut that motif when it strengthens the edit.

Do not feed a music track by default. Describe diegetic rhythm and add final music in post. Use an audio reference only when the user explicitly wants exact synchronization and the active model/tool supports it reliably.

## Continuity hierarchy

When trade-offs appear, protect continuity in this order:

1. Identity and face anatomy.
2. Product/hero-prop geometry.
3. Wardrobe and character state.
4. Location architecture and spatial positions.
5. Lighting/time/weather.
6. Secondary crowds and background action.

Keep secondary elements simpler and more distant when the primary lock is at risk.
