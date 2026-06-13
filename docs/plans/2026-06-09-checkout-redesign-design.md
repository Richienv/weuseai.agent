# Checkout redesign + hero→checkout package flow — Design

**Status:** Approved (founder, 2026-06-09). Next: writing-plans → implement.

**Problem:** The checkout is broken and busy. Hero pricing CTAs point at WhatsApp, not
checkout; `checkout.html` only knows the OLD slugs (`starter`/`pro`/`studio`) with stale prices;
`create-invoice` validates against a server `PLANS` (`supabase/functions/_shared/types.ts`) — any
slug not in it returns `invalid_plan` → **"Paket tidak dikenali"** (the "can't continue" bug). The
page also itemizes scary processor fees and carries cruft copy.

**Goal:** A calm, simple checkout where the hero sends the correct v1.4 package, the slug lines up
end-to-end, and the user picks a payment method in a small popup — not a wall of fee math.

## Decisions (founder, AskUserQuestion 2026-06-09)
- **Payment methods:** keep **QRIS · E-wallet · VA · Card**; remove **Cicilan + BNPL**.
- **Fees:** one clean "Total hari ini" with the (default-method) fee folded in — no itemized
  "Payment method fee" line, no "fees ditanggung pelanggan" paragraph.
- **Method selection:** popup picker opened by "Bayar" (page stays calm).
- **Hero:** all 5 paid-tier cards link to `/checkout?plan=<v1.4-slug>` (enterprise stays WhatsApp).

## Design

1. **Single source of truth.** Both `checkout.html` `PLANS` and the server `PLANS` recognize the 5
   sellable v1.4 slugs (`bare` 99k / `solo` 399k / `voice-starter` 599k / `library-full` 799k /
   `done-for-you` 1.299k), monthly 99k. Only `library-full` carries the never-charged ~~999k~~
   anchor (`setup_fee_anchor_idr`); no invented anchors elsewhere. A drift test pins
   checkout ↔ catalog. The slug the hero sends = the slug checkout shows = the slug the server
   accepts.

2. **Hero → checkout.** The 5 pricing-card `ctaHref`s change `wa.me/...` → `/checkout?plan=<slug>`.
   Enterprise card stays "Hubungi Sales" (WhatsApp/mailto).

3. **Calm page.** Package summary + ONE "Total hari ini Rp X" (setup + first-month hosting + default
   QRIS fee folded, no itemization) + "lalu Rp 99rb/bulan" + email + agree-to-terms. Remove the
   fake strikethroughs (keep only library-full's real anchor) and the processor-fee paragraph.

4. **Payment popup.** "Bayar" opens a modal: QRIS · E-wallet · VA · Card (default QRIS). Selecting a
   method updates the modal's confirm total (real per-method total, fee folded) → proceed to Xendit.
   Cicilan + BNPL removed from `METHODS` + `GROUPS`.

5. **Copy cleanup.** Remove "Payments by weuseai.agent", "Dioperasikan oleh Richie Kidnovell…",
   soften the error tone. Keep Syarat/Privasi/Kontak, the refund-policy line, "Secure payment".

6. **Tests.** Slug round-trip (hero slug → checkout PLANS → server PLANS accepts it, no
   `invalid_plan`); payment-method set is exactly {qris, ewallet, va, card}; checkout↔catalog
   price/slug drift gate.

**Out of scope / unchanged:** Xendit stays TEST mode (real-money needs the prod-key rotation,
founder call). Landing redesign + FOMO mechanic remain the rest of "PR 2".
