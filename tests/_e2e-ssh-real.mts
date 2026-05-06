/**
 * Manual real-SSH integration test. NOT included in `npm test` — invoke via:
 *   VM_HOST=… VM_USER=liren VM_PASSWORD=… npx tsx tests/_e2e-ssh-real.mts
 *
 * Underscore-prefixed filename keeps it out of the *.spec.ts glob.
 */
import { ExecSshProvisioner } from '../services/provisioning/src/ssh/exec-ssh-provisioner.ts'
import { buildSetupScript } from '../services/provisioning/src/setup-script.ts'

const HOST = process.env.VM_HOST!
const USER = process.env.VM_USER ?? 'liren'
const PASSWORD = process.env.VM_PASSWORD!

if (!HOST || !PASSWORD) {
  console.error('Set VM_HOST + VM_PASSWORD env vars')
  process.exit(2)
}

const script = buildSetupScript({
  customerId: 'e2e-ssh-pivot-test',
  tier: 'pro',
  telegramBotToken: '8630424948:AAGmM1ND-ybPp3AGSihp8X1oQS0uQCQx_6o',
  telegramAllowedUserIds: '6805409051',
  // Optional: pass a real OpenRouter key here to test LLM responses.
  // Without it, Hermes installs but won't have an LLM until customer
  // pastes a key (Phase 2A — minted server-side in the real customer flow).
  openRouterKey: process.env.OPENROUTER_KEY,
})

console.log(`[${new Date().toISOString()}] SSH setup → ${USER}@${HOST}`)
console.log(`script length: ${script.length} bytes`)

const ssh = new ExecSshProvisioner()
const result = await ssh.runSetup({
  host: HOST, user: USER, password: PASSWORD, script,
  timeoutMs: 12 * 60 * 1000,
})

console.log(`[${new Date().toISOString()}] FINISHED`)
console.log('ok:', result.ok)
console.log('exitCode:', result.exitCode)
console.log('--- stdout (last 2000) ---')
console.log(result.stdout.slice(-2000))
console.log('--- stderr (last 1000) ---')
console.log(result.stderr.slice(-1000))
