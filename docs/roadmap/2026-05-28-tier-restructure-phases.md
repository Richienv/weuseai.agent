# Tier restructure — Phase B (Voice) + Phase C (Web App)

Status: marker doc for future sprints. Phase A (the 4-tier feature-bundle
restructure) shipped 2026-05-28. Phase B + C are the FEATURE UNLOCKS that
fill in the `features.voice` and `features.web_app` flags that Phase A
introduced as flags-only.

## Context from Phase A

Phase A replaced the count-based 3-tier ladder (starter/pro/studio) with a
4-tier feature matrix:

| Tier | Personas | Setup | features {voice, web_app, custom_build} |
|---|---|---|---|
| voice-starter | 3 | Rp 699rb | {true, false, false} |
| library-full | 10 | Rp 899rb | {true, false, false} |
| done-for-you | 8 | Rp 1.299jt | {true, true, false} |
| enterprise | custom | quote | {true, true, true} |

The `features` object is the single gate Phase B/C read. NO tier-slug
rename is needed for either phase — the unlocks ship within these same
slugs. Source of truth: `supabase/functions/_shared/tier-personas.ts`
(`TIERS`).

The old slugs (starter/pro/studio) are deprecated aliases that still
resolve via `resolveTier()`. They are NOT removed in Phase A; a separate
cleanup PR removes them once the live provisioning chain + xendit-webhook
stop emitting them.

---

## Phase B — Voice Integration

Gate: `features.voice === true` (all four current tiers have voice today —
the flag exists so a future cheaper text-only tier can set it false).

Pipeline (Telegram voice ↔ agent text):

1. **Inbound:** customer sends a Telegram voice note → download the OGG
   via the Bot API → Whisper STT → text → feed to Hermes as a normal
   message. STT runs server-side (platform-paid or BYOK, TBD).
2. **Outbound:** agent text reply → Google Cloud TTS → OGG/MP3 → send back
   as a Telegram voice message. Tier-gated on `features.voice`.
3. **Per-persona voice IDs:** each persona slug maps to a TTS voice
   (e.g. the-pro → a calm baritone, social-conductor → brighter). Stored
   alongside PERSONA_META. Indonesian-language voices preferred.
4. **Cost + cutoffs:** voice minutes are metered; define a per-month soft
   cap per tier before this ships. BYOK option for heavy users.

Wiring lives in a Telegram-webhook middleware step BEFORE the message
reaches Hermes (inbound) and AFTER the reply (outbound). NOT wired in
Phase A — flags only.

Open questions:
- STT/TTS provider billing model (platform-paid vs BYOK vs hybrid).
- Voice-note length cap + transcription failure UX.
- Whether voice is opt-in per customer or always-on when the flag is set.

---

## Phase C — Web App Integration

Gate: `features.web_app === true` (today: done-for-you + enterprise).

Scope:

1. **Web app picker:** customers on web_app-enabled tiers choose from a
   catalog of web apps the `web-app-builder` / Web Creator persona can
   stand up (workout tracker, finance dashboard, task board, project
   board, agent-monitoring dashboard, business eagle-view, market-trend
   board). Picker mirrors the onboarding persona picker pattern.
2. **Subdomain deploy:** each selected web app deploys to a per-customer
   subdomain (e.g. `<customer>.app.weuseai.agent`). Static + lightweight
   API; hosting cost folded into the existing monthly fee or an add-on.
3. **Web Creator API control:** the agent drives the web app via a control
   API (create/update views, push data) so the web app stays in sync with
   what the agent does in chat.

NOT wired in Phase A — `features.web_app` is a flag only. done-for-you +
enterprise carry the flag; the picker + deploy pipeline + control API are
Phase C deliverables.

Open questions:
- Subdomain provisioning (Vercel project per customer vs shared multi-tenant).
- Per-app data model + RLS isolation.
- Whether the web app picker is part of onboarding or a post-onboarding
  dashboard action.

---

## Deferred cleanup (separate PR, not B or C)

Remove the deprecated `starter` / `pro` / `studio` slugs once:
- the live provisioning chain (cloud-init, setup-script, bundle-pull,
  tier-bump, Vultr/DigitalOcean providers) emits only new slugs, and
- the `xendit-webhook` handler maps checkout plans to new slugs, and
- no test rows / DB rows carry the old slugs.

Until then, `resolveTier()` + the alias map are the compatibility shim.
