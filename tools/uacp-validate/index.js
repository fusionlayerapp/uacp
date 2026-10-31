#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const yaml = require('js-yaml')
const { UACP_ERROR_CATALOG, lookupUacpError } = require('./errors.js')

const NL = String.fromCharCode(10)

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k])
  return out
}

function canonicalJson(obj) {
  return JSON.stringify(sortKeys(obj))
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const KIND_RE = /^([a-z][a-z0-9-]*|[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)$/
const ISO_Z_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

function validateEnvelope(env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) throw new Error('envelope_not_object')

  const required = ['uacp_version', 'kind', 'id', 'schema_version', 'version', 'subject', 'author', 'created_at', 'signature', 'body']
  for (const k of required) if (!(k in env)) throw new Error(`missing_required:${k}`)

  if (env.uacp_version !== 1) throw new Error('uacp_version_must_be_1')
  if (typeof env.kind !== 'string' || !KIND_RE.test(env.kind)) throw new Error('kind_invalid')
  if (typeof env.id !== 'string' || env.id.length < 1) throw new Error('id_invalid')
  if (!Number.isInteger(env.schema_version) || env.schema_version < 1) throw new Error('schema_version_invalid')
  if (typeof env.version !== 'string' || !SEMVER_RE.test(env.version)) throw new Error('version_invalid')
  if (typeof env.subject !== 'string' || env.subject.length < 1) throw new Error('subject_invalid')
  if (typeof env.author !== 'string' || env.author.length < 1) throw new Error('author_invalid')
  if (typeof env.created_at !== 'string' || !ISO_Z_RE.test(env.created_at)) throw new Error('created_at_invalid')
  if (typeof env.signature !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(env.signature)) throw new Error('signature_invalid')
  if (typeof env.body !== 'object' || env.body === null) throw new Error('body_invalid')

  if ('audience' in env) {
    if (!Array.isArray(env.audience)) throw new Error('audience_must_be_array')
    for (const p of env.audience) {
      if (typeof p !== 'string' || p.length < 1) throw new Error('audience_entry_invalid')
    }
  }
  if ('scope' in env && typeof env.scope !== 'string') throw new Error('scope_must_be_string')

  const declared = env.signature.slice('sha256:'.length)
  const clone = JSON.parse(JSON.stringify(env))
  delete clone.signature
  const computed = sha256Hex(canonicalJson(clone))
  if (computed !== declared) throw new Error(`signature_mismatch:${declared}:${computed}`)
}

function inspectEnvelope(env) {
  const clone = JSON.parse(JSON.stringify(env || {}))
  delete clone.signature
  const computed = sha256Hex(canonicalJson(clone))
  let valid = false
  let error = null
  try {
    validateEnvelope(env)
    valid = true
  } catch (err) {
    error = err.message
  }
  return {
    protocol: 'UACP/1.0',
    valid,
    id: env?.id || null,
    kind: env?.kind || null,
    version: env?.version || null,
    author: env?.author || null,
    subject: env?.subject || null,
    created_at: env?.created_at || null,
    declaredSignature: env?.signature || null,
    computedSignature: `sha256:${computed}`,
    bodyKeys: env?.body && typeof env.body === 'object' ? Object.keys(env.body) : [],
    error,
    catalogEntry: error ? lookupUacpError(error) : null,
  }
}

function runUacpDoctor() {
  const checks = []
  const baseEnv = {
    uacp_version: 1,
    kind: 'memory',
    id: 'doc-check-1',
    schema_version: 1,
    version: '1.0.0',
    subject: 'user:test',
    author: 'agent:doctor',
    created_at: '2026-10-23T00:00:00Z',
    body: { text: 'doctor check' },
  }
  baseEnv.signature = `sha256:${sha256Hex(canonicalJson(baseEnv))}`
  try {
    validateEnvelope(baseEnv)
    checks.push({ name: 'canonical_envelope_signing', status: 'ok', detail: 'Canonical JSON + SHA-256 envelope verified' })
  } catch (err) {
    checks.push({ name: 'canonical_envelope_signing', status: 'error', detail: err.message })
  }
  checks.push({
    name: 'error_catalog',
    status: Object.keys(UACP_ERROR_CATALOG).length >= 5 ? 'ok' : 'error',
    detail: `${Object.keys(UACP_ERROR_CATALOG).length} structured error codes registered`,
  })
  const healthy = checks.every((c) => c.status === 'ok')
  return { healthy, protocol: 'UACP', checks }
}

function writeCliOutputFile(filePath, payload, textOutput, { append = false } = {}) {
  if (!filePath) return null
  const abs = path.resolve(process.cwd(), filePath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const lower = abs.toLowerCase()
  if (append || lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) {
    const line = JSON.stringify(payload !== undefined ? payload : { output: textOutput }) + NL
    if (append) fs.appendFileSync(abs, line, 'utf8')
    else fs.writeFileSync(abs, line, 'utf8')
    return abs
  }
  const content =
    lower.endsWith('.json') && payload !== undefined
      ? JSON.stringify(payload, null, 2) + NL
      : String(textOutput) + (String(textOutput).endsWith(NL) ? '' : NL)
  fs.writeFileSync(abs, content, 'utf8')
  return abs
}

function extractOption(argv, flags) {
  let value = null
  const rest = []
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const eqFlag = flags.find((f) => token.startsWith(`${f}=`))
    if (eqFlag) {
      value = token.slice(eqFlag.length + 1)
      continue
    }
    if (flags.includes(token)) {
      if (i + 1 < argv.length) {
        value = argv[i + 1]
        i += 1
      }
      continue
    }
    rest.push(token)
  }
  return { value, rest }
}

function runCli(argv = process.argv.slice(2)) {
  const jsonFlag = argv.includes('--json')
  const appendFlag = argv.includes('--append')
  const stripped = argv.filter((a) => a !== '--json' && a !== '--append')
  const { value: outFile, rest: args } = extractOption(stripped, ['-o', '--out', '--output', '--log-file'])
  const outputPath = outFile || process.env.UACP_DIAG_OUTPUT_FILE || null
  const finalize = (exitCode, output, payload) => {
    const written = writeCliOutputFile(outputPath, payload, output, { append: appendFlag })
    return { exitCode, output, outputFile: written, payload }
  }

  const cmd = args[0]

  if (cmd === 'doctor' || cmd === 'conformance') {
    const doc = runUacpDoctor()
    const output = jsonFlag
      ? JSON.stringify(doc, null, 2)
      : [`UACP Doctor: ${doc.healthy ? 'HEALTHY' : 'UNHEALTHY'}`, ...doc.checks.map((c) => `  [${c.status.toUpperCase()}] ${c.name}: ${c.detail}`)].join(NL)
    return finalize(doc.healthy ? 0 : 1, output, doc)
  }

  if (cmd === 'errors') {
    const code = args[1]
    if (code) {
      const entry = lookupUacpError(code)
      if (!entry) {
        const payload = { error: `Unknown code: ${code}` }
        return finalize(1, jsonFlag ? JSON.stringify(payload) : payload.error, payload)
      }
      const output = jsonFlag
        ? JSON.stringify(entry, null, 2)
        : `${entry.code} [${entry.level}/${entry.category}] — ${entry.message}${NL}  Hint: ${entry.hint}`
      return finalize(0, output, entry)
    }
    const all = Object.values(UACP_ERROR_CATALOG)
    const output = jsonFlag ? JSON.stringify(all, null, 2) : all.map((e) => `${e.code} [${e.level}] — ${e.message}`).join(NL)
    return finalize(0, output, all)
  }

  if (cmd === 'inspect') {
    const file = args[1]
    if (!file) {
      return finalize(2, 'Usage: node tools/uacp-validate/index.js inspect <file> [--json] [-o|--output <file>]', {
        error: 'missing_file',
      })
    }
    const abs = path.resolve(process.cwd(), file)
    const raw = fs.readFileSync(abs, 'utf8')
    const env = yaml.load(raw)
    const info = inspectEnvelope(env)
    return finalize(info.valid ? 0 : 1, JSON.stringify(info, null, 2), info)
  }

  const file = cmd === 'validate' ? args[1] : cmd
  if (!file) {
    return finalize(
      2,
      'Usage: node tools/uacp-validate/index.js <path-to-envelope.yml|doctor|inspect|errors> [--json] [-o|--output <file>]',
      { error: 'missing_command' },
    )
  }

  const abs = path.resolve(process.cwd(), file)
  const raw = fs.readFileSync(abs, 'utf8')
  const env = yaml.load(raw)

  try {
    validateEnvelope(env)
    const payload = { ok: true, file }
    return finalize(0, jsonFlag ? JSON.stringify(payload, null, 2) : `PASS: ${file}`, payload)
  } catch (err) {
    const cat = lookupUacpError(err.message)
    const payload = { ok: false, file, error: err.message, catalog: cat }
    return finalize(
      1,
      jsonFlag ? JSON.stringify(payload, null, 2) : `FAIL: ${file}: ${err.message}`,
      payload,
    )
  }
}

function main() {
  const { exitCode, output } = runCli(process.argv.slice(2))
  if (exitCode === 0) console.log(output)
  else console.error(output)
  process.exit(exitCode)
}

if (require.main === module) main()

module.exports = {
  canonicalJson,
  sha256Hex,
  validateEnvelope,
  inspectEnvelope,
  runUacpDoctor,
  runCli,
  UACP_ERROR_CATALOG,
  lookupUacpError,
}
