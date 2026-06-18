# Round-3 ultracode QA + conversion audit — findings & triage (2026-06-17/18)

Workflow `wt58y23b6` (16 agents, 7 grounded dimensions → adversarial verify → synthesis).
**Verdict:** shipReady=false, "close but not clean-ship — no brand-lock or broken-page issues, 5 cheap P1s + 12 P2 polish." 23 raw → 22 confirmed.

## Triage legend
- **FIX** — safe, in-scope, applied this run (gate-green + verified + committed).
- **FLAG** — real but a founder-decision (conversion/funnel/marketing call) or touches an out-of-scope file; NOT auto-applied.
- **KEEP** — judged not-a-defect on review; rationale recorded.

---

## FIX (applied)

### faq.html
- **faq-missing-favicon-asset** (P1) — line 9 pointed at `/assets/favicon.svg` which does not exist → 404 tab icon. My error when I authored faq.html. → replace with index.html's 4-line icon block (`assets/logo.svg` + the 3 PNGs, relative paths) + `theme-color`.
- **faq-247-self-contradiction** (P1, honesty) — answer at "Kenapa bayar hosting" said base VPS "jalan terus 24/7", contradicting the Always-On answer that sells 24/7 as the paid differentiator (and CLAUDE.md's auto-suspend-after-30d model). → drop the absolute "terus 24/7" so 24/7 is promised only by the Always-On answer.
- **faq-missing-og-twitter-meta** (P2) — no OG/Twitter/theme-color. → add the block mirroring use-cases.html, url `https://weuseai.id/faq`.
- **footnote-contrast-below-aa** (P2, a11y) — `.foot-note` rgba .45 (~4.18:1) on legal attribution text. → .62.
- copy-dup (faq-standalone-hosting-dup / faq-cancel-refund-dup, P2) — **KEEP** (see below).

### use-cases.html
- **usecases-stale-domain** (P1, SEO) — canonical/og:url/og:image/twitter:image on `weuseai-agent.vercel.app` while index+faq moved to `weuseai.id`. → repoint the 4 URLs to weuseai.id. (Sitewide note: checkout/welcome/contact/privacy/terms/onboarding/refund-policy still carry vercel.app URLs — those are out-of-scope funnel/legal pages → FLAGGED as a separate sweep.)
- **usecases-ogurl-html-suffix** (P2) — og:url had `.html` vs clean canonical. → drop suffix.
- **usecases-essentials-5-use-case** (P1, copy) — cost card said "Total buat semua 5 use case" on a 40-framed page (stale from the old 5-per-profession layout). → "Operasional bulanan biasa (token AI + WhatsApp gateway)."
- **usecases-hero-double-intro** (P2, brevity) — compress the ~35-word italic re-intro.

### index.html + assets/app.jsx
- **library-tier-247-outcome + comparison-247-row** (P2, honesty) — "VPS dedicated 24/7" / "agent kerja 24/7" / comparison "Jalan 24/7…" stated 24/7 as a baseline guarantee when base auto-suspends and 24/7 is the Always-On add-on. → qualify/reword to stay honest (consistent with the faq fix).
- **text-white-45-prose-contrast / footnote** (P2, a11y) — bump prose `text-white/45` → `/55` at the real-prose instances (CtaFooter disclaimer, italic disclaimers, eyebrows). Decorative `·` separators left as-is.
- **carousel-invalid-tab-pattern** (P2, a11y) — `role=tablist/tab` with no tabpanel/aria-selected. → `role=group` + keep `aria-current`.
- **blurtext-no-space-nodes** (P2, a11y) — per-word spans with no space text node (SR/copy run words together). → `aria-label` full text on the heading + `aria-hidden` on the word spans.
- **hero-input-typed-wraps-mobile** (P2, responsive) — `.db-input-typed` lacked nowrap/clamp → long prompts wrap + grow the 40px input row on 390. → add nowrap/overflow/ellipsis.
- **mux-hls-no-preconnect** (P1→really P2, perf) — Stats Mux HLS + hls.js (jsdelivr) handshake cold at hydration; only fonts preconnected. → add `preconnect stream.mux.com` + `dns-prefetch cdn.jsdelivr.net`.
- **dotted-video-metadata-fetch-on-mount** (P2, perf) — 7 `<DottedVideo preload="metadata">` fetch metadata for all 7 bg mp4s at first paint (in-view gate only toggles play()). → `preload="none"` (sampler needs play() frames anyway).
- **dead-hero-video-const** (P2, cleanup) — `HERO_VIDEO` const (CloudFront url) defined, never used. → delete.

---

## FLAG for founder (NOT auto-applied)

- **hero-cta-dumps-cold-traffic-on-priciest-tier (P0) + split-purchase-funnel (P1)** — THE most important finding. The hero primary CTA "Aktifkan asisten kamu" (app.jsx:2861), the footer CTA (5157), and the mobile sticky CTA (5361) all link to bare `checkout.html` with **no `?plan=`**. checkout.html defaults a param-less visit to `done-for-you` (Siap Pakai, **Rp 1.299jt** — the priciest self-serve tier). So a cold Instagram visitor who taps the first button lands on a payment screen for the most expensive plan, before any price context. MEANWHILE every pricing-card CTA routes to **WhatsApp** manual onboarding — two contradictory funnels for the same product. WORSE: checkout.html's pre-JS static markup (lines 503-514) hardcodes **stale v1.2 numbers** (`Rp 1.398.723` / "Pro plan" / strikethrough `Rp 2.500.000` → `Rp 1.290.000`) that flash on slow mobile until JS overwrites — sticker shock + wrong prices for a 3-second audience. The verifier also confirmed the code comment at app.jsx:4004-4010 ("checkout/create-invoice still speak old slugs only") is **STALE** — checkout.html PLANS + create-invoice already speak the v1.4 slugs at correct prices, so self-serve checkout IS live.
  - **Why flagged, not fixed:** this is a revenue-funnel + checkout decision (which path cold traffic takes), and the stale-pricing flash is in `checkout.html` which is HARD-LIMIT off-limits. Auto-rewiring the primary conversion path or editing checkout is exactly what I must not do unsupervised.
  - **Recommended fix (your call):** EITHER (A) point hero/footer/sticky CTAs at `#pricing` so visitors choose a tier first and converge on one funnel; OR (B) wire each pricing card's CTA to `checkout.html?plan=<slug>` (slug already on each tier object) to unify on the live self-serve flow AND make the plan explicit so it never defaults to the 1.299jt tier. Either way: (1) fix checkout.html lines 503-514 stale v1.2 pre-JS prices, and (2) delete/correct the stale comment at app.jsx:4004-4010. I can do the app.jsx side of whichever you pick in minutes once you decide; checkout.html needs your go-ahead.
- **no-risk-reversal-at-decision-point (P2)** — nothing near the pay CTA reduces perceived risk on the upfront setup fee (399rb–1.299jt). The honest, already-true line "Setup tetap kamu punya kalau berhenti" (FAQ) could be echoed as CTA microcopy, or a refund-window line if /refund-policy grants one. Adding marketing copy near the pay CTA is a conversion/marketing-claim call → your decision.

## KEEP (not a defect on review)
- **faq-standalone-hosting-dup (Q5/Q6) + faq-cancel-refund-dup (Q7/Q11)** — flagged as redundancy, but on a FAQ page some overlap is correct: visitors jump to a single question and each answer should stand alone. Q5≠Q6 (subscription-vs-onetime vs why-pay-hosting) and Q7≠Q11 (berhenti vs refund-window) are distinct questions. Kept standalone; only the honesty edit to the hosting answer applied.

## Sitewide note (out of scope this run)
- Canonical/OG domain migration to weuseai.id is INCOMPLETE: checkout/welcome/contact/privacy/terms/onboarding/refund-policy.html still carry `weuseai-agent.vercel.app`. Funnel/legal pages are off-limits this run → a separate sitewide canonical-domain sweep for the founder.
