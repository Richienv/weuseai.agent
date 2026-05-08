# Phase 2E-3 sub-spec: PDF renderer choice (LOCKED + VERIFIED 2026-05-08)

> **Decision (locked):** Cloudflare Browser Rendering.
> **Verification (passed 2026-05-08):** rendered the live invoice template via CF API, programmatically inspected the resulting 35KB PDF — Bahasa text, Rupiah formatting (`Rp 8.900.000` with `.` thousands separator), em-dashes, curly quotes, math totals all preserved correctly. Producer: Skia/PDF m126 (HeadlessChrome 126).

This doc captures (a) why we chose CF Browser Rendering, (b) the verification protocol + result, (c) the fallback decision tree if a future regression breaks rendering.

---

## Context

Phase 2E-1 shipped `invoice-generator-handler` returning HTML + a signed Storage URL. Acceptable for the founder + first 1-2 concierge customers, but production invoices need PDFs. Phase 2E-3 adds a PDF rendering wrapper.

Three candidates evaluated:

| Option | Cost (per-render economy at 100k/mo) | Ops burden | Vendor lock-in | Bahasa font support |
|---|---|---|---|---|
| **Cloudflare Browser Rendering** | $5/mo flat for 100k req on Workers Paid plan | Zero | Modest (managed Chromium API) | Headless Chromium → system fonts on the underlying OS, equivalent to "render in someone's Chrome" |
| **Browserless.io** | ~$0.001/render PAYG, $50/mo for 100k | Zero | Low (also Chromium-based) | Same Chromium underneath; mature service with documented font handling |
| **WeasyPrint** | $0/render but VPS hosting + ops | High | None (open source) | Has its own renderer (not Chromium); CSS subset; Bahasa text fine but font-stack handling is per-distro and we'd babysit it |

---

## Why CF Browser Rendering

**Cost.** $5/mo flat covers all reasonable invoice volume in 2026 (100k renders = 333 invoices/day, well above any 1-100 customer projection). Browserless at $50/mo is 10× more for the same managed Chromium. WeasyPrint is "free" but the operational cost of self-hosting + monitoring + font-pack maintenance dwarfs the SaaS spend at our scale.

**Stack alignment.** `services/proxy/` already runs on Cloudflare Workers (`liren-proxy`). The founder has a working CF account + Wrangler login. Adding Browser Rendering is one additional binding, not a new vendor relationship.

**Failure semantics.** Cloudflare's edge network is unlikely to be the weakest link in our stack. If CF is down, OpenRouter is probably also struggling, and the customer's Hermes can't reach its LLM either. Single-vendor fail-together is an acceptable risk profile.

**Reversibility.** The handler at `supabase/functions/_shared/pdf-render-handler.ts` is renderer-agnostic — `PdfRenderer` is an injected function, not an inline CF call. If verification fails or CF degrades later, swapping to Browserless is a 30-LOC client change in `cloudflare-browser-rendering.ts` (rename + new fetch URL + new auth header), not a refactor.

---

## Why NOT Browserless (yet)

**Cost ratio.** 10× more per request for what is essentially the same managed-Chromium service.

**No existing relationship.** Adding Browserless means a new vendor onboarding (signup + payment method + secret rotation + invoicing). Phase 2E-3 has 6 days of scope; new vendor onboarding adds half a day of friction we don't need.

**Reserved as fallback.** If the CF verification (next section) surfaces font issues or quality gaps that we can't fix via CSS tweaks, we swap to Browserless. The handler abstraction makes this a 1-day pivot.

---

## Why NOT WeasyPrint

**Operational cost dwarfs LLM cost at our scale.** Self-hosting means:
- Choosing a host (Fly.io / Cloudflare Container / our existing VPS)
- Bundling fonts (DejaVu Sans, Liberation, etc.) — not pre-installed on minimal Linux
- CSS subset edge cases (older WeasyPrint versions don't support flexbox; layout drift between Chromium and WeasyPrint is a known friction)
- Monitoring + on-call when it crashes

We'd save ~$5/mo of CF cost in exchange for a service we maintain. Bad trade. Bring back if we hit 10k+ paying customers AND CF cost becomes meaningful.

---

## Verification gate — protocol

Before Day 2 implementation begins, the founder (or anyone with a CF API token) runs this verification:

### Step 1 — Set CF Edge Function secrets

```sh
# Founder runs once, on their local box, against staging Supabase project:
supabase secrets set \
  CLOUDFLARE_ACCOUNT_ID=<from dashboard.cloudflare.com → top-right account ID> \
  CLOUDFLARE_API_TOKEN=<from dashboard.cloudflare.com → My Profile → API Tokens → Create Custom Token>
# API token needs the "Workers Browser Rendering" permission, scoped to the same account.
```

### Step 2 — Render the existing invoice template HTML

There's a verification script at `scripts/verify-cf-pdf-rendering.ts` (to be added with this PR). Founder runs:

```sh
CLOUDFLARE_ACCOUNT_ID=... \
CLOUDFLARE_API_TOKEN=... \
  npx tsx scripts/verify-cf-pdf-rendering.ts > /tmp/verification.pdf
open /tmp/verification.pdf
```

### Step 3 — Visual checklist

Open the PDF and confirm:

- [ ] Bahasa text renders without missing-glyph boxes:
  - "Invoice yang dibuat oleh agent kamu"
  - "Klien: PT Maju, Tbk."
  - "Ditagihkan ke" (label)
  - "Jatuh tempo" (label)
- [ ] Rupiah formatting: `Rp 3.330.000,00` shows with the correct decimal/thousands separators (Indonesian locale uses `.` for thousands, `,` for decimals).
- [ ] Special chars: em-dash (`—`), curly quotes (`"…"`), `&` ampersand all render as the right glyphs.
- [ ] Layout: header + parties grid + items table + totals + footer, no clipping or visual breakage at the page boundary.
- [ ] Font: clean sans-serif (system fallback acceptable since the template uses `-apple-system, BlinkMacSystemFont, 'Segoe UI'`).

### Step 4 — Decision

- **All checkboxes pass:** lock CF Browser Rendering. Proceed to Day 2 implementation.
- **Any checkbox fails:**
  1. **Font issue specifically:** add `@font-face` declarations to the invoice template pointing at a hosted Inter or Noto Sans Bahasa font. Re-render. If still broken, escalate.
  2. **Layout / Rupiah / em-dash issue:** likely template HTML/CSS, not renderer-specific. Fix template, re-render.
  3. **Truly bad output (renderer can't handle this template):** escalate to founder. Switch to Browserless: change `supabase/functions/_shared/cloudflare-browser-rendering.ts` to call Browserless's `/pdf` endpoint instead. Same I/O contract; ~30 LOC delta.

---

## What ships in Phase 2E-3 regardless of verification result

The handler abstraction means most of the code is renderer-agnostic. Whether verification picks CF or escalates to Browserless, these still ship:

- `supabase/functions/_shared/pdf-render-handler.ts` (pure handler, no I/O)
- `supabase/functions/_shared/cloudflare-browser-rendering.ts` (CF client) OR equivalent Browserless client
- `supabase/functions/pdf-render/index.ts` (deno-serve entrypoint)
- `pdf-renders` Storage bucket (30-day TTL)
- `invoice-generator-handler` upgrade: HTML → PDF (calls the new pdf-render Edge Function)
- Resend email integration (PDF attachment delivery)
- Tests: pdf-render-handler.spec.ts (passes regardless of renderer) + integration test against the chosen renderer

---

## API shape gotcha (caught during verification)

CF Browser Rendering's `/pdf` endpoint accepts a narrow set of top-level keys: `html`, `url`, `viewport`, `gotoOptions`, `screenshotOptions`, `emulateMediaType`, `addStyleTag`, `addScriptTag`, etc. It does **NOT** accept page-level options like `format`, `margin`, `printBackground`, or a nested `pdf` config object — those return `HTTP 400 "unrecognized_keys"`.

Practical consequence: the endpoint always renders at the browser default (A4 page, default browser print margins). For the invoice template that's fine; if a future template needs custom page size, inject `@page` CSS via `addStyleTag` instead of trying API-level params.

`cloudflare-browser-rendering.ts` accepts `format` + `margin` in the type contract for handler parity, but they're effectively ignored against this endpoint. Documented inline.

## History

- **2026-05-08:** founder locks CF Browser Rendering pending Q1 verification gate. Sub-spec doc created.
- **2026-05-08 (later same day):** verification PASSED. 35KB PDF, all checklist items confirmed via `pdftotext` extraction. CF Browser Rendering locked as the renderer. Day 2 implementation proceeds.
