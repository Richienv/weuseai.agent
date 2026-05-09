# glints-job-post — Hermes skill

Bundle: web-master (Web Creator) — Phase 4-3 seed skill (DRAFT)
Tier: studio (DRAFT gate)
Handler: `hermes-skill:autobrowse-replay`

> **Status: DRAFT (Phase 4-3 scaffolding 2026-05-10).** Selectors are placeholders authored from Glints' public DOM patterns at spec lock. Founder runs real Autobrowse capture sessions to refine. See "Graduation status" footer.

## Kapan dipakai

- "extract detail lowongan dari Glints"
- "scrape job post Glints"
- "tarik requirements + benefits dari Glints URL"
- "lookup vacancy di Glints"

## Yang harus diekstrak

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `job_url` | string | ya | URL halaman job post Glints (https://glints.com/id/opportunities/jobs/...) |

## Yang dilakukan

1. Buka `job_url` di browser engine.
2. Tunggu network-idle (Glints adalah Next.js; konten rendered server-side biasanya).
3. Ekstrak field berikut:
   - `job_title` — heading utama job post
   - `company_name` — nama perusahaan
   - `company_logo_url` — URL logo (opsional, untuk display)
   - `location` — kota / "Remote" / "Hybrid"
   - `experience_level` — entry / mid / senior / executive
   - `job_type` — full-time / contract / internship / freelance
   - `salary_range` — range gaji kalau di-display (Glints sering hide-by-default)
   - `requirements` — array of bullet points dari section "Requirements" / "Kualifikasi"
   - `responsibilities` — array of bullet points dari section "Responsibilities" / "Tanggung Jawab"
   - `posted_date` — ISO 8601 atau relative (e.g. "2 hari lalu")
4. Return JSON object.

## Output

Persona-voice wrapper:

> "Job post di Glints:
>
> **Senior Frontend Engineer @ TechCo Indonesia**
> 📍 Jakarta (Hybrid) · 💼 Full-time · ⭐ Senior level
> 💰 Rp 25-40jt/bulan
>
> **Kualifikasi utama:**
> - 5+ tahun React + TypeScript
> - Pernah lead team 3-5 engineer
> - Familiar dengan AWS atau GCP
>
> **Tanggung jawab:**
> - Pimpin development feature flagship
> - Review code juniors
> - Coordinate dengan design + product
>
> Diposting 2 hari lalu. Mau aku draft cover letter dari profile kamu?"

## Decline

- **URL bukan job post** (homepage, search result, profile candidate) — return `not_a_job_page`.
- **Job sudah expired / closed** — return data partial + flag `status: 'closed'`.
- **Auth-walled** (job-post-only-for-Glints-Pro) — return `auth_required`.

## Failure handling

- **Salary hidden** (default Glints behavior) — `salary_range: null` plus flag `salary_disclosed: false`.
- **Section parsing miss** — Glints kadang pakai heading "Persyaratan" vs "Kualifikasi"; matcher accept multiple labels.
- **Posted-date relative format** — convert "2 hari lalu" → ISO timestamp via current_date - 2 days.

## Graduation status

**Phase 4-3 v0 (2026-05-10): DRAFT scaffolding.** Real graduation: founder runs Autobrowse pada 5-10 job posts berbeda (entry-level vs senior, IT vs non-IT, different industries). Glints layout cukup stabil; high-confidence skill once real captures land.
