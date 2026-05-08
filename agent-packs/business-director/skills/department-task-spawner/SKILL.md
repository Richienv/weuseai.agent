# department-task-spawner — Hermes skill

Bundle: business-director (v2)
Tier: studio
Handler: `hermes-skill:department-task-spawner` (lightweight delegation; mirip multi-agent-router dari Project Conductor tapi terbatas ke department-equivalent personas)

## Kapan dipakai

- "buat tim sales draft channel strategy"
- "kasih marketing agent task X"
- "delegate ke engineering"
- "spawn department legal"
- "finance check pricing"

## Yang harus diekstrak

| Field | Wajib | Notes |
|---|---|---|
| `department` | ya | enum: sales \| marketing \| engineering \| legal \| finance |
| `task_description` | ya | What customer wants done |
| `urgency` | tidak | now / next-sprint / backlog |

## Department → persona mapping

| Department | Spawn ke persona | Notes |
|---|---|---|
| sales | The Pro (channel strategy framing) atau Social Conductor (channel-specific tactics) | Customer pilih; default The Pro untuk strategy, Social Conductor untuk execution |
| marketing | Web Creator (landing/blog) + Social Conductor (calendar) | Often dual-spawn |
| engineering | extend-capabilities skill (technical scoping pakai customer's BYOK LLM) | No dedicated engineering persona di v2 |
| legal | Doc Expert (contract templates, compliance docs) | Bukan licensed lawyer — surface template + flag butuh review profesional |
| finance | Trade Pro (pricing, capital, IDR/BI context) | |

## Yang dilakukan

1. Resolve department → persona via mapping di atas.
2. Pre-frame task untuk receiving persona — translate "draft channel strategy" jadi prompt yang fit persona's SKILL.md schema.
3. Spawn child Hermes session via Hermes v0.13.0 multi-agent (sama mechanism dengan Project Conductor's multi-agent-router).
4. Collect output. Synthesize ke "department deliverable" frame.
5. Note: department workspaces (full team simulation) di Phase 6+. Sekarang lightweight 1-task-1-persona delegation.

## Output

Persona-voice wrapper:

> "Task 'draft channel strategy untuk B2B SaaS' aku spawn ke **The Pro** (sales department equivalent). ETA: ~10 menit.
>
> Output akan aku format jadi 'Sales Department Memo' dengan executive summary, recommended channels, dan execution timeline. Kasih tahu kalau mau aku batch dengan task lain (mis. landing page dari Web Creator + content calendar dari Social Conductor)."

## Decline

- **"Hire" / "fire" karyawan virtual.** Aku bukan HR system. Department-task-spawner = delegate task, bukan manage virtual headcount.
- **Department workspace yang persistent state across sessions.** Phase 6+ work; sekarang stateless per task.
