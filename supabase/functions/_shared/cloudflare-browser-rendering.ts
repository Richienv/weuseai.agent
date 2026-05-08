// Cloudflare Browser Rendering REST client.
//
// Spec: docs/plans/2026-05-08-phase-2e-3-spec.md (Q1 locked).
// Sub-spec: docs/plans/2026-05-08-phase-2e-3-pdf-renderer-decision.md
//
// CF Browser Rendering exposes a /pdf endpoint that takes HTML and
// returns a PDF. We use the simplest path (HTML → PDF, no JS needed
// since invoice templates are static-rendered server-side).
//
// API docs: https://developers.cloudflare.com/browser-rendering/rest-api/pdf-endpoint/
//
// Endpoint:
//   POST https://api.cloudflare.com/client/v4/accounts/<account_id>/browser-rendering/pdf
//   Auth: Bearer <api_token>
//   Body: { html, viewport?, addStyleTag?, addScriptTag?, ... }
//
// Returns: PDF bytes (Content-Type: application/pdf) on 200.
// On error: JSON { success: false, errors: [...] } with appropriate status.

// ─── env ────────────────────────────────────────────────────────────────

// @ts-ignore — Deno global available at runtime
declare const Deno: {
  env: { get(key: string): string | undefined }
}

const CF_ACCOUNT_ID = () => Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
const CF_API_TOKEN = () => Deno.env.get('CLOUDFLARE_API_TOKEN')

// ─── implementation ─────────────────────────────────────────────────────

export type CfRenderOpts = {
  format: 'A4' | 'Letter'
  margin: string
}

export type CfRenderResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string; detail?: string }

/**
 * Render an HTML string to PDF bytes via Cloudflare Browser Rendering.
 *
 * Reads CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN from Edge Function
 * env. Both must be set; on missing config we fail fast with a clear
 * error rather than calling the API with empty credentials.
 *
 * Network failures, non-200 responses, and "success: false" error
 * payloads all map to `{ ok: false }` with as much detail as possible
 * for the caller to log + record telemetry.
 */
export async function renderPdfViaCloudflare(
  html: string,
  opts: CfRenderOpts,
): Promise<CfRenderResult> {
  const accountId = CF_ACCOUNT_ID()
  const apiToken = CF_API_TOKEN()
  if (!accountId || !apiToken) {
    return {
      ok: false,
      error: 'cloudflare_env_missing',
      detail:
        'CLOUDFLARE_ACCOUNT_ID and/or CLOUDFLARE_API_TOKEN not set in Edge Function env',
    }
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/pdf`

  // CF Browser Rendering /pdf body shape:
  //   {
  //     html: '...',
  //     viewport: { width, height },        // optional
  //     pdf?: {                             // optional rendering opts
  //       format: 'A4' | 'Letter',
  //       margin: { top, right, bottom, left }
  //     }
  //   }
  //
  // We pass `format` + uniform margins. Other PDF tunables (header/
  // footer, page numbers, scale) deferred — invoice template doesn't
  // need them.
  const body = {
    html,
    pdf: {
      format: opts.format,
      margin: {
        top: opts.margin,
        right: opts.margin,
        bottom: opts.margin,
        left: opts.margin,
      },
    },
  }

  let r: Response
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return {
      ok: false,
      error: 'cloudflare_fetch_failed',
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  if (!r.ok) {
    let detailText = ''
    try {
      detailText = (await r.text()).slice(0, 400)
    } catch { /* swallow */ }
    return {
      ok: false,
      error: 'cloudflare_http_error',
      detail: `HTTP ${r.status}: ${detailText}`,
    }
  }

  // Success path: response body is PDF bytes (Content-Type:
  // application/pdf). Read into a Uint8Array for the handler.
  const buf = new Uint8Array(await r.arrayBuffer())
  if (buf.length === 0) {
    return {
      ok: false,
      error: 'cloudflare_empty_response',
    }
  }

  return { ok: true, bytes: buf }
}
