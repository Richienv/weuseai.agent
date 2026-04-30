/**
 * Auth-only pre-flight: verify IDCLOUDHOST_API_KEY can hit read-only endpoints.
 * No VM spin, no spend. Run before full provisioning test.
 */

import 'dotenv/config'

const API_KEY = process.env.IDCLOUDHOST_API_KEY

if (!API_KEY) {
  console.error('Missing env: IDCLOUDHOST_API_KEY')
  console.error('Isi .env dari .env.example dulu (lihat dashboard.idcloudhost.com → API Keys).')
  process.exit(1)
}

const BASE = 'https://api.idcloudhost.com/v1/user-resource'
const headers = { apikey: API_KEY }

const endpoints: Array<{ label: string; path: string }> = [
  { label: 'VM list', path: '/vm/list' },
  { label: 'SSH keys', path: '/ssh_keys' },
]

async function check(label: string, path: string): Promise<boolean> {
  const url = `${BASE}${path}`
  try {
    const r = await fetch(url, { method: 'GET', headers })
    if (r.ok) {
      console.log(`✓ PASS  ${label.padEnd(10)} GET ${path} → HTTP ${r.status}`)
      return true
    }
    const body = await r.text()
    console.log(`✗ FAIL  ${label.padEnd(10)} GET ${path} → HTTP ${r.status}`)
    console.log(`        body: ${body.slice(0, 500)}`)
    return false
  } catch (e: any) {
    console.log(`✗ FAIL  ${label.padEnd(10)} GET ${path} → network error`)
    console.log(`        ${e.message}`)
    return false
  }
}

async function main() {
  console.log('IDCloudHost auth pre-flight')
  console.log(`Base: ${BASE}`)
  console.log(`Key:  ${API_KEY!.slice(0, 4)}…${API_KEY!.slice(-4)} (${API_KEY!.length} chars)`)
  console.log('')

  const results = await Promise.all(endpoints.map((e) => check(e.label, e.path)))
  const allPass = results.every(Boolean)

  console.log('')
  console.log('=== AUTH PRE-FLIGHT RESULT ===')
  if (allPass) {
    console.log('Verdict: ✓ PASS — API key valid, lanjut full provisioning test.')
    process.exit(0)
  } else {
    console.log('Verdict: ✗ FAIL — fix auth dulu sebelum jalanin npm run test.')
    console.log('Common fixes: cek API key di dashboard.idcloudhost.com → API Keys.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('✗ Unexpected error:', err)
  process.exit(1)
})
