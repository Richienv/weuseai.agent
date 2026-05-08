// pdf-render-handler — Phase 2E-3.
//
// Spec: docs/plans/2026-05-08-phase-2e-3-spec.md (Q1 = Cloudflare Browser
// Rendering, locked).
// Sub-spec: docs/plans/2026-05-08-phase-2e-3-pdf-renderer-decision.md
//
// Pure handler — takes input HTML + a renderer function (CF Browser
// Rendering API client) + an uploader (Storage). Returns a signed URL
// for the rendered PDF.
//
// Kept I/O-free for unit-testability. The deno-serve entrypoint at
// supabase/functions/pdf-render/index.ts wires the real CF API call +
// real Storage upload.

// ─── input shape ────────────────────────────────────────────────────────

export type PdfRenderInput = {
  /** Pre-rendered HTML string. Must be self-contained (inline CSS, no
   *  external <link> stylesheets the renderer can't reach). */
  html: string
  /** Storage object key. Defaults to a uuid-based name when absent. */
  storage_path?: string
  /** Render options forwarded to the renderer. */
  format?: 'A4' | 'Letter'  // default A4
  /** Margin in CSS units (e.g. '20mm', '0.5in'). Default '15mm'. */
  margin?: string
}

// ─── output shape ───────────────────────────────────────────────────────

export type PdfRenderResult =
  | {
      ok: true
      body: {
        signed_url: string
        path: string
        bytes: number
        expires_at: string
      }
    }
  | {
      ok: false
      status: number
      error: string
      detail?: string
    }

// ─── injected dependencies ──────────────────────────────────────────────

export type PdfRenderer = (
  html: string,
  opts: { format: 'A4' | 'Letter'; margin: string },
) => Promise<
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string; detail?: string }
>

export type PdfUploader = (args: {
  path: string
  bytes: Uint8Array
  contentType: 'application/pdf'
}) => Promise<{ signed_url: string; expires_at: string }>

// ─── handler ────────────────────────────────────────────────────────────

/**
 * Default Storage path uses a slug + a 6-char random suffix to avoid
 * collisions when many invoices render in the same minute. Caller can
 * override via input.storage_path.
 */
function defaultStoragePath(): string {
  const ts = new Date().toISOString().slice(0, 10).replaceAll('-', '')  // YYYYMMDD
  const rand = Math.random().toString(36).slice(2, 8)
  return `pdf-renders/${ts}/${rand}.pdf`
}

export async function pdfRenderHandler(
  input: PdfRenderInput,
  renderer: PdfRenderer,
  uploader: PdfUploader,
): Promise<PdfRenderResult> {
  // ── Input validation ────────────────────────────────────────────────
  if (typeof input?.html !== 'string' || input.html.length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_html',
      detail: 'html field must be a non-empty string',
    }
  }
  if (input.html.length > 5_000_000) {
    // 5MB hard cap. CF Browser Rendering's request body limit is ~10MB
    // total; 5MB of HTML leaves plenty of headroom for our wrapper +
    // metadata. Bigger HTML is almost certainly a bug.
    return {
      ok: false,
      status: 413,
      error: 'html_too_large',
      detail: `html is ${input.html.length} bytes; max is 5MB`,
    }
  }
  const format = input.format ?? 'A4'
  if (format !== 'A4' && format !== 'Letter') {
    return {
      ok: false,
      status: 400,
      error: 'invalid_format',
      detail: `format must be 'A4' or 'Letter'; got '${format}'`,
    }
  }
  const margin = input.margin ?? '15mm'

  // ── Render ─────────────────────────────────────────────────────────
  const rendered = await renderer(input.html, { format, margin })
  if (!rendered.ok) {
    return {
      ok: false,
      status: 502,
      error: 'render_failed',
      detail: rendered.error + (rendered.detail ? `: ${rendered.detail}` : ''),
    }
  }

  // PDF magic bytes: 0x25 0x50 0x44 0x46  ("%PDF").
  if (
    rendered.bytes.length < 4 ||
    rendered.bytes[0] !== 0x25 ||
    rendered.bytes[1] !== 0x50 ||
    rendered.bytes[2] !== 0x44 ||
    rendered.bytes[3] !== 0x46
  ) {
    return {
      ok: false,
      status: 502,
      error: 'render_returned_non_pdf',
      detail: `expected PDF magic bytes; got ${rendered.bytes.slice(0, 4)}`,
    }
  }

  // ── Upload ─────────────────────────────────────────────────────────
  const path = input.storage_path ?? defaultStoragePath()
  let uploaded: { signed_url: string; expires_at: string }
  try {
    uploaded = await uploader({
      path,
      bytes: rendered.bytes,
      contentType: 'application/pdf',
    })
  } catch (e) {
    return {
      ok: false,
      status: 500,
      error: 'storage_upload_failed',
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  return {
    ok: true,
    body: {
      signed_url: uploaded.signed_url,
      path,
      bytes: rendered.bytes.length,
      expires_at: uploaded.expires_at,
    },
  }
}
