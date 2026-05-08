# multi-agent-router — Hermes skill

Bundle: project-conductor (v2)
Tier: pro+
Handler: `hermes-skill:multi-agent-router` (Hermes v0.13.0 multi-agent kanban — spawn child agent in dedicated session, collect output, write back to parent kanban task)

## Kapan dipakai

Customer (atau Project Conductor itself) butuh delegate task ke specialist persona. Trigger phrases:

- "spawn Doc Expert untuk draft"
- "delegate ke Web Creator"
- "kasih task ini ke Deep Researcher"
- "run task X via [persona]"

Juga: triggered automatically dari `kanban-orchestrator` saat customer approve plan + bilang "go" atau "spawn".

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `task_id` | string | ya | Reference ke task di kanban |
| `target_persona` | enum: the-pro \| deep-researcher \| web-master \| doc-expert \| slide-master \| trade-pro \| project-conductor \| business-director \| video-producer \| social-conductor | ya | Resolve dari task's suggested_owner_persona kalau tidak override |
| `inputs` | object | tidak | Customer-supplied inputs (mis. brand_name untuk Web Creator, topic untuk Deep Researcher) |
| `priority` | enum: now \| next \| async | tidak | Default async (queue di kanban In Progress); now triggers immediate spawn |

## Yang dilakukan

1. Resolve target persona → check kalau persona tersedia di customer's tier (lookup customers.tier; tier-gate per Phase 2E-2 logic).
2. Spawn child Hermes session via Hermes v0.13.0 multi-agent primitive — pass task_id + inputs + persona slug.
3. Child session execute task pakai persona's SOUL.md + skills.
4. Collect child output kalau task short-running (<5 min) atau setup callback ke parent kanban kalau long-running.
5. Update kanban task status:
   - In Progress saat child active
   - Review saat child output ready (Project Conductor synthesizes + tags untuk customer review)
   - Done saat customer approve
6. Surface synthesis ke customer + dashboard URL update.

## Output

Persona-voice wrapper:

> "Task 'Riset kompetitor' aku spawn ke Deep Researcher. Status: In Progress. ETA: ~15 menit.
>
> Aku ping kalau output siap di-review. Kamu mau aku batch synthesis (semua task selesai dulu) atau real-time per task selesai?"

## Decline criteria

- **Persona yang tidak tersedia di tier customer.** Surface tier-gate; tawarkan upgrade flow atau manual handle.
- **Persona yang tidak match capability task.** Mis. customer bilang "spawn Trade Pro untuk bikin landing" — flag mismatch dan re-suggest Web Creator.
- **Child session loop / recursion.** Project Conductor tidak spawn ke Project Conductor (avoid infinite loops). Decline dengan alasan.

## Decline kalau missing context

Kalau "spawn agent" tanpa task_id — tanya: "Task mana yang mau di-spawn? Kasih task_id atau title."
