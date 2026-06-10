# weuseai.agent

Managed [Hermes](https://github.com/NousResearch/hermes-agent) agent hosting for Indonesian
customers. Pay a one-time setup fee, get a personal AI agent on your own VPS, delivered over
Telegram in Bahasa Indonesia — running in ~5 minutes.

- **Production:** https://weuseai-agent.vercel.app
- **Admin:** https://weuseai-agent.vercel.app/admin
- **Deep brief for contributors / Claude:** [`CLAUDE.md`](./CLAUDE.md) — read it first. This README is the
  human-facing quick-start; `CLAUDE.md` is the authoritative operating brief (architecture locks,
  business model, security gates, working conventions).

> We do **not** fork or build the agent runtime. We provision per-customer VPSes that run upstream
> Hermes (pinned `v0.13.0`) via config + middleware. See the architecture locks in `CLAUDE.md`.

---

## Architecture at a glance

| Layer | What | Where |
|---|---|---|
| Landing / funnel | Static HTML + React-via-CDN | `index.html`, `checkout.html`, `welcome.html`, `onboarding.html` |
| Admin dashboard | Manual provision, fleet, cost | `admin/`, `api/admin/` |
| Provisioning service | Spins up customer VPSes (Vultr SGP, DO failover) | `services/provisioning/` (Fly app `weuseai-provisioning`) |
| Edge Functions | Payments, onboarding, bundle-fetch, etc. | `supabase/functions/` |
| Tier catalog (SSOT) | Tier → personas + pricing | `supabase/functions/_shared/tier-personas.ts` |
| Agent personas | 10-persona library (skills + playbooks + templates) | `agent-packs/` |
| Database | Supabase (RLS-locked) | `supabase/migrations/` |
| Tests | Unit, drift gates, docker harness, e2e | `tests/` |

**Tier catalog is mirrored** to `api/_shared/tier-catalog.ts` and `admin/assets/admin-shared.js`;
drift gates (`tests/tier-personas.spec.ts`, `tests/admin-tier-catalog-drift.spec.ts`) keep all three
in lockstep. Change one, change all three.

---

## Pricing (v1.4, 2026-06-09)

| Slug | Name | Personas | Voice | Setup (IDR) | Hosting/mo |
|---|---|---|---|---|---|
| `bare` | Bare Agent | none (vanilla Hermes) | – | 99.000 | 99.000 |
| `solo` | Solo Starter | 3 (the-pro, doc-expert, slide-master) | – | 399.000 | 99.000 |
| `voice-starter` | Voice Starter | 3 (same 3) | ✓ | 599.000 | 99.000 |
| `library-full` | Library Lengkap | all 10 | ✓ | **799.000** (~~999.000~~ anchor) | 99.000 |
| `done-for-you` | Siap Pakai | 8 (Pro set) | ✓ | 1.299.000 | 99.000 |
| `enterprise` | Enterprise | custom | ✓ | contact | contact |

The `library-full` ~~999.000~~ is a **display-only anchor — never charged** (`setup_fee_anchor_idr`);
the charged amount is always `setup_fee_idr`. Prices stay at these levels post-launch (no fake expiry).

---

## Development

```bash
npm install                 # workspace install (npm workspaces)
npm test                    # full unit + integration + drift-gate suite (no Docker/network)
npm run typecheck:all       # tsc --noEmit across all packages

# Provisioning service against mocks (no Docker):
ENABLE_REAL_PROVISIONING=false VPS_PROVIDER=mock npm run local:prov-dev

# Full local Supabase stack (needs Docker):
npm run local:up            # supabase start
npm run local:fn-serve      # functions serve
```

**Local-first rule:** every code change goes through the local smoke before deploy. Vercel / Supabase /
Fly redeploy is *verification*, not iteration. See `CLAUDE.md` § Local-first iteration.

---

## Deploy

- **Landing + admin + API (Vercel):** auto-deploys on merge to `main`.
- **Provisioning service (Fly):** deploy via the GitHub Actions workflow (added 2026-06-07 — there
  was previously no Fly deploy automation, which let a merged fix sit un-deployed):

  ```bash
  gh workflow run deploy-provisioning.yml --ref main
  # or: Actions tab → "Deploy provisioning service (Fly)" → Run
  ```

  Verify: `fly releases -a weuseai-provisioning` shows the new version. The workflow builds on a
  GitHub runner (reaches Fly's builder reliably) and requires the repo secret `FLY_API_TOKEN`.

---

## Recent changes (2026-06-07 → 2026-06-09)

### v1.4 pricing — backend (PR #226)
Added two cheaper entry tiers (`bare` 99k vanilla Hermes, `solo` 399k 3-persona text-only) and reduced
`voice-starter` (699→599) and `library-full` (899→799, with the 999k display anchor). Fixed a **latent
Phase-A bug**: `/spin-up` rejected all canonical tier slugs (`VALID_TIERS` was legacy-only) even though
the admin form sends them — so new-slug provisioning had been broken. Added `resolveTierToSpecClass()`
so VPS spec/budget size by class while personas + voice resolve from the real canonical slug.
`bare` provisions as true vanilla Hermes (no personas, neutral SOUL, no voice).
*(Landing redesign + launch FOMO mechanic ship in a follow-up PR.)*

### Fly deploy workflow (PR #225)
Added `.github/workflows/deploy-provisioning.yml` — the missing deploy automation for the provisioning
service (see Deploy above).

### config.yaml model-block YAML fix (PR #223)
Root-caused a production incident where customers saw *"the model provider failed after retries."* A
pinned-Hermes config update changed the top-level `model:` key from a scalar to a nested dict, and the
setup-script's `sed` collapsed it into invalid YAML → Hermes dropped the config → empty model →
OpenRouter `400 No models provided`. Replaced the fragile sed with a shape-independent rebuild +
a hard `pyyaml` validation guard, plus a drift-gate test. Retroactive remediation script:
`scripts/remediate-config-yaml-model.sh`. Full write-up:
[`docs/investigation/2026-06-07-config-yaml-model-shape-incident.md`](./docs/investigation/2026-06-07-config-yaml-model-shape-incident.md).

---

## Where to read more

- [`CLAUDE.md`](./CLAUDE.md) — authoritative operating brief (architecture locks, business model,
  security gates, conventions, local-first iteration).
- [`docs/plans/`](./docs/plans/) — implementation plans (e.g. `2026-06-09-pricing-v1.4-tiers.md`).
- [`docs/investigation/`](./docs/investigation/) — incident postmortems.
- [`docs/runbooks/`](./docs/runbooks/) — operational runbooks.
