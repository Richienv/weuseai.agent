/**
 * Provisioning service — entrypoint
 *
 * HTTP server. Dipanggil dari Xendit webhook (via Supabase Edge Function)
 * setelah pelanggan bayar.
 */

import 'dotenv/config'
import express from 'express'
import { spinUpCustomer, tearDownCustomer, type SpinUpDeps } from './customer-flow.js'
import { createVPSProvider } from './providers/index.js'
import { createDataStore } from './stores/index.js'
import { createMessageBroker } from '../../hermes/src/adapters/index.js'
import { parseSpinUpRequest, formatSpinUpResponse } from './spin-up-helpers.js'

const PORT = Number(process.env.PORT ?? 8080)
const AUTH_TOKEN = process.env.PROVISIONING_AUTH_TOKEN

if (!AUTH_TOKEN) {
  console.error('Missing PROVISIONING_AUTH_TOKEN')
  process.exit(1)
}

const isDryRun = process.env.ENABLE_REAL_PROVISIONING === 'false'
if (isDryRun) {
  console.log('[provisioning] DRY-RUN mode (ENABLE_REAL_PROVISIONING=false) — using MockVPSProvider')
}

const sharedDeps: SpinUpDeps = {
  vps: createVPSProvider(),
  store: createDataStore(),
  broker: createMessageBroker(),
  providerName: isDryRun ? 'mock' : 'idcloudhost',
  alertChatId: process.env.RICHIE_CHAT_ID,
}

const app = express()
app.use(express.json())

app.use((req, res, next) => {
  if (req.path === '/health') return next()
  const auth = req.headers.authorization
  if (auth !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
})

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'liren-provisioning' })
})

app.post('/spin-up', async (req, res) => {
  const parsed = parseSpinUpRequest(req.body as Record<string, unknown>, {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    DEFAULT_TELEGRAM_CHAT_ID: process.env.DEFAULT_TELEGRAM_CHAT_ID,
  })
  if (!parsed.ok) {
    return res.status(400).json({ ok: false, error: parsed.error })
  }

  try {
    const result = await spinUpCustomer(parsed.opts, sharedDeps)
    res.json(formatSpinUpResponse(result))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('spin-up failed:', msg)
    res.status(500).json({ ok: false, error: msg })
  }
})

app.post('/tear-down', async (req, res) => {
  const { customerId } = req.body as { customerId: string }
  if (!customerId) return res.status(400).json({ error: 'missing customerId' })

  try {
    const result = await tearDownCustomer(customerId, {
      vps: sharedDeps.vps,
      store: sharedDeps.store,
    })
    res.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).json({ error: msg })
  }
})

app.listen(PORT, () => {
  console.log(`[provisioning] listening on :${PORT}`)
})
