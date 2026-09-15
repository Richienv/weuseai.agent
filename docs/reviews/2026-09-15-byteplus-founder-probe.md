# BytePlus founder probe — 2026-09-15

Probe meaning here: confirm env, do not spend money, do not submit Seedance. A free `ListAssets` / `CreateVisualValidateSession` call was not run because AK/SK are still absent. Real-name / enterprise KYC was not faked.

## Keys found (names + locations only)

No live secret values were found. Nothing was invented. `.env` was not committed. Shell history was not read. 1Password CLI is not installed. No matching macOS Keychain service names (`byteplus`, `modelark`, `ARK`, `volcengine`, `seedance`). Process env: all target names absent.

| Name | Where it exists | Live value? |
|---|---|---|
| `BYTEPLUS_MODELARK_API_BASE` | `.env.example` in `weuseai-agent-ai-video` (and the Richie Files copy); Supabase functions secrets | Name present on Supabase only |
| `BYTEPLUS_ARK_ACCESS_KEY` | Code + tests in `weuseai-identity-lane` (`ark-asset-client`, `ai-video-identity`, smoke) | Absent everywhere live |
| `BYTEPLUS_ARK_SECRET_KEY` | Same | Absent |
| `MODELARK_MERCHANT_API_KEY` | Identity-lane worker / tests / plan | Absent |
| `MODELARK_ASSET_HOST` | Code default `ark.ap-southeast-1.byteplusapi.com` | Now set (see below) |
| `MODELARK_API_KEY` / `ARK_API_KEY` / `VOLC_*` | Docs / old agent-tool notes only | Absent |
| `AI_VIDEO_IDENTITY_LIVENESS_BILLING` | Identity-lane handler / tests | Left unset |

Also checked, no matching names: `~/.env.local`, `chara-matcha-web/.env.local`, `richie/.env`, Cursor personal store. Identity-lane / studio-phone / agent-ai-video trees have `.env.example` only (no `.env`, `.env.local`, `.env.vercel`).

## What was set

**Vercel `weuseai-agent`** (`weuseai-agent.vercel.app` / `www.weuseai.id`):

- Set `MODELARK_ASSET_HOST` on **Production** and **Preview** (public hostname, matches the code default).
- Did **not** set `BYTEPLUS_ARK_ACCESS_KEY`, `BYTEPLUS_ARK_SECRET_KEY`, `MODELARK_MERCHANT_API_KEY` (no local values).
- Left `AI_VIDEO_IDENTITY_LIVENESS_BILLING` unset.
- Did not overwrite any existing different secret. First Production write was polluted by a CLI stdin mishap; it was replaced and re-checked (length 34, matches default). Preview was checked the same way.
- Development: not set (not requested).
- Sibling project `weuseai-agent-ai-video`: those three keys remain absent; host was not copied there.

**Supabase** (linked ref `gtjgsligllbjcisiyrah`):

- Set `MODELARK_ASSET_HOST`.
- Kept existing `BYTEPLUS_MODELARK_API_BASE`.
- Three ARK/merchant keys still absent.
- `AI_VIDEO_IDENTITY_LIVENESS_BILLING` still unset.

Env readers are already wired (`resolveArkAssetConfig` → `missing_ark_asset_credentials` without AK/SK). No product code was changed.

## BytePlus console

Not reachable as the founder. Cursor browser had no existing logged-in session and could not attach. Unauthenticated `curl` hits `https://console.byteplus.com/auth/login`. No stored automation credentials. KYC was not completed.

## Remaining founder clicks

1. **Log in** at [https://console.byteplus.com/auth/login](https://console.byteplus.com/auth/login).
2. **Real-name or enterprise auth** (your documents; this cannot be done by an agent). After login: avatar → **My account** → real-name / enterprise verification. Docs: [https://docs.byteplus.com/en/docs/Account/real-name-verification](https://docs.byteplus.com/en/docs/Account/real-name-verification).
3. **Advanced Creation Rights (Entry), free.** Open [https://console.byteplus.com/ark/region:ap-southeast-1/openManagement](https://console.byteplus.com/ark/region:ap-southeast-1/openManagement) (same page: [https://ai.byteplus.com/ark/region:ap-southeast-1/openManagement](https://ai.byteplus.com/ark/region:ap-southeast-1/openManagement)). Activate **Advanced Creation Rights → Entry**. Sign the asset-library authorization if asked. Do **not** buy the $1,400 tier. Guide: [https://docs.byteplus.com/en/docs/ModelArk/2377608](https://docs.byteplus.com/en/docs/ModelArk/2377608).
4. **Confirm Seedance 2.5** is listed as activated on that same page. Do not run a paid video job. Guide: [https://docs.byteplus.com/en/docs/ModelArk/2637911](https://docs.byteplus.com/en/docs/ModelArk/2637911).
5. **IAM user + AK/SK on project `default`.** [https://console.byteplus.com/iam/user/list](https://console.byteplus.com/iam/user/list) → create user → **Add permission** → `ArkFullAccess` → **Project-specific: Yes** → `default`. Then issue Access Key / Secret Key. Policy notes: [https://docs.byteplus.com/en/docs/modelark/1263493](https://docs.byteplus.com/en/docs/modelark/1263493).
6. **ModelArk API key** (this is `MODELARK_MERCHANT_API_KEY`, not the IAM pair): [https://console.byteplus.com/ark/region:ark+ap-southeast-1/apikey](https://console.byteplus.com/ark/region:ark+ap-southeast-1/apikey) → Create API key.
7. **Paste into Vercel + Supabase** (Production + Preview; same three names on `supabase secrets set`). Keep `BYTEPLUS_MODELARK_API_BASE`. Leave `AI_VIDEO_IDENTITY_LIVENESS_BILLING` unset. Do not commit `.env`.
8. After that, a cheap **free** `ListAssets` check is the next probe. Still no Seedance generate.
