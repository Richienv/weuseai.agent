// Onboarding-time provisioning client — POSTs to the existing
// `services/provisioning` `/spin-up` endpoint with bearer auth.
//
// Same wire shape as the webhook-time provisioning call, plus the new
// fields collected in onboarding (telegramChatId, openrouterApiKey,
// soulMdContent).
//
// Endpoint: ${PROVISIONING_URL}/spin-up
//   - PROVISIONING_URL: https://weuseai-provisioning.fly.dev (per founder)
//   - Auth: Bearer ${PROVISIONING_AUTH_TOKEN}
// Returns 200 { jobId } on success; any non-2xx is bubbled up so the
// handler can roll back the LLM key.

import type {
  IOnboardingProvisioningClient,
  SpinUpInput,
  SpinUpResult,
  RefreshEnvInput,
  RefreshEnvResult,
} from './types.ts'

export class OnboardingProvisioningClient implements IOnboardingProvisioningClient {
  private baseUrl: string
  private authToken: string

  constructor(opts: { baseUrl: string; authToken: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '')
    this.authToken = opts.authToken
    if (!this.baseUrl) {
      throw new Error(
        'OnboardingProvisioningClient: missing baseUrl (env PROVISIONING_URL)',
      )
    }
    if (!this.authToken) {
      throw new Error(
        'OnboardingProvisioningClient: missing authToken (env PROVISIONING_AUTH_TOKEN)',
      )
    }
  }

  async spinUp(input: SpinUpInput): Promise<SpinUpResult> {
    // Wire shape mirrors services/provisioning/src/spin-up-helpers.ts —
    // notably the historical name `customerTelegramBotToken` (used since
    // the BYO-bot intent in CLAUDE.md tech stack). The internal SpinUpInput
    // field is named `telegramBotToken` for ergonomics; we translate
    // here.
    const wire = {
      customerId: input.customerId,
      tier: input.tier,
      telegramChatId: input.telegramChatId,
      customerTelegramBotToken: input.telegramBotToken,
      openrouterApiKey: input.openrouterApiKey,
      soulMdContent: input.soulMdContent,
      alwaysOnEnabled: input.alwaysOnEnabled,
      // Persona selection (2026-05-17): forward the chosen persona slug.
      // parseSpinUpRequest on the provisioning side reads `agentSlug` and
      // threads it into spinUpCustomer's opts.agentSlug. Omitted when the
      // caller didn't supply one (back-compat — defaults to 'the-pro').
      ...(input.agentSlug ? { agentSlug: input.agentSlug } : {}),
    }
    let r: Response
    try {
      r = await fetch(`${this.baseUrl}/spin-up`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.authToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(wire),
      })
    } catch (e) {
      // Network-level failure (DNS, TLS, connection refused). Surface
      // as "ok: false" so the handler treats it the same as a 5xx.
      return {
        ok: false,
        status: 0,
        body: e instanceof Error ? e.message : String(e),
      }
    }
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        body: (await r.text().catch(() => '')).slice(0, 1000),
      }
    }
    // Provisioning service response shape (services/provisioning/src/spin-up-helpers.ts):
    //   { ok: true, vps_instance_id, vps_ip }
    // We treat vps_instance_id as the natural job identifier — welcome.html
    // polls subscription.status to track completion, the job param is just
    // for display + retry-resume bookkeeping.
    const json = (await r.json()) as {
      ok?: boolean
      vps_instance_id?: string
      vps_ip?: string | null
      // Back-compat: accept jobId if a future provisioning version emits it.
      jobId?: string
    }
    const jobId = json.jobId ?? json.vps_instance_id
    if (!jobId) {
      return {
        ok: false,
        status: 502,
        body: 'provisioning service returned no vps_instance_id/jobId',
      }
    }
    return { ok: true, jobId }
  }

  /** Track 3b 2026-05-10: POST to /refresh-env on the provisioning
   *  service. Caller (complete-onboarding step 8a, admin rescue)
   *  supplies the env values directly. */
  async refreshEnv(input: RefreshEnvInput): Promise<RefreshEnvResult> {
    const wire = {
      customer_id: input.customerId,
      env_values: input.envValues,
      // Optional: SOUL.md content (dry-run Stage 7 fix). Provisioning
      // service writes to /home/weuseai/.hermes/SOUL.md when present.
      ...(input.soulMdContent ? { soul_md_content: input.soulMdContent } : {}),
      // Optional: pre-approve customer's Telegram chat_id so first
      // /start lands directly on the in-character agent.
      ...(input.telegramChatId ? { telegram_chat_id: input.telegramChatId } : {}),
      ...(input.telegramUserName ? { telegram_user_name: input.telegramUserName } : {}),
      request_id: input.requestId,
    }
    let r: Response
    try {
      r = await fetch(`${this.baseUrl}/refresh-env`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.authToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(wire),
      })
    } catch (e) {
      return {
        ok: false,
        status: 0,
        body: e instanceof Error ? e.message : String(e),
      }
    }
    let body: unknown
    try {
      body = await r.json()
    } catch {
      body = null
    }
    if (!r.ok) {
      const errBody = body as { error?: string; detail?: string } | null
      return {
        ok: false,
        status: r.status,
        body: JSON.stringify(errBody ?? {}).slice(0, 1000),
        error: errBody?.error,
      }
    }
    const ok = body as {
      vps_id?: string
      ip_address?: string
      applied?: {
        TELEGRAM_BOT_TOKEN?: 'updated' | 'unchanged'
        TELEGRAM_ALLOWED_USERS?: 'updated' | 'unchanged'
        TELEGRAM_HOME_CHANNEL?: 'updated' | 'unchanged'
        OPENROUTER_API_KEY?: 'updated' | 'unchanged'
        OPENAI_API_KEY?: 'updated' | 'unchanged'
      }
      hermes_restart_at?: string
    }
    if (!ok.vps_id || !ok.ip_address) {
      return {
        ok: false,
        status: 502,
        body: 'refresh-env response missing vps_id/ip_address',
      }
    }
    return {
      ok: true,
      vpsId: ok.vps_id,
      ipAddress: ok.ip_address,
      applied: ok.applied ?? {},
      hermesRestartAt: ok.hermes_restart_at ?? new Date().toISOString(),
    }
  }
}
