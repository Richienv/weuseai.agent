# Template — Monthly Review (Internal)

Review bulanan internal: apa yang bekerja, apa yang tidak, apa berikutnya, tema. Untuk konsumsi founder + exec team — bukan board. Lebih candid, lebih banyak nuance.

Audience: founder, exec team, head-of-function. Format Notion atau Google Doc, 1-2 halaman.

## Variables

- `{{period}}` — bulan review, misal "Oktober 2026".
- `{{review_date}}` — tanggal review session, biasanya minggu pertama bulan berikutnya.
- `{{worked_1}}` / `{{worked_2}}` / `{{worked_3}}` — 3 hal yang bekerja periode ini.
- `{{not_worked_1}}` / `{{not_worked_2}}` — 2 hal yang tidak bekerja, dengan diagnosis.
- `{{theme_id}}` — tema dominan periode ini (1 kalimat).
- `{{next_1}}` / `{{next_2}}` / `{{next_3}}` — 3 fokus bulan depan.
- `{{owner_*}}` — owner per item next.

## Template

```
# Monthly Review — {{period}}

Sesi review: {{review_date}}
Peserta: founder + exec team

---

## Tema bulan ini

{{theme_id}}

Contoh: "Bulan ini terasa seperti transisi dari mode growth ke mode retention. Anda menutup deal-deal besar di Q3, sekarang fokus geser ke memastikan customer-customer baru tetap aktif setelah onboarding."

## Apa yang bekerja

1. **{{worked_1}}** — contoh: "Channel referral aktif lagi. Tiga customer baru bulan ini datang dari referral existing, conversion rate referral 45% (vs cold outbound 8%)."
2. **{{worked_2}}** — contoh: "Auto-greet flow menurunkan support ticket 'cara mulai' sebesar 60%. Customer onboarding terasa lebih smooth."
3. **{{worked_3}}** — contoh: "Standup harian 15 menit (bukan 30) bertahan 3 minggu. Tim engineering merasa lebih produktif."

## Apa yang tidak bekerja

1. **{{not_worked_1}}** — contoh: "Pipeline cold outbound stagnan. Hanya 1 dari 24 outreach yang reply minggu lalu. Diagnosis: copy outreach terlalu generic, belum personalisasi per segmen. Eksperimen bulan depan: split list jadi 3 segmen, copy beda per segmen."
2. **{{not_worked_2}}** — contoh: "Hire senior engineer (1) terlambat 6 minggu dari rencana. Diagnosis: salary range Anda di bawah market untuk level senior di Jakarta. Action: re-benchmark range di review hiring plan bulan depan."

## Apa yang berikutnya

1. **{{next_1}}** — owner: {{owner_1}} — contoh: "Re-write copy outreach per segmen (3 variant). Target ready 12 November."
2. **{{next_2}}** — owner: {{owner_2}} — contoh: "Ship dashboard customer self-serve restart. Target shipped 20 November."
3. **{{next_3}}** — owner: {{owner_3}} — contoh: "Finalkan pricing tier Enterprise untuk board review Desember."

## Catatan candid

Hal-hal yang tidak masuk ke board update tapi penting untuk tim ingat:

- Anda merasa cycle decision-making mulai lambat — terlalu banyak diskusi async di Slack tanpa decision owner. Eksperimen: setiap topik async harus punya satu owner + deadline keputusan 48 jam.
- Tim engineering meminta tooling budget naik Rp 8 jt / bulan (Cursor Pro + Linear Business). Anda approve trial 2 bulan, evaluasi impact ke velocity.

## Review berikutnya

Tanggal: minggu pertama Desember 2026. Agenda: review hasil eksperimen outreach, status hire senior, dan persiapan board update Desember.
```

## Tone guide

Formal tapi lebih candid dari board update — Anda form tetap dipakai. Diagnosis untuk "tidak bekerja" wajib, bukan hanya identifikasi. Catatan candid boleh berisi friction / decision yang masih bergerak. Action items selalu ada owner + tanggal. Zero exclamation marks, zero kata banned.
