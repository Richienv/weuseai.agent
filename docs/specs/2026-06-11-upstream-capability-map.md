# Upstream capability map — hermes-agent v0.13.0 (pinned)

**Date:** 2026-06-11 (Mission 3 Phase 0)
**Sources:** upstream docs (hermes-agent.nousresearch.com/docs), release
notes v0.13.0→v0.16.0, upstream GitHub issues, and our own
`setup-script.ts` (the config we actually write). Compiled via a research
pass; confidence per row noted — anything load-bearing for our builds was
designed to degrade gracefully if the upstream detail differs (see Mesh
note below).

**Purpose (the guardrail):** build nothing the upstream already provides.
Three buckets: native+enabled · native-but-not-enabled · ours.

## A. Native AND already enabled for customers

| Capability | How it's on | Notes |
|---|---|---|
| Cross-session memory | Zero-config: `MEMORY.md`/`USER.md` auto-load + FTS5 session search | **Corrects audit U5**: "ingatan lintas sesi" is natively delivered — the Mission 2 worry that it "rests on defaults" stands, but the defaults are real shipped features, not luck. v0.15 makes session search 4500× faster (upgrade-day benefit, not a gap). |
| Cron / scheduled tasks | `hermes cron add` (we install Pagi Briefing 07:00 + EOD 18:00 WIB) | Also supports chat-side `/cron add`, pause/resume/remove, 20+ delivery targets. No recursive cron (good). |
| STT voice input | `stt.enabled` + Groq key, written by setup-script on voice tiers | Working as shipped (Phase B). |
| Skills / slash commands | SKILL.md discovery under `~/.hermes/skills/` | Our whole persona system rides this. |
| **Sub-agents / delegation** | `delegate_task(goal, context, toolsets)` — agent-native tool, on by default, flat depth-1, parallel batch up to 3 | **The Phase 1 primitive.** Children get FRESH context (no parent history), so persona delegation = pass the persona's SOUL + skill excerpts in the task `context`. Not a skill-level API — skills *instruct* the agent to use it. Confidence: medium-high (docs + release notes); the Mesh skill degrades to sequential persona-adoption if the tool is absent/renamed. |

## B. Native but NOT enabled — and what enabling requires

| Capability | What enabling takes | Recommendation |
|---|---|---|
| MCP client (incl. Gmail/Calendar via Composio or Google Workspace MCP) | `mcp_servers:` config block + **per-customer OAuth** + onboarding UX + new promises in copy | **Founder decision — do not flip silently.** This is the real fix for audit U4 (mock calendar data): real connectors. Needs: an onboarding step for Google OAuth, secure per-customer credential storage (integration_credentials table already exists for API-key-style creds), and honest copy. Biggest roadmap unlock; not free. |
| TTS voice output | `voice.auto_tts: true` + a TTS provider key (xAI voices etc.) | Customer-facing behavior change + per-minute COGS with no metering seam (same problem as STT cost audit P1). Recommendation: hold until voice cost metering exists. |
| External memory providers (Mem0 etc.) | config + a third-party account | Native memory is sufficient today. Skip. |
| `/cron add` from chat (customer-managed schedules) | Already on, but undocumented to customers | Cheap CX win: mention in a future "what your agent can do" doc. No action this mission (copy = founder surface). |

**Config-only + zero-cost + zero-copy candidates to enable this mission:
none found.** Everything in bucket B fails at least one of the three
conditions (OAuth, provider cost, or customer-facing copy). Stated plainly
rather than force-flipping something.

## C. Not native — our layer (correctly)

| Capability | Where it lives |
|---|---|
| Tier→persona composition + bundle delivery | tier-personas.ts, bundle-fetch/-pull, agent-packs |
| Persona Genesis (generated personas) | persona-genesis fn + validator + tar packager |
| Playbook state machine across messages | flow-state Edge Function (upstream has no cross-message step cursor for skills) |
| Payments, provisioning, fleet lifecycle | Xendit chain, Fly service, Fleet Sentinel |
| **Agent Mesh orchestration policy** (Phase 1) | OUR layer composes the native `delegate_task` primitive: decomposition contract, tier-gated delegation, assembly format, failure honesty. The primitive is upstream; the policy is us. |
| **Self-Improving Library** (Phase 2) | Signals → DeepSeek drafts → founder approval → bundle pipeline. Nothing upstream touches our library. |

## D. Things we were about to rebuild — caught by this map

1. **Sub-agent execution engine.** A naive Mesh build would have added a
   server-side task queue + executor. Native `delegate_task` (with parallel
   batch) makes that redundant — the Mesh ships as a conductor skill +
   contract module only.
2. **Cross-session memory store.** Candidate roadmap item "build a Supabase
   knowledge store per customer" — native memory + session search already
   covers the sold promise. Closed.
3. **Customer-managed schedules.** `/cron add` from chat already exists —
   any "let customers schedule reports" feature is copy, not code.

## E. Known upstream gaps relevant to us

- **Telegram image input is broken in v0.13** (images arrive as file paths,
  pixels never reach the model — upstream issues #25118/#19287; partial fix
  v0.14). Do not promise vision. Revisit at the next HERMES_VERSION bump
  (which requires the config.yaml shape re-verification per the 2026-06-07
  lock).
- v0.15's Kanban/swarm expansion is a future Mesh v2 substrate; not needed
  for v1.
