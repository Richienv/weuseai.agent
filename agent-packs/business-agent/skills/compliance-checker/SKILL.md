# compliance-checker — Hermes skill

Bundle: business-agent (v2)
Tier: studio
Handler: `hermes-skill:compliance-checker`

## Kapan dipakai

- "kasih reminder pajak"
- "BPJS gimana"
- "due date SPT"
- "PPh Final UMKM"
- "OSS verifikasi"

Juga: cron-triggered weekly Mondays jam 9 WIB kalau customer enable auto-reminder.

## Yang harus diekstrak

| Field | Wajib | Notes |
|---|---|---|
| `mode` | ya | enum: list-active \| upcoming-due \| explainer-{topic} |
| `business_status` | tidak | enum: pre-incorporation \| pt-active \| cv-active. Default pt-active. |
| `has_employees` | tidak | bool. Triggers BPJS items kalau true. |

## Yang dilakukan

1. Load `templates/compliance/indonesian-due-dates.md`.
2. Filter items relevan ke `business_status` + `has_employees`.
3. Per item: nama, due date pattern, penalty kalau telat, dokumen wajib.
4. Surface 3-5 most-imminent items (sorted by date).
5. Disclaimer: "Aku reminder + surface info publik. Untuk filing actual + advice tax-specific, ngomong dengan akuntan."

## Indonesian compliance items covered (v2 scope)

- **BPJS Kesehatan & Ketenagakerjaan** — bulanan, gajian + premi (~4-5% of payroll). Auto-debit kalau setup.
- **PPh 21** — pemotongan gaji karyawan. Bulanan setor + tahunan SPT 1721.
- **PPh 25** — angsuran bulanan badan. Kalau revenue di atas threshold UMKM Final.
- **PPh Final UMKM 0.5%** — small-biz omzet ≤Rp 4.8M/tahun. Bulanan.
- **PPN** — kalau PKP (omzet >Rp 4.8M/tahun). Bulanan setor + lapor.
- **SPT Tahunan Badan** — 4 bulan setelah tutup tahun buku.
- **OSS verifikasi** — 90 hari setelah penerbitan NIB. Submit dokumen pendukung.
- **NIB perpanjangan** — kalau ada perubahan KBLI.

## Output

Persona-voice wrapper untuk upcoming-due mode:

> "Compliance items 30 hari ke depan:
> 1. **PPN bulanan** — setor 15 Nov, lapor SPT 1111 paling lambat 30 Nov. Kalau telat: bunga 2% per bulan.
> 2. **PPh 21** — setor 10 Nov untuk payroll Oktober. Pakai bukti potong A1 / A2 sesuai jenis.
> 3. **BPJS Ketenagakerjaan** — auto-debit 10 Nov. Cek saldo rekening cukup.
>
> Aku ping H-7 untuk masing-masing. Kalau ada perubahan situasi (hire baru, omzet break threshold UMKM), kasih tahu — aku adjust reminder."

## Fetch template

Sebelum surface compliance items, panggil `bundle-fetch` dengan `agent_slug` `business-agent` dan filter `kind` ke `markdown` (compliance / finance) atau `financial`. Kalau template registry punya entry yang cocok (mis. `compliance/indonesian-due-dates.md` untuk reference BPJS / SPT / PPh / OSS, `finance/djp-tax-filing-cycle.md` untuk monthly + annual DJP cycle, `finance/bpjs-registration-paths.md` untuk BPJS registration steps, `legal/uu-pdp-basic-compliance.md` untuk UU PDP checklist), pakai itu sebagai starting frame. Kalau registry tidak punya match untuk item compliance tertentu, log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus surface dari nol.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Decline

- **Tax advice spesifik** ("aku boleh tidak nge-claim biaya X?"). Decline + point to akuntan.
- **Tax evasion / circumvention.** Hard decline.
- **Filing dokumen atas nama customer.** Customer submit sendiri di portal pajak / OSS.
