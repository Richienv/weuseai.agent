# Video Studio reliability review

6 September 2026. Local implementation and verification; production activation pending.

## Verdict

The existing operator studio uses ByteDance Seedance through Monid, not the Higgsfield API. The generation contract, submission recovery, worker polling, and status UI needed repair. The code changes below are implemented locally. They do not remove BytePlus's restrictions on references containing real people.

The requested production job is `c371e6f9-5804-4caf-a787-78d4fcd6eec5`. Its database record remains unverified. Do not describe this particular job as fixed, failed for privacy reasons, or completed without reading its provider binding and current record.

## Evidence

| Finding | Evidence and implication |
|---|---|
| Provider mismatch | Both Monid clients post `provider: bytedance` to `/v1/video/seedance-2.5`. Higgsfield is a visual reference in the existing design document. |
| Prompt contract mismatch | Live `monid inspect` on 6 September reports `content[].text.maxLength = 6000`. The prior UI allowed 10,000; draft storage allows 100,000. Draft storage and generation limits are now separate. |
| Invalid first-frame parameters | The inspected endpoint requires `ratio: adaptive` for first-frame inputs. The old client always sent the UI's fixed ratio. The client now inherits the frame ratio and explicitly requests MP4 for Seedance 2.5. |
| Poll exhaustion | Browser refreshes previously triggered the worker every 1.5 seconds. Database claiming stopped at 40 polls without moving the job to an actionable terminal state. The new claim function enforces a 15-second interval and exposes exhausted synchronization separately from provider rejection. |
| Provider privacy rejection | A recent run visible through the existing Monid CLI returned outer `COMPLETED`, inner HTTP 400 with `InputImageSensitiveContentDetected.PrivacyInformation`, no output, and zero cost. This run was NOT verified as the requested job. The existing parser already handles this envelope; the misleading retry guidance in the UI was replaced. |
| Lost or repeated submissions | A dropped-response browser test produced repeated HTTP requests. Stable client request IDs plus a unique database index deduplicate these atomically. Attempt state is persisted before the billable provider POST. Ambiguous submissions are never automatically replayed. |
| Missing references | Previously, an unsignable reference was skipped. Generation now fails before the provider POST when any required reference cannot be signed. |
| Misleading status | Poll errors were suppressed; queued errors could appear as failed; a provider URL could light up the final step before durable storage; editing a new draft could change how an old job's failure was shown. These states now use explicit job evidence. |
| Mobile controls | Focusing the prompt hid Generate even when no virtual keyboard was present. Visibility now follows actual viewport contraction, and the navigation drawer is hidden until opened. |

## Implemented behavior

The desktop layout places the composer beside a persistent preview with status, stage, duration, estimated or actual cost, and job details. Mobile has a visible Generate control and a jump to the selected result. History can be filtered to running, completed, and failed jobs.

A job is ready only after its result is stored. An upstream URL without a stored result is shown as saving. Temporary polling failures preserve the last known state and show a connection warning. Broken video playback has a reload action. Signed media URLs stay stable during normal polling so playback does not restart.

Retrying a synchronization timeout resumes the existing provider run. It does not create another video. Cancellation is offered only before dispatch; a local cancel no longer pretends to stop a provider job already rendering. Reusing a job restores its prompt, settings, and reference roles without automatically generating.

The worker processes one claimed job per invocation with a five-minute lease, bounded provider requests, and structured logs containing job/run IDs but no credentials or prompts. Operator-only requests can return immediately using `EdgeRuntime.waitUntil`. A database schedule can continue processing while the browser is closed. This follows [Supabase background task support](https://supabase.com/docs/guides/functions/background-tasks) and [scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).

## Validation

- Full application suite: 2,901 passed; 33 skipped; zero failures.
- Focused operator/client/state suite: 74 passed before the final mobile-only correction; the affected UI tests were rerun afterward.
- PostgreSQL smoke test executed the actual claiming and dispatch function definitions: old 40-poll recovery, poll cadence, exhaustion, ambiguous-submission protection, request uniqueness, lease protection, missing scheduler configuration, URL validation, operator-only dispatch, and permission denial for anonymous callers.
- Browser smoke uses local synthetic jobs and an existing repository MP4. It covers status changes, prompt reuse, 6,000-character validation, stable playback, playback progress and errors, connection loss, double submission, ambiguous-response recovery, and the 390×844 mobile layout.
- Main TypeScript check passes. The wider Supabase check still reports a pre-existing `Uint8Array<ArrayBufferLike>` / `BufferSource` error in `supabase/functions/_shared/ai-video-capability.ts:120`. The identical error was reproduced in the original checkout before applying these changes.

Local smoke commands:

```sh
npm test
npm run typecheck
node scripts/studio-ui-smoke.mjs
# Requires Playwright and an installed Chrome (or PLAYWRIGHT_CHANNEL override).
node scripts/studio-db-smoke.mjs
# Requires @electric-sql/pglite, or STUDIO_PGLITE_MODULE pointing to its installed module.
```

`STUDIO_PREVIEW=1 STUDIO_PREVIEW_PORT=8816 node scripts/studio-ui-smoke.mjs` starts an interactive local fixture preview. Its banner identifies simulated data; it does not generate a paid video.

## Production activation order

1. Read the exact requested job record and its bound Monid run through access to the correct Supabase project. The connected Supabase tool denied this project; Vercel logs did not contain the job ID.
2. Apply `20260906010000_ai_video_operator_reliability.sql` before publishing the updated API. It adds the client request key, replaces the poll budget/claiming behavior, and installs an operator-only schedule. Do not deploy the new API before this schema exists.
3. Configure two Vault entries using the existing secret-management process: `ai_video_operator_worker_url` must be the exact project's `/functions/v1/ai-video-render-worker` URL; `ai_video_operator_worker_token` must authorize this server-only worker. Do not use a publishable/anonymous key. The dispatch function reports missing configuration as an explicit cron failure.
4. Deploy the updated `ai-video-render-worker`, then the Vercel admin/API/static bundle. Build the JSX bundle with `node scripts/build-studio.mjs` first.
5. Verify a cron invocation, selected-job status refresh, and retrieval/playback of a known successful stored result. Resume the requested job only if its existing run and state justify it. A provider-rejected run requires a corrected input or a compatible provider, not a synchronization retry.
6. For a future local Supabase CLI check of background work, enable `edge_runtime.policy = "per_worker"` in an isolated local configuration, as documented by Supabase. This setting was not changed in the shared project.

No production migration, deployment, new paid generation, budget change, or provider switch was performed during this review.

## Access blocker

Automatic approval review rejected exporting the complete production environment because that would export more credentials than the investigation required. No such export was made. The narrower read-only query for the requested job was also unavailable because the connected Supabase account lacks permission for this project. Production verification needs scoped access to that job and the necessary worker configuration.
