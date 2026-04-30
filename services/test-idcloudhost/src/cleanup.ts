/**
 * Cleanup orphaned test VMs (prefix: liren-test-).
 * Run kalau test.ts crash dan VM ketinggal.
 */

import 'dotenv/config'

const API_KEY = process.env.IDCLOUDHOST_API_KEY
const REGION = process.env.IDCLOUDHOST_REGION || ''

if (!API_KEY) {
  console.error('Missing IDCLOUDHOST_API_KEY')
  process.exit(1)
}

const BASE = REGION
  ? `https://api.idcloudhost.com/v1/${REGION}/user-resource`
  : 'https://api.idcloudhost.com/v1/user-resource'

const headers = { apikey: API_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }

async function main() {
  const r = await fetch(`${BASE}/vm/list`, { headers })
  if (!r.ok) {
    console.error('List VM failed:', r.status, await r.text())
    process.exit(1)
  }
  const data = (await r.json()) as any
  const vms: any[] = Array.isArray(data) ? data : data.vms || data.list || []
  const orphans = vms.filter((v) => typeof v.name === 'string' && v.name.startsWith('liren-test-'))

  if (!orphans.length) {
    console.log('No orphan test VMs found.')
    return
  }

  console.log(`Found ${orphans.length} orphan test VM(s):`)
  for (const vm of orphans) console.log(`  - ${vm.name} (${vm.uuid}) [${vm.status}]`)

  for (const vm of orphans) {
    process.stdout.write(`Deleting ${vm.name}... `)
    const dr = await fetch(`${BASE}/vm?uuid=${vm.uuid}`, { method: 'DELETE', headers })
    if (dr.ok) console.log('✓')
    else console.log('✗', dr.status, await dr.text())
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
