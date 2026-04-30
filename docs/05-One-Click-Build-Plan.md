# 05 — One-Click Hermes Build Plan

**V0 · April 2026 · INTERNAL · BUILD-READY**
*Companion to: `04-Liren-Stand-Strategy.md`*
*Target: Phase 1 launch dalam 2 minggu (MVP), full system dalam 6 minggu*

---

## 1. Definisi "one-click"

Pelanggan klik "Subscribe" → 5 menit kemudian agent mereka hidup di WhatsApp/Telegram, siap dipakai. **Zero touch dari Richie** sepanjang proses (kecuali support eksepsional).

### Time budget per step

| Step | Yang dilihat pelanggan | Yang terjadi behind | Target |
|------|-------------------------|----------------------|--------|
| 1 | Klik tier di pricing page | Redirect ke Xendit | <1 detik |
| 2 | Bayar via QRIS/GoPay/transfer | Xendit process | 30-90 detik |
| 3 | Halaman "agent kamu sedang dipersiapkan" | Webhook trigger → IDCloudHost API → spin up VPS | 60-120 detik |
| 4 | Notifikasi Telegram + dashboard refresh | VPS ready → Docker pull Hermes → start container | 90-120 detik |
| 5 | QR code muncul di dashboard + Telegram | whatsapp-web.js generate QR | <5 detik |
| 6 | Pelanggan scan QR di HP | WA Web auth | 15-30 detik |
| 7 | Agent live confirmation | Hermes ready, test ping | <10 detik |
| **Total** | — | — | **~5 menit** |

**Critical assumption:** IDCloudHost API bisa provision VPS dalam ≤120 detik. **Wajib di-test Day 1** sebelum apa pun yang lain dibangun.

---

## 2. Architecture

### High-level diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  PELANGGAN                                                       │
│  Browser (lirenlabs.ai) → WhatsApp app (HP) ← → Telegram (HP)   │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  EDGE LAYER (Vercel + Cloudflare)                                │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │ Landing page   │  │ Customer dash    │  │ LLM proxy       │ │
│  │ (Next.js)      │  │ (Next.js)        │  │ (CF Worker)     │ │
│  └────────────────┘  └──────────────────┘  └─────────────────┘ │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  CONTROL PLANE (Mac Mini)                                        │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │ Provisioning   │  │ Telegram bot     │  │ Webhook handler │ │
│  │ service        │  │ @LirenStandBot   │  │ (Xendit)        │ │
│  └────────────────┘  └──────────────────┘  └─────────────────┘ │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATA LAYER (Supabase)                                           │
│  Auth · customers · subscriptions · vps_instances ·              │
│  credits · usage_log · marketplace_skills · audit_log            │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  CUSTOMER VPS (IDCloudHost, one per customer)                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Docker: Hermes container                                     ││
│  │   ├─ ARIA (meeting agent)                                    ││
│  │   ├─ GHOST (job search agent)                                ││
│  │   ├─ ICARUS (LinkedIn agent)                                 ││
│  │   ├─ whatsapp-web.js (channel)                               ││
│  │   └─ skill loader (marketplace install)                      ││
│  └─────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### Component inventory

| # | Component | Tech | Status | Owner |
|---|-----------|------|--------|-------|
| 1 | Landing page (lirenlabs.ai) | HTML/Next.js | **Sudah ada** (`liren-labs-site-v01/`) | Richie |
| 2 | Pricing page | Next.js | Belum | New |
| 3 | Customer dashboard | Next.js | Belum | New |
| 4 | Auth | Supabase Auth | Belum | New |
| 5 | Database | Supabase | Sebagian | Extend |
| 6 | Xendit checkout integration | Xendit SDK | Belum | New |
| 7 | Webhook handler | Supabase Edge Function | Belum | New |
| 8 | Provisioning service | Node.js + IDCloudHost API | Belum | New |
| 9 | Hermes Docker image | Dockerfile + Hermes code | Belum | Repackage |
| 10 | LLM proxy | Cloudflare Worker | Belum | New |
| 11 | Telegram bot (@LirenStandBot) | Telegram Bot API | Sebagian | Extend |
| 12 | WhatsApp Web integration | whatsapp-web.js | Belum | New |
| 13 | Marketplace registry | Supabase + skill manifest | Belum | New |
| 14 | Audit log | Supabase | Belum | New |

---

## 3. MVP scope (Week 1-2)

**Goal:** Onboard 5 beta pelanggan gratis. Validate end-to-end flow. NOT production launch.

### IN scope

- Pricing page (Starter 299k, Pro 399k)
- Xendit checkout (sandbox dulu, production switch akhir Week 2)
- Webhook handler + provisioning service
- IDCloudHost VPS spin-up
- Hermes Docker image (basic — 1 sub-agent dulu, ARIA untuk Meeting)
- Telegram bot onboarding (delivery channel di Phase 1, WA di Layer 2)
- Customer dashboard minimal: status agent, balance credits, button "Top Up"
- LLM proxy (Cloudflare Worker) dengan credit metering
- Supabase schema: customers, subscriptions, vps_instances, credits, usage_log

### OUT of scope (defer ke Layer 2-3)

- WhatsApp Web integration (Telegram cukup untuk validate flow)
- Marketplace UI (skill di-install hardcoded di Hermes image)
- Auto-update Hermes
- Backup/restore
- Audit log
- Premium skill payment
- Specialised Trained Agent (Lamaran, LinkedIn) di Marketplace

---

## 4. Critical components — code skeletons

### 4.1. Supabase schema (Day 1)

```sql
-- customers: 1 row per pelanggan
create table customers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  telegram_chat_id text,
  whatsapp_number text,
  display_name text,
  created_at timestamptz default now()
);

-- subscriptions: tier + lifecycle
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  tier text check (tier in ('starter', 'pro')),
  xendit_subscription_id text,
  status text check (status in ('active', 'paused', 'canceled')),
  started_at timestamptz default now(),
  next_billing_at timestamptz
);

-- vps_instances: 1 row per VPS
create table vps_instances (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  idcloudhost_vps_id text not null,
  ip_address inet,
  ssh_key_id text,
  region text default 'jakarta',
  status text check (status in ('provisioning', 'running', 'stopped', 'failed')),
  created_at timestamptz default now()
);

-- credits: prepaid balance
create table credits (
  customer_id uuid primary key references customers(id),
  balance_usd_cents integer default 0,  -- store as cents to avoid float
  updated_at timestamptz default now()
);

-- usage_log: every Claude call
create table usage_log (
  id bigserial primary key,
  customer_id uuid references customers(id),
  vps_instance_id uuid references vps_instances(id),
  model text,
  input_tokens integer,
  output_tokens integer,
  cost_usd_cents integer,
  created_at timestamptz default now()
);

-- credit_topups: every Xendit payment that adds credits
create table credit_topups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  xendit_invoice_id text unique,
  amount_idr integer,
  credits_usd_cents integer,
  created_at timestamptz default now()
);

create index idx_usage_log_customer_time on usage_log(customer_id, created_at desc);
create index idx_subscriptions_customer on subscriptions(customer_id);
```

### 4.2. Xendit checkout + webhook (Day 2-3)

Pricing page button → POST `/api/checkout`:

```typescript
// app/api/checkout/route.ts
import { Xendit } from 'xendit-node'
import { supabase } from '@/lib/supabase'

const xendit = new Xendit({ secretKey: process.env.XENDIT_SECRET! })

export async function POST(req: Request) {
  const { tier, email } = await req.json()
  const amount = tier === 'starter' ? 299_000 : 399_000

  // Create or fetch customer
  const { data: customer } = await supabase
    .from('customers')
    .upsert({ email })
    .select()
    .single()

  // Create Xendit invoice
  const invoice = await xendit.Invoice.createInvoice({
    data: {
      externalId: `liren-${customer!.id}-${Date.now()}`,
      amount,
      payerEmail: email,
      description: `Liren Stand ${tier} subscription`,
      successRedirectUrl: `https://lirenlabs.ai/stand/welcome?cid=${customer!.id}`,
      paymentMethods: ['QRIS', 'OVO', 'DANA', 'LINKAJA', 'BCA', 'BNI', 'BRI', 'MANDIRI']
    }
  })

  return Response.json({ invoice_url: invoice.invoiceUrl })
}
```

Xendit webhook → Supabase Edge Function:

```typescript
// supabase/functions/xendit-webhook/index.ts
serve(async (req) => {
  const callback = await req.json()
  
  // Verify Xendit signature
  if (!verifyXenditSignature(req)) {
    return new Response('unauthorized', { status: 401 })
  }
  
  if (callback.status !== 'PAID') return new Response('ok')
  
  // Parse external_id to get customer_id
  const customerId = callback.external_id.split('-')[1]
  
  // Determine tier from amount
  const tier = callback.amount === 299_000 ? 'starter' : 'pro'
  
  // Insert subscription
  await supabase.from('subscriptions').insert({
    customer_id: customerId,
    tier,
    xendit_subscription_id: callback.id,
    status: 'active',
    next_billing_at: new Date(Date.now() + 30 * 24 * 3600 * 1000)
  })
  
  // Trigger provisioning (call Mac Mini)
  await fetch(`${PROVISIONING_URL}/spin-up`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${PROVISIONING_TOKEN}` },
    body: JSON.stringify({ customerId, tier })
  })
  
  // Add starter credits (100k IDR worth = ~$6 = 600 cents)
  const starterCredits = tier === 'starter' ? 600 : 1500
  await supabase.from('credits').upsert({
    customer_id: customerId,
    balance_usd_cents: starterCredits
  })
  
  return new Response('ok')
})
```

### 4.3. Provisioning service (Day 4-5) — the heart of "one-click"

```typescript
// provisioning/spin-up.ts
import { IDCloudHost } from './idcloudhost-client'
import { ssh } from './ssh-client'
import { telegram } from './telegram'
import { supabase } from './supabase'

export async function provisionCustomer(customerId: string, tier: 'starter' | 'pro') {
  const log = (msg: string) => console.log(`[${customerId}] ${msg}`)
  
  try {
    // 1. Create VPS via IDCloudHost API
    log('Creating VPS...')
    const spec = tier === 'starter'
      ? { vcpu: 1, memory: 4096, disk: 50 }   // KVM 1
      : { vcpu: 2, memory: 8192, disk: 100 }  // KVM 2
    
    const vps = await IDCloudHost.createVPS({
      name: `liren-${customerId.slice(0, 8)}`,
      ...spec,
      os: 'ubuntu-24.04',
      region: 'jakarta',
      ssh_key: process.env.IDCLOUDHOST_SSH_KEY_ID!
    })
    
    // 2. Save to DB immediately (status: provisioning)
    await supabase.from('vps_instances').insert({
      customer_id: customerId,
      idcloudhost_vps_id: vps.id,
      ip_address: vps.public_ip,
      status: 'provisioning'
    })
    
    // 3. Wait for SSH ready
    log('Waiting for SSH...')
    await waitForSSH(vps.public_ip, { timeoutMs: 120_000 })
    
    // 4. Run setup script (idempotent)
    log('Running setup...')
    await ssh.exec(vps.public_ip, [
      'curl -fsSL https://get.docker.com | sh',
      'docker pull lirenlabs/hermes:latest',
      `docker run -d --name hermes --restart=unless-stopped \
         -e CUSTOMER_ID=${customerId} \
         -e LLM_PROXY_URL=https://proxy.lirenlabs.ai \
         -e LLM_PROXY_TOKEN=${await mintProxyToken(customerId)} \
         -e TELEGRAM_BOT_TOKEN=${process.env.TELEGRAM_TOKEN} \
         -e SUPABASE_URL=${process.env.SUPABASE_URL} \
         -e SUPABASE_KEY=${process.env.SUPABASE_ANON_KEY} \
         -p 3000:3000 \
         lirenlabs/hermes:latest`
    ])
    
    // 5. Healthcheck
    log('Healthcheck...')
    await waitForHTTP(`http://${vps.public_ip}:3000/health`, { timeoutMs: 60_000 })
    
    // 6. Mark running
    await supabase.from('vps_instances')
      .update({ status: 'running' })
      .eq('idcloudhost_vps_id', vps.id)
    
    // 7. Notify customer
    const { data: customer } = await supabase
      .from('customers').select('telegram_chat_id').eq('id', customerId).single()
    
    if (customer?.telegram_chat_id) {
      await telegram.send(customer.telegram_chat_id,
        `Agent kamu hidup. Coba ketik /halo buat sapa dia.`
      )
    }
    
    log('Done.')
  } catch (e) {
    log(`Failed: ${e}`)
    await supabase.from('vps_instances')
      .update({ status: 'failed' })
      .eq('customer_id', customerId)
    
    // Alert Richie
    await telegram.send(process.env.RICHIE_CHAT_ID!,
      `Provisioning failed for ${customerId}: ${e}`
    )
    throw e
  }
}

// Helper: poll until SSH responds
async function waitForSSH(ip: string, opts: { timeoutMs: number }) {
  const deadline = Date.now() + opts.timeoutMs
  while (Date.now() < deadline) {
    try {
      await ssh.exec(ip, ['echo ready'])
      return
    } catch {
      await new Promise(r => setTimeout(r, 5000))
    }
  }
  throw new Error('SSH timeout')
}
```

### 4.4. Hermes Dockerfile (Day 6-7)

```dockerfile
# Dockerfile
FROM node:20-slim

# Install Playwright deps
RUN apt-get update && apt-get install -y \
  wget gnupg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Hermes source
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN npx playwright install chromium --with-deps

# Hermes entrypoint listens on 3000 (health) and connects to Telegram/WA
EXPOSE 3000
CMD ["node", "dist/hermes-runner.js"]
```

```typescript
// hermes-runner.ts (entrypoint)
import { startHermes } from './core'
import { telegramAdapter } from './adapters/telegram'
import { whatsappAdapter } from './adapters/whatsapp'  // Layer 2
import { llmProxyClient } from './llm-proxy'
import express from 'express'

async function main() {
  const customerId = process.env.CUSTOMER_ID!
  
  const hermes = await startHermes({
    customerId,
    llm: llmProxyClient({
      url: process.env.LLM_PROXY_URL!,
      token: process.env.LLM_PROXY_TOKEN!
    }),
    adapters: [
      telegramAdapter({ token: process.env.TELEGRAM_BOT_TOKEN!, customerId })
      // whatsappAdapter() — added in Layer 2
    ]
  })
  
  // Health endpoint for provisioning service
  const app = express()
  app.get('/health', (_, res) => res.json({ ok: true, customerId }))
  app.listen(3000)
  
  console.log('Hermes ready for', customerId)
}

main().catch(console.error)
```

### 4.5. LLM proxy (Day 8) — credit metering

```typescript
// proxy/worker.ts (Cloudflare Worker)
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // Auth: extract customer_id from JWT in Authorization header
    const customerId = await verifyToken(req.headers.get('authorization'))
    if (!customerId) return new Response('unauthorized', { status: 401 })
    
    // Check balance
    const { balance_usd_cents } = await getCreditBalance(customerId, env)
    if (balance_usd_cents <= 0) {
      return Response.json({
        error: 'no_credits',
        message: 'Top up credits to continue.'
      }, { status: 402 })
    }
    
    // Forward to Anthropic
    const body = await req.json() as any
    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    
    const result = await anthropicResp.json() as any
    
    // Calculate cost
    const cost = calculateCost(body.model, result.usage)
    
    // Debit + log (best-effort, async)
    env.SUPABASE.run(async () => {
      await debitCredits(customerId, cost.totalCents, env)
      await logUsage(customerId, body.model, result.usage, cost.totalCents, env)
    })
    
    return Response.json(result)
  }
}

function calculateCost(model: string, usage: any): { totalCents: number } {
  // Sonnet 4.6 pricing (approx, as of April 2026)
  const rates: Record<string, [number, number]> = {
    'claude-sonnet-4-6': [3.0, 15.0],   // [input, output] per 1M tokens, USD
    'claude-haiku-4-5': [0.25, 1.25]
  }
  const [inRate, outRate] = rates[model] || [3.0, 15.0]
  const usd = (usage.input_tokens * inRate + usage.output_tokens * outRate) / 1_000_000
  return { totalCents: Math.ceil(usd * 100) }
}
```

### 4.6. Customer dashboard (Day 9-10)

Minimal Next.js app at `lirenlabs.ai/stand/dashboard`:

```typescript
// app/stand/dashboard/page.tsx
import { createClient } from '@supabase/supabase-js'

export default async function Dashboard() {
  const customer = await getCurrentCustomer()
  const vps = await getCustomerVPS(customer.id)
  const credits = await getCustomerCredits(customer.id)
  
  return (
    <div className="bg-canvas min-h-screen p-8 font-inter">
      <h1 className="text-3xl">Liren Stand</h1>
      
      <section className="mt-8">
        <h2 className="text-xl">Status Agent</h2>
        <div className={vps.status === 'running' ? 'text-liren-blue' : 'text-muted'}>
          {vps.status === 'running' ? 'Hidup ✓' : 'Sedang dipersiapkan...'}
        </div>
      </section>
      
      <section className="mt-8">
        <h2 className="text-xl">Credits</h2>
        <div className="text-4xl font-display">${(credits.balance_usd_cents / 100).toFixed(2)}</div>
        <button className="mt-4 bg-liren-blue text-canvas px-6 py-3">
          Top Up Credits
        </button>
      </section>
      
      <section className="mt-8">
        <h2 className="text-xl">Channel</h2>
        <p>Saat ini: Telegram @LirenStandBot</p>
        <p className="text-muted text-sm">WhatsApp integration dibuka di Phase 2.</p>
      </section>
    </div>
  )
}
```

---

## 5. Layer 2 (Week 3-4): WhatsApp Web + Marketplace + Credits Top-up

### 5.1. WhatsApp Web integration (Day 11-13)

Tambah ke Hermes Docker image:

```typescript
// adapters/whatsapp.ts
import { Client, LocalAuth } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'

export async function whatsappAdapter({ customerId, hermes }) {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: `/data/wa-session-${customerId}` }),
    puppeteer: { headless: true, args: ['--no-sandbox'] }
  })
  
  client.on('qr', async (qr) => {
    // Send QR to customer via Telegram + dashboard
    const qrPng = await qrcode.toBuffer(qr)
    await telegram.sendPhoto(customerId, qrPng, {
      caption: 'Scan QR ini di WhatsApp → Settings → Linked Devices'
    })
    await supabase.from('vps_instances').update({ wa_qr_pending: true })
      .eq('customer_id', customerId)
  })
  
  client.on('ready', () => {
    console.log('WhatsApp ready for', customerId)
    supabase.from('vps_instances').update({ 
      wa_status: 'authenticated',
      wa_qr_pending: false 
    }).eq('customer_id', customerId)
  })
  
  client.on('message', async (msg) => {
    // Self-chat only: only respond to messages from customer to themselves
    if (msg.from !== msg.to) return
    
    // Trigger pattern: messages starting with `/agent` or any in Note to Self
    if (!msg.body.startsWith('/agent') && msg.from !== `${customerId}@c.us`) return
    
    const command = msg.body.replace(/^\/agent\s*/, '')
    const response = await hermes.process(command)
    await client.sendMessage(msg.from, response)
  })
  
  await client.initialize()
}
```

### 5.2. Marketplace skill format (Day 14-15)

Skill manifest YAML:

```yaml
# marketplace/skills/whatsapp-auto-reply.yaml
id: wa-auto-reply
name: WhatsApp Auto-Reply
tier: free  # or 'premium'
price_idr: 0
description: |
  Auto-balas pesan masuk dengan template yang kamu setting.
  Bisa atur jam aktif (misal: weekend off).
version: 1.0.0
runtime:
  type: hermes-skill
  entrypoint: skills/wa-auto-reply/index.js
permissions:
  - whatsapp.read
  - whatsapp.write
config_schema:
  active_hours: { type: 'cron', default: '0 9-18 * * 1-5' }
  template: { type: 'text', required: true }
```

Marketplace UI in dashboard:

```typescript
// app/stand/marketplace/page.tsx
export default async function Marketplace() {
  const skills = await getMarketplaceSkills()
  const installed = await getCustomerInstalledSkills(currentCustomer.id)
  
  return (
    <div className="grid grid-cols-3 gap-6 p-8 bg-canvas">
      {skills.map(skill => (
        <SkillCard key={skill.id} skill={skill} 
                   isInstalled={installed.includes(skill.id)} />
      ))}
    </div>
  )
}
```

Install action calls a Supabase function which writes to `marketplace_installs` table; Hermes container polls for new installs every 60s and loads them dynamically.

### 5.3. Credits top-up flow (Day 16-17)

Dashboard button → `/api/topup`:

```typescript
// app/api/topup/route.ts
const TOPUP_PACKS = [
  { idr: 50_000, credits_cents: 300 },   // ~$3
  { idr: 100_000, credits_cents: 650 },  // ~$6.50
  { idr: 250_000, credits_cents: 1700 }, // ~$17
  { idr: 500_000, credits_cents: 3500 }, // ~$35
]

export async function POST(req: Request) {
  const { pack_idr, customerId } = await req.json()
  const pack = TOPUP_PACKS.find(p => p.idr === pack_idr)
  if (!pack) return new Response('invalid pack', { status: 400 })
  
  const invoice = await xendit.Invoice.createInvoice({
    data: {
      externalId: `topup-${customerId}-${Date.now()}`,
      amount: pack.idr,
      description: `Liren Stand credits — Rp ${pack.idr.toLocaleString()}`,
      successRedirectUrl: 'https://lirenlabs.ai/stand/dashboard?topup=success'
    }
  })
  
  return Response.json({ invoice_url: invoice.invoiceUrl })
}
```

Webhook adds credits same as initial subscription, but to `credit_topups` table.

---

## 6. Layer 3 (Week 5-6): Polish + ops

### 6.1. Auto-update Hermes (Day 18-19)

Cron job on Mac Mini:

```bash
# /etc/cron.d/liren-update
0 3 * * 1 /opt/liren/scripts/update-all-vps.sh
```

```typescript
// scripts/update-all-vps.ts
const vpsList = await supabase.from('vps_instances')
  .select('*').eq('status', 'running')

for (const vps of vpsList.data!) {
  try {
    await ssh.exec(vps.ip_address, [
      'docker pull lirenlabs/hermes:latest',
      'docker stop hermes && docker rm hermes',
      // Re-run with same env (stored in /opt/liren/env-CUSTOMER_ID)
      `bash /opt/liren/run-hermes-${vps.customer_id}.sh`
    ])
  } catch (e) {
    // Notify Richie, retry tomorrow
  }
}
```

### 6.2. Daily backup (Day 20)

```typescript
// scripts/daily-backup.ts — runs on each VPS via cron
const dump = await ssh.exec(vps.ip, [
  'docker exec hermes /app/scripts/export-state.sh > /tmp/state.json'
])
// Upload to Supabase Storage with versioning
await supabase.storage.from('backups').upload(
  `${customerId}/${date}.json`, 
  dump
)
```

### 6.3. Audit log (Day 21)

Every Hermes action logged to Supabase via the LLM proxy (already capturing) plus skill-level events:

```typescript
// hermes/lib/audit.ts
export async function audit(event: { 
  customerId: string, 
  action: string, 
  target: string, 
  result: 'ok' | 'error',
  meta?: any 
}) {
  await supabase.from('audit_log').insert({
    customer_id: event.customerId,
    action: event.action,
    target: event.target,
    result: event.result,
    meta: event.meta,
    created_at: new Date()
  })
}
```

Dashboard tab: "Aktivitas" — shows last 50 actions for transparency.

### 6.4. Onboarding polish (Day 22-23)

- Status page selama provisioning (websocket update dari provisioning service)
- Better error messages
- Recovery flow kalau provisioning gagal (auto-retry 1x, escalate ke Richie)

---

## 7. Day-by-day implementation order

**Asumsi: Richie kerja 6 jam/hari di build, 2 jam content, sisanya admin.**

### Week 1 — Foundation

| Day | Task | Output | Dep |
|-----|------|--------|-----|
| 1 | **Test IDCloudHost API.** Spin up 1 VPS via API, time it, document quirks. **Go/no-go decision.** | Working API call, ≤120s provisioning verified | — |
| 2 | Supabase schema + auth setup | DB live, schema applied | — |
| 3 | Xendit sandbox integration + webhook handler | Test payment flow → webhook fires → DB updated | Day 2 |
| 4 | Provisioning service skeleton | Manual trigger spins up VPS, installs Docker | Day 1, 2 |
| 5 | Hermes Dockerfile + minimal entrypoint | Image builds, runs, listens on :3000 | — |
| 6 | Connect provisioning to Hermes image (push to registry, pull on VPS) | Spin-up + Hermes start in <120s | Day 4, 5 |
| 7 | LLM proxy (Cloudflare Worker) + credit metering | Hermes call → proxy → Claude → debit credits | Day 2 |

**Week 1 gate:** Manual end-to-end test — Richie pays via Xendit sandbox, VPS spins up, Hermes sends Telegram message within 5 min.

### Week 2 — MVP polish

| Day | Task | Output | Dep |
|-----|------|--------|-----|
| 8 | Pricing page (Liren aesthetic) | `/stand/pricing` deployed | — |
| 9 | Customer dashboard skeleton | Status, balance, top-up button | Day 7 |
| 10 | Telegram onboarding bot — collect name, use case, lang | Bot DMs flow works end-to-end | — |
| 11 | Top-up flow (Xendit sandbox) | Customer can buy credits, balance updates | Day 7 |
| 12 | Internal end-to-end test #1 | Richie self-onboards, ukur waktu, fix friction | All above |
| 13 | Bug fixes from #1 | All P0 friction resolved | Day 12 |
| 14 | **Onboard 5 beta gratis** (atau 5 internal test pelanggan) | 5 working agents | All |

**Week 2 gate:** 5 beta pelanggan onboarded ≤ 5 min, Hermes responds to Telegram within 24 hours, credit metering accurate.

### Week 3-4 — Layer 2

| Day | Task |
|-----|------|
| 15-17 | WhatsApp Web integration (whatsapp-web.js, QR flow, self-chat handler) |
| 18-19 | Marketplace skill format + UI + 5 starter skill (free) |
| 20-21 | Premium skill payment flow + Specialised Trained Agent (Meeting first) listing |

**Week 4 gate:** Pelanggan bisa pilih channel WA atau Telegram, install skill dari marketplace, beli Agent Meeting via marketplace.

### Week 5-6 — Layer 3 + public launch

| Day | Task |
|-----|------|
| 22-23 | Auto-update + backup automation |
| 24 | Audit log + dashboard transparency tab |
| 25 | Xendit production switch, refund policy, ToS, privacy policy |
| 26 | Soft public launch (existing IG audience) |
| 27-28 | Monitor, fix bugs, support first wave |

**Week 6 gate:** 10 paying Stand subscriber, 10 Agent Meeting install, retention check, top-up rate ≥ 2× subscription.

---

## 8. Test plan

### Unit tests (per component)

- Provisioning service — mock IDCloudHost API, verify retry/recovery logic
- LLM proxy — verify cost calculation accuracy, balance check, abuse limits
- Xendit webhook — verify signature, idempotency (replay same callback = no double-charge)
- Hermes adapter (Telegram/WA) — message round-trip

### Integration tests

- Full sign-up → VPS live → Hermes message: end-to-end smoke test, must complete <5 min
- Payment failure → no provisioning
- Credits exhausted → Hermes pauses, customer notified
- VPS provision fail → status updated, customer notified, Richie alerted

### Load test (Week 5)

- Simulate 50 simultaneous sign-ups; check IDCloudHost rate limits
- Simulate 1000 concurrent Hermes → Claude calls via proxy

### Pre-launch checklist (Day 25)

- [ ] Xendit production keys live
- [ ] Refund policy published
- [ ] ToS + Privacy Policy published (BI + EN)
- [ ] WhatsApp ToS disclosure tested
- [ ] Backup script verified (restore test)
- [ ] Auto-update tested end-to-end
- [ ] Customer can cancel subscription self-serve
- [ ] Anthropic API budget alert set ($X/day)
- [ ] IDCloudHost budget alert set
- [ ] Founder Telegram alerts working (provisioning fail, payment fail)
- [ ] Brand voice review: every customer-facing string passed `01-Brand-Kit` rules

---

## 9. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|-------------|
| 1 | IDCloudHost API tidak lengkap / lambat | High | Critical | Day 1 test. Fallback: Vultr Jakarta (better API), atau Hostinger manual provisioning untuk first 5 pelanggan |
| 2 | WhatsApp ban pelanggan karena automation | Medium | High | Disclosure + rate limiting + Telegram fallback selalu tersedia |
| 3 | Anthropic API cost spike (abuse) | Medium | High | Hard rate limit per pelanggan + daily budget alert + auto-pause kalau spike |
| 4 | Xendit webhook lost/duplicated | Low | Medium | Idempotency key (use Xendit invoice ID), retry queue |
| 5 | Hermes Docker image bloated | Low | Low | Multi-stage build, alpine base where possible |
| 6 | Provisioning >5 min | Medium | High | Optimize Docker image size, pre-warm registry, background SSH while VPS booting |
| 7 | Credits balance race condition | Low | Medium | Use Supabase RPC with row lock; never read-modify-write from app |
| 8 | Pelanggan bayar tapi VPS gagal provision | Medium | High | Auto-retry 1x, manual fallback in 30 min, refund kalau gagal lagi |
| 9 | Mac Mini control plane down | Low | High | Cloudflare Worker handles webhooks; VPS fleet keeps running. Add UptimeRobot alert |
| 10 | Brand voice slip in customer-facing copy | Medium | Low | Pre-launch checklist Day 25 line: voice review every string |

---

## 10. Open decisions blocking build

Sebelum Day 1, kamu perlu jawab ini:

1. **IDCloudHost API access — udah daftar developer account?** Kalau belum, daftar hari ini.
2. **Xendit account — sandbox + production sudah aktif?** Kalau belum, register hari ini.
3. **Anthropic API — billing limit set?** Saran: $100/hari untuk start, naikkan setelah ada pelanggan.
4. **Domain `lirenlabs.ai/stand` — DNS ready?** Sub-path Vercel deploy paling cepat.
5. **Mac Mini access — Tailscale/WireGuard ke VPS pelanggan ready?** Untuk SSH dari control plane ke VPS pelanggan, lebih aman pakai mesh VPN daripada direct SSH key.
6. **GitHub repo organization** — Hermes repo + Liren-Stand monorepo? Saya rekomen monorepo: `liren-labs/stand` dengan apps/ (web, dashboard) + services/ (provisioning, proxy) + hermes/ (container).

---

## 11. Apa yang TIDAK ada di plan ini

Hal-hal yang sengaja saya tunda:

- **Mobile app** — web mobile responsive cukup untuk Phase 1-3. Native app post-100 pelanggan.
- **Self-serve refund** — manual via Telegram support cukup di Phase 1.
- **Affiliate / referral** — Phase 4+ setelah PMF.
- **Multi-language** — BI only di launch. EN translation Phase 2.
- **Team accounts / SSO** — Phase 4+, bukan target persona Phase 1.
- **Custom domain per pelanggan** — never (anti-pattern, masalah security).

---

*Last updated: 2026-04-25 · Author: Richie + Hermes*
*Next review: setelah Week 1 gate (Day 7).*
