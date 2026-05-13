# Tokopedia integration — explicitly deferred for v1

**Date:** 2026-05-13
**Decision:** D5 — Tokopedia skipped for v1 Indonesian integrations broker.
**Source:** Locked in Sesi R kickoff after `docs/research/2026-05-13-indonesian-tools-integration.md` review.

---

## Decision

Tokopedia Seller API (now part of TikTok Shop Partner Center) is **not in scope** for the v1 integrations broker. Shopee Open Platform covers the e-commerce surface; Tokopedia adds rewrite risk + founder-touch cost without proportional customer-value unlock.

## Reasoning (3 points)

1. **Active TikTok Shop migration creates rewrite risk.** As of April 2024, Tokopedia's standalone developer portal redirected to TikTok Shop Partner Center. The new schema is post-migration but still actively evolving. Building today carries a near-certain rewrite cost when TikTok Shop stabilizes its API.

2. **Shopee covers 54% of the same audience with cleaner partner-approval path.** Indonesian e-commerce share 2025: Shopee 54%, Tokopedia + TikTok Shop combined 38-42%. Most Indonesian SMB sellers operate on both platforms simultaneously. Shopping Open Platform's "Third-Party Partner Platform" application has a published 24-hour Go-Live audit window vs. Tokopedia's manual business-team approval with no published SLA (community reports 2-6 weeks).

3. **SIUP + business-team manual approval is a founder-touch cost.** Tokopedia/TikTok Shop developer onboarding requires:
   - SIUP (Surat Izin Usaha Perdagangan — Indonesian business license)
   - Manual member-type selection (Third-Party Enabler / Seller / In-House / Third-Party)
   - Business-team validation queue with no published SLA
   - Indonesian-domiciled legal entity

   We currently don't have a PT (Sesi B closeout locked PT-deferral until first concierge customer signs OR Rp 50jt cumulative revenue). Building Tokopedia adds PT setup to the critical path.

## Re-evaluation triggers

This decision flips to "build" if EITHER:

### Trigger A — paying customer demand

A paying customer explicitly requests Tokopedia integration AND is willing to wait through the integration cost (SIUP, partner application, build time). Customer commits via:
- Pre-payment for Tokopedia setup (one-time fee, TBD pricing)
- OR signed waitlist with confirmed onboarding date once integration ships

### Trigger B — TikTok Shop schema stabilizes + spare bandwidth

Both conditions met:
- TikTok Shop Partner Center API has been schema-stable for 90 days (no breaking changes in changelog / community-reported regressions)
- Sesi A's hardening lane has spare bandwidth OR a dedicated implementer is available
- AND we have a PT entity in place (per Sesi B closeout PT trigger)

## What this doesn't mean

- We do NOT recommend customers stop selling on Tokopedia. They continue using Tokopedia's own seller dashboard manually.
- Our `/trade-pro` persona can still assist with Tokopedia-related tasks via general advice (pricing, listing copy, promotions) — just without API automation.
- Shopee integration (Slot 4 in research doc, also deferred behind Xendit/WhatsApp/OnlinePajak slots 1-3) covers most of the same automation surface.

## Reference

- Research doc: `docs/research/2026-05-13-indonesian-tools-integration.md` §3 (e-commerce findings) + §4 (priority ranking)
- TikTok Shop migration completion: [Jakarta Post, April 2024](https://www.thejakartapost.com/business/2024/04/04/tokopedia-integration-with-tiktok-shop-completed.html)
- TikTok Shop Partner Center: <https://partner.tiktokshop.com/docv2/page/overview>
- Sesi B closeout (PT-deferral trigger): `memory/sesi_b_closeout_2026_05_10.md`
