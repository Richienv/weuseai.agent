/**
 * ISshProvisioner — port for executing setup scripts on a VPS over SSH.
 *
 * Pivoted from cloud-init delivery (2026-05-04) after IDCloudHost was
 * confirmed to either not run cloud-init at all, or to silently drop our
 * `cloud_init=@file` submission. SSH gives us a tight feedback loop —
 * stdout/stderr from the setup steps, retryable failures, no parser quirks.
 *
 * Production impl shells out to ssh+sshpass; mock records the call for tests.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  type ISshProvisioner,
  type SshSetupResult,
} from '../services/provisioning/src/ssh-provisioner.ts'
import { MockSshProvisioner } from '../services/provisioning/src/ssh/mock-ssh-provisioner.ts'

test('mock ssh provisioner: records target host + user + script + returns ok', async () => {
  const m = new MockSshProvisioner()
  const r = await m.runSetup({
    host: '203.194.1.2',
    user: 'liren',
    password: 'pw1',
    script: '#!/bin/bash\necho hello',
  })
  assert.equal(r.ok, true)
  assert.equal(m.calls.length, 1)
  assert.equal(m.calls[0].host, '203.194.1.2')
  assert.equal(m.calls[0].user, 'liren')
  assert.equal(m.calls[0].password, 'pw1')
  assert.match(m.calls[0].script, /echo hello/)
})

test('mock ssh provisioner: reports stdout + stderr from injected fakes', async () => {
  const m = new MockSshProvisioner({
    nextResult: { ok: true, stdout: 'line1\nline2\n', stderr: 'warn: foo\n', exitCode: 0 },
  })
  const r = await m.runSetup({
    host: 'h', user: 'u', password: 'p', script: 's',
  })
  assert.equal(r.ok, true)
  assert.equal(r.stdout, 'line1\nline2\n')
  assert.equal(r.stderr, 'warn: foo\n')
  assert.equal(r.exitCode, 0)
})

test('mock ssh provisioner: returns ok=false + non-zero exit when injected', async () => {
  const m = new MockSshProvisioner({
    nextResult: { ok: false, stdout: '', stderr: 'permission denied', exitCode: 255 },
  })
  const r = await m.runSetup({ host: 'h', user: 'u', password: 'p', script: 's' })
  assert.equal(r.ok, false)
  assert.equal(r.exitCode, 255)
  assert.match(r.stderr, /permission denied/)
})

test('mock ssh provisioner: ISshProvisioner type is satisfied', () => {
  const m: ISshProvisioner = new MockSshProvisioner()
  assert.ok(typeof m.runSetup === 'function')
})
