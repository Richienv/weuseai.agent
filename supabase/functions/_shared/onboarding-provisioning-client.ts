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
    let r: Response
    try {
      r = await fetch(`${this.baseUrl}/spin-up`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.authToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(input),
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
    const json = (await r.json()) as { jobId?: string }
    if (!json.jobId) {
      return {
        ok: false,
        status: 502,
        body: 'provisioning service did not return jobId',
      }
    }
    return { ok: true, jobId: json.jobId }
  }
}
