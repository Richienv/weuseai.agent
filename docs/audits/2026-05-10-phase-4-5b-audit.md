# Phase 4-5b hermes-kanban-proxy: Hardening Audit (2026-05-10)

> **Verdict: ship-ready as-is for Phase 5 scope.** No code changes required from this audit. Documenting the threat model + future-hardening backlog.

> **Context:** Phase 5 ships BD v3 + 5 dept packs + approval queue. BD v3 will exercise the kanban proxy heavier than the initial Phase 4-5b smoke (one snapshot per session). This audit asks: does the current handler hold up?

---

## Current state (post Phase 5-3.c)

`supabase/functions/_shared/hermes-kanban-proxy-handler.ts` + `supabase/functions/hermes-kanban-proxy/index.ts`:

- ✅ **HMAC auth available** (Phase 5-3.c #32) — gated on `HERMES_INSTANCE_HMAC_KEY` env. Backward-compat MVP mode when unset.
- ✅ **Schema validation** — 16 unit tests covering board id / customer id / hermes_version range / persona enum / status enum / dangling task refs / task_id key consistency.
- ✅ **Customer existence check** — multi-tenant gate even before HMAC enabled.
- ✅ **Atomic upsert pattern** — boards via `.upsert(onConflict: 'id')`; tasks via delete-by-board_id + insert. No Postgres transaction; relies on "proxy is the only writer" assumption.
- ✅ **Idempotent re-call semantics** — same snapshot → same row. Verified live in PR #22.

---

## Threat model (post-5-3.c)

| Threat | Likelihood | Impact | Mitigation today |
|---|---|---|---|
| Cross-customer write (attacker uses customer A's token to write B's board) | Low (requires HMAC enabled + token leak) | High (data corruption + audit confusion) | HMAC re-derives expected token from `board.customer_id` → mismatch → 401 |
| Replay attack (same snapshot replayed by stale Hermes instance) | Medium | Low (snapshot is the source of truth; replay is no-op) | None — accepted (snapshot replay is benign by design) |
| DoS via massive board snapshot | Low (would need legit-looking customer + huge `board.tasks` payload) | Medium (PostgREST insert-many timeout, function memory) | None — see "future hardening" |
| customer_id enumeration via timing | Low (HMAC fires before existence check) | Low (existence is one bit) | HMAC gate prevents 401-vs-404 leak when env enabled |
| Tasks-table FK violations from concurrent edits | Low | Medium (orphan tasks if board deleted mid-call) | `ON DELETE CASCADE` on FK; concurrent calls with overlapping board_id are rare in single-customer single-Hermes workflow |

---

## What changed in Phase 5 that affects load profile

| Phase 5 component | Effect on proxy load |
|---|---|
| Project Conductor existing kanban-orchestrator | One snapshot per task transition (already exercised) |
| BD v3 dept dispatch (Phase 5-2) | New: each department engagement = new board, sometimes 5 boards per customer per week |
| Approval queue → action complete (Phase 5-3.b) | New: task status flips on approval outcome → snapshot |
| Department threads (Phase 5-1) | Each `department_threads` row may link to a board → snapshot per spawn |

**Estimated peak load (per customer):** ~30-50 snapshot updates per active business-week (not per day). Well within current architecture.

---

## Audit findings — no code changes required

### ✅ FINDING 1: HMAC ordering is correct

HMAC check fires BEFORE customer existence check. No 404-vs-401 enumeration leak when env enabled. (`tests/hermes-kanban-proxy-hmac.spec.ts:135-156`.)

### ✅ FINDING 2: Single-writer assumption holds for Phase 5

The proxy is the only writer to `hermes_kanban_boards` + `hermes_kanban_tasks`. BD v3's kanban-orchestrator skill on customer VPS is the only originator of snapshots. No race risk.

### ✅ FINDING 3: Schema check enums match handler enums

Drift defense in `phase-5-integration.spec.ts` covers: persona enum (10), status enum (5), version range regex. Adding a new persona / status would fail tests until handler + schema synced.

### ✅ FINDING 4: Action lifecycle ordering is safe

Approval queue create → snapshot to BD v3 board (via dept-thread spawn) → customer approves → action executes → BD v3 updates board → snapshot to platform. Approval queue is the source of truth for "did this action happen"; the kanban mirror is for cross-customer aggregations only. Cross-table consistency drift would be visible to founder dashboard but doesn't corrupt source-of-truth.

### ⚠️ FINDING 5: No payload size cap (deferred — see future hardening)

Current code accepts arbitrary-sized `board.tasks` jsonb. A malicious customer (or buggy Hermes instance) could submit a 10MB board snapshot.

**Risk assessment:** LOW for Phase 5 — only authenticated customers submit; no public attack surface. Real risk emerges in Phase 6 when codebase integration could create boards with auto-generated tasks per PR.

### ⚠️ FINDING 6: No request rate limiting at proxy

Could a runaway Hermes instance (e.g. infinite loop bug) hammer the proxy? Yes. Supabase Edge Functions have a global rate limit (~1000 req/sec project-wide) which would smooth most cases, but doesn't prevent a single customer from hogging budget.

**Risk assessment:** LOW for Phase 5 (single-digit customer count). MEDIUM at Phase 6 scale.

---

## Future-hardening backlog (open items, no PR planned)

| Item | Trigger | Effort |
|---|---|---|
| Add max payload size cap (e.g. 1MB, 200 tasks) | Phase 6 codebase integration ships | ~30 LOC + 2 tests |
| Add per-customer rate limiter (Redis-backed) | First customer report of weird latency | ~80 LOC + Redis setup |
| Add request-level idempotency key (header-based) | If retry-storm becomes a problem | ~50 LOC + tests |
| Migrate delete-then-insert to single MERGE / upsert-many | Postgres 17+ supports better UPSERT for arrays; PostgREST may need custom RPC | ~60 LOC |
| Add audit log of all board snapshots (separate table) | Compliance signal from a customer | Schema migration + ~40 LOC |

None blocking Phase 5 ship. None blocking Phase 6 spec lock. Track as platform-eng backlog if customer signal arrives.

---

## Recommendations

### Now (no PR — covered by this audit)

- ✅ Document audit conclusions (this file).
- ✅ Confirm HMAC env stays unset until cloud-init writes per-customer tokens (Phase 5-3.c rollout).

### Phase 6 ship (blocking Phase 6-4 codebase integration)

- ⚠️ Add max payload size cap before codebase integration goes live (PR 6-4-cap or inline in 6-4 work).

### Long-term (no urgency)

- Future-hardening backlog items above. Bring forward when customer signal emerges.

---

## Verdict

**No code changes from this audit.** Phase 4-5b proxy ships as-is for Phase 5 + early Phase 6. Hardening backlog tracked here for Phase 6+ trigger points.
