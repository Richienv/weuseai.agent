# domain-advisory — Hermes skill

Bundle: web-master (Web Creator)
Tier: pro+
Handler: `hermes-skill:domain-advisory` (Hermes reads `templates/domain-comparison/2026-q2.json` snapshot + reasons over customer's profile to recommend)

## Kapan dipakai

Customer minta saran beli domain. Trigger phrases:

- "saran domain"
- "beli domain di mana"
- "domain provider Indonesia mana yang bagus"
- "Niagahoster vs Hostinger"
- "cari domain murah"
- "domain advice"

Juga: setelah `landing-page-builder` / `multi-page-site-builder` complete dan customer perlu URL yang representable.

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `desired_tld` | string | tidak | Default `.com`, alternatif `.id`, `.co.id`, `.my.id` (per kebutuhan Indonesia) |
| `business_kind` | enum: small-biz \| ecommerce \| multi-domain \| personal | tidak | Default small-biz |
| `budget_idr_yr` | int | tidak | Default Rp 200k/tahun (mid range) |
| `priority` | enum: lowest-price \| best-support \| fastest-uptime \| ease-of-use | tidak | Default best-support (rationale: founder-customers value local CS) |

## Yang dilakukan

1. Load `templates/domain-comparison/2026-q2.json` (refreshed quarterly). Snapshot includes per-TLD price + customer-support rating + uptime SLA + transfer policy + free SSL availability.
2. Filter providers based on `desired_tld` availability + `budget_idr_yr` ceiling.
3. Score 3 providers (Niagahoster, IDwebhost, Hostinger) berdasarkan `priority`:
   - **lowest-price**: minimize annual cost for chosen TLD
   - **best-support**: prioritize CS rating + Bahasa Indonesia support
   - **fastest-uptime**: prioritize SLA + historical uptime
   - **ease-of-use**: prioritize dashboard UX + auto-DNS + integration with Vercel
4. Output 3-row comparison table + 1 recommendation with reasoning.
5. **JANGAN** beli atas nama customer. Kasih URL referral provider; customer checkout sendiri.

## Output yang dikembalikan ke customer

Persona-voice wrapper:

> "Berdasarkan profile kamu (small biz, prioritas best-support, budget Rp 200k/tahun), rekomendasi: **Niagahoster**.
>
> Perbandingan untuk `.com`:
> - Niagahoster: Rp 159k/tahun. Support 24/7 Bahasa via WA. Free SSL. Auto-DNS-to-Vercel guide ada.
> - IDwebhost: Rp 145k/tahun. Support office hours. Free SSL.
> - Hostinger: Rp 129k/tahun. Support multi-bahasa Bahasa+English. Free SSL + free email.
>
> Niagahoster menang karena local CS yang jauh lebih responsif kalau ada masalah migration / DNS — buat first-domain customer ini lebih penting daripada saving Rp 30k/tahun.
>
> Beli di [niagahoster.co.id/domain]. Setelah beli, aku bantu setup DNS-to-Vercel via `vercel-deploy-orchestrator`."

## Decline criteria

- Affiliate / kickback request — aku sebut harga dari snapshot publik, tidak ada deal khusus.
- Domain provider di luar 3 yang aku data — flag bahwa data tidak lengkap, customer compare manual.

## Decline kalau missing context

Kalau request cuma "saran domain" — tanya: "Domain buat apa? Bisnis kecil, e-commerce, atau personal? Plus prioritas: harga termurah, support terbaik, atau ease-of-use?"
