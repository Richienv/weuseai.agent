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
import { ExecSshProvisioner } from './ssh/exec-ssh-provisioner.js'
import { MockSshProvisioner } from './ssh/mock-ssh-provisioner.js'
import { OpenRouterKeyMinter } from './llm/openrouter-minter.js'
import { MockLlmKeyMinter } from './llm/mock-minter.js'
import { tierBump, type TierBumpRouteRequest } from './routes/tier-bump.js'
import { refreshEnvHandler, type RefreshEnvRequest } from './routes/refresh-env.js'
import { restartHermesHandler, type RestartHermesRequest } from './routes/restart-hermes.js'
import { customerProgressHandler, type CustomerProgressRequest } from './routes/customer-progress.js'
import {
  readinessProbeHandler,
  type ReadinessProbeRequest,
} from './routes/customer-readiness-probe.js'
import { createRefreshEnvStore } from './stores/refresh-env-supabase-store.js'

const PORT = Number(process.env.PORT ?? 8080)
const AUTH_TOKEN = process.env.PROVISIONING_AUTH_TOKEN
const FLEET_SSH_PRIVATE_KEY = process.env.FLEET_SSH_PRIVATE_KEY ?? ''

if (!AUTH_TOKEN) {
  console.error('Missing PROVISIONING_AUTH_TOKEN')
  process.exit(1)
}

const isDryRun = process.env.ENABLE_REAL_PROVISIONING === 'false'
if (isDryRun) {
  console.log('[provisioning] DRY-RUN mode (ENABLE_REAL_PROVISIONING=false) — using MockVPSProvider')
}

// Dry-run substitutes mocks for the side-effecting deps (no IDCH spawn,
// no real OpenRouter mint) but keeps real Supabase + broker so we can
// still inspect rows + telegram in staging.
const ssh = isDryRun ? new MockSshProvisioner() : new ExecSshProvisioner()
const llmMinter = isDryRun ? new MockLlmKeyMinter() : new OpenRouterKeyMinter()

const sharedDeps: SpinUpDeps = {
  vps: createVPSProvider(),
  store: createDataStore(),
  broker: createMessageBroker(),
  ssh,
  llmMinter,
  // Vultr-migration cascade 2026-05-11: read provider name from
  // VPS_PROVIDER env (same value the factory uses) so vps_instances.provider
  // stamping matches the actual factory choice. Post-IDCH-retirement
  // (2026-05-13) the default is 'vultr' to match the factory default.
  providerName: isDryRun
    ? 'mock'
    : (process.env.VPS_PROVIDER ?? 'vultr'),
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

// Phase 2E-3: tier-bump. Called by Supabase customer-tier-bump Edge
// Function on Xendit-paid upgrades. SSH into the customer's VPS using
// the fleet SSH key, sed .env, restart hermes-gateway. The drop-in's
// ExecStartPre re-runs and applies the new tier filter.
app.post('/tier-bump', async (req, res) => {
  const body = req.body as Partial<TierBumpRouteRequest>
  try {
    const result = await tierBump(
      {
        customer_id: body.customer_id ?? '',
        target_tier: body.target_tier as TierBumpRouteRequest['target_tier'],
        vps_host: body.vps_host ?? '',
      },
      { fleetPrivateKey: FLEET_SSH_PRIVATE_KEY },
    )
    if (!result.ok) {
      return res.status(502).json({ ok: false, error: result.error })
    }
    res.json({ ok: true, restarted_at: result.restarted_at })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('tier-bump failed:', msg)
    res.status(500).json({ ok: false, error: msg })
  }
})

// Track 3a (2026-05-10): /refresh-env. SSHes into the customer's
// existing VPS to rewrite .env (caller-supplied env_values) + restart
// hermes-gateway + verify it came back up. Closes the architectural
// gap where spinUp's idempotency returned existing VPS without
// updating .env. See docs/design/2026-05-10-vps-config-refresh.md.
//
// Pivot 2026-05-10: provisioning is a "dumb pipe" — does NOT decrypt
// or source values. Callers (complete-onboarding-handler step 8a,
// admin-customer-vps-refresh) supply env_values directly. Keeps the
// encryption key in Supabase secrets only, never on Fly.
const refreshEnvStore = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createRefreshEnvStore({
      supabaseUrl: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    })
  : null

app.post('/refresh-env', async (req, res) => {
  if (!refreshEnvStore) {
    return res.status(500).json({
      ok: false,
      error: 'internal',
      detail: 'refresh-env requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars',
    })
  }
  const body = req.body as Partial<RefreshEnvRequest>
  try {
    const result = await refreshEnvHandler(
      {
        customer_id: body.customer_id ?? '',
        env_values: body.env_values ?? {},
        soul_md_content: body.soul_md_content,
        telegram_chat_id: body.telegram_chat_id,
        telegram_user_name: body.telegram_user_name,
        request_id: body.request_id ?? '',
      },
      {
        fleetPrivateKey: FLEET_SSH_PRIVATE_KEY,
        store: refreshEnvStore,
      },
    )
    if (!result.ok) {
      // Map error → status code per design.
      const status =
        result.error === 'no_active_vps' ? 404
        : result.error === 'invalid_field' ? 400
        : result.error === 'ssh_unreachable' ? 503
        : result.error === 'ssh_auth_failed' ? 502
        : 500
      return res.status(status).json(result)
    }
    res.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('refresh-env failed:', msg)
    res.status(500).json({ ok: false, error: 'internal', detail: msg })
  }
})

// D1 multi-persona webhook push (2026-05-12): /restart-hermes minimal
// route. Called by Supabase bundle-version-bump-broadcast Edge Function
// when a persona ships an update. SSHes into the customer's VPS and
// runs `sudo systemctl restart hermes-gateway` — triggers ExecStartPre
// = weuseai-bundle-pull which fetches the new version + installs.
app.post('/restart-hermes', async (req, res) => {
  if (!refreshEnvStore) {
    return res.status(500).json({
      ok: false,
      error: 'internal',
      detail: 'restart-hermes requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars (uses refresh-env store)',
    })
  }
  const body = req.body as Partial<RestartHermesRequest>
  try {
    const result = await restartHermesHandler(
      {
        customer_id: body.customer_id ?? '',
        reason: body.reason,
      },
      {
        fleetSshPrivateKey: FLEET_SSH_PRIVATE_KEY,
        store: {
          findVpsByCustomerId: async (customerId: string) => {
            // Reuse refresh-env's existing query — only one row per customer
            // by design (vps_instances.customer_id is unique post-PR #75 hardening).
            return await refreshEnvStore.findActiveVPSByCustomer(customerId)
          },
        },
      },
    )
    if (!result.ok) {
      return res.status(result.status).json(result)
    }
    res.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('restart-hermes failed:', msg)
    res.status(500).json({ ok: false, error: 'internal', detail: msg })
  }
})

// Phase 2 prevention (2026-05-13): GET /customer-progress — real-time
// surface for welcome.html so customers + admin see actual setup-script
// progress (apt install / Hermes pip / gateway start) instead of an
// 8-min "stuck at stage Y" black box. SSH-tails the VPS's
// /var/log/weuseai-setup.log + heartbeat file in one round-trip.
//
// Read-only — no side effects on the VPS. Safe to poll every 3-5 sec
// during the setup window.
app.get('/customer-progress', async (req, res) => {
  if (!refreshEnvStore) {
    return res.status(500).json({
      ok: false,
      error: 'internal',
      detail: 'customer-progress requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars',
    })
  }
  const customerId = (req.query.customer_id ?? '') as string
  try {
    const result = await customerProgressHandler(
      { customer_id: customerId },
      {
        fleetSshPrivateKey: FLEET_SSH_PRIVATE_KEY,
        store: {
          findVpsByCustomerId: async (cid: string) => {
            return await refreshEnvStore.findActiveVPSByCustomer(cid)
          },
        },
      },
    )
    if (!result.ok) {
      return res.status(result.status).json(result)
    }
    res.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('customer-progress failed:', msg)
    res.status(500).json({ ok: false, error: 'internal', detail: msg })
  }
})

// Track 1 (post-pair UX polish, 2026-05-10): /customer-readiness-probe.
// Returns 8-check JSON describing whether a customer's agent is fully
// usable. welcome.html polls this every 10s during state A/B and only
// transitions to "klik Buka Telegram" when critical checks pass
// (hermes_systemd_active + hermes_pairing_approved + soul_md_present).
//
// Reuses the same Supabase store as /refresh-env (CombinedStore).
app.post('/customer-readiness-probe', async (req, res) => {
  if (!refreshEnvStore) {
    return res.status(500).json({
      ok: false,
      error: 'internal',
      detail: 'customer-readiness-probe requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars',
    })
  }
  const body = req.body as Partial<ReadinessProbeRequest>
  try {
    const result = await readinessProbeHandler(
      { customer_id: body.customer_id ?? '' },
      {
        fleetPrivateKey: FLEET_SSH_PRIVATE_KEY,
        store: refreshEnvStore,
      },
    )
    if (!result.ok) {
      const status =
        result.error === 'invalid_field' ? 400
        : result.error === 'no_active_vps' ? 404
        : 500
      return res.status(status).json(result)
    }
    res.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('customer-readiness-probe failed:', msg)
    res.status(500).json({ ok: false, error: 'internal', detail: msg })
  }
})

app.listen(PORT, () => {
  console.log(`[provisioning] listening on :${PORT}`)
})
