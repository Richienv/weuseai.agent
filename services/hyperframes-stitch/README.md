# @weuseai/hyperframes-stitch

CLI to concatenate per-scene mp4 chunks (output of the `hyperframes-render` Edge Function) into a single video, applying HyperFrames transitions via local ffmpeg.

> Runs on customer VPS during a Video Producer agent's render flow. Founder can also run it locally for smoke tests.

## Why a CLI on customer VPS, not in the Edge Function

ffmpeg in Deno Edge Functions requires a ~30MB wasm bundle per invocation. Customer VPSes already have ffmpeg available (`apt install ffmpeg` is a one-line cloud-init addition). Running the stitch locally is faster, cheaper, and lets us return mp4 chunks to the customer's local fs without a Supabase storage round-trip.

## Install (one-time per machine)

```bash
# macOS
brew install ffmpeg

# Debian/Ubuntu (customer VPS)
apt install ffmpeg
```

## Usage

### Pattern 1: explicit args
```bash
npx hyperframes-stitch \
  --scenes scene1.mp4,scene2.mp4,scene3.mp4 \
  --transitions cut,whip-pan,fade-out \
  --durations 3.0,5.0,2.0 \
  --out merged.mp4
```

### Pattern 2: feed render-handler response (recommended)

The `/functions/v1/hyperframes-render` Edge Function returns a `stitch_recipe` field. Save the response to a file and pass it via `--recipe-json`:

```bash
# Customer's Hermes flow — pseudocode
RESPONSE=$(curl -X POST https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/hyperframes-render \
  -d "$(cat hyperframes-spec.json)")
echo "$RESPONSE" > /tmp/render-response.json

# (poll each job per RESPONSE.jobs[].job_id until succeeded; download mp4 to scene-N.mp4)
# ...

# Stitch
npx hyperframes-stitch \
  --scenes scene-1.mp4,scene-2.mp4,scene-3.mp4 \
  --recipe-json /tmp/render-response.json \
  --out merged.mp4
```

Scene paths must be in the SAME order as `jobs[]` in the recipe (same as `scenes[].scene_id` ascending).

## Transition vocabulary

Mirror of the HyperFrames JSON `transition_to_next` values:

| HyperFrames | ffmpeg primitive | Duration |
|---|---|---|
| `cut` | bare concat (no blend) | — |
| `match-cut` | bare concat (semantic only) | — |
| `whip-pan` | `xfade=transition=hblur` | 0.3s |
| `dissolve` | `xfade=transition=fade` | 0.5s |
| `fade-out` | `fade=t=out` on output | 0.5s (last scene only) |

## Fast path

When ALL transitions are `cut` or `match-cut` AND the last scene is not `fade-out`, the CLI uses a bare ffmpeg concat (no xfade chain). This is faster and avoids re-encoding artifacts.

When any non-bare transition is present, falls back to `xfade` chain with cumulative offsets.

## Testing

Pure-logic tests cover the ffmpeg argv builder (no real ffmpeg invocation):

```bash
npm test
```

Live ffmpeg tests run only when `WEUSEAI_HYPERFRAMES_LIVE=1` is set + ffmpeg is installed.

## Status

Phase 4-2 v0 — covers the 5 HyperFrames transitions; bare-cut fast path; xfade fallback. Phase 4.5+ may add audio cross-fading for transitions and per-scene audio cue overlays.
