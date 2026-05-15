#!/usr/bin/env node
/**
 * Wrapper script: `npm run smoke -- --target=local|deployed`
 *
 * Founder local-first directive 2026-05-14: this is the ergonomic entry
 * point that mirrors `--target=` syntax from the cascade brief.
 * Underneath it just dispatches to the existing scripts:
 *   smoke:service:local  → E2E_SMOKE_TARGET=local fixture-based smoke
 *   smoke:service:deployed → E2E_SMOKE_TARGET=deployed real-network smoke
 *
 * Default (no flag) = local (cheap, no network, runs anywhere).
 */

import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const targetArg = args.find((a) => a.startsWith('--target='))
const target = targetArg ? targetArg.split('=')[1] : 'local'

if (target !== 'local' && target !== 'deployed') {
  // eslint-disable-next-line no-console
  console.error(`smoke-runner: --target must be 'local' or 'deployed' (got '${target}')`)
  process.exit(2)
}

const env = {
  ...process.env,
  E2E_SMOKE_TARGET: target,
}
if (target === 'local') {
  env.AUDIT_CID = process.env.AUDIT_CID ?? 'cust-local-renita'
}

const child = spawn('npx', ['tsx', '--test', 'tests/e2e/smoke-service.spec.ts'], {
  stdio: 'inherit',
  env,
})
child.on('exit', (code) => process.exit(code ?? 1))
