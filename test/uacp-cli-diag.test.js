'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  canonicalJson,
  sha256Hex,
  inspectEnvelope,
  runUacpDoctor,
  runCli,
} = require('../tools/uacp-validate/index.js')

test('uacp doctor and errors CLI commands succeed', () => {
  const doc = runUacpDoctor()
  assert.equal(doc.healthy, true)

  const cliDoc = runCli(['doctor', '--json'])
  assert.equal(cliDoc.exitCode, 0)
  assert.equal(JSON.parse(cliDoc.output).healthy, true)

  const cliErr = runCli(['errors', 'E_UACP_SIGNATURE_MISMATCH', '--json'])
  assert.equal(cliErr.exitCode, 0)
  assert.equal(JSON.parse(cliErr.output).code, 'E_UACP_SIGNATURE_MISMATCH')
})

test('inspectEnvelope reports signature match and mismatch with catalog mapping', () => {
  const env = {
    uacp_version: 1,
    kind: 'memory',
    id: 'mem-1',
    schema_version: 1,
    version: '1.0.0',
    subject: 'user:1',
    author: 'agent:1',
    created_at: '2026-10-23T12:00:00Z',
    body: { key: 'val' },
  }
  env.signature = `sha256:${sha256Hex(canonicalJson(env))}`
  const okInfo = inspectEnvelope(env)
  assert.equal(okInfo.valid, true)

  const badInfo = inspectEnvelope({ ...env, signature: `sha256:${'0'.repeat(64)}` })
  assert.equal(badInfo.valid, false)
  assert.equal(badInfo.catalogEntry.code, 'E_UACP_SIGNATURE_MISMATCH')
})

test('uacp-validate CLI writes to CLI and optional --output file (#111)', () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uacp-out-'))
  try {
    const outFile = path.join(tmpDir, 'doctor.json')
    const res = runCli(['doctor', '--output', outFile])
    assert.equal(res.exitCode, 0)
    assert.match(res.output, /HEALTHY/)
    assert.equal(JSON.parse(fs.readFileSync(outFile, 'utf8')).healthy, true)

    const jsonlFile = path.join(tmpDir, 'telemetry.jsonl')
    runCli(['doctor', '-o', jsonlFile, '--append'])
    runCli(['errors', 'E_UACP_SIGNATURE_MISMATCH', '-o', jsonlFile, '--append'])
    const lines = fs.readFileSync(jsonlFile, 'utf8').trim().split('\n')
    assert.equal(lines.length, 2)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

