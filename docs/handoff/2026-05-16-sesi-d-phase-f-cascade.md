# Sesi D static-audit handoff — Phase F (8-min → 15-min flow) cascade

**Date:** 2026-05-16
**Branch:** `cascade/phase-f` (not yet merged to `main` at handoff time)
**Cascade log:** `docs/cascades/2026-05-14-8min-flow-validation.md` (run records + locked decisions)
**Scope of this audit:** static review only — logic, security, correctness drift. Sesi D does not run code; runtime behaviour was already validated by 3 clean Phase F chain runs + a founder-confirmed hold-VPS run. Sesi D findings come back as follow-up PRs.

---

## Why this cascade existed

Validate the fresh-customer chain end-to-end before the first real paying customer: real Xendit test invoice → paid webhook → Vultr VPS → setup-script → onboarding/pairing → hermes-gateway → bundle-pull → proactive auto-greet. Priority lock `feedback_8min_flow_priority_lock.md` (2026-05-14, amended 2026-05-15 to a 15-min reliability-over-speed budget). **Closed + released 2026-05-16.**

---

## Changes shipped on `cascade/phase-f` (review targets)

Commits oldest→newest. Each line is a review target.

| Commit | What | Sesi D — verify |
|---|---|---|
| `61e9176` | local-stack fidelity fix — dedup migration timestamps, `.env.example`, smoke wrapper | Migration-rename `20260510120000`→`20260510120100` is idempotent + has no prod schema_migrations impact (audited in `docs/audit/2026-05-15-pr121-migration-rename-prod-impact.md`). |
| `0d6e77b` | Phase F harness — fresh-customer chain smoke | Harness orchestration; local-vs-deployed dep seam. |
| `b46da5b` | Stage 11 teardown routes through provisioning `/tear-down` | No direct Vultr call from the harness. |
| `a73e043`→`7a912e6` | Stage 2 — synthetic `invoice.paid` POST to `xendit-webhook` (VA-simulate route proven dead) | **Stage 2 fidelity:** synthetic body is built from `XENDIT_INVOICE_PAID_TEMPLATE`, captured from a real Xendit API response. Confirm the synthetic event still matches what real Xendit emits for the 6 fields the handler reads (`id, external_id, status, paid_at, payment_method, amount`). |
| `907a27a` | Stage 3 PostgREST query fix | **Verify the two-step lookup is correctly indexed:** `customers` by `email`, then `subscriptions` by `customer_id`. PostgREST `in.()` takes no subquery — confirm no other call site has the same bug. |
| `7d370f4` | Bug A (Stage 4/5 lifecycle) + Bug B (Vultr IPv6 egress) + 15-min budgets | **Bug B:** `services/provisioning/src/index.ts` forces IPv4 (`dns.setDefaultResultOrder('ipv4first')` + `net.setDefaultAutoSelectFamily(false)`). Verify this is comprehensive — no library (Supabase client, Telegram, DO) bypasses it; `undici`/global-fetch all honour it. |
| `a7b0586` | monorepo-root `.dockerignore` | Excludes `._*` AppleDouble + build cruft. |
| `3877058` | Phase F pairing stages 5.5-5.8 | **Verify the harness mirrors the REAL onboarding code paths byte-for-byte:** `validate-bot-token` → `rotate-pairing-code` → synthetic `/pair` to `pair-customer-bot-webhook` → `complete-onboarding`. Flag any divergence between the harness's calls and what `onboarding.html` actually does. |
| `3630ca0` | harness ssh `UserKnownHostsFile=/dev/null` | **Verify no new attack surface.** It is test-harness-only (the harness SSHing to ephemeral throwaway VPSes). Document explicitly that this pattern must NOT leak into production SSH paths (`services/provisioning` `ExecSshProvisioner` uses its own fleet-key flow — confirm it is unaffected). |
| `91ab632` | Stages 9-10 → `manual` status | A bot token cannot validate a bot's reply; founder confirms by hand. Confirm `manual` is treated as clean (not fail) in the verdict. |
| `b9f2dfd` | setup-script `apt_retry` (3×, 5s/15s backoff) | **Verify the retry pattern is sound — no race conditions, no infinite loop, the per-attempt `timeout` is preserved, exit codes propagate.** apt only (not npm/pip/curl). |
| `4b4fede`→`3b2a3a4` | 3 bot-UX fixes — `start` skill + `config.yaml` `tool_progress:"off"` + `interim_assistant_messages:false` | No upstream Hermes patch — confirm. The `start` skill is a `SKILL.md` under `~/.hermes/skills/`. `tool_progress` is quoted (unquoted `off` = YAML boolean). |
| `0d0160e` | `E2E_CHAIN_HOLD_VPS` flag | Skips Stage 11 teardown for the manual /start test. Held VPS must be torn down by hand — confirm the harness logs the customerId to do so. |
| `50133e5` | auto-greet surfaced + Stage 5.9 | `complete-onboarding` response now includes `greeting:{ok,source}`. Stage 5.9 asserts it. Confirm `proactive-greeting.ts` itself is unchanged (pre-existing, Track 2) — the cascade only added observability. |

### Carried over (NOT a cascade commit — prior audit item)

- **PR #119 — snapshot-vs-clearStalePairState ordering invariant** in `supabase/functions/_shared/xendit-webhook-handler.ts`. The bot-token snapshot MUST happen before `clearStalePairState` wipes `telegram_bot_token`. Pinned by `tests/xendit-webhook-bot-token-snapshot.spec.ts`. Verify the ordering still holds and the drift-gate test still guards it.

---

## Audit evidence — timing tables

Four clean runs (3 cascade-close + 1 hold-VPS), all under the 15-min budget:

| Run | Type | Chain time (1-9) | Verdict |
|---|---|---|---|
| `deployed-1778897729613` | cascade #1 | 6.72 min | 16/16 clean |
| `deployed-1778898155812` | cascade #2 | 6.68 min | 16/16 clean |
| `deployed-1778898587659` | cascade #3 | 6.72 min | 16/16 clean |
| `deployed-1778913264702` | hold-VPS (auto-greet) | 7.88 min | 16/16 clean, Stage 5.9 `auto-greet source=llm` |

Per-stage tables are in `docs/cascades/2026-05-14-8min-flow-validation.md` run blocks.

---

## Known-deferred (do NOT flag as bugs)

- **Xendit prod-mode signing + `invoice.paid` body-shape fidelity** — unvalidated until the first real paid customer (post `XENDIT_API_KEY` rotation). Intentional.
- **"Empty response after tool calls"** — upstream Hermes (`run_agent.py`) agent-loop behaviour. The cascade only suppressed the user-facing leak via config; the underlying behaviour is upstream-locked, not ours to patch.
- **Name-as-email in the harness greeting** — benign test artifact (CASE A); see the cascade doc's locked decisions.
- Open follow-ups: `docs/post-cascade-followups.md`.
