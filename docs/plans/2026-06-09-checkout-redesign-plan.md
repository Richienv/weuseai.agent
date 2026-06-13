# Checkout Redesign Implementation Plan

> **For Claude:** Execute task-by-task with TDD. Design: `docs/plans/2026-06-09-checkout-redesign-design.md`.

**Goal:** Fix the hero→checkout package flow ("Paket tidak dikenali") and make checkout calm —
catalog-driven slugs end-to-end, one clean total, a payment-method popup, cruft copy removed.

**Architecture:** Single source of truth = the v1.4 tier catalog. The client (`checkout.html`) and the
authoritative server (`supabase/functions/_shared/types.ts` `PLANS`, used by `create-invoice`) both
recognize the 5 sellable v1.4 slugs; a legacy alias (`starter→voice-starter`, `pro→done-for-you`,
`studio→library-full`) keeps old links working. The hero pricing cards link to `/checkout?plan=<slug>`.

**Tech:** static `checkout.html` (vanilla JS), Deno Edge Function (`create-invoice-handler.ts`),
React-via-CDN landing (`index.html`), node:test (`tsx --test`).

**Sellable slugs + charged setup (IDR):** `bare` 99k · `solo` 399k · `voice-starter` 599k ·
`library-full` 799k (anchor 999k, display only) · `done-for-you` 1.299k. Monthly 99k all tiers.

---

### Task 1: Server `PLANS` recognizes v1.4 slugs (fixes `invalid_plan`)

**Files:** Modify `supabase/functions/_shared/types.ts:14-18` (PLANS); `create-invoice-handler.ts`
(resolve legacy alias before the `body.plan in PLANS` check at :205 and the `PLANS[plan]` reads at
:150/:159). Test: `tests/create-invoice-v14-plans.spec.ts`.

- **RED:** test asserts `create-invoice` accepts each of the 5 v1.4 slugs (no `invalid_plan`) and
  computes the charge from the v1.4 `setupIdr` (e.g. `done-for-you` → 1_299_000 + 99_000 hosting),
  and that legacy `pro` resolves to `done-for-you`'s amount.
- **GREEN:** PLANS gets the 5 canonical entries (`setupIdr`, `setupOldIdr` only for library-full =
  999_000 else = setupIdr, `displayName`). Add `LEGACY_ALIAS = {starter:'voice-starter',
  pro:'done-for-you', studio:'library-full'}`; in the handler resolve `plan = LEGACY_ALIAS[p] ?? p`
  before validation/lookup.
- Verify amount is recomputed server-side (do NOT trust client amount). Commit.

### Task 2: `checkout.html` PLANS = v1.4 catalog (+ legacy alias) + drift gate

**Files:** Modify `checkout.html:690-718` (PLANS) + `readURL` (:800-810, resolve legacy + default).
Test: `tests/checkout-plans-drift.spec.ts` (source-grep checkout.html for the 5 slugs + prices,
assert they match the v1.4 figures; assert NO `cicilan`/`bnpl`).

- PLANS keyed by the 5 v1.4 slugs: `{name, thumb, title, sub, price, anchor?}`. `anchor` ONLY on
  `library-full` (999_000). Remove the fake `old:` anchors on the others.
- `readURL`: resolve legacy alias, default to `voice-starter` (cheapest voiced) if absent/unknown
  (NOT `pro`). Unknown slug → default + (optionally) a gentle note, never a hard error.
- Drift test red→green. Commit.

### Task 3: `checkout.html` calm page — one clean total, kill cruft

**Files:** Modify `checkout.html` summary/total render (:839-948), HTML lines :459, :468 (planOld),
:542 (fee-explainer), :547 (promo — keep), :671-682 (footer).

- Total = setup + first-month hosting + **default (QRIS) fee folded** → single "Total hari ini Rp X".
  Remove the itemized "Payment method fee" line and the `fee-explainer` paragraph (:542).
- Strikethrough: render `planOld`/anchor ONLY when `plan.anchor` exists (library-full); hide otherwise.
- Footer: remove "Payments by **weuseai.agent**" (:672) and "Dioperasikan oleh Richie Kidnovell…"
  (:680). Keep Syarat/Privasi/Kontak links + refund-policy line + "Secure payment · TLS encrypted".
- Soften error copy: `invalid_plan` message → calm ("Paket belum kepilih — balik ke harga, pilih lagi ya").
- Commit.

### Task 4: Payment-method popup (QRIS · E-wallet · VA · Card)

**Files:** Modify `checkout.html` METHODS (:730-793 — delete `cicilan` + `bnpl`), GROUPS (:795 —
delete `cicilan` group), the method-list render (:844-910), the Bayar button (:659), add a modal.

- METHODS = exactly `[qris, ewallet, va, card]`. GROUPS = `[instan, transfer]`.
- Move the method list into a **modal** (`#payModal`, hidden by default, focus-trapped, Esc/overlay
  closes, `aria-modal`). The page no longer shows methods inline.
- "Bayar" (`#payBtn`) opens the modal instead of submitting. Modal lists the 4 methods (default QRIS);
  selecting updates the modal confirm button to the real per-method total ("Bayar Rp Y via <method>");
  confirm runs the existing invoice-create + Xendit submit (PRESERVE that logic + TOS gating + error
  handling untouched).
- Page "Total hari ini" reflects the QRIS default; modal reflects the chosen method.
- Commit.

### Task 5: Hero pricing CTAs → checkout

**Files:** Modify `index.html` pricing-card objects (~:8355-8412). The 3 existing paid cards
(`voice-starter`, `library-full`, `done-for-you`): change `ctaHref` from `wa.me/...` to
`/checkout?plan=<slug>` (use each card's `slug`). Enterprise card (if present) stays WhatsApp/mailto.

- Note: `bare`/`solo` cards aren't on the landing yet (landing redesign is the rest of PR2) — but the
  checkout + server already accept them, so adding those cards later "just works".
- Commit.

### Task 6: Verify + ship

- `npm test` green; new specs pass; `npm run typecheck:all` adds no new errors (verify vs baseline).
- **Preview-verify** `checkout.html` for each slug (`?plan=done-for-you`, `?plan=voice-starter`,
  `?plan=bare`): correct package + total renders, popup opens/picks/closes, no console errors,
  mobile width OK. Screenshot proof.
- Adversarial review pass (slug round-trip can't 'invalid_plan'; fee math; brand/copy; a11y of modal).
- PR → CI (docker-harness, drift gates) green → merge. Xendit stays TEST mode.
