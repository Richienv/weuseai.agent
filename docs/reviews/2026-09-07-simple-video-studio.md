# Simple Video Studio

## Design decision

The main flow is prompt, optional photos/audio, Generate, then loading/failure/video and Download. Remove the sidebar, skill modes, take selection, templates, prompt library, stage checklist and permanent help paragraphs. Seedance 2.5 and Wan 3.0 share a compact native model picker, with Seedance selected by default. Format and duration share one small settings sheet. History opens on request. Reference thumbnails carry tappable tags, with autocomplete and matching highlight colors in the prompt.

Palette: ink #090a0c, panel #15171b, edge #2b2f37, paper #f3f4f6, muted #a1a6b0, signal #829aff. Use the existing Inter font with a 32/22/16/13 scale. White is the main action; restrained blue indicates active work. No decorative grids or badges.

Desktop: left-aligned compact composer beside the current result. Mobile: one primary screen at a time, composer before submission and result immediately afterward; no floating toolbar or bottom overlay. Controls have 44px touch targets.

```text
Mobile                  Desktop
Video         Riwayat   Video                               Riwayat
Buat video              Buat video             Current result
[Prompt           ]     [Prompt          ]      [video/status]
[Foto] [Audio]          [Foto] [Audio]          [Download]
[references       ]     [references      ]
Seedance / 9:16 / 6 dtk  Model / format / duration
[Generate  $1.39  ]     [Generate        ]
```

The previous green composer and large step dashboard repeated the same status. This revision removes that repetition; status appears in the result, and connection errors appear only when actionable.

## Provider decision

Simple requests offer Seedance 2.5 (the default requested by the user) and Wan 3.0 via the existing Monid account. The explicit selection persists across reload; switching keeps the prompt and uploaded references, and reuse restores the original model. Estimates and reference validation follow the selected model. Both accept image and audio references, with MP4 output and up to 30 seconds. Old jobs keep their bound provider model and run. No automatic provider fallback or repeated paid submission.

Source: https://www.alibabacloud.com/help/en/model-studio/wan3-video-generation-api-reference

Monid Seedance 2.5 contract: 30 reference images; 10 audio clips; clips 2–30 seconds with at most 30 seconds of audio and 30 seconds of video separately. The existing 720p estimate is $1.156 per 5 output seconds. New simple requests validate durations on both frontend and backend.

Monid Wan 3.0 contract: 10 reference images; 5 audio clips; audio clips 1–15 seconds, at most 15 seconds combined with any reference video. At 720P, estimate $0.10 multiplied by output plus reference clip seconds. Frontend normalizes photos to JPEG and decodable audio to WAV. Actual character likeness still needs a successful render and visual review; attaching reference material is not proof of likeness.

## Verification

- Full regression suite after reference tagging: 2,923 passed, 33 skipped, zero failures. The 79 focused tests include both Monid adapters, tag binding, persisted source prompts, input validation, estimates, and bundle freshness; main TypeScript check passed.
- Twenty-four browser scenarios passed at desktop size and 390×844: plain prompts, compact settings, default and saved model choices, model switching without losing references, per-model audio limits, pasted reference handles, filename search, keyboard and thumbnail insertion, fast typing, highlight scrolling, replacement, deletion, and reuse, real photo/audio upload bytes, reference cost calculation, automatic binding, double-click prevention, reload recovery, stable playback, actual MP4 download, playback recovery, connection loss, history/reuse, explicit failure, interrupted uploads, and ambiguous submissions.
- The browser checks use synthetic jobs and the existing repository MP4. They do not prove a new provider render or character likeness.
- Main TypeScript check passed. The wider Supabase check reports only the existing BufferSource incompatibility in `ai-video-capability.ts:120`; that file is byte-identical to the original checkout and is outside this change.
- The actual migration was executed against local PostgreSQL via PGlite: existing library models remained valid, Wan was accepted, an invalid model was rejected, and an existing Seedance run was unchanged.
- The compiled browser bundle is approximately 46 KB, with a dedicated stylesheet that does not change the other admin pages.

Reliability inherited from the 6 September change is retained: stable submission IDs, no automatic paid replay, bounded polling, persistent MP4 storage, and status recovery. Simple polling skips the unused template/character libraries and signs reference previews only when requested. Source photos and audio stay visible when reused; interrupted uploads persist as failed draft attachments and block generation until resolved.

## Reference tags

`@Image1`, `@Image2`, `@Audio1` and existing video references bind to specific assets. Each attachment owns its handle. Replacing its file keeps the handle; removing it leaves mentions unresolved and blocks Generate until corrected. Upload counters persist, so deleted slots cannot silently become another subject. Prompts pasted before upload can bind to the first attached files in order.

The composer uses a native textarea with a synchronized color mirror. Typing `@` opens a list searchable by tag or filename; keyboard selection and clicking a thumbnail insert at the current cursor. IME composition retains normal typing. Image tags use #b7c7ff and audio tags #efc78f against the existing dark palette. The reference strip scrolls horizontally on mobile, and editing a filename replaces that attachment. Character sheets use the normal photo path; this change does not generate new character sheets.

Submission validates every handle against the attached files before sanitizing the prompt. Handles are mapped in one pass to the actual URL-first/path-second submission order, numbered separately for images, video and audio. Source prompts and original handles live in the existing job usage JSON for history/reuse; this requires no new database migration. Provider status updates retain this metadata.

The current Monid Seedance 2.5 schema was inspected on 7 September 2026 and explicitly specifies `@Image1` / `@Audio1` in content-array order. Wan uses `Image 1` / `Audio 1`, with each media type counted independently, so both Monid adapters translate the canonical handles for Wan. See the [Wan API reference](https://www.alibabacloud.com/help/en/model-studio/wan3-video-generation-api-reference). Character guidance keeps each character and voice assigned to its reference and treats multiple sheet views as one subject, while following explicit reference roles in the user's prompt.

Verification covers mixed uploaded/remote assets, duplicate and dangling handles, non-cascading swaps, high numbered draft handles, provider payload order, job persistence, autocomplete, replacing/removing files, and recovery after reload. These checks establish binding correctness; they do not establish rendered likeness. The Seedance route still has the provider's documented real-face input restriction, recorded in the reliability review.

## Local review

Run `STUDIO_PREVIEW=1 STUDIO_PREVIEW_PORT=8816 node scripts/studio-ui-smoke.mjs`. The preview banner labels simulated data; demo requests do not use Monid or spend credits.

## Activation

Production access remains blocked as recorded in the 6 September reliability review. No production migration, deployment, paid generation, or account change was performed.

Apply the previous reliability migration and worker scheduling configuration first, then `20260907010000_operator_wan_library.sql`. Deploy the updated worker before the API/static bundle so the worker recognizes Wan jobs. Existing jobs must keep their model and provider task ID. The new UI defaults to Seedance 2.5 with Wan 3.0 available; it does not automatically switch providers after a failed request.

Before declaring production ready, use scoped access to the correct Supabase project to verify the selected job, worker schedule, a successful photo/audio render, actual character likeness, and stored-result download. A successful API request alone does not satisfy that check.
