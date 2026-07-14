# vercel-deploy-orchestrator — Hermes skill

Bundle: web-app-builder (Web Creator)
Tier: pro+
Handler: `external:vercel-deploy` (calls Vercel REST API via the customer's `VERCEL_TOKEN` env)

## Kapan dipakai

Setelah `landing-page-builder` atau `multi-page-site-builder` selesai dan customer approve. Trigger phrases:

- "deploy"
- "publish"
- "live-kan"
- "kasih URL"
- "promote ke production"
- "ship it"

Juga: ketika customer udah cek preview lokal dan bilang "approve" / "ok" / "go".

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `source_path` | string | ya | Path lokal hasil dari skill sebelumnya (`/tmp/web-creator-out/...`) |
| `project_name` | string | tidak | Default: slug dari business_name. Aku check Vercel projects yang udah ada — kalau udah punya, pakai existing. |
| `target` | enum: preview \| production | tidak | Default preview untuk first deploy; production setelah customer approve preview URL |
| `custom_domain` | string | tidak | Kalau customer udah beli domain, aku setup DNS hookup |
| `env_vars` | array | tidak | Untuk site yang butuh env (mis. WhatsApp endpoint, GA tracking ID). Tidak pernah commit ke source. |

## Yang dilakukan

1. Validasi `VERCEL_TOKEN` ada di customer env. Kalau tidak ada, decline dengan: "Aku butuh VERCEL_TOKEN dulu. Bisa kamu generate di vercel.com/account/tokens, lalu paste di dashboard kamu? Token-nya disimpan encrypted di .env VPS kamu, tidak aku share ke siapa pun."
2. Tar source folder + POST ke Vercel `/v13/deployments` dengan project + token.
3. Poll deployment status sampai `READY` atau `ERROR`. Timeout 5 menit.
4. Kalau success + `target=preview`: kembalikan preview URL ke customer untuk approval.
5. Kalau success + `target=production` + `custom_domain` set: panggil Vercel `/v9/projects/<id>/domains` untuk hookup. Tunjukkan DNS records yang customer perlu set di domain provider.
6. Kalau `target=production` tanpa custom_domain: alias ke `<project_name>.vercel.app` default.
7. Catat `deployments` row di customer DB (Phase 4 — saat ini log-only).

## Output yang dikembalikan ke customer

Persona-voice wrapper untuk preview:

> "Site kamu hidup di [preview-URL]. Cek dulu di mobile + desktop. Kalau udah pas, bilang 'promote' — aku alias ke production / domain kamu."

Persona-voice wrapper untuk production:

> "Live: [final-URL]. Custom domain [domain] udah aku hookup — tinggal kamu set DNS records ini di [provider]: [list records]. Propagation 1-24 jam."

## Decline criteria

- Deploy site yang berisi konten yang melanggar Vercel policy (akan auto-rejected anyway, aku flag dulu).
- Deploy dengan custom domain yang customer belum punya — aku tanya beli dulu via `domain-advisory`.

## Decline kalau missing context

Kalau "deploy" muncul tanpa konteks site sebelumnya — tanya: "Deploy site mana? Bisa kasih path source-nya?"
