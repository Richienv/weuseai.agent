// Pure handler for hyperframes-render. Web Platform APIs only.
//
// Spec: docs/plans/2026-05-09-phase-4-spec.md (Phase 4-2, Q2=A
// Runway primary + Pika fallback).
//
// Contract:
//   POST /functions/v1/hyperframes-render
//   Body:  RenderRequest (see ./render-providers/types.ts)
//   200:   RenderKickoffResponse — { jobs[], cost_estimate, stitch_recipe }
//   400:   { error: 'invalid_json' | 'invalid_input' | 'no_provider' }
//   405:   { error: 'method_not_allowed' }
//   502:   { error: 'provider_unavailable', detail: string } (kickoff failed)
//
// Auth model: customer's Hermes runtime calls this from VPS. Phase 4-2
// v0 doesn't gate by JWT — relies on customer providing valid render
// API keys (which themselves are gated by the provider). Phase 4.5
// will add tier-check via JWT-role pattern (mirrors invoice-generator
// flow per 2E-3 PR #6).
//
// Why Phase 4-2 v0 doesn't store the api_keys server-side: that would
// require a SQL migration (add encrypted columns to customers table)
// and we don't yet have SUPABASE_ACCESS_TOKEN for autonomous Management
// API access. Customer's Hermes holds the key in its own .env and
// passes it per request. Phase 4.5+ migrates to encrypted storage when
// the token arrives.

import {
  pickProvider,
  validateHyperFramesInput,
  type RouterDeps,
} from './render-providers/router.ts'
import type {
  IRenderProvider,
  RenderJob,
  RenderKickoffResponse,
  RenderRequest,
} from './render-providers/types.ts'

export type HyperFramesRenderDeps = {
  router: RouterDeps
}

export async function handleHyperFramesRender(
  req: Request,
  deps: HyperFramesRenderDeps,
): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  let body: RenderRequest
  try {
    body = (await req.json()) as RenderRequest
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  // Validate the HyperFrames input itself.
  const validationErr = validateHyperFramesInput(body.hyperframes)
  if (validationErr) {
    return json({ error: 'invalid_input', detail: validationErr }, 400)
  }

  if (!body.api_keys || (!body.api_keys.runway && !body.api_keys.pika)) {
    return json(
      {
        error: 'invalid_input',
        detail: 'api_keys must include at least one of runway, pika',
      },
      400,
    )
  }

  // Route to a provider.
  const decision = pickProvider(body, deps.router)
  if (!decision.ok) {
    return json(
      {
        error: 'no_provider',
        detail: decision.reason,
        attempted: decision.attemptedProviders,
      },
      400,
    )
  }

  const { provider, apiKey } = decision

  // Pre-flight cost estimate (informational; we don't gate).
  const costPerSec = provider.estimateCost(body.hyperframes).usd_cents_per_sec
  const totalSec = body.hyperframes.scenes.reduce(
    (s, sc) => s + sc.duration_sec,
    0,
  )
  const totalCents = Math.round(totalSec * costPerSec)

  // Kick off all scenes in parallel. We catch per-scene errors so
  // partial-success kickoffs report cleanly.
  const kickoffs = await Promise.allSettled(
    body.hyperframes.scenes.map((scene) =>
      provider.startScene({
        scene,
        aspect_ratio: body.hyperframes.metadata.aspect_ratio,
        apiKey,
      }),
    ),
  )

  const jobs: RenderJob[] = []
  const failures: { scene_id: number; error: string }[] = []
  for (let i = 0; i < kickoffs.length; i++) {
    const r = kickoffs[i]
    if (r.status === 'fulfilled') {
      jobs.push(r.value)
    } else {
      failures.push({
        scene_id: body.hyperframes.scenes[i].scene_id,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      })
    }
  }

  if (jobs.length === 0) {
    return json(
      {
        error: 'provider_unavailable',
        provider: provider.name,
        detail: failures,
      },
      502,
    )
  }

  // Build the stitch recipe for the customer's Hermes to consume.
  const stitchRecipe = buildStitchRecipe(body.hyperframes, jobs)

  const response: RenderKickoffResponse & {
    failures?: typeof failures
  } = {
    jobs,
    cost_estimate: {
      usd_cents: totalCents,
      provider: provider.name,
      note: `${provider.name}: ${(totalCents / 100).toFixed(2)} USD estimated for ${totalSec.toFixed(1)}s of video (matched via ${decision.reason})`,
    },
    stitch_recipe: stitchRecipe,
    ...(failures.length > 0 ? { failures } : {}),
  }
  return json(response)
}

/** Build the ffmpeg recipe instructions the customer's Hermes uses
 *  AFTER polling all jobs to success. The actual stitch runs on the
 *  customer's VPS via `services/hyperframes-stitch/` CLI; we just
 *  report what to feed it. */
function buildStitchRecipe(
  hyperframes: RenderRequest['hyperframes'],
  jobs: RenderJob[],
): RenderKickoffResponse['stitch_recipe'] {
  return {
    transitions: hyperframes.scenes.map((s) => ({
      scene_id: s.scene_id,
      transition: s.transition_to_next,
    })),
    total_duration_sec: hyperframes.metadata.total_duration_sec,
    cli_hint:
      `npx hyperframes-stitch ` +
      `--scenes <scene1.mp4>,<scene2.mp4>,... ` +
      `--transitions cut,match-cut,... ` +
      `--out merged.mp4`,
  }
}

export async function pollAllJobs(
  jobs: RenderJob[],
  provider: IRenderProvider,
  apiKey: string,
): Promise<{ done: boolean; results: ReturnType<typeof providerToStatus>[] }> {
  const results = await Promise.all(
    jobs.map(async (job) => {
      const status = await provider.pollJob({ job, apiKey })
      return providerToStatus(status)
    }),
  )
  const done = results.every((r) => r.terminal)
  return { done, results }
}

function providerToStatus(status: ReturnType<IRenderProvider['pollJob']> extends Promise<infer T> ? T : never): {
  scene_id: number
  status: 'queued' | 'processing' | 'succeeded' | 'failed'
  mp4_url?: string
  error?: string
  terminal: boolean
} {
  switch (status.status) {
    case 'queued':
      return { scene_id: status.job.scene.scene_id, status: 'queued', terminal: false }
    case 'processing':
      return {
        scene_id: status.job.scene.scene_id,
        status: 'processing',
        terminal: false,
      }
    case 'succeeded':
      return {
        scene_id: status.job.scene.scene_id,
        status: 'succeeded',
        mp4_url: status.mp4_url,
        terminal: true,
      }
    case 'failed':
      return {
        scene_id: status.job.scene.scene_id,
        status: 'failed',
        error: status.error,
        terminal: true,
      }
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  })
}
