# Incident: config.yaml model-block YAML shape — "model provider failed after retries"

**Date:** 2026-06-07
**Severity:** High (LLM path dead on affected customer VPSes; silent Opus cost-burn on others)
**Status:** Resolved — fleet remediated, generator fixed + drift-gated, lock added.

> **Postscript (2026-06-07, later):** all three test customers referenced below
> — `admin@example.com` (`9b3daadb…`), richie (`65e6c0ff…`), renita
> (`2f60325d…`) and their VPSes (139.180.144.49 / 66.42.59.231 /
> 139.180.157.57) — were **deleted by the founder** for a clean-slate
> `/checkout` retest. The IDs/IPs here are a **historical forensic record**,
> not live rows. The generator fix (PR #223) is what protects future
> provisions; it only takes effect once the Fly `weuseai-provisioning` service
> is redeployed onto #223 (see "Deploy" note at end).

---

## Symptom

Founder provisioned a test customer via `/admin/manual-provision`. Bot paired +
auto-greeted, but the first task ("coba buatin invoice…") returned:

> ⚠️ The model provider failed after retries. I kept raw provider details out
> of chat; check gateway logs for diagnostics.

## Root cause (verified, not assumed)

The Cowork consult hypothesised a **sub-key budget** problem (admin-provisioned
customers skipping OpenRouter budget allocation). **Disproven via DB ground
truth:** the customer's `customer_openrouter_keys` row had a correctly
allocated **$5 cap with $0 spend** (`customer_llm_cost.pct_used = 0.0`). Budget
was never the issue.

The actual cause came from the **gateway journal**:

```
/home/weuseai/.hermes/config.yaml line 11, column 3 — ParserError: while parsing a block mapping
Falling back to default config — every user override (model settings) is IGNORED.
API call failed provider=openrouter model=   summary=HTTP 400: No models provided
```

Chain:

1. The setup-script pinned the model with
   `sed -i -E 's|^model:.*|model: deepseek/deepseek-v4-pro|'`, written
   (2026-05-17) when a fresh non-interactive Hermes install shipped `model:`
   as a **top-level scalar**.
2. A later pinned-Hermes config template ships `model:` as a **nested dict**:
   ```yaml
   model:
     default: "anthropic/claude-opus-4.6"
   ```
   `model.default` is the authoritative key Hermes reads (this is also exactly
   how Opus leaked before the 2026-05-17 pin).
3. The `sed` rewrote the **parent** line to a scalar
   (`model: deepseek/deepseek-v4-pro`), leaving the indented `default:` child
   **orphaned** → invalid YAML ("while parsing a block mapping", line 11:3).
4. Hermes failed to parse config.yaml → fell back to default config → **empty
   model** → OpenRouter request sent with no model → **HTTP 400 "No models
   provided"** → surfaced as "model provider failed after retries".

So: **not** a budget bug, **not** provider downtime, **not** a wrong env var.
A setup-script config-generation bug triggered by an upstream config-schema
change.

## Fleet sweep (all active VPSes)

| Customer | VPS | Provisioned | State found | Action |
|---|---|---|---|---|
| admin@example.com | 139.180.144.49 | 06-03 | `PARSE=FAIL` (orphaned child) | hotfixed → DeepSeek, OR 200 |
| kidnovell.richie | 66.42.59.231 | 05-26 | `PARSE=FAIL`, "No models" since 05-27 | remediated → DeepSeek, OR 200 |
| renita | 139.180.157.57 | 05-17 | **parses but `model.default = anthropic/claude-opus-4.6`** (running Opus) | remediated → DeepSeek, OR 200 |

Three distinct states pinned the regression timeline exactly: VPSes provisioned
**after** the 2026-05-17 sed landed are YAML-broken (richie, admin); the one
provisioned **before** it (renita) silently ran **Opus** — a live lock #2
violation (~5.5× per-customer LLM budget). All three now validated end-to-end:
config parses, `model.default = deepseek/deepseek-v4-pro`, and a direct
OpenRouter call returns **HTTP 200** (`deepseek/deepseek-v4-pro-20260423`).

## Fix

- **Generator** (`services/provisioning/src/setup-script.ts`): replaced the
  scalar-collapsing `sed` with `modelPinShellBlock()` — an awk that deletes ANY
  top-level `model:` construct (scalar OR dict + its indented body) then appends
  one canonical nested block. Shape-independent.
- **Hard guard** (`configYamlValidateShellBlock()`): after all tweaks, the
  setup-script validates the FINAL config.yaml with the Hermes venv pyyaml and
  **fails the provision loudly** if it doesn't parse or `model.default` isn't
  pinned — so a future upstream schema change surfaces to US at provision time,
  not via a customer 402.
- **Drift gate** (`tests/setup-script-config-yaml-model.spec.ts`): runs the real
  generator bash against nested / scalar-broken / missing shapes, asserting
  valid YAML + pinned `model.default`, idempotency, and that the fragile sed can
  never return. The reproduction test fails with the exact upstream parser error.
- **Retroactive remediation** (`scripts/remediate-config-yaml-model.sh`): the
  committed, idempotent VPS-side hotfix used for the sweep above.

## Secondary observations (flagged, lower priority)

- **Duplicate greeting:** the original consult noted two greetings (14:10 +
  14:17). On the admin VPS the gateway journal shows a recurring Telegram
  `getUpdates` **polling conflict** ("terminated by other getUpdates request;
  make sure only one bot instance is running"). `pgrep` shows a **single**
  local gateway process on every VPS, so the second consumer is **external** to
  the VPS (another process/host polling the same bot token, or a stale Telegram
  session) — NOT a local duplicate. This plausibly also explains the
  double-greet. Needs a separate look at the concierge-vs-standard greeting
  path and whether any non-VPS process holds the bot token. Did not block the
  LLM fix; the LLM path is verified working independently of it.

## Deploy

The generator fix is merged to `main` (PR #223) but the Fly
`weuseai-provisioning` service must be **redeployed** for it to take effect on
new provisions — until then, the service still runs the pre-#223 setup-script
and any newly provisioned VPS reproduces this bug. **Do not provision a new
customer (incl. a `/checkout` run that reaches onboarding/provisioning) until
the service is on #223.** Deploy from the repo root:

```
fly deploy --config services/provisioning/fly.toml \
  --dockerfile services/provisioning/Dockerfile -a weuseai-provisioning
```

Verify: `fly releases -a weuseai-provisioning` shows a version **> v37**.

## Follow-ups

- [ ] Investigate the Telegram `getUpdates` conflict / duplicate-greet source.
- [ ] Consider asserting the Hermes config-schema shape at version-pin bump time
      (see CLAUDE.md Agent-runtime lock addition, 2026-06-07).
