// Tests for the I/O half of the LLM cost monitor — fetchLlmCostRows and
// fetchOpenRouterUsageCents. A stub fetch is injected so no network is
// touched; the focus is URL/header composition, USD→cents conversion,
// and the per-customer degrade-on-failure behavior.

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'

import {
  fetchLlmCostRows,
  fetchOpenRouterUsageCents,
} from '../packages/observability/src/llm-cost.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('fetchOpenRouterUsageCents', () => {
  it('converts OpenRouter USD usage to integer cents', async () => {
    const stub: typeof fetch = async () =>
      jsonResponse({ data: { usage: 1.234, limit: 5 } })
    const cents = await fetchOpenRouterUsageCents('hash-x', 'prov-key', stub)
    assert.equal(cents, 123)
  })

  it('sends the provisioning key as a bearer token to the keys endpoint', async () => {
    let seenUrl = ''
    let seenAuth = ''
    const stub: typeof fetch = async (url, init) => {
      seenUrl = String(url)
      seenAuth = String((init?.headers as Record<string, string>)?.authorization ?? '')
      return jsonResponse({ data: { usage: 0 } })
    }
    await fetchOpenRouterUsageCents('hash-y', 'prov-key', stub)
    assert.equal(seenUrl, 'https://openrouter.ai/api/v1/keys/hash-y')
    assert.equal(seenAuth, 'Bearer prov-key')
  })

  it('throws when OpenRouter returns a non-2xx status', async () => {
    const stub: typeof fetch = async () => jsonResponse({ error: 'nope' }, 404)
    await assert.rejects(
      () => fetchOpenRouterUsageCents('gone', 'prov-key', stub),
      /404/,
    )
  })

  it('throws when the response is missing data.usage', async () => {
    const stub: typeof fetch = async () => jsonResponse({ data: {} })
    await assert.rejects(
      () => fetchOpenRouterUsageCents('h', 'prov-key', stub),
      /missing or invalid data.usage/,
    )
  })
})

describe('fetchLlmCostRows', () => {
  const VIEW_ROWS = [
    {
      customer_id: '11111111-1111-4111-8111-111111111111',
      email: 'a@example.com',
      openrouter_key_hash: 'hash-a',
      credit_limit_usd_cents: 500,
      latest_cost_usd_cents: 100,
    },
    {
      customer_id: '22222222-2222-4222-8222-222222222222',
      email: 'b@example.com',
      openrouter_key_hash: 'hash-b',
      credit_limit_usd_cents: 3000,
      latest_cost_usd_cents: null,
    },
  ]

  it('joins the view rows with live OpenRouter spend', async () => {
    const stub: typeof fetch = async (url) => {
      const u = String(url)
      if (u.includes('/rest/v1/customer_llm_cost')) return jsonResponse(VIEW_ROWS)
      if (u.endsWith('/keys/hash-a')) return jsonResponse({ data: { usage: 2.5 } })
      if (u.endsWith('/keys/hash-b')) return jsonResponse({ data: { usage: 6 } })
      throw new Error(`unexpected url ${u}`)
    }
    const rows = await fetchLlmCostRows({
      supabaseUrl: 'https://db.example.co',
      supabaseServiceKey: 'svc',
      openRouterProvisioningKey: 'prov',
      fetchImpl: stub,
    })
    const a = rows.find((r) => r.customer_id.startsWith('1111'))!
    assert.equal(a.cost_usd_cents, 250)
    assert.equal(a.cost_source, 'openrouter_live')
    assert.equal(a.credit_limit_usd_cents, 500)
  })

  it('degrades a customer to the stored snapshot when OpenRouter fails', async () => {
    const stub: typeof fetch = async (url) => {
      const u = String(url)
      if (u.includes('/rest/v1/customer_llm_cost')) return jsonResponse(VIEW_ROWS)
      // hash-a fails, hash-b ok
      if (u.endsWith('/keys/hash-a')) return jsonResponse({ error: 'down' }, 500)
      if (u.endsWith('/keys/hash-b')) return jsonResponse({ data: { usage: 6 } })
      throw new Error(`unexpected url ${u}`)
    }
    const rows = await fetchLlmCostRows({
      supabaseUrl: 'https://db.example.co',
      supabaseServiceKey: 'svc',
      openRouterProvisioningKey: 'prov',
      fetchImpl: stub,
    })
    const a = rows.find((r) => r.customer_id.startsWith('1111'))!
    // hash-a had a snapshot (100) → degrade to snapshot, not unavailable.
    assert.equal(a.cost_source, 'snapshot')
    assert.equal(a.cost_usd_cents, 100)
  })

  it('marks a customer unavailable when OpenRouter fails and no snapshot exists', async () => {
    const stub: typeof fetch = async (url) => {
      const u = String(url)
      if (u.includes('/rest/v1/customer_llm_cost')) return jsonResponse(VIEW_ROWS)
      return jsonResponse({ error: 'down' }, 500)
    }
    const rows = await fetchLlmCostRows({
      supabaseUrl: 'https://db.example.co',
      supabaseServiceKey: 'svc',
      openRouterProvisioningKey: 'prov',
      fetchImpl: stub,
    })
    // customer b had latest_cost_usd_cents null → unavailable.
    const b = rows.find((r) => r.customer_id.startsWith('2222'))!
    assert.equal(b.cost_source, 'unavailable')
  })

  it('throws when the view query itself fails', async () => {
    const stub: typeof fetch = async () => jsonResponse({ error: 'boom' }, 503)
    await assert.rejects(
      () =>
        fetchLlmCostRows({
          supabaseUrl: 'https://db.example.co',
          supabaseServiceKey: 'svc',
          openRouterProvisioningKey: 'prov',
          fetchImpl: stub,
        }),
      /customer_llm_cost.*503/,
    )
  })
})
