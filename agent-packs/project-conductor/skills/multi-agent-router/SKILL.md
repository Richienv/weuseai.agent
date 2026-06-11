# multi-agent-router — Hermes skill

Bundle: project-conductor (v2)
Tier: pro+
Handler: `hermes-skill:multi-agent-router` (delegasi sub-task ke specialist persona via Hermes `delegate_task`, dengan tier gate + fallback)

## Kapan dipakai

Customer (atau Project Conductor itself) butuh delegate task ke specialist persona. Trigger phrases:

- "spawn Doc Expert untuk draft"
- "delegate ke Web Creator"
- "kasih task ini ke Deep Researcher"
- "run task X via [persona]"

Juga: triggered automatically dari `kanban-orchestrator` / `project-orchestration` saat customer approve plan + bilang "go" atau "spawn".

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `task_id` | string | ya | Reference ke task di kanban |
| `target_persona` | enum: the-pro \| deep-researcher \| web-app-builder \| doc-expert \| slide-master \| trade-pro \| business-agent \| video-producer \| social-conductor | ya | Slug HARUS persis seperti di daftar ini (web-app-builder = "Web Creator", business-agent = "Business Director"). Resolve dari task's suggested_owner_persona kalau tidak override. `project-conductor` sengaja tidak ada di daftar — tidak ada self-delegation. |
| `inputs` | object | tidak | Customer-supplied inputs (mis. brand_name untuk Web Creator, topic untuk Deep Researcher) |
| `priority` | enum: now \| next \| async | tidak | Default async (queue di kanban In Progress); now triggers immediate spawn |

## Gerbang tier (WAJIB sebelum spawn apa pun)

Daftar persona yang BOLEH di-delegate adalah env `$WEUSEAI_AGENT_SLUGS`
(CSV) — daftar persona tier customer ini, ditulis saat provisioning dari
katalog tier. Itu SATU-SATUNYA sumber kebenaran di mesin ini; jangan
menebak dari nama paket dan jangan memanggil endpoint apa pun untuk cek
tier.

- `target_persona` ada di `$WEUSEAI_AGENT_SLUGS` → lanjut spawn.
- `target_persona` TIDAK ada di daftar → JANGAN spawn. Kerjakan bagian lain
  yang bisa, lalu sampaikan ke customer persis kalimat ini (ganti
  [Nama Persona] dengan display name-nya):

  > Satu bagian rencana ini butuh persona [Nama Persona], yang belum termasuk paket kamu. Bagian lain tetap aku kerjakan — hasilnya di bawah. Kalau bagian itu penting, persona [Nama Persona] tersedia di paket yang lebih lengkap.

## Yang dilakukan

1. Cek gerbang tier di atas. Lolos → lanjut.
2. Siapkan konteks persona untuk child agent. Child `delegate_task` mulai
   dengan konteks KOSONG (tidak mewarisi percakapan), jadi kamu yang bawa
   identitasnya: baca SOUL.md persona target di
   `/var/lib/weuseai/bundle/<slug>/<versi terpasang>/SOUL.md` (versi
   terpasang ada di `/var/lib/weuseai/bundle/<slug>/.installed-version`)
   dan, kalau relevan dengan task, 1-2 template dari folder `templates/`
   bundle itu.
3. Spawn via tool `delegate_task`:
   - Satu task: `delegate_task(goal=<brief task>, context=<SOUL persona + brief + inputs + template relevan>)`
   - Beberapa task independen: bentuk batch paralel `delegate_task(tasks=[...])`, maksimal 3 berjalan bersamaan.
4. Fallback kalau tool `delegate_task` tidak tersedia di mesin ini:
   JANGAN berhenti diam. Kerjakan sub-task itu sendiri secara berurutan —
   baca SOUL.md persona target, adopsi cara kerjanya untuk sub-task itu
   saja, beri label output dengan nama persona-nya. Hasil customer tetap
   sama: tiap bagian dikerjakan dengan keahlian persona yang tepat.
5. Kumpulkan output child. Task gagal atau kehabisan waktu → catat
   statusnya dengan jujur, JANGAN ulangi lebih dari satu kali, dan jangan
   biarkan satu kegagalan menahan task lain.
6. Update kanban task status:
   - In Progress saat child active
   - Review saat child output ready (Project Conductor synthesizes + tags untuk customer review)
   - Done saat customer approve
7. Surface synthesis ke customer + dashboard URL update.

## Output

Persona-voice wrapper:

> "Task 'Riset kompetitor' aku spawn ke Deep Researcher. Status: In Progress. ETA: ~15 menit.
>
> Aku ping kalau output siap di-review. Kamu mau aku batch synthesis (semua task selesai dulu) atau real-time per task selesai?"

## Decline criteria

- **Persona di luar `$WEUSEAI_AGENT_SLUGS`.** Pakai kalimat gerbang tier di atas, persis. Jangan improvisasi kalimat upgrade lain.
- **Persona yang tidak match capability task.** Mis. customer bilang "spawn Trade Pro untuk bikin landing" — flag mismatch dan re-suggest Web Creator.
- **Child session loop / recursion.** Project Conductor tidak spawn ke Project Conductor (avoid infinite loops). Decline dengan alasan.

## Decline kalau missing context

Kalau "spawn agent" tanpa task_id — tanya: "Task mana yang mau di-spawn? Kasih task_id atau title."
