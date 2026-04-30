/**
 * Mint short-lived JWT untuk Hermes container, untuk auth ke LLM proxy.
 *
 * Token berisi customer_id signed dengan PROXY_JWT_SECRET.
 * Proxy verify token sebelum forward call ke Anthropic/Zhipu/DeepSeek.
 */

import crypto from 'node:crypto'

const SECRET = process.env.PROXY_JWT_SECRET!

export async function mintProxyToken(customerId: string, validForDays = 365): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: customerId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + validForDays * 24 * 3600,
    }),
  )
  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url')
  return `${header}.${payload}.${sig}`
}

function base64UrlEncode(s: string) {
  return Buffer.from(s).toString('base64url')
}
