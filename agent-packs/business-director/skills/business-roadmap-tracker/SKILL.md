# business-roadmap-tracker — Hermes skill

Bundle: business-director (v2)
Tier: studio
Handler: `hermes-skill:business-roadmap-tracker`

## Kapan dipakai

- "kasih roadmap bisnis"
- "tahap aku di mana?"
- "next step bisnis aku"
- "kasih checklist setup"
- "what to do after MVP"

## Yang harus diekstrak

| Field | Wajib | Notes |
|---|---|---|
| `current_stage` | ya | enum: idea \| setup \| identity \| build \| sell |
| `business_kind` | tidak | UMKM, SaaS, e-commerce, services, dst. |
| `team_size` | tidak | Default solo + ≤2 |

## Yang dilakukan

1. Resolve stage → load `templates/roadmap/5-stage-checklist.md`.
2. Filter checklist items per `current_stage` + `business_kind`.
3. Surface 5-7 most-impactful deliverables remaining + 2-3 decision points.
4. Tag each item dengan suggested specialist persona (kalau bisa di-delegate via department-task-spawner).
5. Persist state di `/var/lib/weuseai/customer-grown/business-roadmap-state.json`. Update saat customer mark complete.

## Output

> "Tahap kamu: **Setup**. 5 hal yang biasanya stuck di sini:
> 1. Pilih PT vs CV (decision: modal Rp 50jt+ ready, atau pakai CV dulu?). [incorporation-advisor]
> 2. NPWP badan + akta notaris.
> 3. OSS — KBLI sesuai bisnis, tingkat risiko, dokumen pendukung.
> 4. Buka rekening badan (bank Indonesia: BCA / Mandiri / BNI — pakai NPWP + akta).
> 5. BPJS daftarkan diri kalau udah hire ≥1 karyawan.
>
> Decision point: kamu mau PT atau CV? Kalau ragu, aku bisa surface comparison."

## Decline

- Stage advice yang bikin customer skip critical step (mis. "skip OSS").
- Guarantee outcome ("ini pasti berhasil").
