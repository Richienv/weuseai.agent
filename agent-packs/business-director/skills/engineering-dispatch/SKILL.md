# engineering-dispatch — Hermes skill

Bundle: business-director (v3 — Phase 5 dept pack)
Tier: studio (Q3=A locked: phase_5_enabled = true required)
Handler: `hermes-skill:engineering-dispatch` (facade — translates engineering-shaped intent to specialist persona/skill)

> Replaces the general-purpose `department-task-spawner` for engineering work. No new logic — pure routing.

## Kapan dipakai

Customer raises engineering-shaped intent. Trigger phrases:

- "scope feature X"
- "estimate effort untuk integrate Stripe"
- "review architecture pilihan database"
- "kapan migrate dari MySQL ke Postgres"
- "deploy pipeline CI/CD"
- "monitoring + alerting setup"
- "API design untuk endpoint Y"
- "infra cost estimation"

## Yang harus diekstrak

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `intent_kind` | enum: feature-scoping \| effort-estimate \| architecture-review \| infra-decision \| api-design \| ops-setup \| cost-estimate | ya | Determines specialist routing |
| `tech_context` | string | tidak | Existing stack hints (e.g. "Next.js + Supabase", "Laravel + MySQL") |
| `urgency` | enum: now \| next-sprint \| backlog | tidak | Default next-sprint |

## Routing table

There is no dedicated engineering persona in v2/v3 (per business-director/manifest.json
existing comment: "extend-capabilities skill — technical scoping pakai customer's
BYOK LLM"). All engineering work routes through one of:

| `intent_kind` | Specialist persona | Skill called |
|---|---|---|
| feature-scoping | The Pro | extend-capabilities (technical scoping) |
| effort-estimate | The Pro | extend-capabilities (technical scoping) |
| architecture-review | The Pro | extend-capabilities (technical scoping) |
| infra-decision | The Pro | extend-capabilities (technical scoping) |
| api-design | The Pro | extend-capabilities (technical scoping) |
| ops-setup | Doc Expert | runbook-template-generator |
| cost-estimate | Trade Pro | cost-modeler |

## Approval gates

None for engineering-dispatch directly. Some downstream actions surface approvals:
- Production deployment (if Phase 6+ adds deploy automation) → `regulatory_filing` for systems handling personal data per UU PDP
- Database migration affecting customer-personal data → `regulatory_filing`

For Phase 5, no engineering action is auto-executable — all output is advisory.

## Yang dilakukan

1. Parse customer message → `intent_kind` (use trigger-phrase heuristics)
2. Route to The Pro / Doc Expert / Trade Pro per routing table
3. Pre-frame: include `tech_context` if customer provided it; otherwise specialist asks
4. Open `department_threads` row (`department: 'engineering'`) for cross-session resume
5. Collect output, frame as "Engineering Department deliverable" — typically:
   - Decision matrix with options + tradeoffs
   - Effort estimate (S/M/L or person-days)
   - Risk callouts
   - Recommended next step
6. **Note**: BD v3 does NOT execute engineering changes — all output is for human implementation. We surface the recommendation; founder/team executes.

## Output

Persona-voice wrapper:

> "Intent 'estimate effort untuk integrate Stripe payment' aku route ke **The Pro** (extend-capabilities skill — technical scoping mode).
>
> Open thread di Engineering department: `payment-integration-stripe`. ETA: ~12 menit.
>
> Output bakal kasih effort estimate (S/M/L), key dependencies, dan risk callouts. Catatan: BD v3 ngga execute migration sendiri — output untuk founder/dev tim implementasi."

## Decline scenarios

- Customer's tier ≠ studio OR `phase_5_enabled = false` → degrade to existing Persona v2 BD scoped MVP
- `intent_kind` requires actual code execution (not scoping) → BD v3 declines + recommends customer's existing dev workflow + offers to advise on architecture
- Cost-sensitive infrastructure decision (e.g. >Rp 5jt/month addon) → flag with founder approval before recommending
