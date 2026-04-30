# 06 — Research Preview: Build vs Buy + Production Patterns

**V0 · April 2026 · INTERNAL · DECISION-FOCUSED**
*Companion to: `04-Liren-Stand-Strategy.md` + `05-One-Click-Build-Plan.md` + `liren-stand/` scaffold*
*Purpose: catch obvious "you're rebuilding what already exists" mistakes sebelum 2 minggu kerja terbuang*

---

## Executive Summary — 5 findings yang ubah build plan

1. **Drop custom LLM proxy. Pakai LiteLLM.** Sudah open-source, OpenAI-compatible untuk 100+ model, ada built-in rate limit, caching, observability. Hemat 1-2 minggu kerja vs `packages/proxy/src/index.ts` yang baru kita tulis.

2. **Refactor Hermes pakai Mastra.** Framework agent TypeScript-native, dibangun di atas Vercel AI SDK, **dipakai Replit Agent 3 di production** (use case persis seperti Liren Stand). Hermes from-scratch buang waktu yang sudah di-solve.

3. **WhatsApp Web ban risk lebih besar dari ekspektasi.** Multiple GitHub issues documented akun ke-ban di production walaupun kode sama dengan local. Telegram harus default channel, WhatsApp opt-in dengan disclosure tegas dan rate-limit ketat.

4. **Per-customer VPS = hardware isolation otomatis.** Itu strength arsitektur yang nggak saya tekankan cukup. Karena tiap pelanggan punya VPS sendiri (KVM = full virtualization), kita nggak butuh gVisor/Firecracker. **Architectural advantage** vs MyClaw yang belum tentu jelas isolation modelnya.

5. **Cloud-init plaintext secret = utang teknis sejak Day 1.** Pattern yang saya tulis di `cloud-init.ts` bake API keys di plaintext. Ganti ke bootstrap pattern: VPS dapat short-lived token → fetch secrets dari Infisical atau Doppler runtime. Saving ini before launch jauh lebih mudah dari setelah ada 50 pelanggan.

**Net effect:** revisi ini hemat ~2 minggu engineering time + reduce future security/operational debt. Stack jadi lebih kuat dengan komponen yang sudah battle-tested di Replit, PayPal, Klarna.

---

## Part 1 — Build vs Buy keputusan

### 1.1 LLM proxy: **PAKAI LiteLLM**, drop custom proxy

**Yang sudah kita tulis:** `packages/proxy/src/index.ts` — Cloudflare Worker dengan JWT auth, credit metering, route ke Zhipu/DeepSeek/Anthropic. ~200 baris kode.

**LiteLLM offers:**

- OpenAI-compatible API untuk **100+ provider** (Zhipu, DeepSeek, Claude, Gemini, plus self-hosted Ollama/vLLM)
- Built-in: rate limiting, response caching (semantic + exact), spending tracking per virtual key, retry/fallback logic, observability hooks
- Open-source (Python), self-host gratis. Atau pakai cloud version dengan free tier
- **Virtual API keys per pelanggan** — sudah ada built-in, nggak perlu bangun JWT dari nol

**Comparison:**

| Feature | Custom proxy (yang kita tulis) | LiteLLM |
|---------|--------------------------------|---------|
| Multi-provider routing | Manual (3 provider) | 100+ otomatis |
| Credit metering per pelanggan | Custom Supabase RPC | Built-in dengan virtual keys |
| Caching | Tidak ada | Semantic + exact, configurable |
| Rate limiting | Manual | Built-in per key/model/time-window |
| Observability | Logs sederhana | Langfuse, Helicone, Datadog adapters |
| Retry/fallback | Manual | Built-in dengan policy config |
| Maintenance | Kamu | Komunitas |
| Time to setup | 1-2 minggu polish | 1-2 hari |

**Migration path:**

1. Hapus `packages/proxy/` dari scaffold
2. Deploy LiteLLM via Docker (1 container di Mac Mini atau Cloudflare container)
3. Configure provider keys + virtual keys per pelanggan
4. Hermes pakai LiteLLM endpoint (sama-sama OpenAI-compatible, no code change)
5. Credit tracking pakai LiteLLM's built-in spend tracker

**Trade-off:** kehilangan code ownership di proxy layer. Worth it karena layer ini bukan differentiator — itu plumbing yang harus reliable, bukan unik.

**Saran konkret:** drop `packages/proxy/`. Saya bisa scaffold LiteLLM Docker setup + configuration kalau kamu confirm.

---

### 1.2 Agent framework: **PAKAI Mastra**, drop Hermes from-scratch

**Mastra adalah TypeScript-native agent framework**, dibangun di atas Vercel AI SDK. Built-in: memory (short + long term), tool calling (MCP-native), observability, evaluation, agent workflow graph, streaming.

**Production track record (verified):**

- **Replit Agent 3** — pakai Mastra. Improved task success rate dari 80% → 96%. Use case persis seperti Liren Stand: managed AI agent per pelanggan
- **PayPal** — production
- **Sanity, Brex, SoftBank, Marsh McLennan** — production
- $13M seed round Oct 2025 (signal komitmen tim untuk maintain panjang)

**Comparison vs custom Hermes:**

| Aspek | Custom Hermes (yang kita tulis) | Mastra |
|-------|----------------------------------|--------|
| LLM client + routing | Manual OpenAI client | Vercel AI SDK (built-in) |
| Memory / chat history | In-memory Map | Built-in dengan persistence |
| Tool calling / function | Belum ada | Built-in dengan MCP support |
| Workflow graph (multi-step) | Belum ada | Built-in |
| Streaming responses | Belum ada | Built-in |
| Evaluation / testing | Belum ada | Built-in |
| MCP marketplace integration | Harus build | Native MCP client |

**Yang penting:** Mastra **native MCP**. Marketplace skill kamu bisa di-distribute as MCP servers, langsung kompatibel.

**Migration path:**

1. `packages/hermes/` direstrukturisasi: pakai Mastra sebagai inti
2. Telegram adapter tetap (Mastra agnostic ke channel)
3. Future skill marketplace = MCP servers (open standard, ada ecosystem)
4. Spend stays di LiteLLM proxy (Mastra → LiteLLM → provider)

**Trade-off:** dependency pada Mastra. Mitigasi: Mastra open-source (Apache 2.0), self-hostable, founders dari Gatsby (track record). Risk acceptable.

**Saran konkret:** restructure `packages/hermes/` untuk Mastra + AI SDK. Saya bisa buatkan migration patch.

---

### 1.3 PaaS layer: **REFERENCE Coolify**, jangan pakai sebagai foundation

**Coolify adalah open-source MyClaw** essentially. Tapi arsitekturnya berbeda dari yang kita butuhin:

- Coolify = **per-server PaaS** (1 admin server deploy banyak app)
- Liren Stand = **per-customer VPS** (1 pelanggan = 1 VPS sendiri)

Kita nggak bisa pakai Coolify as-is. Tapi UI/UX patterns mereka worth dipelajari:

| Coolify pattern | Yang bisa kita curi |
|-----------------|---------------------|
| One-click app templates | Marketplace skill installer |
| Service status dashboard | Customer dashboard "Status Agent" widget |
| Auto-deploy from git | Hermes auto-update dari Docker registry |
| Resource monitoring per app | VPS resource panel |

**Saran konkret:** install Coolify di test VPS untuk study UX. Screenshot key flow, adopt yang masuk Liren aesthetic.

---

### 1.4 Customer dashboard: **REFERENCE LibreChat**, bukan dipakai

**LibreChat** punya:

- Full user management, OAuth (Discord, GitHub, Google, Azure AD)
- Multi-provider LLM support
- Workspaces / per-user isolation
- Plugin/MCP system
- Polished React UI

**Kalau dipakai langsung:** terlalu banyak fitur enterprise yang kita nggak butuh, customization curve berat untuk Liren aesthetic.

**Yang worth dicuri:**

- Auth flow patterns (OAuth + JWT + RBAC)
- Workspace isolation model
- Plugin architecture (mirip MCP)
- Settings UI patterns

**Saran konkret:** clone LibreChat repo, baca `api/` dan `client/` source untuk reference. Tapi build dashboard kita custom Next.js dengan Liren aesthetic.

---

### 1.5 Secrets management: **PAKAI Infisical** (open-source self-host)

**Masalah dengan plaintext cloud-init di scaffold sekarang:**

```yaml
# packages/provisioning/src/cloud-init.ts (line 32-37) — RISKY
write_files:
  - path: /opt/liren/.env
    content: |
      LLM_PROXY_TOKEN=${params.llmProxyToken}    # plaintext di cloud-init
      TELEGRAM_BOT_TOKEN=${params.telegramBotToken}
```

Kalau cloud-init log ter-leak, atau IDCloudHost dashboard pelanggan kena compromise, semua secret terbuka.

**Best practice 2026 (verified):** bootstrap dengan **minimal credentials**, fetch secret runtime dari secret manager.

**Recommended pattern:**

1. VPS provisioned dengan **bootstrap token** saja (short-lived, pelanggan-specific JWT)
2. Hermes container start → call Infisical API dengan bootstrap token → exchange untuk full env
3. Secret rotation tinggal update di Infisical, semua pelanggan VPS auto-pick-up

**Provider comparison (open-source):**

| Tool | Pros | Cons |
|------|------|------|
| **Infisical** | Open-source, self-host, automatic rotation, free for small teams | Tooling masih muda dibanding Vault |
| **Doppler** | Best DX, instant onboarding | Closed-source, $$ at scale |
| **HashiCorp Vault** | Most powerful, dynamic secrets | Heavy ops, enterprise-grade |

**Saran konkret:** pakai **Infisical** self-host. Sat di Mac Mini control plane atau small VPS terpisah. Dollar cost: nol. Time to setup: 1-2 hari. Saving: huge — kalau secret rotation di-skip karena susah, itu vector breach.

---

### 1.6 Payment: **KEEP Xendit** (already verified)

Research Indonesia market confirmed:

| Provider | Pros | Cons | Best for |
|----------|------|------|----------|
| **Xendit** | Multi-tenant marketplace support, recurring billing, modern API, QRIS 0.63% | Tier kecil masih ada minimum | **Liren Stand ✓** |
| Midtrans | GoPay native, paling banyak metode | Multi-tenant kurang | Single-merchant |
| DOKU | Pioneer, recurring card kuat | API agak kuno | Recurring card primary |

**Rekomendasi:** Xendit confirmed. Implementation di build plan tetap.

---

## Part 2 — Production patterns

### 2.1 WhatsApp Web automation: risk lebih tinggi dari yang saya bilang sebelumnya

**Apa yang ditemukan di research:**

GitHub issues (Baileys, whatsapp-web.js) mendokumentasikan ban kasus di production yang **identik dengan local development environment** yang nggak ke-ban. Pattern:

- Local: chat 100 message/jam → fine
- Production VPS: chat 100 message/jam → ban dalam beberapa hari

Why: WhatsApp's anti-spam ML detect bukan dari rate, tapi dari pattern (IP residen vs datacenter IP, device fingerprint, traffic shape). Production VPS = datacenter IP = higher scrutiny.

**Anti-ban patterns (partial mitigation):**

- Random delay 2-10 detik antar message
- Typing simulation sebelum send
- Limit 100-200 message/hari pertama akun
- Use residential proxy (mahal, complicated)
- Implement custom auth state (jangan pakai `useMultiFileAuthState` yang demo-grade)
- Rotate user-agent fingerprint
- Sleep cycle realistic (jangan jalan 24/7)

**Tapi:** none of these are 100% effective. WhatsApp anti-spam ML evolve terus.

**Implication untuk Liren Stand:**

Saya recommend revisi positioning WhatsApp dari "primary channel" ke **"opt-in dengan risk disclosure tegas":**

```
Default: Telegram (gratis, nggak ada ban risk, full feature)
Opt-in: WhatsApp Web (limited use, ada risk ban, kamu yang pegang resiko)
```

Atau: **WhatsApp Business API** untuk pelanggan yang serius — lebih mahal tapi legal dan reliable. Itu opsi tier "Pro+" atau bundle terpisah.

**Saran konkret:**

1. Phase 1 launch: Telegram only. Period.
2. Phase 2 (Month 2-3): WhatsApp Web sebagai opt-in beta dengan signed disclaimer
3. Phase 3+ (atau tier atas): WhatsApp Business API integration untuk pelanggan yang butuh reliability

Ini **menurunkan klaim marketing** "WhatsApp native AI agent" tapi **menaikkan trust** dengan jujur tentang risk.

---

### 2.2 Multi-tenant isolation: kita actually di posisi bagus

Container security research summary:

```
Docker (shared kernel) < gVisor (syscall intercept) < Firecracker (microVM, hardware isolation)
```

**Kalau kita pakai Docker shared host (kayak Coolify, Replit, Railway):** kernel vulnerability = semua tenant exposed. Butuh gVisor minimum.

**Kalau kita pakai per-customer VPS (current architecture):** tiap pelanggan dapat **KVM = full hardware virtualization**. Itu equivalent dengan Firecracker isolation, tanpa overhead engineering Firecracker.

**Architecture advantage** yang belum kita expose di marketing: setiap pelanggan punya isolation hardware-level. Lebih kuat dari MyClaw (yang belum jelas isolation modelnya — kemungkinan Docker shared).

**Yang masih harus kita pastikan:**

1. **Docker hardening di dalam VPS:**
   - `--read-only` filesystem kecuali volumes specified
   - Drop capabilities: `--cap-drop=ALL --cap-add=NET_BIND_SERVICE`
   - Non-root user di container (sudah kita lakuin di Dockerfile)
   - Resource limits (`--memory`, `--cpus`)

2. **Network isolation per VPS:**
   - Default: VPS firewall block semua inbound kecuali 22 (SSH) dan 3000 (Hermes health)
   - Outbound: allow only LiteLLM proxy + Telegram + WA + IDCloudHost API

3. **Customer secret isolation:**
   - Secret pelanggan A nggak boleh ke-akses dari VPS pelanggan B
   - Infisical project per pelanggan

**Saran konkret:** documentation-only update di build plan untuk highlight isolation strength. Marketing copy: "agent kamu jalan di server pribadi kamu, bukan dibagi dengan ribuan pelanggan lain."

---

### 2.3 Cloud-init: bootstrap pattern, jangan plaintext

**Ganti `packages/provisioning/src/cloud-init.ts` jadi bootstrap pattern:**

```yaml
#cloud-config
# Hanya bootstrap token + Infisical URL — bukan secret asli
write_files:
  - path: /opt/liren/bootstrap.json
    permissions: '0600'
    content: |
      {
        "customer_id": "${customerId}",
        "infisical_token": "${shortLivedBootstrapToken}",
        "infisical_url": "https://infisical.lirenlabs.ai"
      }

  - path: /opt/liren/run.sh
    permissions: '0755'
    content: |
      #!/bin/bash
      set -e
      # Fetch real secrets dari Infisical pakai bootstrap token
      eval $(infisical export --token=$(jq -r .infisical_token /opt/liren/bootstrap.json))
      docker pull lirenlabs/hermes:latest
      docker run -d --env-file /tmp/hermes.env ... lirenlabs/hermes:latest

runcmd:
  - apt-get install -y infisical-cli
  - bash /opt/liren/run.sh
```

**Bootstrap token** valid hanya 1 jam, scope hanya ke customer's project. Kalau bocor, damage minimal.

**Saving:** rotation Telegram token / Anthropic key tanpa redeploy semua VPS. Critical untuk scale.

---

## Part 3 — Updated stack recommendation

| Layer | Original plan | Revised plan | Rationale |
|-------|---------------|---------------|-----------|
| LLM proxy | Custom CF Worker | **LiteLLM (self-host Docker)** | Battle-tested, save 1-2 weeks |
| Agent framework | Hermes scratch | **Mastra (TypeScript-native)** | Replit Agent 3 production proof |
| Agent SDK | Manual | **Vercel AI SDK** (via Mastra) | Industry standard streaming + tools |
| Skill ecosystem | Custom format | **MCP servers** | Open standard, ecosystem |
| Container security | Docker default | **Docker hardening** (read-only, cap-drop) | Defense in depth |
| Tenant isolation | VPS-per-customer | **Same — already strong** | Hardware isolation = win |
| Secrets | Plaintext cloud-init | **Bootstrap → Infisical** | Rotation, audit, breach resistance |
| Payment | Xendit | **Xendit (confirmed)** | Verified best |
| WhatsApp | Primary channel | **Telegram primary, WA opt-in** | Ban risk too high for primary |
| VPS provider | IDCloudHost | **IDCloudHost (confirmed)** | API verified, cloud-init working |
| Customer dashboard | Next.js custom | **Next.js custom + LibreChat reference** | Brand-fit + proven patterns |

### Updated cost math (revised stack)

**Starter Rp 299.000:**

| Item | Rupiah/bulan |
|------|---------------|
| Revenue | 299.000 |
| VPS IDCloudHost (KVM 1) | -145.000 |
| Xendit QRIS 0.63% | -1.884 |
| LiteLLM hosting (Mac Mini gratis, atau ~$5 small VPS) | -2.500 |
| Infisical self-host (same Mac Mini, gratis) | 0 |
| LLM (GLM-4-Flash gratis, DeepSeek overflow ~$0.05) | -800 |
| **Margin gross** | **~148.816 (~50%)** |

Hampir nggak berubah dari hitungan sebelumnya. Yang banyak berubah: kompleksitas operasional turun, time-to-launch naik.

---

## Part 4 — Open source projects worth studying

| Project | Why study | What to steal |
|---------|-----------|----------------|
| **Coolify** | OSS PaaS, polished UX | UI patterns, deployment status flow |
| **LibreChat** | Multi-user AI chat, OAuth, polished | Auth flow, workspace pattern, plugin architecture |
| **AnythingLLM** | Per-workspace isolation, RAG | Workspace boundary, document handling |
| **Open WebUI** | RBAC + multi-user | Admin/user roles |
| **Mastra** | Production agent framework | Adopt directly |
| **LiteLLM** | LLM proxy reference | Adopt directly |
| **Infisical** | OSS secrets manager | Adopt directly |
| **Replit Agent 3** | Most similar product to Liren Stand | Architecture studies, blog posts |

---

## Part 5 — Revised build plan implications

### What changes in `liren-stand/` scaffold

1. **`packages/proxy/` → DELETE.** Replace dengan LiteLLM Docker config.

2. **`packages/hermes/` → REFACTOR.** Pakai Mastra + Vercel AI SDK sebagai inti. Telegram adapter tetap.

3. **`packages/provisioning/src/cloud-init.ts` → REWRITE.** Bootstrap pattern, bukan plaintext secrets.

4. **NEW: `infrastructure/litellm/`** — Docker compose + config untuk LiteLLM self-host

5. **NEW: `infrastructure/infisical/`** — self-host Infisical setup di Mac Mini

### Updated 90-day plan timing

| Phase | Original | Revised |
|-------|----------|---------|
| Week 1 — Foundation | 7 hari hand-rolled | 4-5 hari (LiteLLM + Mastra cut work) |
| Week 2 — MVP polish | 7 hari | 6-7 hari (sama) |
| Week 3-4 — Layer 2 | 14 hari | 12 hari (MCP-native skill marketplace lebih cepat) |
| Week 5-6 — Layer 3 + launch | 14 hari | 14 hari (sama) |

**Net saving: ~3-5 hari engineering time.** Plus reduced operational complexity, plus better observability dari Day 1.

---

## Part 6 — Open questions yang masih perlu research lanjutan

Hal-hal yang nggak ke-research di preview ini, masih harus dipikirkan:

1. **Mac Mini sebagai single point of failure** — kalau Mac Mini down, semua provisioning berhenti, LiteLLM proxy berhenti. Mitigasi: sewa cloud VPS sebagai failover ($10/bulan), atau migrate ke Cloudflare Workers untuk komponen yang bisa.

2. **Backup + disaster recovery** — kalau VPS pelanggan crash, gimana restore? Daily backup ke Supabase Storage cukup? Atau perlu snapshot VPS-level (IDCloudHost feature)?

3. **Indonesian compliance** — UU PDP (Personal Data Protection Law, effective Oct 2024). Implication untuk Liren yang pegang chat data pelanggan di VPS. Konsultasi legal needed sebelum scale.

4. **Customer support scale** — solo founder + 25-100 pelanggan = berapa lama bisa di-handle sendiri? Threshold untuk first hire.

5. **Migration plan** — kalau IDCloudHost ada outage 24-jam, bisa nggak migrate VPS ke Vultr/Hetzner cepat? Test ini sekali sebelum scale.

6. **Marketplace economics** — gimana split revenue kalau third-party developer bikin skill premium? 70/30? 80/20? Norm di App Store / Steam / Patreon perlu studi.

7. **Tier upgrade flow** — pelanggan Starter mau upgrade ke Pro: VPS migrate atau spawn baru? UX-nya gimana? Data continuity?

---

## Part 7 — Decision framework untuk ke depan

Ke depan, kalau muncul pertanyaan "build or buy?" — pakai filter ini:

**BUY / USE OSS kalau:**
- Layer plumbing yang banyak di-solve di market (LLM routing, secrets, container orchestration)
- Bukan differentiator kamu
- Ada open-source dengan production track record
- Vendor lock-in rendah (open standard, exportable data)

**BUILD kalau:**
- Itu **differentiator** Liren (Liren aesthetic, Bahasa-first UX, marketplace curation, brand voice in agent responses)
- Niche yang nggak ada di market
- Custom karena Indonesian context (payment integration, Bahasa parsing, local LLM tuning)
- Tipis di market tapi mature in-house knowledge

**Real example:** dashboard Liren — BUILD (differentiator). LLM proxy — BUY/USE (plumbing). Hermes orchestration — USE (Mastra is the differentiator's substrate).

---

## Action items dari research preview

**This week (sebelum Day 1 IDCloudHost test):**

1. Setup LiteLLM container (test config)
2. Read Mastra docs + tutorial — confirm fit untuk Hermes
3. Spin up Infisical self-host instance, test secret injection flow
4. Decision: WhatsApp positioning di pricing page (Telegram default vs WA opt-in)

**Setelah Day 1 IDCloudHost test pass:**

1. Update `liren-stand/` scaffold: drop proxy, refactor hermes ke Mastra, rewrite cloud-init
2. Document Indonesian compliance (UU PDP) requirements
3. Test VPS migration plan (IDCloudHost → Vultr backup)

**Ongoing:**

- Subscribe Replit Engineering blog (Agent 3 architecture posts)
- Follow Mastra changelog (framework yang akan jadi inti)
- Watch LiteLLM + Infisical updates

---

## Sources

**Open-source PaaS:**
- [Coolify vs CapRover vs Dokku 2026](https://selfhostable.dev/blog/coolify-vs-caprover-vs-dokku/)
- [Dokploy comparison](https://docs.dokploy.com/docs/core/comparison)

**LLM gateways:**
- [LLM Gateway comparison 2026](https://www.helicone.ai/blog/top-llm-gateways-comparison-2025)
- [LiteLLM alternatives](https://www.pomerium.com/blog/litellm-alternatives)
- [Portkey vs LiteLLM vs OpenRouter 2026](https://www.pkgpulse.com/guides/portkey-vs-litellm-vs-openrouter-llm-gateway-2026)

**WhatsApp automation risk:**
- [Baileys ban issue (production)](https://github.com/WhiskeySockets/Baileys/issues/2309)
- [WhatsApp AI Framework anti-ban](https://github.com/cloud8877-source/whatsapp-ai-framework)
- [OpenClaw WhatsApp risks](https://zenvanriel.com/ai-engineer-blog/openclaw-whatsapp-risks-engineers-guide/)

**Container isolation:**
- [Firecracker vs gVisor (Northflank)](https://northflank.com/blog/firecracker-vs-gvisor)
- [Sandboxing AI agents 2026](https://northflank.com/blog/how-to-sandbox-ai-agents)

**Secrets management:**
- [Infisical vs Doppler vs Vault 2026](https://www.pkgpulse.com/blog/infisical-vs-doppler-vs-hashicorp-vault-secrets-2026)
- [Infisical review 2026](https://cybersecurityo.com/secrets-management/infisical-review/)

**Indonesia payment:**
- [Komparasi Payment Gateway Indonesia](https://ripandis.com/blog/komparasi-payment-gateway-indonesia)
- [Xendit vs Midtrans vs DOKU 2025](https://wartaekonomi.co.id/read583685/perbandingan-payment-gateway-indonesia-2025-midtrans-vs-xendit-vs-doku-untuk-pemilik-usaha)

**Agent frameworks:**
- [Mastra TypeScript framework](https://mastra.ai/)
- [Mastra GitHub](https://github.com/mastra-ai/mastra)
- [Agent framework comparison 2026 (Speakeasy)](https://www.speakeasy.com/blog/ai-agent-framework-comparison)
- [Best open-source agent frameworks 2026 (Firecrawl)](https://www.firecrawl.dev/blog/best-open-source-agent-frameworks)
- [Replit Agent 3 + Mastra production case](https://www.generative.inc/mastra-ai-the-complete-guide-to-the-typescript-agent-framework-2026)

**Multi-user AI deployment references:**
- [LibreChat vs AnythingLLM vs Open WebUI 2026](https://toolhalla.ai/blog/open-webui-vs-anythingllm-vs-librechat-2026)

---

*Last updated: 2026-04-27 · Author: Richie + Hermes*
*Next research review: setelah LiteLLM + Mastra POC test*
