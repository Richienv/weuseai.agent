# sales-dispatch — Hermes skill

Bundle: business-agent (v3 — Phase 5 dept pack)
Tier: studio (Q3=A locked: phase_5_enabled = true required)
Handler: `hermes-skill:sales-dispatch` (facade — translates sales-shaped intent to specialist persona)

> Replaces the general-purpose `department-task-spawner` for sales work. No new logic — pure routing.

## Kapan dipakai

Customer raises sales-shaped intent. Trigger phrases:

- "draft channel strategy"
- "bantu lead-gen"
- "siapa target customer kita"
- "outreach plan untuk B2B"
- "cold-email sequence"
- "proposal client X"
- "pitch deck untuk investor"
- "pricing tiering review"

## Yang harus diekstrak

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `intent_kind` | enum: channel-strategy \| lead-gen \| outreach \| proposal \| pitch \| pricing | ya | Determines specialist routing |
| `target_segment` | string | ya | Who you're selling to (B2B/B2C/specific niche) |
| `urgency` | enum: now \| next-sprint \| backlog | tidak | Default next-sprint |

## Routing table

| `intent_kind` | Specialist persona | Skill called |
|---|---|---|
| channel-strategy | The Pro | strategic-positioning |
| lead-gen | Deep Researcher | market-segment-research |
| outreach | Social Conductor | outreach-sequence-builder |
| proposal | Doc Expert | contract-template-generator |
| pitch | Slide Master | pitch-deck-composer |
| pricing | Trade Pro | pricing-tier-modeler |

## Approval gates

None for sales-dispatch directly. Some downstream skills surface approvals:
- `proposal` → if customer accepts, `contract_sign` approval (Doc Expert side)
- Pitch deck for investors → no approval (informational)

## Yang dilakukan

1. Parse customer message → `intent_kind` (use trigger-phrase heuristics first; ambiguous intent → ask once)
2. Route to specialist via Hermes v0.13.x multi-agent spawn (same mechanism as project-conductor's multi-agent-router)
3. Pre-frame the task — translate sales-shaped intent to the specialist's expected schema
4. Open `department_threads` row for this engagement (`department: 'sales'`) so BD v3 can resume context across sessions (Q5=C cross-session memory)
5. Collect output, frame as "Sales Department deliverable" (executive summary + recommendation + execution timeline)

## Output

Persona-voice wrapper:

> "Intent 'channel strategy untuk B2B SaaS' aku route ke **The Pro** (strategic-positioning skill).
>
> Open thread di Sales department: `Q3-channel-strategy`. ETA: ~10 menit.
>
> Kasih tahu kalau mau aku batch dengan task lain (mis. cold-email sequence dari Social Conductor + pricing review dari Trade Pro untuk konsisten messaging)."

## Decline scenarios

- Customer's tier ≠ studio OR `phase_5_enabled = false` → degrade to existing Persona v2 BD scoped MVP and recommend tier upgrade
- `intent_kind` doesn't match any specialist → suggest 1-2 closest matches; don't guess
